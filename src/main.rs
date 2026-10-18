use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    process::Command,
    thread,
};

fn portrait(page: &str) -> Result<String, String> {
    if !(page.starts_with("https://www.tsn.ca/") || page.starts_with("https://tsn.ca/")) {
        return Err("Csak HTTPS TSN-profil adható meg.".into());
    }
    let output = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            page,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(
            "A TSN jelenleg nem érhető el. Ellenőrizd a hálózati hozzáférést és a profil címét."
                .into(),
        );
    }
    let html = String::from_utf8_lossy(&output.stdout);
    for tag in html.split('<').filter(|t| t.starts_with("meta ")) {
        if tag.contains("og:image") {
            if let Some(start) = tag.find("content=\"") {
                let url = tag[start + 9..]
                    .split('"')
                    .next()
                    .unwrap_or("")
                    .replace("&amp;", "&");
                if url.starts_with("https://") {
                    return Ok(url);
                }
            }
        }
    }
    Err("Nem található kép a megadott TSN-profilon.".into())
}
fn valid_nhl_path(path: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    match parts.as_slice() {
        ["roster", team, "current"] => {
            team.len() == 3 && team.bytes().all(|b| b.is_ascii_uppercase())
        }
        ["player", id, "game-log", "now"] => {
            (6..=9).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
        }
        _ => false,
    }
}
fn nhl(path: &str) -> Result<String, String> {
    if !valid_nhl_path(path) {
        return Err("Érvénytelen NHL-végpont.".into());
    }
    let url = format!("https://api-web.nhle.com/v1/{path}");
    let response = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            "--header",
            "Accept: application/json",
            &url,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !response.status.success() {
        return Err("Az NHL-adatforrás átmenetileg nem érhető el.".into());
    }
    String::from_utf8(response.stdout).map_err(|_| "Érvénytelen NHL-válasz.".into())
}
fn dfo_slug(code: &str) -> Option<&'static str> {
    match code {
        "ANA" => Some("anaheim-ducks"),
        "BOS" => Some("boston-bruins"),
        "BUF" => Some("buffalo-sabres"),
        "CGY" => Some("calgary-flames"),
        "CAR" => Some("carolina-hurricanes"),
        "CHI" => Some("chicago-blackhawks"),
        "COL" => Some("colorado-avalanche"),
        "CBJ" => Some("columbus-blue-jackets"),
        "DAL" => Some("dallas-stars"),
        "DET" => Some("detroit-red-wings"),
        "EDM" => Some("edmonton-oilers"),
        "FLA" => Some("florida-panthers"),
        "LAK" => Some("los-angeles-kings"),
        "MIN" => Some("minnesota-wild"),
        "MTL" => Some("montreal-canadiens"),
        "NSH" => Some("nashville-predators"),
        "NJD" => Some("new-jersey-devils"),
        "NYI" => Some("new-york-islanders"),
        "NYR" => Some("new-york-rangers"),
        "OTT" => Some("ottawa-senators"),
        "PHI" => Some("philadelphia-flyers"),
        "PIT" => Some("pittsburgh-penguins"),
        "SJS" => Some("san-jose-sharks"),
        "SEA" => Some("seattle-kraken"),
        "STL" => Some("st-louis-blues"),
        "TBL" => Some("tampa-bay-lightning"),
        "TOR" => Some("toronto-maple-leafs"),
        "UTA" => Some("utah-mammoth"),
        "VAN" => Some("vancouver-canucks"),
        "VGK" => Some("vegas-golden-knights"),
        "WSH" => Some("washington-capitals"),
        "WPG" => Some("winnipeg-jets"),
        _ => None,
    }
}
fn dfo_lines(code: &str) -> Result<String, String> {
    let slug = dfo_slug(code).ok_or("Érvénytelen NHL-csapat.")?;
    let url = format!("https://www.dailyfaceoff.com/teams/{slug}/line-combinations");
    let response = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "20",
            &url,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !response.status.success() {
        return Err("A Daily Faceoff aktuális sorai most nem tölthetők le.".into());
    }
    String::from_utf8(response.stdout).map_err(|_| "Érvénytelen forrásoldal.".into())
}
fn points_leaders() -> Result<String, String> {
    let response = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            "https://api-web.nhle.com/v1/skater-stats-leaders/current?categories=points&limit=-1",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !response.status.success() {
        return Err("Pontlista nem elérhető.".into());
    }
    String::from_utf8(response.stdout).map_err(|_| "Érvénytelen pontlista.".into())
}
fn injury_report() -> Result<String, String> {
    let response = Command::new("curl")
        .args([
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "15",
            "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !response.status.success() {
        return Err("Sérülésadat nem elérhető.".into());
    }
    String::from_utf8(response.stdout).map_err(|_| "Érvénytelen sérülésjelentés.".into())
}
fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
fn handle(mut stream: TcpStream) {
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .ok();
    let mut buf = [0; 16384];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buf[..n]);
    let path = request.split_whitespace().nth(1).unwrap_or("/");
    let (status, kind, body) = match path {
        "/" => (
            "200 OK",
            "text/html; charset=utf-8",
            include_str!("../static/index.html").to_string(),
        ),
        "/app.js" => (
            "200 OK",
            "text/javascript; charset=utf-8",
            include_str!("../static/app.js").to_string(),
        ),
        "/dfo.js" => (
            "200 OK",
            "text/javascript; charset=utf-8",
            include_str!("../static/dfo.js").to_string(),
        ),
        _ if path.starts_with("/api/lines?team=") => {
            let code = &path[16..];
            if dfo_slug(code).is_none() {
                (
                    "400 Bad Request",
                    "text/plain; charset=utf-8",
                    "Érvénytelen NHL-csapat.".into(),
                )
            } else {
                match dfo_lines(code) {
                    Ok(html) => ("200 OK", "text/plain; charset=utf-8", html),
                    Err(e) => ("502 Bad Gateway", "text/plain; charset=utf-8", e),
                }
            }
        }
        "/injuries.js" => (
            "200 OK",
            "text/javascript; charset=utf-8",
            include_str!("../static/injuries.js").to_string(),
        ),
        "/api/leaders" => match points_leaders() {
            Ok(json) => ("200 OK", "application/json; charset=utf-8", json),
            Err(_) => (
                "502 Bad Gateway",
                "application/json; charset=utf-8",
                "{\"error\":\"Pontlista nem elérhető.\"}".into(),
            ),
        },
        "/api/injuries" => match injury_report() {
            Ok(json) => ("200 OK", "application/json; charset=utf-8", json),
            Err(_) => (
                "502 Bad Gateway",
                "application/json; charset=utf-8",
                "{\"error\":\"Sérülésadat nem elérhető.\"}".into(),
            ),
        },
        "/stats.js" => (
            "200 OK",
            "text/javascript; charset=utf-8",
            include_str!("../static/stats.js").to_string(),
        ),
        "/style.css" => (
            "200 OK",
            "text/css; charset=utf-8",
            include_str!("../static/style.css").to_string(),
        ),
        "/health" => ("200 OK", "text/plain", "ok".into()),
        _ if path.starts_with("/api/nhl?path=") => {
            let route = decode(&path[14..]);
            if !valid_nhl_path(&route) {
                (
                    "400 Bad Request",
                    "application/json; charset=utf-8",
                    "{\"error\":\"Érvénytelen NHL-végpont.\"}".into(),
                )
            } else {
                match nhl(&route) {
                    Ok(json) => ("200 OK", "application/json; charset=utf-8", json),
                    Err(_) => (
                        "502 Bad Gateway",
                        "application/json; charset=utf-8",
                        "{\"error\":\"Az NHL-adatforrás átmenetileg nem érhető el.\"}".into(),
                    ),
                }
            }
        }
        _ if path.starts_with("/api/portrait?url=") => match portrait(&decode(&path[18..])) {
            Ok(url) => ("200 OK", "text/plain; charset=utf-8", url),
            Err(e) => ("422 Unprocessable Entity", "text/plain; charset=utf-8", e),
        },
        _ => ("404 Not Found", "text/plain", "Not found".into()),
    };
    let header=format!("HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",body.len());
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}
fn main() {
    let address = std::env::var("NHL_BIND").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = TcpListener::bind(&address).expect("Nem indítható a webszerver");
    println!("NHL Lines listening on {address}");
    for stream in listener.incoming().flatten() {
        thread::spawn(|| handle(stream));
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_profile_url() {
        assert_eq!(
            decode("https%3A%2F%2Fwww.tsn.ca%2Fnhl%2Fplayer"),
            "https://www.tsn.ca/nhl/player"
        );
    }
    #[test]
    fn only_supported_nhl_routes() {
        assert!(valid_nhl_path("roster/EDM/current"));
        assert!(valid_nhl_path("player/8478402/game-log/now"));
        for path in [
            "https://evil.com",
            "roster/../../current",
            "roster/EDM/current?token=x",
            "player/abc/game-log/now",
            "roster/edm/current",
        ] {
            assert!(!valid_nhl_path(path));
        }
    }
    #[test]
    fn malformed_encoding_does_not_panic() {
        assert_eq!(decode("%é"), "%é");
    }
    #[test]
    fn rejects_other_hosts() {
        assert!(portrait("https://example.com/").is_err());
        assert!(portrait("https://www.tsn.ca.evil.com/").is_err());
    }
}
