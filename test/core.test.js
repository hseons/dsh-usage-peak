import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import {
  aggregateTurns,
  apply,
  buildSnapshot,
  buildCsv,
  csvEscape,
  decodeSessionFile,
  emptyDay,
  encodePricing,
  holidayAt,
  isPeakAt,
  normalizePricing,
  parsePricingParam,
  resolvePricing,
  nextSwitch,
  normalizeDays,
  parseSessionMeta,
  parseSessionTurns,
  priceFor,
  projectInfo,
  walletSummary,
} from '../index.js';

/** Beijing wall clock -> epoch ms. */
const bj = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 8 * 3600_000;

test('priceFor picks the pro table only for pro models', () => {
  assert.equal(priceFor('deepseek-flash').id, 'flash');
  assert.equal(priceFor('deepseek-pro').id, 'pro');
  const unknown = priceFor('some-unknown-model');
  assert.equal(unknown.id, 'other');
  assert.equal(unknown.fallback, true);
  // Still estimated at Flash rates so totals do not collapse to zero.
  assert.deepEqual(unknown.out, priceFor('deepseek-flash').out);
  assert.equal(priceFor(undefined).id, 'other');
});

test('isPeakAt covers the four weekday windows and nothing else', () => {
  // 2026-11-09 is a Monday.
  assert.equal(isPeakAt(bj(2026, 11, 9, 8, 59)), false);
  assert.equal(isPeakAt(bj(2026, 11, 9, 9, 0)), true);
  assert.equal(isPeakAt(bj(2026, 11, 9, 11, 59)), true);
  assert.equal(isPeakAt(bj(2026, 11, 9, 12, 0)), false);
  assert.equal(isPeakAt(bj(2026, 11, 9, 14, 0)), true);
  assert.equal(isPeakAt(bj(2026, 11, 9, 17, 59)), true);
  assert.equal(isPeakAt(bj(2026, 11, 9, 18, 0)), false);
  assert.equal(isPeakAt(bj(2026, 11, 9, 23, 30)), false);
  // Saturday / Sunday are always valley.
  assert.equal(isPeakAt(bj(2026, 11, 7, 10, 0)), false);
  assert.equal(isPeakAt(bj(2026, 11, 8, 15, 0)), false);
});

test('public holidays are valley all day, makeup workdays follow weekday hours', () => {
  // 2026 National Day: Oct 1 (Thu) is a public holiday.
  assert.equal(isPeakAt(bj(2026, 10, 1, 10, 0)), false);
  assert.equal(isPeakAt(bj(2026, 10, 7, 15, 0)), false);
  // Spring Festival makeup: Feb 14 is a Saturday but a working day.
  assert.equal(isPeakAt(bj(2026, 2, 14, 10, 0)), true);
  assert.equal(isPeakAt(bj(2026, 2, 14, 13, 0)), false);
  // New Year makeup: Jan 4 is a Sunday but a working day.
  assert.equal(isPeakAt(bj(2026, 1, 4, 10, 0)), true);
  // A plain weekend stays valley.
  assert.equal(isPeakAt(bj(2026, 11, 7, 10, 0)), false);
});

test('nextSwitch skips holiday blocks and honors makeup workdays', () => {
  // Wednesday Sep 30 2026 evening: Oct 1-7 are holidays, next peak is Oct 8.
  const afterNationalDay = nextSwitch(bj(2026, 9, 30, 19, 0));
  assert.equal(afterNationalDay.at, bj(2026, 10, 8, 9, 0));
  assert.equal(afterNationalDay.status, 'peak');

  // Saturday Sep 19: Sunday Sep 20 is a makeup workday, so it is the next peak.
  const makeup = nextSwitch(bj(2026, 9, 19, 10, 0));
  assert.equal(makeup.at, bj(2026, 9, 20, 9, 0));
  assert.equal(makeup.status, 'peak');
});

test('nextSwitch reaches past a nine-day Spring Festival block', () => {
  // 2026: Feb 15-23 off. Feb 14 (Sat) is a makeup workday ending at 18:00.
  // The next peak is Tuesday Feb 24, not a fake switch one hour later.
  const afterChunjie2026 = nextSwitch(bj(2026, 2, 14, 18, 0));
  assert.equal(afterChunjie2026.at, bj(2026, 2, 24, 9, 0));
  assert.equal(afterChunjie2026.status, 'peak');
  // From inside the break (Feb 23 is still a holiday) the same target holds.
  assert.equal(nextSwitch(bj(2026, 2, 23, 8, 0)).at, bj(2026, 2, 24, 9, 0));

  // 2027: Feb 5-13 off, Feb 14 (Sun) is a makeup workday, so it is the target.
  const afterChunjie2027 = nextSwitch(bj(2027, 2, 4, 18, 0));
  assert.equal(afterChunjie2027.at, bj(2027, 2, 14, 9, 0));
  assert.equal(afterChunjie2027.status, 'peak');
});

