namespace Hangman.Game;

/// <summary>Et ord i spillet plus den kategori der vises som hint.</summary>
public sealed record WordEntry(string Word, string Category);

/// <summary>
/// Nødplan. Ordene her bruges KUN når online-kilden ikke kan nås — den
/// almindelige pulje hentes af <see cref="OnlineWordSource"/>.
/// Alle ord er 6-10 tegn, store bogstaver, kun A-Z + Æ Ø Å.
/// </summary>
public static class WordBank
{
    private const string Dyr = "Dyr";
    private const string Mad = "Mad & Drikke";
    private const string Byer = "Byer & Steder";
    private const string Natur = "Natur";
    private const string Ting = "Ting i hjemmet";
    private const string Sport = "Sport & Fritid";

    private static readonly WordEntry[] Entries =
    [
        new("PINDSVIN", Dyr),
        new("FLAGERMUS", Dyr),
        new("SOMMERFUGL", Dyr),
        new("SØSTJERNE", Dyr),
        new("MARSVIN", Dyr),
        new("DELFIN", Dyr),
        new("HVALROS", Dyr),
        new("ISBJØRN", Dyr),
        new("GRÆSHOPPE", Dyr),
        new("SNEGLEHUS", Dyr),
        new("ØRENTVIST", Dyr),
        new("ELEFANT", Dyr),
        new("KROKODILLE", Dyr),
        new("PAPEGØJE", Dyr),
        new("SÆLHUND", Dyr),
        new("RÆVEUNGE", Dyr),
        new("HUMLEBI", Dyr),
        new("REGNORM", Dyr),
        new("SKILDPADDE", Dyr),
        new("NÆSEHORN", Dyr),
        new("FIRBEN", Dyr),
        new("HAVODDER", Dyr),
        new("ULVEHUND", Dyr),

        new("RUGBRØD", Mad),
        new("FLØDEBOLLE", Mad),
        new("FRIKADELLE", Mad),
        new("KANELSNEGL", Mad),
        new("SMØRREBRØD", Mad),
        new("RØDGRØD", Mad),
        new("ÆBLESKIVE", Mad),
        new("KARTOFFEL", Mad),
        new("REMOULADE", Mad),
        new("LAKRIDS", Mad),
        new("HINDBÆR", Mad),
        new("OSTEMAD", Mad),
        new("PANDEKAGE", Mad),
        new("GULEROD", Mad),
        new("SOLBÆRSAFT", Mad),
        new("KAKAOMÆLK", Mad),
        new("LAGKAGE", Mad),
        new("DRØMMEKAGE", Mad),
        new("SPEGEPØLSE", Mad),
        new("MEDISTER", Mad),
        new("GRØNKÅL", Mad),

        new("KØBENHAVN", Byer),
        new("AALBORG", Byer),
        new("ODENSE", Byer),
        new("ESBJERG", Byer),
        new("RANDERS", Byer),
        new("HELSINGØR", Byer),
        new("SVENDBORG", Byer),
        new("FREDERICIA", Byer),
        new("SILKEBORG", Byer),
        new("HILLERØD", Byer),
        new("RINGSTED", Byer),
        new("HOLBÆK", Byer),
        new("SKAGEN", Byer),
        new("VIBORG", Byer),
        new("HERNING", Byer),
        new("KOLDING", Byer),
        new("NYKØBING", Byer),
        new("ROSKILDE", Byer),
        new("AMAGER", Byer),
        new("BORNHOLM", Byer),
        new("LIMFJORDEN", Byer),

        new("NORDLYS", Natur),
        new("REGNBUE", Natur),
        new("TORDENVEJR", Natur),
        new("SNEFNUG", Natur),
        new("SOLNEDGANG", Natur),
        new("BØGESKOV", Natur),
        new("KLITTER", Natur),
        new("VANDFALD", Natur),
        new("GLETSJER", Natur),
        new("MÅNESKIN", Natur),
        new("MORGENDUG", Natur),
        new("EFTERÅR", Natur),
        new("HAVBRIS", Natur),
        new("STJERNER", Natur),
        new("TÅGEBANKE", Natur),
        new("LYNGHEDE", Natur),
        new("FYRRETRÆ", Natur),
        new("ØSTENVIND", Natur),
        new("ISTAPPER", Natur),
        new("SANDSTRAND", Natur),

        new("PARAPLY", Ting),
        new("VINDMØLLE", Ting),
        new("KIKKERT", Ting),
        new("STØVSUGER", Ting),
        new("LOMMELYGTE", Ting),
        new("TANDBØRSTE", Ting),
        new("BRILLEETUI", Ting),
        new("CYKELPUMPE", Ting),
        new("KAFFEKANDE", Ting),
        new("STRYGEJERN", Ting),
        new("SYMASKINE", Ting),
        new("BOGREOL", Ting),
        new("HÅRBØRSTE", Ting),
        new("RYGSÆK", Ting),
        new("NØGLERING", Ting),
        new("PENGEPUNG", Ting),
        new("HÅNDKLÆDE", Ting),
        new("KOMFUR", Ting),
        new("TERMOKANDE", Ting),
        new("SKAMMEL", Ting),

        new("HÅNDBOLD", Sport),
        new("BADMINTON", Sport),
        new("SVØMNING", Sport),
        new("LØBETUR", Sport),
        new("CYKELLØB", Sport),
        new("RIDNING", Sport),
        new("SEJLADS", Sport),
        new("BRÆTSPIL", Sport),
        new("SKISPORT", Sport),
        new("BOWLING", Sport),
        new("KLATREVÆG", Sport),
        new("GYMNASTIK", Sport),
        new("FISKERI", Sport),
        new("SKAKSPIL", Sport),
        new("ATLETIK", Sport),
        new("TENNISBOLD", Sport),
        new("VANDRETUR", Sport),
        new("STRIKNING", Sport),
        new("FOTOGRAFI", Sport),
    ];

    public static int Count => Entries.Length;

    /// <summary>Hele nødplanen, til brug når online-kilden er nede.</summary>
    public static IReadOnlyList<WordEntry> All => Entries;

    /// <summary>Trækker et tilfældigt ord. Undgår at gentage det ord der lige er spillet.</summary>
    public static WordEntry Draw(string? previousWord = null)
    {
        if (Entries.Length == 0)
        {
            throw new InvalidOperationException("Ordbanken er tom.");
        }

        for (var attempt = 0; attempt < 8; attempt++)
        {
            var entry = Entries[Random.Shared.Next(Entries.Length)];
            if (!string.Equals(entry.Word, previousWord, StringComparison.OrdinalIgnoreCase))
            {
                return entry;
            }
        }

        // De 8 forsøg ramte previousWord hver gang (matematisk muligt, praktisk
        // set næsten aldrig). Filtrér eksplicit her også, så garantien i
        // dokumentationskommentaren rent faktisk holder i alle tilfælde.
        var remaining = Entries.Where(e => !string.Equals(e.Word, previousWord, StringComparison.OrdinalIgnoreCase)).ToArray();
        return remaining.Length > 0
            ? remaining[Random.Shared.Next(remaining.Length)]
            : Entries[Random.Shared.Next(Entries.Length)];
    }
}
