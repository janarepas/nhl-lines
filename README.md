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

## Keretek, sorok, portrék

- 32 csapat választható a saját színeivel a középre igazodó, horizontális logótekerőn. Egérrel húzható, érintéssel és görgővel görgethető; a nyílgombok, a Home és az End billentyűk is működnek. A választás az NHL aktuális keretét tölti be a `https://api-web.nhle.com/v1/roster/{TEAM}/current` végpontról.
- Minden megnyitáskor, kézi frissítéskor és 10 percenként újraellenőrizzük a keretet. Az API-adapter legfeljebb 5 perces gyorsítótárat használhat.
- A saját összeállítás NHL-játékosazonosítókat tárol. Keretfrissítéskor a távozókat eltávolítja, az érvényes helyeket megtartja, az újakat pozíció szerint hozzáadja; a további kerettagok külön megjelennek. A sorok nem hivatalos vagy Daily Faceoff által megerősített meccsnapi sorok.
- Helyi tárolás: `localStorage`, `blueline-v2` kulcs. Csapatonként külön sorrend. Ha az NHL nem elérhető, a mentett keret dátumozott figyelmeztetéssel jelenik meg; első látogatáskor érthető üres állapot látszik. Nincs beépített, elavult bemutató keret.
- A portrék és emblémák az NHL `assets.nhle.com` szerveréről érkeznek; a játékos képcímét a keret API adja vissza. Hiányzó kép esetén monogram látszik. Egyedi TSN-profil importja opcionális.

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

Végpontok: `/health` (csak Rust), `/api/nhl?path=roster%2FEDM%2Fcurrent`, `/api/nhl?path=player%2F8478402%2Fgame-log%2Fnow`, `/api/portrait?url=...` (opcionális TSN-import). A proxy kizárólag az engedélyezett NHL-útvonalakat éri el; nem általános URL-proxy.

Hálózati igény: `api-web.nhle.com`, `assets.nhle.com`; opcionális TSN-importhoz `www.tsn.ca`, `tsn.ca` és a TSN-oldal által visszaadott kép CDN-je. A Cloudflare fiók Pages Functions/Workers kéréskorlátai érvényesek.

## Ellenőrzés korlátai

A fejlesztési környezet proxyja blokkolta az NHL, a Daily Faceoff és a publikus Pages domain élő elérését. A Rust tesztek, a forma számítása, a Cloudflare adapter tesztjei, a Workers fordítása és a böngészős folyamatok helyi, ellenőrzött API-tesztadatokkal futottak. Ez nem igazolja a publikus deployment vagy az élő NHL-adatok elérhetőségét; telepítés után ezeket külön kell ellenőrizni. A portrék sikertelen letöltését kezeljük, tényleges élő képletöltést a korlátozott környezetben nem lehetett igazolni.
