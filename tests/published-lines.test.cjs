const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../static/published-lines.js");
const now = Date.parse("2026-10-19T16:00:00Z");
const entry = {
  forwards: [
    ["Jake Guentzel", "Brayden Point", "Gage Goncalves"],
    ["Dominic James", "Conor Geekie"],
  ],
  defense: [["Victor Hedman", "Erik Cernak"]],
  goalies: [["Andrei Vasilevskiy"]],
  pp1: [
    "Jake Guentzel",
    "Brayden Point",
    "Gage Goncalves",
    "Victor Hedman",
    "Erik Cernak",
  ],
  pp2: [],
};
const feed = () => ({
  source: "dailyfaceoff.com",
  updated_at: "2026-10-19 14:45:21 UTC",
  teams: { "tampa-bay-lightning": structuredClone(entry) },
});
const roster = [
  {
    id: 8478010,
    name: "Brayden Point",
    first: "Brayden",
    last: "Point",
    group: "F",
  },
];
const parse = (data) =>
  PublishedLines.parse(data, roster, "tampa-bay-lightning", "TBL", now);
test("published lineup preserves rows, partial lines, Point NHL ID and PP source order", () => {
  const x = parse(feed());
  assert.equal(x.forwards[0][1], 8478010);
  assert.equal(x.forwards[1].length, 2);
  assert.equal(x.pp[0][1], 8478010);
  assert.deepEqual(x.pk, []);
  assert.equal(x.extra.length, 7);
  assert.equal(x.updated, "2026-10-19T14:45:21Z");
  assert.ok(PublishedLines.valid(x));
});
test("unidentified source names get no invented NHL ID or portrait", () => {
  const x = parse(feed());
  const p = x.extra.find((p) => p.name === "Jake Guentzel");
  assert.equal(p.id, "dfo:jakeguentzel");
  assert.equal(p.image, "");
});
test("rejects wrong source, missing timestamp, future, old or malformed published data", () => {
  for (const mutate of [
    (x) => (x.source = "other"),
    (x) => delete x.updated_at,
    (x) => (x.updated_at = "2027-01-01 00:00:00 UTC"),
    (x) => (x.updated_at = "2026-10-01 00:00:00 UTC"),
    (x) => x.teams["tampa-bay-lightning"].forwards[0].push("Extra Player"),
    (x) => (x.teams["tampa-bay-lightning"].forwards[0][0] = "Brayden Point"),
  ]) {
    const x = feed();
    mutate(x);
    assert.throws(() => parse(x));
  }
  assert.equal(
    PublishedLines.valid({ ...parse(feed()), type: "nhl-last-game" }),
    false,
  );
});

test("verified Nicholas Robertson alias resolves only to Nick's NHL roster ID", () => {
  const data = feed();
  data.teams["tampa-bay-lightning"].forwards[0][0] = "Nicholas Robertson";
  const nick = {
    id: 8481582,
    name: "Nick Robertson",
    first: "Nick",
    last: "Robertson",
    group: "F",
    number: 14,
    image: "verified-headshot",
  };
  const known = PublishedLines.parse(
    data,
    [...roster, nick],
    "tampa-bay-lightning",
    "TBL",
    now,
  );
  assert.equal(known.forwards[0][0], 8481582);
  assert.ok(!known.extra.some((p) => p.name === "Nicholas Robertson"));
  const absent = PublishedLines.parse(
    data,
    roster,
    "tampa-bay-lightning",
    "TBL",
    now,
  );
  assert.equal(absent.forwards[0][0], "dfo:nicholasrobertson");
  const otherRobertson = { ...nick, id: 8480027, name: "Jason Robertson" };
  assert.equal(
    PublishedLines.parse(
      data,
      [...roster, otherRobertson],
      "tampa-bay-lightning",
      "TBL",
      now,
    ).forwards[0][0],
    "dfo:nicholasrobertson",
  );
  const recovered = PublishedLines.reconcile(absent, [...roster, nick]);
  assert.equal(recovered.forwards[0][0], 8481582);
  assert.equal(recovered.updated, absent.updated);
  assert.deepEqual(recovered.forwards[0].slice(1), absent.forwards[0].slice(1));
  assert.equal(
    absent.forwards[0][0],
    "dfo:nicholasrobertson",
    "Saved source snapshot stays immutable",
  );
  assert.ok(!recovered.extra.some((p) => p.id === "dfo:nicholasrobertson"));
});

