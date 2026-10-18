const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseReport, normalize } = require("../static/injuries.js");
const report = {
  injuries: [
    {
      displayName: "Edmonton Oilers",
      injuries: [
        {
          athlete: { displayName: "Ryan Nugent-Hopkins" },
          status: "Out",
          details: { type: "Upper Body" },
        },
        {
          athlete: { displayName: "Connor McDavid" },
          status: "Day-To-Day",
          details: { type: "Lower Body" },
        },
        {
          athlete: { displayName: "Suspended Player" },
          status: "Out",
          details: { type: "Suspension" },
        },
        { athlete: { displayName: "Available Player" }, status: "Active" },
      ],
    },
    {
      displayName: "Boston Bruins",
      injuries: [{ athlete: { displayName: "Other Player" }, status: "Out" }],
    },
  ],
};
test("separate injury report only matches the selected team and injury statuses", () => {
  const map = parseReport(report, "Edmonton Oilers");
  assert.equal(map.size, 2);
  assert.equal(map.get(normalize("Ryan Nugent-Hopkins")).status, "Out");
  assert.ok(!map.has(normalize("Suspended Player")));
  assert.ok(!map.has(normalize("Other Player")));
});
test("normalizes punctuation and diacritics, without fuzzy name matching", () => {
  assert.equal(normalize("Nugent-Hopkins"), normalize("Nugent Hopkins"));
  assert.equal(normalize("Montréal"), normalize("Montreal"));
  assert.notEqual(normalize("Sebastian Aho"), normalize("Sebastien Aho"));
});
test("unknown schemas produce unavailability, rather than healthy statuses", () => {
  assert.throws(() => parseReport({}, "Edmonton Oilers"));
  assert.throws(() =>
    parseReport({ injuries: [{ players: [] }] }, "Edmonton Oilers"),
  );
  assert.equal(parseReport({ injuries: [] }, "Edmonton Oilers").size, 0);
});
