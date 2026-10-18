# Blue Line

Magyar nyelvű, NHL ihletésű sorkezelő. Rust HTTP-szerver, HTML/CSS/JavaScript felület, külső Rust-függőség nélkül.

## Indítás

Rust stable és curl szükséges.

```sh
cargo run
```

Alapértelmezett port: 3000. A `NHL_BIND` változóval módosítható. Ellenőrzés: `cargo test`, illetve GET `/health`.

32 csapat színpalettája választható; a kezdő téma Edmonton Oilers. A keret szándékosan szerkeszthető bemutató adat, nem élő vagy hivatalos csapatkeret. A csapatválasztás a színeket változtatja, a keretet megtartja. Módosítások a böngésző localStorage tárhelyére mentődnek. Az összhang egyszerű szerepkör-alapú becslés, nem az EA játék algoritmusa.

A játékosszerkesztő TSN-profil URL-ből a Rust szerveren keresztül kikeresi az oldal HTTPS `og:image` képét. Kép hiányában monogramot mutat. Az oldal előnézeti képe nem feltétlenül portré: a kiválasztott profilt és a képet ellenőrizni kell. A környezetben a tsn.ca és www.tsn.ca hálózati engedélyezése szükséges, a képekhez az adott TSN-kép CDN-je is. Nincs beégetett vagy más forrásból származó játékosfotó. TSN kapcsolat nélkül a felület és minden helyi szerkesztés működik; a portré importja érthető hibaüzenetet ad.

## Cloudflare Pages

A `wrangler.toml` a `static` mappát állítja be kimenetként. Git integration beállítások: production branch `main`, framework `None`, build command üres, root directory a repó gyökere. Nincs szükség Rust buildre a statikus felület publikálásához. A TSN-import Rust API-ja külön szolgáltatást vagy Workers implementációt igényel; Pages statikus tárhelyen önmagában nem működik.

A Cloudflare legutóbbi production deploymentjének sikeres (`Success`) állapotúnak kell lennie. Hibánál a build logot kell ellenőrizni; sikeres build mellett 404 esetén ellenőrizd, hogy a deployment a `static/index.html` fájlt publikálja, és a használt domain valóban az adott Pages-projekt domainje.
