import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

import {
  aggregateTurns,
  decodeSessionFile,
  emptyDay,
  isPeakAt,
  nextSwitch,
  normalizeDays,
  parseSessionTurns,
  priceFor,
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
