import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Evaluate only the production pure/storage helpers; no React/DOM rendering.
const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
function helpers(storage = {}) {
  const events = [];
  const context = { window: { localStorage: storage, dispatchEvent: (event) => events.push(event) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, C: { error: 'red', peak: 'amber', text3: 'gray' }, DATA_URL: '/data', DEFAULT_DAYS: 14 };
  const start = source.indexOf("    const PREFS_KEY =");
  const stop = source.indexOf('    function useFeed(', start);
  vm.runInNewContext(source.slice(start, stop) + '\nthis.api = { validatePrefs, readPrefs, savePrefs, alertState, feedUrl, requestGate, tint };', context);
  return { ...context.api, events };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('client validates finite positive thresholds and ordered runway limits', () => {
  const api = helpers();
  assert.deepEqual(plain(api.validatePrefs({ warnDays: '8', lowDays: '2', dailyBudget: '' })), { warnDays: 8, lowDays: 2, dailyBudget: null });
  for (const value of [0, -1, Infinity, NaN, 'abc', true, ' ']) {
    assert.equal(api.validatePrefs({ warnDays: value, lowDays: 1 }), null);
  }
  assert.equal(api.validatePrefs({ warnDays: 3, lowDays: 3 }), null);
  assert.equal(api.validatePrefs({ warnDays: 7, lowDays: 3, dailyBudget: -1 }), null);
});

test('client storage exceptions retain valid in-memory preferences and dispatch sync event', () => {
  const api = helpers({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } });
  assert.equal(api.readPrefs().warnDays, 7);
  assert.equal(api.savePrefs({ warnDays: 10, lowDays: 4, dailyBudget: 20 }), true);
  assert.equal(api.readPrefs().warnDays, 10);
  assert.equal(api.events.length, 1);
  assert.equal(api.events[0].type, 'dsh-usage-peak:alerts-change');
  assert.equal(api.savePrefs({ warnDays: 1, lowDays: 2 }), false);
  assert.equal(api.events.length, 1);
});

test('client quota errors do not restore stale readable storage over unsaved preferences', () => {
  const api = helpers({ getItem: () => JSON.stringify({ warnDays: 7, lowDays: 3, dailyBudget: null }), setItem() { throw Error('quota'); } });
  assert.equal(api.readPrefs().warnDays, 7);
  api.savePrefs({ warnDays: 10, lowDays: 4, dailyBudget: 20 });
  assert.equal(api.readPrefs().warnDays, 10);
});

test('client corrupt storage falls back and valid storage restores', () => {
  let raw = '{broken';
  const api = helpers({ getItem: () => raw });
  assert.equal(api.readPrefs().lowDays, 3);
  raw = JSON.stringify({ warnDays: 9, lowDays: 2, dailyBudget: 30 });
  assert.equal(api.readPrefs().dailyBudget, 30);
});

test('client global budget and runway boundary levels use highest alert, never selected cost', () => {
  const api = helpers();
  const prefs = { warnDays: 7, lowDays: 3, dailyBudget: 100 };
  const check = (days, cost) => api.alertState({ wallet: { runwayDays: days }, globalTodayCost: cost, today: { cost: 0 } }, prefs);
  assert.equal(check(7, 100).level, 'ok');
  assert.equal(check(6.99, 100).level, 'warn');
  assert.equal(check(3, 100).level, 'warn');
  assert.equal(check(2.99, 0).level, 'low');
  assert.equal(check(20, 100.01).level, 'warn');
  assert.equal(check(20, 120).level, 'low');
  assert.equal(check(3, 120).level, 'low');
  assert.equal(check(null, 0).walletLevel, 'unknown');
  assert.equal(api.alertState({ wallet: { runwayDays: 20 }, today: { cost: 999 } }, prefs).budgetLevel, 'unknown');
});

test('client data and CSV URLs encode project identity and preserve scope', () => {
  const api = helpers();
  const project = '/项目/a b?x=1&foo=#';
  assert.equal(api.feedUrl('/data', 7, project, true), `/data?days=7&project=${encodeURIComponent(project)}&fresh=1`);
  assert.equal(`${api.feedUrl('/export.csv', 30, project)}&scope=projects`, `/export.csv?days=30&project=${encodeURIComponent(project)}&scope=projects`);
  assert.equal(api.feedUrl('/data', 14, ''), '/data?days=14');
});

test('client request generation guard rejects old filters, refreshes, and unmount results', () => {
  const gate = helpers().requestGate();
  gate.select('alpha');
  const first = gate.begin('alpha');
  gate.select('beta');
  assert.equal(gate.current(first), false);
  const second = gate.begin('beta');
  assert.equal(gate.current(second), true);
  const refresh = gate.begin('beta');
  assert.equal(gate.current(second), false);
  assert.equal(gate.current(refresh), true);
  gate.invalidate();
  assert.equal(gate.current(refresh), false);
});

test('client uses valid CSS color mixing and native keyboard buttons', () => {
  assert.equal(helpers().tint('var(--color)', 14), 'color-mix(in srgb, var(--color) 14%, transparent)');
  assert.doesNotMatch(source, /\$\{(?:C\.\w+|walletTone|props\.tone)\}(?:14|1a|22)/);
  assert.match(source, /onClick: \(\) => onSelect\(project.key\)/);
  assert.match(source, /'aria-label': t\('projects.clear'\)/);
  assert.match(source, /window.addEventListener\('storage', sync\)/);
});
