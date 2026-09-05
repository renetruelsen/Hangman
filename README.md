# Galgeleg — dansk Hangman

Hurtig POC. ASP.NET Core 10 (Razor Pages) serverer siden og et lille ord-API;
selve spillet kører i vanilla JS, og galgen er inline SVG der tegner sig selv.

## Kør

```bash
dotnet run --launch-profile http
```

→ <http://localhost:5062>

## Sådan hænger det sammen

| Fil | Ansvar |
|---|---|
| `Game/WordBank.cs` | 124 danske ord på 6-10 tegn, fordelt på 6 kategorier |
| `Program.cs` | `GET /api/word?seneste=<ord>` → `{ word, category }` |
| `Pages/Index.cshtml` | Markup + galge-SVG'en (5 rammedele, 11 kropsdele) |
| `wwwroot/css/hangman.css` | Hele det visuelle |
| `wwwroot/js/hangman.js` | Spillogik, tegne-animation, lyd, konfetti |

## Regler

- 8 liv. Hvert forkert gæt afslører ét trin af manden: hoved, krop, to arme,
  to ben, X-øjne, trist mund.
- Galgen selv tegnes op ved spilstart og koster ikke liv.
- Dansk alfabet inkl. Æ Ø Å. Både on-screen-tastatur og fysisk tastatur.
- `Enter` eller `Esc` starter et nyt ord når runden er slut.

## Ting værd at vide

- **Ordet ligger i klienten.** `/api/word` sender ordet i klartekst, og JS
  afgør alt. Bogstaverne skrives dog først ind i DOM'en når de afsløres, så man
  skal ind i netværksfanen for at snyde. Skal det være snydesikkert, skal
  gætningen flyttes til serveren.
- **`stroke-dasharray` fjernes efter hver optegning.** Bliver mønsteret stående
  sammen med `drop-shadow`, undlader Chrome at gentegne strøget, og stregen
  ender som løsrevne prikker. Se `draw()` i `hangman.js`.
- **`.wrap` må ikke danne en stacking context.** Ved spilslut løftes `.panel`
  til `z-index: 10`, så det afslørede ord står over resultat-overlayet. Derfor
  ligger alle baggrundslag på negativ `z-index`, sidefarven på `<html>` frem for
  `<body>`, og `shake`-klassen fjernes efter animationen — en efterladt
  `transform` ville alene være nok til at fange ordet bag overlayet.
- **`inert` gør `elementFromPoint` ubrugelig.** Mens resultatskærmen vises er
  `.wrap` inert, og hele undertræet forsvinder fra hit-testing. Skal lagdeling
  måles, skal `inert` slås fra et øjeblik først.
- **Fontene hentes fra Google Fonts.** Uden net falder titlen tilbage på
  Georgia. Skal demoen kunne køre offline, skal Cinzel og Outfit self-hostes i
  `wwwroot/fonts/`.
- **Bootstrap og jQuery ligger stadig i `wwwroot/lib/`** fra projektskabelonen,
  men bruges ikke længere af noget. Kan slettes.