test('holidayAt exposes the rule behind the current tariff', () => {
  assert.deepEqual(holidayAt(bj(2026, 10, 1, 10, 0)), { day: '2026-10-01', holiday: '国庆节', makeup: null });
  assert.deepEqual(holidayAt(bj(2026, 2, 14, 10, 0)), { day: '2026-02-14', holiday: null, makeup: '春节' });
  assert.deepEqual(holidayAt(bj(2026, 11, 9, 10, 0)), { day: '2026-11-09', holiday: null, makeup: null });
});

test('aggregateTurns tags holiday days in the window', () => {
  const now = bj(2026, 10, 7, 12, 0);
  const agg = aggregateTurns([], { now, days: 7 });
  assert.equal(agg.window[0].day, '2026-10-01');
  assert.equal(agg.window[0].holiday, '国庆节');
  assert.equal(agg.window[6].holiday, '国庆节');
  assert.deepEqual(agg.warnings, []);
});

test('2027 holidays and makeup workdays follow the 2027 State Council notice', () => {
  // Spring Festival: Feb 5-13 off; Jan 31 and Feb 14 (Sundays) are workdays.
  assert.equal(isPeakAt(bj(2027, 2, 5, 10, 0)), false);
  assert.equal(isPeakAt(bj(2027, 2, 13, 10, 0)), false);
  assert.equal(isPeakAt(bj(2027, 1, 31, 10, 0)), true);
  assert.equal(isPeakAt(bj(2027, 2, 14, 10, 0)), true);
  // National Day: Oct 1-7 off, Oct 8 is a normal Friday, Oct 9 is makeup.
  assert.equal(isPeakAt(bj(2027, 10, 1, 10, 0)), false);
  assert.equal(isPeakAt(bj(2027, 10, 8, 10, 0)), true);
  assert.equal(isPeakAt(bj(2027, 10, 9, 10, 0)), true);
  // The full 2027 calendar no longer raises the missing-calendar warning.
  const agg = aggregateTurns([], { now: bj(2027, 10, 7, 12, 0), days: 7 });
  assert.deepEqual(agg.warnings, []);
});

test('years without calendar data fall back to weekdays and warn', () => {
  const now = bj(2028, 1, 5, 12, 0);
  // 2028-01-05 is a Wednesday; without data the weekday rule marks it peak.
  assert.equal(isPeakAt(bj(2028, 1, 5, 10, 0)), true);
  const agg = aggregateTurns([], { now, days: 7 });
  assert.deepEqual(agg.warnings, [{ code: 'calendar-missing', years: [2028] }]);
});

test('nextSwitch walks to the next boundary and reports the target status', () => {
  const lunch = nextSwitch(bj(2026, 11, 9, 12, 30));
  assert.equal(lunch.status, 'peak');
  assert.equal(lunch.at, bj(2026, 11, 9, 14, 0));

  const evening = nextSwitch(bj(2026, 11, 9, 18, 0));
  assert.equal(evening.status, 'peak');
  assert.equal(evening.at, bj(2026, 11, 10, 9, 0));

  const morning = nextSwitch(bj(2026, 11, 9, 7, 15));
  assert.equal(morning.status, 'peak');
  assert.equal(morning.at, bj(2026, 11, 9, 9, 0));

  // Friday after close: the next switch is Monday morning, not Saturday.
  const weekend = nextSwitch(bj(2026, 11, 13, 19, 0));
  assert.equal(weekend.status, 'peak');
  assert.equal(weekend.at, bj(2026, 11, 16, 9, 0));

  // Inside a peak window the next switch is back to valley.
  const insidePeak = nextSwitch(bj(2026, 11, 9, 10, 0));
  assert.equal(insidePeak.status, 'valley');
  assert.equal(insidePeak.at, bj(2026, 11, 9, 12, 0));
});

