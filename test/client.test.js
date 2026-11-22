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
  vm.runInNewContext(source.slice(start, stop) + '\nthis.api = { validatePrefs, readPrefs, savePrefs, alertState, feedUrl, requestGate, tint, pillStatus, statusLabel, statusTip, tipAnchor, validatePricing, readPricing, savePricing, encodePricing, pricingParam, clonePricing, DEFAULT_PRICING };', context);
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

test('client alert prefix keeps the peak/valley countdown visible', () => {
  const api = helpers();
  assert.equal(api.pillStatus(true, '2:43 后转谷'), '⚠ 2:43 后转谷');
  assert.equal(api.pillStatus(false, '2:43 后转谷'), '2:43 后转谷');
});

test('client tooltip anchor stays inside the chart box', () => {
  const api = helpers();
  assert.equal(api.tipAnchor(100, 200, 400), 4);
  assert.equal(api.tipAnchor(300, 200, 400), 196);
  assert.equal(api.tipAnchor(20, 200, 400), 4);
  assert.equal(api.tipAnchor(399, 200, 400), 196);
  assert.equal(api.tipAnchor(50, 120, 100), 4);
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

test('client pricing validation rejects malformed tables and normalizes numeric strings', () => {
  const api = helpers();
  assert.equal(api.validatePricing(null), null);
  assert.equal(api.validatePricing([]), null);
  assert.equal(api.validatePricing([{ id: 'flash' }, { id: 'pro' }]), null);
  const duplicate = api.clonePricing(api.DEFAULT_PRICING);
  duplicate[1].id = 'flash';
  assert.equal(api.validatePricing(duplicate), null);
  for (const bad of [-1, Infinity, NaN, '', 'abc', true]) {
    const table = api.clonePricing(api.DEFAULT_PRICING);
    table[0].hit[0] = bad;
    assert.equal(api.validatePricing(table), null);
  }
  const table = api.clonePricing(api.DEFAULT_PRICING);
  table[0].hit = ['0.5', '1'];
  assert.deepEqual(plain(api.validatePricing(table)[0].hit), [0.5, 1]);
  assert.equal(api.validatePricing(table)[0].label, 'DeepSeek Flash');
});

test('client custom pricing round-trips through localStorage and emits a sync event', () => {
  const api = helpers();
  const custom = api.clonePricing(api.DEFAULT_PRICING);
  custom[0].miss = [0.5, 1];
  assert.equal(api.validatePricing(custom)[0].miss[1], 1);
  assert.notEqual(api.pricingParam(custom), '');
  assert.equal(api.pricingParam(api.DEFAULT_PRICING), '');
  assert.equal(api.pricingParam(null), '');
  const encoded = api.encodePricing(custom);
  assert.match(encoded, /^flash:/);
  assert.equal(api.savePricing(custom), true);
  assert.equal(api.events.at(-1).type, 'dsh-usage-peak:pricing-change');
  assert.deepEqual(plain(api.readPricing()), plain(custom));
  assert.equal(api.savePricing([{ id: 'flash' }]), false);
});

test('client pricing storage failures keep this page usable', () => {
  const api = helpers({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } });
  const custom = api.clonePricing(api.DEFAULT_PRICING);
  custom[1].out = [20, 40];
  assert.equal(api.savePricing(custom), true);
  assert.deepEqual(plain(api.readPricing())[1].out, [20, 40]);
  assert.equal(api.events.at(-1).type, 'dsh-usage-peak:pricing-change');
});

test('client feed URLs include only non-default pricing', () => {
  const api = helpers();
  const custom = api.clonePricing(api.DEFAULT_PRICING);
  custom[0].hit = [0.01, 0.02];
  const encoded = api.encodePricing(custom);
  assert.equal(api.feedUrl('/data', 7, '', false, custom), `/data?days=7&pricing=${encodeURIComponent(encoded)}`);
  assert.equal(api.feedUrl('/data', 7, '', false, api.DEFAULT_PRICING), '/data?days=7');
  assert.equal(api.feedUrl('/data', 7, '', true, custom), `/data?days=7&pricing=${encodeURIComponent(encoded)}&fresh=1`);
});

test('client status labels a holiday valley and a makeup workday peak', () => {
  const api = helpers();
  const dict = {
    'status.peak': '峰时',
    'status.valley': '谷时',
    'status.holiday': '节假日',
    'status.makeup': '调休上班',
    'status.holidayTip': '法定节假日，全天按谷时计价',
    'status.makeupTip': '调休上班日，按工作日峰谷时段计价',
    'widget.loading': '读取中',
  };
  const t = (key) => dict[key] || key;
  assert.equal(api.statusLabel({ now: { peak: false, holiday: '国庆节', makeup: null } }, t), '谷时 · 节假日');
  assert.equal(api.statusLabel({ now: { peak: true, holiday: null, makeup: '春节' } }, t), '峰时 · 调休上班');
  assert.equal(api.statusLabel({ now: { peak: true, holiday: null, makeup: null } }, t), '峰时');
  assert.equal(api.statusLabel({ now: { peak: false, holiday: null, makeup: null } }, t), '谷时');
  assert.equal(api.statusLabel(null, t), '读取中');
  assert.equal(api.statusTip({ now: { peak: false, holiday: '国庆节', makeup: null } }, t), '国庆节 · 法定节假日，全天按谷时计价');
  assert.equal(api.statusTip({ now: { peak: true, holiday: null, makeup: '春节' } }, t), '春节 · 调休上班日，按工作日峰谷时段计价');
  assert.equal(api.statusTip({ now: { peak: true, holiday: null, makeup: null } }, t), '');
});