test("Jacob and Jake Middleton resolve to one NHL player, including saved source rows", () => {
  const data = feed();
  data.teams["tampa-bay-lightning"].defense[0][0] = "Jacob Middleton";
  const jake = { id: 8478136, name: "Jake Middleton", group: "D" };
  const resolved = PublishedLines.parse(
    data,
    [...roster, jake],
    "tampa-bay-lightning",
    "TBL",
    now,
  );
  assert.equal(resolved.defense[0][0], 8478136);
  assert.ok(!resolved.extra.some((p) => p.name === "Jacob Middleton"));
  const saved = PublishedLines.parse(
    data,
    roster,
    "tampa-bay-lightning",
    "TBL",
    now,
  );
  const recovered = PublishedLines.reconcile(saved, [...roster, jake]);
  assert.equal(recovered.defense[0][0], 8478136);
  assert.ok(!recovered.extra.some((p) => p.id === "dfo:jacobmiddleton"));
  assert.equal(recovered.updated, saved.updated);
});
test("official NHL localized name variants match without fuzzy nickname guessing", () => {
  const data = feed();
  data.teams["tampa-bay-lightning"].forwards[0][0] = "Official Alternate";
  const verified = {
    id: 1234567,
    name: "Official Default",
    nameAliases: ["Official Alternate"],
    group: "F",
  };
  const resolved = PublishedLines.parse(
    data,
    [...roster, verified],
    "tampa-bay-lightning",
    "TBL",
    now,
  );
  assert.equal(resolved.forwards[0][0], 1234567);
});

test("Verified source-name variants reconcile with single NHL IDs, including cached rows", () => {
  for (const [sourceName, id, officialName] of [
    ["Gabriel Perreault", 8484210, "Gabe Perreault"],
    ["Gabe Perraault", 8484210, "Gabe Perreault"],
    ["Gabe Perreault", 8484210, "Gabriel Perreault"],
    ["Alex Kerfoot", 8477021, "Alexander Kerfoot"],
    ["Alexander Kerfoot", 8477021, "Alex Kerfoot"],
    ["Zack Boulduc", 8482737, "Zachary Bolduc"],
    ["Zack Bolduc", 8482737, "Zachary Bolduc"],
    ["Zach Bolduc", 8482737, "Zachary Bolduc"],
    ["Johnny Brodzinski", 8477380, "Jonny Brodzinski"],
    ["Jonathan Brodzinski", 8477380, "Jonny Brodzinski"],
    ["Jonathon Brodzinski", 8477380, "Jonny Brodzinski"],
  ]) {
    const data = feed();
    data.teams["tampa-bay-lightning"].forwards[0][0] = sourceName;
    const official = { id, name: officialName, group: "F" };
    const resolved = PublishedLines.parse(
      data,
      [...roster, official],
      "tampa-bay-lightning",
      "TBL",
      now,
    );
    assert.equal(resolved.forwards[0][0], id, sourceName);
    assert.ok(
      !resolved.extra.some(
        (p) => p.name.toLowerCase() === sourceName.toLowerCase(),
      ),
    );
    const saved = PublishedLines.parse(
      data,
      roster,
      "tampa-bay-lightning",
      "TBL",
      now,
    );
    const recovered = PublishedLines.reconcile(saved, [...roster, official]);
    assert.equal(recovered.forwards[0][0], id);
    assert.equal(recovered.extra.length, saved.extra.length - 1);
    assert.equal(recovered.updated, saved.updated);
  }
});
