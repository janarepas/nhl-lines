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

## Aktuális sorok: Daily Faceoff

A sorösszeállítás kizárólagos forrása a kiválasztott csapat Daily Faceoff `line-combinations` oldala. A felület három fület tartalmaz: 5 az 5 ellen, Power Play, Shorthanded. A normál nézetben együtt látszanak a támadósorok, védőpárok és kapusok, a forrás szerinti sorrendben. Sikertelen letöltéskor nincs más adatokból számolt összeállítás.

A `/api/lines?team=TBL` végpont a rögzített csapat–URL megfeleltetésen keresztül olvassa a forrást. A böngésző egy inaktív HTML-dokumentumból, a szakaszcímek és játékoshivatkozások alapján azonosítja az egységeket; az oldal kódját nem hajtja végre, HTML-jét nem illeszti a felületbe. Megőrzi a forrás sorrendjét. A forrástól eltérő, pozíció alapján generált vagy kézzel átrendezett sorokat nem mutatja megerősített összeállításként.

A játékosokat normalizált teljes név alapján kapcsoljuk az NHL aktuális keretéhez. Ha valaki nem azonosítható az NHL keretében, a Daily Faceoff neve monogrammal jelenik meg, kitalált NHL-azonosító, portré vagy statisztika nélkül. Az aktuális NHL-keret további tagjai külön listában látszanak. A portrék az NHL `assets.nhle.com` szerveréről érkeznek; hiányzó vagy hibás képnél csapatszínű átmenetes monogram látszik. A forma mindig látható.

A forrás minden megnyitáskor, kézi frissítéskor és 10 percenként újraellenőrződik; az API-adapter legfeljebb 5 perces gyorsítótárat használhat. A forrás frissítési idejét csak frissítést jelölő (`dateModified`/`updated`) `time[datetime]` mező esetén mutatjuk; a letöltési időt külön jelöljük. A helyi tárhely `blueline-v2` kulcsa csapatonként menti a már feldolgozott forrást és idejét. Ha egyik adatforrás sem elérhető, a korábbi Daily Faceoff- vagy NHL-adat dátumozott mentett állapotként jelenik meg; régi, pozíció szerint generált sorokat nem használunk. Nem azonosítható forrásformátum és hiányzó PP/PK egység esetén egyértelmű üres állapot látszik.

A 32 csapat teljes szélességű logótekerőn választható, saját színeikkel. A játékosadatok forrása továbbra is `https://api-web.nhle.com/v1/roster/{TEAM}/current`. Az egyedi TSN-portré importja opcionális.

A böngészős regresszió tesztadatokkal futtatható Playwright + Chromium megléte esetén: `NHL_TEST_BASE_URL=http://127.0.0.1:3000 node tests/dfo.browser.cjs` (előtte induljon a Rust szerver). Ez a parser szemantikus mintáit, a füleket, a forrássorrend megőrzését és a hibakezelést ellenőrzi, nem az élő Daily Faceoff oldalt.

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

Végpontok: `/api/lines?team=TBL` (Daily Faceoff), `/health` (csak Rust), `/api/nhl?path=roster%2FEDM%2Fcurrent`, `/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow`, `/api/portrait?url=...` (opcionális TSN-import). A proxy kizárólag az engedélyezett NHL-útvonalakat éri el; nem általános URL-proxy.

Hálózati igény: `www.dailyfaceoff.com`, `api-web.nhle.com`, `api.nhle.com`, `assets.nhle.com`; opcionális TSN-importhoz `www.tsn.ca`, `tsn.ca` és a TSN-oldal által visszaadott kép CDN-je. A Cloudflare fiók Pages Functions/Workers kéréskorlátai érvényesek.

## Ellenőrzés korlátai

