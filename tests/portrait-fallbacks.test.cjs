const test = require("node:test");
const assert = require("node:assert/strict");
require("../static/portrait-fallbacks.js");

test("missing current portraits resolve only for their verified exact NHL identity and source", () => {
  const cases = [
    [8477971, "DET", "20252026", "NSH"],
    [8482806, "NSH", "20252026", "MTL"],
    [8476822, "NYR", "20252026", "PHI"],
    [8482111, "STL", "20252026", "NSH"],
    [8480842, "EDM", "20222023", "PIT"],
  ];
  for (const [id, currentTeam, season, archiveTeam] of cases) {
    const current = `https://assets.nhle.com/mugs/nhl/20262027/${currentTeam}/${id}.png`;
    const expected = `https://assets.nhle.com/mugs/nhl/${season}/${archiveTeam}/${id}.png`;
    const found = PortraitFallbacks.resolve(id, current);
    assert.equal(found.image, expected);
    assert.equal(found.missing, current);
    assert.match(found.label, /^NHL archive portrait/);
    assert.equal(PortraitFallbacks.resolve(id + 1, current), null);
    assert.equal(
      PortraitFallbacks.resolve(id, current.replace("20262027", "20272028")),
      null,
    );
    assert.equal(
      PortraitFallbacks.resolve(id, current.replace(currentTeam, "BOS")),
      null,
    );
    found.image = "https://example.test/changed.png";
    assert.equal(
      PortraitFallbacks.resolve(id, current).image,
      expected,
      "Caller cannot alter later resolutions",
    );
  }
});

test("archive refresh sources are unique and stay on the official same-player NHL asset route", () => {
  const sources = PortraitFallbacks.sources();
  assert.equal(sources.length, 5);
  assert.equal(new Set(sources).size, 5);
  for (const source of sources)
    assert.match(
      source,
      /^https:\/\/assets\.nhle\.com\/mugs\/nhl\/\d{8}\/[A-Z]{3}\/\d{7}\.png$/,
    );
  sources.pop();
  assert.equal(PortraitFallbacks.sources().length, 5);
  assert.equal(
    PortraitFallbacks.resolve(
      8478402,
      "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
    ),
    null,
  );
});
