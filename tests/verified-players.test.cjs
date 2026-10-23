const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../static/verified-players.json');

test('verified supplemental identities keep official NHL IDs, exact source references and groups', () => {
  assert.equal(registry.version, 1);
  assert.ok(Number.isFinite(Date.parse(registry.checkedAt)));
  const ids = new Set();
  for (const player of registry.players) {
    assert.ok(Number.isSafeInteger(player.id) && player.id > 0);
    assert.ok(!ids.has(player.id)); ids.add(player.id);
    assert.equal(player.name, player.first + ' ' + player.last);
    assert.ok(player.nameAliases.includes(player.name));
    assert.equal(player.sourceUrl, `https://api-web.nhle.com/v1/player/${player.id}/landing`);
    assert.match(player.image, new RegExp(`^https://assets\\.nhle\\.com/mugs/nhl/\\d{8}/[A-Z]{3}/${player.id}\\.png$`));
    assert.ok(player.sourceTeams.length > 0 && player.sourceTeams.every(team => /^[A-Z]{3}$/.test(team)));
    assert.equal(player.group, player.pos === 'G' ? 'G' : player.pos === 'D' ? 'D' : 'F');
    assert.ok(Number.isInteger(player.number));
    assert.match(player.birthCountry, /^[A-Z]{3}$/);
  }
});

test('published source teams never overwrite the verified current team after transfers', () => {
  for (const id of [8482110, 8482076]) {
    const player = registry.players.find(player => player.id === id);
    assert.deepEqual(player.sourceTeams, ['NJD']);
    assert.equal(player.currentTeam, 'WPG');
    assert.match(player.image, /\/WPG\//);
  }
  const player = registry.players.find(player => player.id === 8482700);
  assert.equal(player.name, 'Nolan Allan');
  assert.equal(player.currentTeam, 'SJS');
});
