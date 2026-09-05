using Microsoft.Extensions.Caching.Memory;

namespace Hangman.Game;

/// <summary>Hvor et udleveret ord kom fra — så man kan se om online-kilden virker.</summary>
public enum WordOrigin
{
    Online,
    Lokal
}

public sealed record DrawResult(WordEntry Entry, WordOrigin Origin, int PoolSize);

/// <summary>
/// Udleverer ord til spillet.
///
/// Puljen hentes online i BAGGRUNDEN og caches. Et spil venter aldrig på
/// netværket: er puljen ikke klar endnu (eller kilden nede), serveres der med
/// det samme fra den lokale nødplan, og online-ordene tages i brug så snart de
/// er hentet. Hver browser har sit eget sæt af allerede sete ord, så den samme
/// spiller ikke får dubletter før hele puljen er brugt.
/// </summary>
public sealed class WordService(
    OnlineWordSource online,
    IMemoryCache cache,
    ILogger<WordService> logger)
{
    private const string PoolKey = "ordpulje";
    private static readonly TimeSpan PoolLifetime = TimeSpan.FromHours(24);
    private static readonly TimeSpan HistoryLifetime = TimeSpan.FromHours(6);

    /// <summary>Hele opvarmningen har ét samlet budget — ikke ét pr. kategori.</summary>
    private static readonly TimeSpan WarmupBudget = TimeSpan.FromSeconds(25);

    private static int _warming;   // 0 = ledig, 1 = opvarmning i gang

    public DrawResult Draw(string playerId)
    {
        var (pool, origin) = GetPool();
        var seen = GetHistory(playerId);

        var unseen = pool.Where(w => !seen.Contains(w.Word)).ToArray();

        if (unseen.Length == 0)
        {
            // Spilleren har været hele puljen igennem — start forfra frem for
            // at nægte at udlevere et ord.
            logger.LogInformation("Spiller {Spiller} har set alle {Antal} ord; historikken nulstilles.",
                playerId, pool.Count);
            seen.Clear();
            unseen = pool.ToArray();
        }

        var picked = unseen[Random.Shared.Next(unseen.Length)];
        seen.Add(picked.Word);

        return new DrawResult(picked, origin, pool.Count);
    }

    private (IReadOnlyList<WordEntry> Pool, WordOrigin Origin) GetPool()
    {
        if (cache.TryGetValue(PoolKey, out IReadOnlyList<WordEntry>? cached) && cached is { Count: > 0 })
        {
            return (cached, WordOrigin.Online);
        }

        // Puljen er ikke klar. Start opvarmningen (én ad gangen) og servér
        // nødplanen imens — spilleren skal ikke vente på et netværkskald.
        EnsureWarming();
        return (WordBank.All, WordOrigin.Lokal);
    }

    /// <summary>Henter puljen i baggrunden. Kaldes uden at der ventes på den.</summary>
    public void EnsureWarming()
    {
        if (Interlocked.CompareExchange(ref _warming, 1, 0) != 0)
        {
            return;   // en opvarmning er allerede i gang
        }

        _ = Task.Run(async () =>
        {
            try
            {
                using var cts = new CancellationTokenSource(WarmupBudget);
                var words = await online.FetchPoolAsync(cts.Token);

                if (words.Count >= 50)
                {
                    cache.Set(PoolKey, words, PoolLifetime);
                    logger.LogInformation("Ordpuljen er klar med {Antal} online-ord.", words.Count);
                }
                else
                {
                    logger.LogWarning(
                        "Online-kilden gav kun {Antal} ord — spillet kører videre på den lokale ordbank.",
                        words.Count);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Opvarmning af ordpuljen slog fejl; den lokale ordbank bruges.");
            }
            finally
            {
                Interlocked.Exchange(ref _warming, 0);
            }
        });
    }

    private HashSet<string> GetHistory(string playerId) =>
        cache.GetOrCreate("set:" + playerId, entry =>
        {
            entry.SlidingExpiration = HistoryLifetime;
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        })!;
}