A fejlesztési környezet proxyja blokkolta az NHL, a Daily Faceoff és a publikus Pages domain élő elérését. A Daily Faceoff tényleges jelenlegi HTML-sémája és éles importja ezért NINCS ellenőrizve. Az importáló szemantikus HTML-tesztadatokkal futott; ha az élő oldal szerkezete más, a felület hibát jelez, és a parser külön igazítást igényel. A Rust tesztek, a forma számítása, a Cloudflare adapter tesztjei, a Workers fordítása és a böngészős folyamatok helyi, ellenőrzött API-tesztadatokkal futottak. Ez nem igazolja a publikus deployment vagy az élő NHL-adatok elérhetőségét; telepítés után ezeket külön kell ellenőrizni. A portrék sikertelen letöltését kezeljük, tényleges élő képletöltést a korlátozott környezetben nem lehetett igazolni.

## Jelzések és sérülésadatok

- 👌 Stabil forma: az utolsó öt meccs pontadatai nem teljesítik a hot streak vagy pontcsend feltételeit.
- 🔝 Az NHL aktuális idényének pontlistavezetője: a külön `/api/leaders` végpont az NHL `skater-stats-leaders/current?categories=points&limit=-1` listáját kéri le. Minden pozitív pontszámmal holtversenyben vezető játékos jelzést kap; hiányos lista esetén nincs jelölés.
- 🩹 Automatikus külső sérülésjelentés: `/api/injuries`, forrása az ESPN nyilvános NHL injuries feedje (`site.api.espn.com`). Csapat és normalizált teljes név alapján egyeztetünk az NHL aktuális keretével, nem végzünk bizonytalan névhasonlósági találgatást. A név melletti jelzés a sorokban és a további kerettagoknál is megjelenik, a tooltip tartalmazza a forrás státuszát. Felfüggesztést és személyes ok miatti hiányzást nem címkézünk sérülésként.

Az ESPN-jelentés nem helyettesíti az NHL-keretet, és nem ad hozzá az NHL aktuális keretében nem szereplő játékost. A sérülésjelentés és a pontlista minden keretfrissítésnél frissül. Ha a külső forrás nem elérhető vagy a válasz sémája megváltozott, ezt a felület jelzi, és nem mutat megerősítetlen ikonokat. A jelzés hiánya nem igazol egészséges státuszt. A források működését tesztadatokkal ellenőriztük; az ESPN és az NHL éles kapcsolatát a fejlesztési környezet hálózati tiltása miatt továbbra sem lehetett igazolni.

## Forrásletöltési hiba diagnosztikája

A Pages `/api/lines` hiba esetén nem gyorsítótárazható 502 választ küld. Az `X-Line-Error` fejléc különbözteti meg az elutasított hozzáférést (`source-access-denied`), forrásoldali HTTP-hibát, ellenőrző oldalt, átirányítást és hálózati hibát. Az `X-Upstream-Status` az eredeti HTTP-státuszt mutatja, ha rendelkezésre áll. A függvény legfeljebb három HTTPS átirányítást követhet ugyanarra a csapatoldalra a Daily Faceoff saját domainjein. Másik domainre nem lép át, és semmilyen Cloudflare-ellenőrzést nem kerül meg. A felület megjeleníti a konkrét forráshibát.

Az éles Pages adatvégpont 502 válasza és a közvetlen Daily Faceoff-oldal 403-as Cloudflare-elutasítása is megfigyelhető volt. Engedélyezett gépi hozzáférés nélkül a kód módosítása önmagában nem igazolja vagy oldja meg az adatletöltést.

## Sorösszeállítás forrása

Az 5v5, PP és PK egységek kizárólag a Daily Faceoff közölt sorrendjéből származnak. Nincs jégidőből számolt tartalék összeállítás. A korábban mentett NHL-kombinációkat a felület elutasítja. Forráshibánál csak egy korábban sikeresen letöltött, dátummal jelölt Daily Faceoff-mentés maradhat látható; ilyen mentés nélkül a sorok helyén a forráshiba jelenik meg.
