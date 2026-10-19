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

A kiadó JSON-ja `Access-Control-Allow-Origin: *` fejléccel böngészőből is olvasható. A Pages kapcsolati hibája esetén a felület ugyanazt a rögzített nyilvános feedet közvetlenül kéri le; forrásoldali hozzáférés-elutasítás vagy hibás séma esetén nincs ilyen újrapróbálkozás.

A kiadó naponta többször frissít. Megőrizzük a támadósorok, védőpárok, kapusok és PP-egységek közölt sorrendjét; sem jégidőből, sem statisztikából nem számolunk összeállítást. A forrás hiányos sorait hiányosként mutatjuk, nem töltjük fel más játékossal. A jelenlegi feed nem közöl PK-egységeket. A Shorthanded fül külön RotoWire-forrást használ az alábbi korlátokkal. Ez nem meccs közbeni élő követés, és nem feltétlenül megerősített következő meccses kezdőcsapat.

A felület feltünteti a feed publikációs időpontját, a kiadót és az eredeti forrását. Több mint 36 órás állománynál figyelmeztet; hiányzó, jövőbeli vagy több mint 7 napos letöltött adatot elutasít. A közvetlen forrásoldal frissítési idejét nem ismerjük. A már feldolgozott csapatadatot dátummal mentjük; kapcsolatvesztéskor egyértelmű mentett jelzést mutatunk. Korábbi, jégidőből számolt mentések nem jelenhetnek meg.

A Power Play egységek sematikus umbrella nézetet kapnak: az első azonosított védő hátul, középen jelenik meg, a többi játékos körülötte. Ez megjelenítési séma, nem a forrás által megerősített taktikai helyek állítása. A tagság nem változik; ismeretlen posztnál nem címkézünk játékost védőnek. A portrék csapatszínű körkeretet kapnak, elhalványítás nélkül. Asztali nézetben a két kompakt PP-egység egymás mellett látszik, mobilon egymás alatt.

A nevek alatt az NHL-keret `shootsCatches` mezőjéből származó ütőfogás röviden bekeretezett 🏒 Left / 🏒 Right formában látszik. A védőpárokban a mezszám mellett a soron belüli bal/jobb oldal szerint LD/RD jelölés szerepel, az ütőfogástól függetlenül. Kapusnál ugyanez a mező a fogókezet jelöli. Hiányzó vagy ismeretlen adatnál „—” jelenik meg.

A játékosokat normalizált teljes név alapján egyeztetjük az NHL aktuális keretével. Azonosított játékosnál hivatalos NHL-portré és forma látszik; azonosítatlan névnél monogram és hiányzó statisztika, kitalált NHL-ID nélkül. A további kerettagok külön listában szerepelnek. A portrék automatikusan az NHL-től érkeznek; nincs felhasználói portrébeállítás.

A 32 csapat az egysoros felső navigáció kereshető logós listájából választható. A felület nyitott, kártyakeretek nélküli elrendezést és nagy rendszerbetűket használ; Apple-eszközökön a platform saját SF betűtípusát. Görgetés nem vált csapatot. A fejléc helyben tárolt, generált meztextúrát használ az adott klub színeiben; nem a hivatalos mez termékfotója.

Böngészős regresszió: `NHL_TEST_BASE_URL=http://127.0.0.1:3000 node tests/dfo.browser.cjs`. Ez név alapú feedtesztadatokkal ellenőrzi a füleket, forrássorrendet, dátumozott mentést és hibakezelést; a régi HTML-parser tesztjeit is megtartja. Az éles kapcsolathoz külön tényleges forráskérés szükséges.

## Shorthanded: RotoWire és box nézet

A `/api/penalty-kill` a RotoWire nyilvános `https://www.rotowire.com/hockey/depth-charts-pk.php` oldalát kéri le, rögzített URL-ről. A böngésző az explicit Forward / Forward / Defenseman / Defenseman oszlopok első és második sorából olvassa a PK1/PK2 egységeket; nem számol jégidőből vagy statisztikából. A négy játékos két-két sorban, sematikus box alakzatban jelenik meg. Ez megjelenítési mód, nem állítás a csapat tényleges védekezési rendszeréről.

