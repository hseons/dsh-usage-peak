import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import {
  aggregateTurns,
  buildCsv,
  csvEscape,
  decodeSessionFile,
  emptyDay,
  isPeakAt,
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
  assert.equal(priceFor('some-unknown-model').id, 'flash');
  assert.equal(priceFor(undefined).id, 'flash');
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
    ['flash', 2],
    ['pro', 1],
  ]);
  assert.deepEqual(agg.warnings, [{ code: 'unknown-model', models: ['mystery-model'] }]);

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
