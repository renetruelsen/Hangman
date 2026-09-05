using System.Text.Json;

namespace Hangman.Game;

/// <summary>
/// Henter en pulje af danske ord fra den danske Wiktionarys MediaWiki-API.
///
/// Den Danske Ordbog (ordnet.dk/ddo) kan IKKE bruges: den svarer 202 med en tom
/// krop og en AWS WAF-udfordringsside, der skal løses med JavaScript i en rigtig
/// browser. En HttpClient kommer aldrig igennem den, uanset netværksadgang.
///
/// Der hentes en hel pulje ad gangen frem for ét ord pr. runde — ét netværkskald
/// pr. kategori i stedet for ét pr. spil, hvilket både er hurtigere og holder os
/// langt fra kildens rate-limits.
/// </summary>
public sealed class OnlineWordSource(HttpClient http, ILogger<OnlineWordSource> logger)
{
    /// <summary>Wiktionary-kategori → den tekst spilleren får som hint.</summary>
    private static readonly (string Category, string Display)[] Categories =
    [
        ("Dyr", "Dyr"),
        ("Fugle", "Dyr"),
        ("Fisk", "Dyr"),
        ("Insekter", "Dyr"),
        ("Pattedyr", "Dyr"),
        ("Mad", "Mad & Drikke"),
        ("Drikkevarer", "Mad & Drikke"),
        ("Frugter", "Mad & Drikke"),
        ("Grøntsager", "Mad & Drikke"),
        ("Planter", "Natur"),
        ("Træer", "Natur"),
        ("Vejr", "Natur"),
        ("Blomster", "Natur"),
        ("Værktøj", "Ting i hjemmet"),
        ("Møbler", "Ting i hjemmet"),
        ("Beklædning", "Ting i hjemmet"),
        ("Køretøjer", "Ting i hjemmet"),
        ("Sport", "Sport & Fritid"),
        ("Musik", "Sport & Fritid"),
        ("Musikinstrumenter", "Sport & Fritid"),
    ];

    /// <summary>
    /// Henter alle brugbare ord fra kilden. Returnerer en tom liste hvis kilden
    /// ikke kan nås — kaldsstedet falder så tilbage til den lokale ordbank.
    /// </summary>
    public async Task<IReadOnlyList<WordEntry>> FetchPoolAsync(CancellationToken ct)
    {
        // Samme ord kan optræde i flere kategorier; første kategori vinder.
        var found = new Dictionary<string, WordEntry>(StringComparer.OrdinalIgnoreCase);

        foreach (var (category, display) in Categories)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                foreach (var word in await FetchCategoryAsync(category, ct))
                {
                    found.TryAdd(word, new WordEntry(word, display));
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                logger.LogInformation(ex, "Kunne ikke hente kategorien {Kategori}.", category);
            }
        }

        logger.LogInformation("Hentede {Antal} unikke ord fra online-kilden.", found.Count);
        return found.Values.ToArray();
    }

    private async Task<IEnumerable<string>> FetchCategoryAsync(string category, CancellationToken ct)
    {
        var url = "/w/api.php?action=query&list=categorymembers" +
                  $"&cmtitle=Kategori:{Uri.EscapeDataString(category)}" +
                  "&cmnamespace=0&cmlimit=500&format=json";

        using var response = await http.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode)
        {
            return [];
        }

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var json = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        if (!json.RootElement.TryGetProperty("query", out var query) ||
            !query.TryGetProperty("categorymembers", out var members))
        {
            return [];
        }

        return members.EnumerateArray()
            .Select(m => m.TryGetProperty("title", out var t) ? t.GetString() : null)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t!.ToUpperInvariant())
            .Where(IsUsable)
            .ToArray();
    }

    /// <summary>Samme krav som til den lokale ordbank: 6-10 tegn, kun A-Z + Æ Ø Å.</summary>
    private static bool IsUsable(string word) =>
        word.Length is >= 6 and <= 10 &&
        word.All(c => c is >= 'A' and <= 'Z' or 'Æ' or 'Ø' or 'Å');
}