A 2026-10-19-i ellenőrzéskor öt csapat adatlapja volt nyilvános (ANA, BOS, BUF, CAR, CBJ); a többi 27 előfizetést kér. ANA, BOS, BUF és CAR mindkét egységét sikerült az NHL aktuális keretéhez egyeztetni. CBJ egyik neve nem szerepelt a hivatalos keretben, ezért az ellenőrzés elutasította az egységeit. Az előfizetéses tartalmat nem kérjük le más útvonalon. Hiányzó / megváltozott / nem egyeztethető adatnál az ok jelenik meg, generált egység helyett. Nincs teljes 32 csapatos PK-lefedettség.

A RotoWire itt nem közöl frissítési időt: a felület a **lekérés** idejét írja ki, nem állítja, hogy a sorok akkor módosultak. A PK-adatot minden csapatváltáskor és frissítéskor újra kéri le (szerveres gyorsítótár legfeljebb 5 perc); nem menti helyi soradatként. A fő feed által esetleg később közölt PK-egységek elsőbbséget kapnak.

## Mozgás és fejléc

A `static/motion.js` finom egérgörgős mozgást és kb. 1 másodperces sorbelépést biztosít. Az animáció a statisztikai újrarajzolásokon át folytatódik, nem indul újra; a csapatlista és a profil saját görgetése natív marad. A `prefers-reduced-motion` letiltja a mozgást. Az üveghatás a fejlécen, a legördülőn, súgókon és profilon jelenik meg, a sorok továbbra is kártyamentesek.

A fejléc jobb oldalán a kiválasztott csapat idényes pontlistavezetője szerepel, holtverseny esetén mindegyik játékos. Adatforrás: NHL `club-stats/{TEAM}/now`; a megjelenített idény és a rájátszás-jelölés is a forrásból származik. Meccs, gól, gólpassz, pont, plusz–mínusz és kapura lövés látható. Hiányzó adatot nem helyettesítünk kitalált számmal. Az ütőfogás kisebb, keretezett jelölést kap.

Önálló mozgásteszt: `node tests/motion.browser.cjs` (Playwright és Chromium szükséges).

## Forma

A teljes 🔥/🧊/👌 formajelöléshez (ikon és szöveg) rámutatásra megjelenő súgó tartozik; billentyűzetfókusszal és érintéssel is elérhető. Nincs külön állandó formamagyarázó blokk. A navigáció, csapatnév, frissítés és állapotok egy rövid, lágy mezmintás fejlécet alkotnak.


Forrás: `/v1/player/{ID}/game-log/now`, az utolsó legfeljebb öt lejátszott meccs. Aktuális hot streak: legalább 3 egymást követő pontszerző mérkőzés, vagy legalább 7 pont pontosan öt meccsen. Pontcsend: az utolsó 3 meccsen nincs pont. A legutóbbi meccsnek az előző 14 naptári napba kell esnie, különben „Korábbi meccsek” jelzés jelenik meg. Kevés vagy hiányos adatnál nem állítunk elő statisztikát. A kapusok statisztikái elsőként töltődnek. A kapusforma az oldal saját SV%-alapú jelölése: legalább 3, legfeljebb 5 legutóbbi meccs és teljes, érvényes lövésadat esetén 🔥 legalább 93%, 🧊 89% alatt, 👌 a kettő között (89% beleértve, 93% nélkül). Régi, kevés vagy hiányos adatnál nincs aktuális formaosztályzat; a meglévő statisztikák láthatók maradnak. A súgó tartalmazza a küszöböket, a hot streak összesítő a kapusokat is számolja. Az utolsó legfeljebb 5 meccs összes lövéséből számolt védési hatékonyság, játékidővel súlyozott GAA (kapott gól / 60 perc) és W–L–OT mérleg jelenik meg. Hiányzó alapadatnál a megfelelő érték nem számítható; nem állítunk elő becslést.

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

Végpontok: `/api/penalty-kill` (nyilvános RotoWire PK-adatlap), `/api/lineups` (Between the Lines JSON), `/api/lines?team=TBL` (korábbi közvetlen Daily Faceoff-adapter), `/health` (csak Rust), `/api/nhl?path=roster%2FEDM%2Fcurrent`, `/api/nhl?path=club-stats%2FSJS%2Fnow`, `/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow`, `/api/portrait?url=...` (korábbi adapter, a felület már nem használja). A proxy kizárólag az engedélyezett NHL-útvonalakat éri el; nem általános URL-proxy.

