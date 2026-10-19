# NHL Line Combos

Letisztult, magyar nyelvű NHL-sorösszeállító: támadósorok, védőpárok és kapusok egy oldalon. Rust HTTP-szerver és HTML/CSS/JavaScript felület. Cloudflare Pages-en a statikus felületet Pages Functions API-adapter egészíti ki.

## Helyi indítás

Rust stable, curl és a tesztekhez Node.js 20+ szükséges.

```sh
cargo run --locked
```

Alapértelmezett cím: `0.0.0.0:3000`, a `NHL_BIND` változóval módosítható. Az alkalmazás nem igényel külső Rust crate-eket vagy API-kulcsot.

```sh
cargo test --locked
node --test tests/*.test.cjs
```

## Automatikus soradatok: Between the Lines

A `/api/lineups` a Between the Lines függetlenül publikált, nyilvános JSON-adatállományát olvassa: `https://raw.githubusercontent.com/hg913488/nhl-line-combos-app/main/data/lines.json`. Adatközlő: [Himank Goel / Between the Lines](https://github.com/hg913488/nhl-line-combos-app); a közzétett feed eredeti forrásmegjelölése Daily Faceoff. A saját szerverünk nem közvetlenül a DFO-oldalt olvassa, és nem hajtja végre a kiadó scraperét. Csak a közzétett tényszerű soradatokat dolgozza fel, a kiadó programkódjának átvétele nélkül.

A kiadó naponta többször frissít. Megőrizzük a támadósorok, védőpárok, kapusok és PP-egységek közölt sorrendjét; sem jégidőből, sem statisztikából nem számolunk összeállítást. A forrás hiányos sorait hiányosként mutatjuk, nem töltjük fel más játékossal. A jelenlegi feed nem közöl PK-egységeket: a Shorthanded fül ezt jelzi, nem generál egységeket. Ez nem meccs közbeni élő követés, és nem feltétlenül megerősített következő meccses kezdőcsapat.

A felület feltünteti a feed publikációs időpontját, a kiadót és az eredeti forrását. Több mint 36 órás állománynál figyelmeztet; hiányzó, jövőbeli vagy több mint 7 napos letöltött adatot elutasít. A közvetlen forrásoldal frissítési idejét nem ismerjük. A már feldolgozott csapatadatot dátummal mentjük; kapcsolatvesztéskor egyértelmű mentett jelzést mutatunk. Korábbi, jégidőből számolt mentések nem jelenhetnek meg.

A játékosokat normalizált teljes név alapján egyeztetjük az NHL aktuális keretével. Azonosított játékosnál hivatalos NHL-portré és forma látszik; azonosítatlan névnél monogram és hiányzó statisztika, kitalált NHL-ID nélkül. A további kerettagok külön listában szerepelnek.

A 32 csapat az oldal tetején, kereshető logós listából választható. Görgetés nem vált csapatot. A fejléc helyben tárolt, generált meztextúrát használ az adott klub színeiben; nem a hivatalos mez termékfotója.

Böngészős regresszió: `NHL_TEST_BASE_URL=http://127.0.0.1:3000 node tests/dfo.browser.cjs`. Ez név alapú feedtesztadatokkal ellenőrzi a füleket, forrássorrendet, dátumozott mentést és hibakezelést; a régi HTML-parser tesztjeit is megtartja. Az éles kapcsolathoz külön tényleges forráskérés szükséges.

## Forma

Forrás: `/v1/player/{ID}/game-log/now`, az utolsó legfeljebb öt lejátszott meccs. Aktuális hot streak: legalább 3 egymást követő pontszerző mérkőzés, vagy legalább 7 pont pontosan öt meccsen. Pontcsend: az utolsó 3 meccsen nincs pont. A legutóbbi meccsnek az előző 14 naptári napba kell esnie, különben „Korábbi meccsek” jelzés jelenik meg. Kevés vagy hiányos adatnál nem állítunk elő statisztikát. A kapusoknál a lövésekkel súlyozott védési hatékonyság látszik, nem pontszerző forma.

## Cloudflare Pages

Git integration:

| Mező | Érték |
|---|---|
| Production branch | `main` |
| Framework | `None` |
| Build command | üres |
| Root directory | repó gyökere (üres) |
| Output directory | `static` (a wrangler.toml is beállítja) |

A repógyökérben levő `functions/api/` könyvtárat a Pages build automatikusan fordítja. A `static/_routes.json` csak az `/api/*` kéréseket irányítja a Functions-re; a többi fájl statikus. Nem kell külön Rust-szerver a Pages telepítéshez: az ottani API-adapter JavaScript, a helyi/önálló webszerver Rust. A sima `static` mappa feltöltése önmagában nem elég az élő API-hoz: Functions-t tartalmazó Git deployment szükséges.

Végpontok: `/api/lineups` (Between the Lines JSON), `/api/lines?team=TBL` (korábbi közvetlen Daily Faceoff-adapter), `/health` (csak Rust), `/api/nhl?path=roster%2FEDM%2Fcurrent`, `/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow`, `/api/portrait?url=...` (opcionális TSN-import). A proxy kizárólag az engedélyezett NHL-útvonalakat éri el; nem általános URL-proxy.

Hálózati igény: `raw.githubusercontent.com`, `api-web.nhle.com`, `api.nhle.com`, `assets.nhle.com`; opcionális TSN-importhoz `www.tsn.ca`, `tsn.ca` és a TSN-oldal által visszaadott kép CDN-je. A Cloudflare fiók Pages Functions/Workers kéréskorlátai érvényesek.

## Élő ellenőrzés

A nyilvános feed 2026-10-19-i állománya mind a 32 csapatot tartalmazta. A helyi Rust-szerver a tényleges feedet és az aktuális hivatalos NHL-keretet együtt szolgálja ki. A közvetlen DFO-letöltés továbbra is 403-mal elutasított; a korábbi HTML-parser önmagában nem igazolt éles kapcsolat.

## Jelzések és sérülésadatok

- 👌 Stabil forma: az utolsó öt meccs pontadatai nem teljesítik a hot streak vagy pontcsend feltételeit.
- 🔝 Az NHL aktuális idényének pontlistavezetője: a külön `/api/leaders` végpont az NHL `skater-stats-leaders/current?categories=points&limit=-1` listáját kéri le. Minden pozitív pontszámmal holtversenyben vezető játékos jelzést kap; hiányos lista esetén nincs jelölés.
- 🩹 Automatikus külső sérülésjelentés: `/api/injuries`, forrása az ESPN nyilvános NHL injuries feedje (`site.api.espn.com`). Csapat és normalizált teljes név alapján egyeztetünk az NHL aktuális keretével, nem végzünk bizonytalan névhasonlósági találgatást. A név melletti jelzés a sorokban és a további kerettagoknál is megjelenik, a tooltip tartalmazza a forrás státuszát. Felfüggesztést és személyes ok miatti hiányzást nem címkézünk sérülésként.

Az ESPN-jelentés nem helyettesíti az NHL-keretet, és nem ad hozzá az NHL aktuális keretében nem szereplő játékost. A sérülésjelentés és a pontlista minden keretfrissítésnél frissül. Ha a külső forrás nem elérhető vagy a válasz sémája megváltozott, ezt a felület jelzi, és nem mutat megerősítetlen ikonokat. A jelzés hiánya nem igazol egészséges státuszt. A források működését tesztadatokkal ellenőriztük; az ESPN és az NHL éles kapcsolatát a fejlesztési környezet hálózati tiltása miatt továbbra sem lehetett igazolni.

## Forrásletöltési hiba diagnosztikája

A Pages `/api/lines` hiba esetén nem gyorsítótárazható 502 választ küld. Az `X-Line-Error` fejléc különbözteti meg az elutasított hozzáférést (`source-access-denied`), forrásoldali HTTP-hibát, ellenőrző oldalt, átirányítást és hálózati hibát. Az `X-Upstream-Status` az eredeti HTTP-státuszt mutatja, ha rendelkezésre áll. A függvény legfeljebb három HTTPS átirányítást követhet ugyanarra a csapatoldalra a Daily Faceoff saját domainjein. Másik domainre nem lép át, és semmilyen Cloudflare-ellenőrzést nem kerül meg. A felület megjeleníti a konkrét forráshibát.

Az éles Pages adatvégpont 502 válasza és a közvetlen Daily Faceoff-oldal 403-as Cloudflare-elutasítása is megfigyelhető volt. Engedélyezett gépi hozzáférés nélkül a kód módosítása önmagában nem igazolja vagy oldja meg az adatletöltést.