test('decodeSessionFile stitches concatenated zstd frames', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-peak-'));
  const file = path.join(dir, 'session.v4.jsonl.zstd');
  const one = Buffer.from('{"type":"assistant/message","time":1}\n');
  const two = Buffer.from('{"type":"assistant/message","time":2}\n');
  fs.writeFileSync(file, Buffer.concat([zlib.zstdCompressSync(one), zlib.zstdCompressSync(two)]));
  try {
    const text = decodeSessionFile(file);
    assert.equal(text, one.toString('utf8') + two.toString('utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseSessionTurns keeps only billed assistant messages', () => {
  const text = [
    '{"type":"user/message","time":100}',
    '{"type":"assistant/message","time":200,"data":{"usage":{"inputTokens":10,"cacheReadTokens":20,"outputTokens":30},"message":{"source":{"model":"deepseek-flash"}}}}',
    '{"type":"assistant/message","time":300,"data":{}}',
    'not json',
    '',
    '{"type":"assistant/message","time":400,"data":{"usage":{"inputTokens":1},"message":{"source":{"model":"deepseek-pro"}}}}',
  ].join('\n');

  assert.deepEqual(parseSessionTurns(text), [
    { t: 200, model: 'deepseek-flash', input: 10, cache: 20, output: 30 },
    { t: 400, model: 'deepseek-pro', input: 1, cache: 0, output: 0 },
  ]);
});

test('normalizeDays accepts only the offered windows', () => {
  assert.equal(normalizeDays('7'), 7);
  assert.equal(normalizeDays(30), 30);
  assert.equal(normalizeDays('14'), 14);
  assert.equal(normalizeDays('90'), 14);
  assert.equal(normalizeDays(null), 14);
  assert.equal(normalizeDays(undefined), 14);
});

test('aggregateTurns zero-fills a contiguous window and prices peak at 2x', () => {
  const now = bj(2026, 11, 10, 12, 0);
  const turns = [
    // Peak Monday: 1M miss + 1M hit + 1M out at double price -> 10.04.
    { t: bj(2026, 11, 9, 10, 0), model: 'deepseek-flash', input: 1e6, cache: 1e6, output: 1e6 },
    // Valley Tuesday: same tokens -> 5.02.
    { t: bj(2026, 11, 10, 8, 0), model: 'deepseek-flash', input: 1e6, cache: 1e6, output: 1e6 },
  ];

  const agg = aggregateTurns(turns, { now, days: 7 });

  assert.equal(agg.windowDays, 7);
  assert.equal(agg.window.length, 7);
  assert.deepEqual(
    agg.window.map((day) => day.day),
    ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'],
  );
  assert.equal(agg.window[0].calls, 0);
  assert.equal(agg.window[0].cost, 0);

  assert.equal(agg.window[5].cost, 10.04);
  assert.equal(agg.window[5].peakCost, 10.04);
  assert.equal(agg.window[5].savingIfValley, 5.02);
  assert.equal(agg.window[6].cost, 5.02);
  assert.equal(agg.window[6].valleyCost, 5.02);
  assert.equal(agg.today.day, '2026-11-10');

  assert.equal(agg.week.cost, 15.06);
  assert.equal(agg.week.calls, 2);
  assert.equal(agg.week.savingIfValley, 5.02);
  assert.equal(agg.week.avgTokensPerCall, 3_000_000);
  assert.equal(agg.week.avgPerDay, 2.1514);

  assert.deepEqual(agg.models.map((model) => [model.id, model.calls]), [
    ['flash', 2],
    ['pro', 0],
  ]);
  assert.deepEqual(agg.warnings, []);
});

test('aggregateTurns sums per-window models and flags unknown models once', () => {
  const now = bj(2026, 11, 10, 12, 0);
  const turns = [
    { t: bj(2026, 11, 10, 9, 0), model: 'deepseek-flash', input: 1e6, cache: 0, output: 0 },
    { t: bj(2026, 11, 10, 9, 5), model: 'deepseek-pro', input: 1e6, cache: 0, output: 0 },
    { t: bj(2026, 11, 10, 9, 6), model: 'mystery-model', input: 0, cache: 0, output: 1e6 },
  ];

  const agg = aggregateTurns(turns, { now, days: 7 });
  assert.deepEqual(agg.models.map((model) => [model.id, model.calls]), [
    ['flash', 1],
    ['pro', 1],
    ['other', 1],
  ]);
  // The unknown call is its own row, flagged as an estimate, and stays out of Flash.
  const other = agg.models.find((model) => model.id === 'other');
  assert.equal(other.estimated, true);
  assert.equal(other.cost, 8); // 1M output tokens at Flash peak output rate
  assert.equal(agg.models.find((model) => model.id === 'flash').calls, 1);
  // Totals still include the estimate rather than dropping it.
  assert.equal(agg.today.cost, 2 + 9 + 8);
  assert.deepEqual(agg.warnings, [{ code: 'unknown-model', models: ['mystery-model'] }]);

  // No unknown traffic in the window => no phantom "other" row.
  const clean = aggregateTurns(turns.slice(0, 2), { now, days: 7 });
  assert.deepEqual(clean.models.map((model) => model.id), ['flash', 'pro']);
  assert.deepEqual(clean.warnings, []);

  // Windows that end before the turns contain only zero days.
  const old = aggregateTurns(turns, { now, days: 30 });
  assert.equal(old.window.length, 30);
  assert.equal(old.window[0].calls, 0);
});

test('emptyDay starts with 24 empty hour buckets', () => {
  const day = emptyDay('2026-11-10');
  assert.equal(day.hours.length, 24);
  assert.equal(day.hours[0].hour, 0);
  assert.equal(day.hours[23].hour, 23);
  assert.equal(day.calls, 0);
  assert.equal(day.lastAt, 0);
});

test('hour buckets carry tokens and the cache hit rate', () => {
  const now = bj(2026, 11, 10, 10);
  const agg = aggregateTurns(
    [
      { t: now, model: 'deepseek-flash', input: 1e6, cache: 3e6, output: 0.5e6 },
      { t: now + 30 * 60_000, model: 'deepseek-flash', input: 1e6, cache: 0, output: 0.5e6 },
    ],
    { now, days: 7 },
  );
  const hour = agg.hours[10];
  assert.equal(hour.calls, 2);
  assert.equal(hour.tokens, 6e6);
  assert.equal(hour.hitRate, 0.6);
  assert.equal(agg.hours[11].tokens, 0);
  assert.equal(agg.hours[11].hitRate, 0);
});

test('window edges stay stable across a day boundary', () => {
  const now = bj(2026, 11, 10, 0, 0) + 1; // one ms past midnight
  const agg = aggregateTurns([], { now, days: 7 });
  assert.equal(agg.window[6].day, '2026-11-10');
  assert.equal(agg.window[0].day, '2026-11-04');
  assert.equal(agg.window.length, 7);
  assert.equal(now - bj(2026, 11, 10, 0, 0), 1);
});

test('parseSessionMeta reads cwd from the session header only', () => {
  const text = [
    '{"type":"session","version":4,"id":"s1","cwd":"/Users/me/projects/alpha"}',
    '{"type":"assistant/message","time":1}',
  ].join('\n');
  assert.deepEqual(parseSessionMeta(text), { cwd: '/Users/me/projects/alpha' });
  assert.deepEqual(parseSessionMeta('{"type":"assistant/message"}'), { cwd: null });
  assert.deepEqual(parseSessionMeta('not json'), { cwd: null });
});

test('projectInfo prefers cwd and decodes the workspace slug fallback', () => {
  assert.deepEqual(projectInfo('/Users/me/projects/alpha/', '--Users-me-projects-alpha--'), {
    key: '/Users/me/projects/alpha',
    name: 'alpha',
    path: '/Users/me/projects/alpha',
  });

  const fallback = projectInfo(null, '--Users-me-~5FAE~~8F6F~soft-alpha--');
  assert.equal(fallback.key, 'slug:--Users-me-~5FAE~~8F6F~soft-alpha--');
  assert.equal(fallback.name, 'Users/me/微软soft/alpha');
  assert.equal(fallback.path, '/Users/me/微软soft/alpha');
});

test('parseSessionTurns attaches the project when one is supplied', () => {
  const line =
    '{"type":"assistant/message","time":200,"data":{"usage":{"inputTokens":10,"cacheReadTokens":20,"outputTokens":30},"message":{"source":{"model":"deepseek-flash"}}}}';
  const project = { key: '/alpha', name: 'alpha', path: '/alpha' };
  assert.deepEqual(parseSessionTurns(line, project), [
    {
      t: 200,
      model: 'deepseek-flash',
      input: 10,
      cache: 20,
      output: 30,
      project,
    },
  ]);
});

test('aggregateTurns groups window spend by project, sorted by cost', () => {
  const now = bj(2026, 11, 10, 12, 0);
  const alpha = { key: '/alpha', name: 'alpha', path: '/alpha' };
  const beta = { key: '/beta', name: 'beta', path: '/beta' };
  const turns = [
    // Peak Monday: 1M miss at peak price = 2.
    { t: bj(2026, 11, 9, 10, 0), model: 'deepseek-flash', input: 1e6, cache: 0, output: 0, project: alpha },
    // Valley Tuesday: 3M miss at valley price = 3.
    { t: bj(2026, 11, 10, 8, 0), model: 'deepseek-flash', input: 3e6, cache: 0, output: 0, project: beta },
    // Outside the 7-day window: must not be grouped.
    { t: bj(2026, 10, 1, 8, 0), model: 'deepseek-flash', input: 9e6, cache: 0, output: 0, project: alpha },
    // Legacy turn without a project: counted in totals, not in project shares.
    { t: bj(2026, 11, 10, 9, 0), model: 'deepseek-flash', input: 1e6, cache: 0, output: 0 },
  ];

  const agg = aggregateTurns(turns, { now, days: 7 });
  assert.deepEqual(
    agg.projects.map((project) => [project.name, project.path, project.calls, project.tokens, project.cost]),
    [
      ['beta', '/beta', 1, 3_000_000, 3],
      ['alpha', '/alpha', 1, 1_000_000, 2],
    ],
  );
  assert.ok(Math.abs(agg.projects[0].share - 0.6) < 1e-12);
  assert.ok(Math.abs(agg.projects[1].share - 0.4) < 1e-12);
});

test('walletSummary levels follow the 7-day and 3-day runways', () => {
  assert.equal(walletSummary(70, 10).level, 'ok');
  assert.equal(walletSummary(69, 10).level, 'warn');
  assert.equal(walletSummary(30, 10).level, 'warn');
  assert.equal(walletSummary(29, 10).level, 'low');
  assert.deepEqual(walletSummary(29, 10), { balance: 29, avgPerDay: 10, runwayDays: 2.9, level: 'low' });
  assert.deepEqual(walletSummary(null, 10), { balance: null, avgPerDay: 10, runwayDays: null, level: 'unknown' });
  assert.deepEqual(walletSummary(10, 0), { balance: 10, avgPerDay: 0, runwayDays: null, level: 'unknown' });
  assert.equal(walletSummary(-5, 10).runwayDays, 0);
});

test('buildCsv escapes cells and guards spreadsheet formulas', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvEscape(3), '3');
  assert.equal(csvEscape(null), '');

  const payload = {
    days: [
      {
        day: '2026-11-10',
        calls: 2,
        tokens: 10,
        cost: 0.5,
        costCache: 0.1,
        costMiss: 0.2,
        costOut: 0.2,
        peakCost: 0.3,
        valleyCost: 0.2,
        savingIfValley: 0.15,
        peakShare: 0.6,
        hitRate: 0.5,
        holiday: '国庆节',
      },
    ],
    projects: [{ name: 'a,b', path: '/x', calls: 1, tokens: 2, cost: 0.1, peakCost: 0.1, share: 1 }],
  };

  const daily = buildCsv(payload, 'days');
  assert.match(daily, /^day,calls,tokens,cost,cost_cache/);
  assert.match(daily, /2026-11-10,2,10,0.5,0.1,0.2,0.2,0.3,0.2,0.15,0.6,0.5,国庆节\n$/);

  const projects = buildCsv(payload, 'projects');
  assert.match(projects, /^project,path,calls,tokens,cost,peak_cost,share\n/);
  assert.match(projects, /"a,b",\/x,1,2,0.1,0.1,1\n$/);
  assert.equal(buildCsv({ days: [] }, 'bogus'), 'day,calls,tokens,cost,cost_cache,cost_miss,cost_out,peak_cost,valley_cost,saving_if_valley,peak_share,hit_rate,holiday\n');
});


const filterAlpha = { key: '/项目/alpha + 100% & #', name: 'alpha + 100% & #', path: '/项目/alpha + 100% & #' };
const filterBeta = { key: '/项目/alpha + 100% & #-child', name: 'beta', path: '/项目/beta' };
function filterTurns(now) {
  return [
    { t: now, model: 'deepseek-flash', input: 1e6, cache: 0, output: 0, project: filterAlpha },
    { t: now, model: 'deepseek-pro', input: 2e6, cache: 0, output: 0, project: filterBeta },
    { t: now, model: 'mystery', input: 1e6, cache: 0, output: 0 },
  ];
}

test('project drilldown uses exact opaque keys and preserves the full project directory', () => {
  const now = bj(2026, 11, 10, 10);
  const turns = filterTurns(now);
  const global = aggregateTurns(turns, { now, days: 7 });
  const alpha = aggregateTurns(turns, { now, days: 7, project: filterAlpha.key });
  assert.deepEqual(alpha.selectedProject, filterAlpha);
  assert.deepEqual(alpha.projectOptions, global.projects);
  assert.equal(alpha.today.calls, 1);
  assert.equal(alpha.today.cost, 2);
  assert.equal(alpha.week.cost, 2);
  assert.equal(alpha.hours[10].calls, 1);
  assert.deepEqual(alpha.models.map((m) => m.calls), [1, 0]);
  assert.deepEqual(alpha.warnings, []);
  assert.equal(alpha.projects.length, 1);
  // Drilling into a project must keep its share of the whole window (2 / 20),
  // not collapse to 100% of the filtered slice.
  assert.ok(Math.abs(alpha.projects[0].share - 0.1) < 1e-12);
  assert.ok(Math.abs(global.attributedCost - 20) < 1e-12);
  assert.ok(Math.abs(global.projects.find((p) => p.key === filterBeta.key).share - 0.9) < 1e-12);
  assert.equal(global.selectedProject, null);
  assert.deepEqual(aggregateTurns(turns, { now, project: '' }).selectedProject, null);
  const unknown = aggregateTurns(turns, { now, days: 7, project: '/missing' });
  assert.deepEqual(unknown.selectedProject, { key: '/missing', name: 'missing', path: '/missing' });
  assert.equal(unknown.today.calls, 0);
  assert.equal(unknown.window.length, 7);
  assert.deepEqual(unknown.projects, []);
  assert.deepEqual(unknown.projectOptions, global.projects);
});

function snapshotFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-filter-'));
  const now = bj(2036, 11, 10, 10);
  const turns = filterTurns(now);
  for (const [i, turn] of turns.entries()) {
    const session = path.join(dir, '.dsh/sessions', `workspace-${i}`, 'session');
    fs.mkdirSync(session, { recursive: true });
    const text = [
      JSON.stringify({ type: 'session', cwd: turn.project?.key || '/legacy' }),
      JSON.stringify({
        type: 'assistant/message',
        time: turn.t,
        data: { usage: { inputTokens: turn.input }, message: { source: { model: turn.model } } },
      }),
    ].join('\n');
    fs.writeFileSync(path.join(session, 'session.v4.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(text)));
  }
  fs.writeFileSync(
    path.join(dir, '.dsh/.dshw-usage.json'),
    JSON.stringify({ lastBalance: 70, history: { '2036-11-10': 99 } }),
  );
  t.mock.method(os, 'homedir', () => dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { now };
}

test('snapshot caches isolate project and window while wallet and global spend stay global', (t) => {
  const { now } = snapshotFixture(t);
  const global = buildSnapshot({ now, days: 7, fresh: true });
  const alpha = buildSnapshot({ now, days: 7, project: filterAlpha.key, fresh: true });
  const beta = buildSnapshot({ now, days: 7, project: filterBeta.key, fresh: true });
  assert.equal(alpha.today.calls, 1);
  assert.equal(beta.today.calls, 1);
  assert.notEqual(alpha.today.cost, beta.today.cost);
  assert.deepEqual(alpha.wallet, global.wallet);
  assert.deepEqual(beta.wallet, global.wallet);
  assert.equal(alpha.globalTodayCost, global.today.cost);
  assert.equal(global.today.ledger, 99);
  assert.equal(alpha.today.ledger, undefined);
  assert.deepEqual(alpha.projectOptions, global.projects);
  // The /data path filters turns before aggregating; its project row must still
  // report the same share of the whole window as the global table.
  assert.equal(
    alpha.projects[0].share,
    global.projects.find((project) => project.key === filterAlpha.key).share,
  );
  assert.strictEqual(buildSnapshot({ now: now + 1, days: 7, project: filterAlpha.key }), alpha);
  assert.strictEqual(buildSnapshot({ now: now + 1, days: 7, project: filterBeta.key }), beta);
  assert.strictEqual(buildSnapshot({ now: now + 1, days: 7 }), global);
  assert.equal(buildSnapshot({ now, days: 14, project: filterAlpha.key, fresh: true }).days.length, 14);
  const unknown = buildSnapshot({ now, days: 7, project: '/missing', fresh: true });
  assert.equal(unknown.today.cost, 0);
  assert.deepEqual(unknown.wallet, global.wallet);
  assert.equal(unknown.globalTodayCost, global.today.cost);
});

function routeHarness(rejection) {
  const routes = new Map();
  const disposed = [];
  let cleanup;
  apply({
    webServer: {
      register(route) {
        routes.set(route.path, route);
        return () => disposed.push(route.path);
      },
    },
    connection: { requestRejection() { return rejection; } },
    effect(factory) { cleanup = factory(); },
  });
  return {
    disposed,
    cleanup: () => cleanup(),
    async request(route, url, method = 'GET') {
      const res = {
        statusCode: 200,
        headers: {},
        body: Buffer.alloc(0),
        writeHead(status, headers) {
          this.statusCode = status;
          this.headers = headers;
        },
        end(body) { this.body = Buffer.from(body || ''); },
      };
      await routes.get(`/plugin/dsh-usage-peak/${route}`).handler({ url, method }, res);
      return res;
    },
  };
}

test('snapshot exposes the current holiday and makeup workday for the panel', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-calendar-'));
  t.mock.method(os, 'homedir', () => dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const holiday = buildSnapshot({ now: bj(2026, 10, 1, 10, 0), days: 7, fresh: true });
  assert.equal(holiday.now.peak, false);
  assert.equal(holiday.now.holiday, '国庆节');
  assert.equal(holiday.now.makeup, null);
  assert.equal(holiday.now.nextAt, bj(2026, 10, 8, 9, 0));

  const makeup = buildSnapshot({ now: bj(2026, 2, 14, 10, 0), days: 7, fresh: true });
  assert.equal(makeup.now.peak, true);
  assert.equal(makeup.now.holiday, null);
  assert.equal(makeup.now.makeup, '春节');

  const plain = buildSnapshot({ now: bj(2026, 11, 9, 10, 0), days: 7, fresh: true });
  assert.equal(plain.now.peak, true);
  assert.equal(plain.now.holiday, null);
  assert.equal(plain.now.makeup, null);
});

test('HTTP data and CSV routes decode project once, filter exports, and preserve BOM', async (t) => {
  const { now } = snapshotFixture(t);
  t.mock.method(Date, 'now', () => now);
  const app = routeHarness();
  const project = encodeURIComponent(filterAlpha.key);
  const res = await app.request('data', `/plugin/dsh-usage-peak/data?days=7&fresh=1&project=${project}`);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.deepEqual(payload.selectedProject, filterAlpha);
  assert.equal(payload.today.calls, 1);
  assert.equal(payload.projectOptions.length, 3);
  const csv = await app.request('export.csv', `/plugin/dsh-usage-peak/export.csv?days=7&scope=projects&project=${project}`);
  assert.equal(csv.statusCode, 200);
  assert.deepEqual([...csv.body.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(csv.headers['Content-Type'], /^text\/csv/);
  assert.match(csv.headers['Content-Disposition'], /^attachment;/);
  assert.equal(Number(csv.headers['Content-Length']), csv.body.length);
  assert.equal(csv.headers['Cache-Control'], 'no-store');
  const text = csv.body.toString('utf8');
  assert.ok(text.includes(filterAlpha.key));
  assert.ok(!text.includes(filterBeta.key));
  assert.equal(text.trim().split('\n').length, 2);
  const daily = await app.request('export.csv', `/?days=7&project=${project}`);
  assert.ok(daily.body.toString('utf8').includes(buildCsv(payload, 'days')));
  const unknown = await app.request('data', '/?project=%2Fmissing&fresh=1');
  assert.equal(JSON.parse(unknown.body).today.calls, 0);
  for (const route of ['data', 'export.csv']) {
    assert.equal((await app.request(route, '/', 'POST')).statusCode, 405);
    const rejected = routeHarness(401);
    const denied = await rejected.request(route, '/');
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.body.length, 0);
    assert.equal((await routeHarness(true).request(route, '/')).statusCode, 403);
  }
  app.cleanup();
  assert.deepEqual(app.disposed, ['/plugin/dsh-usage-peak/data', '/plugin/dsh-usage-peak/export.csv']);
});

test('snapshot cache bounds arbitrary keys and evicts expired entries', (t) => {
  const { now } = snapshotFixture(t);
  const oldest = buildSnapshot({ now, days: 7, project: '/cache-0', fresh: true });
  for (let index = 1; index <= 64; index += 1) {
    buildSnapshot({ now, days: 7, project: `/cache-${index}`, fresh: true });
  }
  assert.notStrictEqual(buildSnapshot({ now, days: 7, project: '/cache-0' }), oldest);
  const current = buildSnapshot({ now, days: 7, project: '/cache-64' });
  assert.strictEqual(buildSnapshot({ now: now + 1, days: 7, project: '/cache-64' }), current);
  buildSnapshot({ now: now + 15000, days: 7, project: '/new-after-expiry' });
  assert.notStrictEqual(buildSnapshot({ now: now + 15000, days: 7, project: '/cache-64' }), current);
});

test('assistant messages bill from the earliest stream chunk, falling back to record time', () => {
  const line = (time, stream) => JSON.stringify({
    type: 'assistant/message',
    time,
    data: {
      usage: { inputTokens: 10, cacheReadTokens: 5, outputTokens: 2 },
      message: { source: { model: 'deepseek-flash' } },
      stream,
    },
  });
  const text = [
    line(900, [{ type: 'chunk', time: 300 }, { type: 'chunk', time: 100 }, { type: 'chunk', time: 200 }]),
    line(500, undefined),
    line(700, [{ type: 'chunk', time: 'bad' }, { type: 'chunk' }, { type: 'chunk', time: 650 }]),
  ].join('\n');
  assert.deepEqual(parseSessionTurns(text).map((turn) => turn.t), [100, 500, 650]);
});

const customPricing = [
  { id: 'flash', hit: [0.01, 0.02], miss: [0.5, 1], out: [2, 4] },
  { id: 'pro', hit: [0.1, 0.2], miss: [3, 6], out: [9, 18] },
];

test('custom pricing normalizes, encodes, and round-trips through the query parameter', () => {
  const normalized = normalizePricing(customPricing);
  assert.equal(normalized[0].label, 'DeepSeek Flash');
  assert.equal(normalized[1].label, 'DeepSeek Pro');
  const encoded = encodePricing(customPricing);
  assert.equal(encoded, 'flash:0.01,0.02,0.5,1,2,4|pro:0.1,0.2,3,6,9,18');
  assert.deepEqual(parsePricingParam(encoded), normalized);
  assert.deepEqual(resolvePricing(encoded), { pricing: normalized, custom: true, invalid: false });
  const fallback = resolvePricing(undefined);
  assert.equal(fallback.custom, false);
  assert.equal(fallback.invalid, false);
  assert.deepEqual(fallback.pricing[0].hit, [0.02, 0.04]);
  const invalid = resolvePricing('flash:oops');
  assert.equal(invalid.custom, false);
  assert.equal(invalid.invalid, true);
  assert.deepEqual(invalid.pricing[0].hit, [0.02, 0.04]);
  assert.equal(parsePricingParam('flash:' + '0,'.repeat(5)), null);
  assert.equal(parsePricingParam('x'.repeat(513)), null);
  for (const bad of [[], [customPricing[0]], [{ ...customPricing[0] }, { ...customPricing[0] }]]) {
    assert.equal(normalizePricing(bad), null);
  }
  for (const bad of [-1, Infinity, NaN, '1', true, 1e8]) {
    const table = normalizePricing(customPricing).map((price) => ({ ...price }));
    table[0].hit = [bad, 0.02];
    assert.equal(normalizePricing(table), null);
  }
});

test('custom pricing recalculates peak cost and peak-at-valley savings', () => {
  const peak = bj(2026, 11, 9, 10);
  const valley = bj(2026, 11, 9, 13);
  const turn = (t) => ({ t, model: 'deepseek-flash', input: 2e6, cache: 1e6, output: 1e6 });
  const atPeak = aggregateTurns([turn(peak)], { now: peak, days: 7, pricing: customPricing });
  assert.equal(atPeak.today.cost, 6.02);
  assert.equal(atPeak.today.peakCost, 6.02);
  assert.equal(atPeak.today.savingIfValley, 3.01);
  const atValley = aggregateTurns([turn(valley)], { now: valley, days: 7, pricing: customPricing });
  assert.equal(atValley.today.cost, 3.01);
  assert.equal(atValley.today.savingIfValley, 0);
  assert.equal(priceFor('deepseek-pro', normalizePricing(customPricing)).miss[1], 6);
  const invalid = aggregateTurns([turn(peak)], { now: peak, days: 7, pricing: [{ id: 'broken' }] });
  assert.equal(invalid.today.cost, 12.04);
});

test('snapshot applies custom pricing, isolates its cache key, and warns on invalid input', (t) => {
  const { now } = snapshotFixture(t);
  const encoded = encodePricing(customPricing);
  const base = buildSnapshot({ now, days: 7, fresh: true });
  const custom = buildSnapshot({ now, days: 7, pricing: encoded, fresh: true });
  assert.equal(custom.pricingCustom, true);
  assert.deepEqual(custom.pricing, normalizePricing(customPricing).map(({ id, label, hit, miss, out }) => ({ id, label, hit, miss, out })));
  assert.ok(custom.today.cost < base.today.cost);
  assert.strictEqual(buildSnapshot({ now: now + 1, days: 7, pricing: encoded }), custom);
  const other = buildSnapshot({ now: now + 1, days: 7, pricing: encodePricing([
    { id: 'flash', hit: [0.5, 1], miss: [2, 4], out: [8, 16] },
    { id: 'pro', hit: [0.1, 0.2], miss: [3, 6], out: [9, 18] },
  ]) });
  assert.notStrictEqual(other, custom);
  const invalid = buildSnapshot({ now, days: 7, pricing: 'not-a-price', fresh: true });
  assert.equal(invalid.pricingCustom, false);
  assert.equal(invalid.warnings[0].code, 'pricing-invalid');
  assert.deepEqual(invalid.pricing, base.pricing);
});

test('HTTP pricing parameter drives custom figures and CSV values', async (t) => {
  const { now } = snapshotFixture(t);
  t.mock.method(Date, 'now', () => now);
  const app = routeHarness();
  const encoded = encodePricing(customPricing);
  const res = await app.request('data', `/?days=7&fresh=1&pricing=${encodeURIComponent(encoded)}`);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.pricingCustom, true);
  assert.deepEqual(payload.pricing, normalizePricing(customPricing).map(({ id, label, hit, miss, out }) => ({ id, label, hit, miss, out })));
  const csv = await app.request('export.csv', `/?days=7&scope=days&pricing=${encodeURIComponent(encoded)}`);
  assert.ok(csv.body.toString('utf8').includes(buildCsv(payload, 'days')));
  const invalid = await app.request('data', '/?days=7&fresh=1&pricing=nope');
  assert.equal(JSON.parse(invalid.body).warnings[0].code, 'pricing-invalid');
  app.cleanup();
});
