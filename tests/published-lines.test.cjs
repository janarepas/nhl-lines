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