Hálózati igény: `raw.githubusercontent.com`, `api-web.nhle.com`, `api.nhle.com`, `assets.nhle.com`; opcionális TSN-importhoz `www.tsn.ca`, `tsn.ca` és a TSN-oldal által visszaadott kép CDN-je. A Cloudflare fiók Pages Functions/Workers kéréskorlátai érvényesek.

## Élő ellenőrzés

A nyilvános feed 2026-10-19-i állománya mind a 32 csapatot tartalmazta. A helyi Rust-szerver a tényleges feedet és az aktuális hivatalos NHL-keretet együtt szolgálja ki. A közvetlen DFO-letöltés továbbra is 403-mal elutasított; a korábbi HTML-parser önmagában nem igazolt éles kapcsolat.

## Jelzések és sérülésadatok

- 👌 Stabil forma: az utolsó öt meccs pontadatai nem teljesítik a hot streak vagy pontcsend feltételeit.
- 🔝 Az NHL aktuális idényének és a kiválasztott csapatnak a pontlistavezetője: a külön `/api/leaders` végpont az NHL `skater-stats-leaders/current?categories=points&limit=-1` listáját kéri le. A teljes lista `teamAbbrev` mezője szerint külön kiszámítjuk a csapat maximumát. Minden pozitív pontszámmal holtversenyben vezető játékos jelzést kap; a tooltip megkülönbözteti a csapat- és NHL-vezetést. hiányos lista esetén nincs jelölés.
- 🩹 Automatikus külső sérülésjelentés: `/api/injuries`, forrása az ESPN nyilvános NHL injuries feedje (`site.api.espn.com`). Csapat és normalizált teljes név alapján egyeztetünk az NHL aktuális keretével, nem végzünk bizonytalan névhasonlósági találgatást. Külön sorban jelenik meg a 🩹, a sérülés típusa és az ESPN `details.returnDate` alapján a várható visszatérés, illetve hozzávetőleges hátralévő napok száma. A napkülönbség budapesti naptári dátumok szerint számolódik. Hiányzó adatnál nem ismert időpontot jelzünk; lejárt becslést nem állítunk be visszatérésként. A tooltip jelzi a forrást és a becslés jellegét. Felfüggesztést és személyes ok miatti hiányzást nem címkézünk sérülésként.

Az ESPN-jelentés nem helyettesíti az NHL-keretet, és nem ad hozzá az NHL aktuális keretében nem szereplő játékost. A sérülésjelentés és a pontlista minden keretfrissítésnél frissül. Ha a külső forrás nem elérhető vagy a válasz sémája megváltozott, ezt a felület jelzi, és nem mutat megerősítetlen ikonokat. A jelzés hiánya nem igazol egészséges státuszt. Az ESPN éles feedjének strukturált sérüléstípus- és visszatérési dátummezőit ellenőriztük. A megjelenítés és a hiányzó/lejárt dátumok kezelése külön tesztekben is szerepel.

## Forrásletöltési hiba diagnosztikája

A Pages `/api/lines` hiba esetén nem gyorsítótárazható 502 választ küld. Az `X-Line-Error` fejléc különbözteti meg az elutasított hozzáférést (`source-access-denied`), forrásoldali HTTP-hibát, ellenőrző oldalt, átirányítást és hálózati hibát. Az `X-Upstream-Status` az eredeti HTTP-státuszt mutatja, ha rendelkezésre áll. A függvény legfeljebb három HTTPS átirányítást követhet ugyanarra a csapatoldalra a Daily Faceoff saját domainjein. Másik domainre nem lép át, és semmilyen Cloudflare-ellenőrzést nem kerül meg. A felület megjeleníti a konkrét forráshibát.

Az éles Pages adatvégpont 502 válasza és a közvetlen Daily Faceoff-oldal 403-as Cloudflare-elutasítása is megfigyelhető volt. Engedélyezett gépi hozzáférés nélkül a kód módosítása önmagában nem igazolja vagy oldja meg az adatletöltést.
