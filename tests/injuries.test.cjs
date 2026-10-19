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

test("injury details retain the published return date and display approximate remaining days", () => {
  const { describe } = require("../static/injuries.js");
  const data = {
    injuries: [
      {
        displayName: "Edmonton Oilers",
        injuries: [
          {
            athlete: { displayName: "Connor McDavid" },
            status: "Out",
            date: "2026-10-15T10:00Z",
            details: {
              type: "Knee",
              detail: "Surgery",
              returnDate: "2026-10-23",
            },
          },
        ],
      },
    ],
  };
  const injury = parseReport(data, "Edmonton Oilers").get(
    normalize("Connor McDavid"),
  );
  assert.equal(injury.returnDate, "2026-10-23");
  assert.equal(injury.date, "2026-10-15T10:00Z");
  const text = describe(injury, Date.parse("2026-10-19T12:00Z"));
  assert.match(text.type, /Térdsérülés.*műtét/);
  assert.match(text.returnLabel, /kb\. 4 nap/);
  assert.equal(text.days, 4);
  assert.equal(
    describe(injury, Date.parse("2026-10-19T22:30Z")).days,
    3,
    "Use Budapest calendar dates",
  );
});
test("unknown, invalid and expired return estimates never invent recovery duration", () => {
  const { describe } = require("../static/injuries.js");
  const now = Date.parse("2026-10-19T12:00Z");
  for (const returnDate of [null, "invalid", "2026-02-30"]) {
    const info = describe(
      {
        reason: "Lower Body",
        status: "Day-To-Day",
        date: "2026-10-23",
        returnDate,
      },
      now,
    );
    assert.equal(info.days, null);
    assert.match(info.returnLabel, /nem ismert/);
    assert.match(info.type, /Alsótest/);
  }
  const expired = describe({ status: "Out", returnDate: "2026-10-18" }, now);
  assert.equal(expired.days, null);
  assert.match(expired.returnLabel, /becslés lejárt/);
  assert.match(
    describe({ status: "Out", returnDate: "2026-10-19" }, now).returnLabel,
    /ma \(becslés\)/,
  );
  const data = {
    injuries: [
      {
        displayName: "Edmonton Oilers",
        injuries: [
          {
            athlete: { displayName: "Non Injury" },
            status: "Out",
            details: { type: "Contract Dispute" },
          },
        ],
      },
    ],
  };
  assert.equal(parseReport(data, "Edmonton Oilers").size, 0);
});
