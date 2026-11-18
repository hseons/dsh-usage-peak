/**
 * dsh-usage-peak — Host half.
 *
 * Reads the session logs (~/.dsh/sessions/<cwd>/<session>/session.v4.jsonl.zstd),
 * reconstructs every model request from its `assistant/message` usage, prices it
 * with the DeepSeek peak/valley tariff (Beijing time), and serves the result as
 * JSON for the Settings page dashboard implemented in ./client.js.
 *
 * The whale ledger (~/.dsh/.dshw-usage.json) is only used as a cross-check:
 * it knows account-level spend but not the input/cache/output split.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { CALENDAR_YEARS, OFF_DAYS, WORKDAYS, hasCalendar, yearOf } from './holidays.js';

const NS = 'dsh-usage-peak';
const REPO_URL = 'https://github.com/hseons/dsh-usage-peak';
const VERSION = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const ROUTE_BASE = '/plugin/dsh-usage-peak';
const SNAPSHOT_TTL_MS = 15_000;
const MAX_SNAPSHOTS = 64;
const BJ_OFFSET = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 14;
const WINDOW_DAYS = [7, 14, 30];
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); // zstd frame magic, little endian

/** CNY per million tokens, [valley, peak]. */
const PRICING = [
  { id: 'flash', label: 'DeepSeek Flash', match: 'flash', hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  { id: 'pro', label: 'DeepSeek Pro', match: 'pro', hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] },
];
const PRICING_IDS = PRICING.map((price) => price.id);
const PRICING_MAX = 1e7;

function clonePricing(table) {
  return table.map((price) => ({
    id: price.id,
    label: price.label,
    match: price.match,
    hit: [...price.hit],
    miss: [...price.miss],
    out: [...price.out],
  }));
}

/**
 * Validate a complete custom price table.
 *
 * The table must carry exactly the known model ids once each; every number is
 * CNY per million tokens and must be finite, non-negative, and bounded. We keep
 * the model labels/matchers from the built-in table so custom prices cannot
 * smuggle in arbitrary model routing.
 */
export function normalizePricing(value) {
  if (!Array.isArray(value) || value.length !== PRICING_IDS.length) return null;
  const byId = new Map();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    if (!PRICING_IDS.includes(entry.id) || byId.has(entry.id)) return null;
    const pair = (values) => {
      if (!Array.isArray(values) || values.length !== 2) return null;
      if (!values.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= PRICING_MAX)) return null;
      return [...values];
    };
    const hit = pair(entry.hit);
    const miss = pair(entry.miss);
    const out = pair(entry.out);
    if (!hit || !miss || !out) return null;
    const base = PRICING.find((price) => price.id === entry.id);
    byId.set(entry.id, { id: entry.id, label: base.label, match: base.match, hit, miss, out });
  }
  return PRICING_IDS.every((id) => byId.has(id)) ? PRICING_IDS.map((id) => byId.get(id)) : null;
}

/** Compact URL form: `flash:hitV,hitP,missV,missP,outV,outP|pro:...`. */
export function encodePricing(table) {
  const normalized = normalizePricing(table);
  if (!normalized) return '';
  return normalized
    .map((price) => `${price.id}:${[...price.hit, ...price.miss, ...price.out].join(',')}`)
    .join('|');
}

export function parsePricingParam(raw) {
  if (typeof raw !== 'string' || raw === '' || raw.length > 512) return null;
  const table = [];
  for (const part of raw.split('|')) {
    const pieces = part.split(':');
    if (pieces.length !== 2) return null;
    const id = pieces[0];
    const values = pieces[1].split(',').map((value) => (value.trim() === '' ? NaN : Number(value)));
    if (id === '' || values.length !== 6) return null;
    table.push({ id, hit: values.slice(0, 2), miss: values.slice(2, 4), out: values.slice(4, 6) });
  }
  return normalizePricing(table);
}

/** Default table plus whether the caller supplied an invalid override. */
export function resolvePricing(raw) {
  const supplied = raw !== null && raw !== undefined && raw !== '';
  const parsed = supplied ? parsePricingParam(raw) : null;
  if (parsed) return { pricing: parsed, custom: true, invalid: false };
  return { pricing: clonePricing(PRICING), custom: false, invalid: supplied };
}

export function priceFor(model, pricing = PRICING) {
  const name = String(model || '').toLowerCase();
  // Pro wins over flash when both substrings appear; iterate from the pro end.
  for (let index = pricing.length - 1; index >= 0; index -= 1) {
    if (name.includes(pricing[index].match)) return pricing[index];
  }
  return pricing[0] || PRICING[0];
}

export function bjDate(ts) {
  return new Date(ts + BJ_OFFSET);
}

export function dayKey(ts) {
  return bjDate(ts).toISOString().slice(0, 10);
}

/**
 * Peak = Beijing Mon-Fri 09:00-12:00 and 14:00-18:00; everything else is valley
 * (half price). Public holidays are valley all day, makeup workdays (including
 * a Saturday/Sunday) follow the weekday windows.
 */
export function isPeakAt(ts) {
  const key = dayKey(ts);
  if (OFF_DAYS.has(key)) return false;
  const d = bjDate(ts);
  const dow = d.getUTCDay();
  const weekend = dow === 0 || dow === 6;
  if (weekend && !WORKDAYS.has(key)) return false;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080);
}

/** Next tariff switch after `ts`, with the status it switches into. */
export function nextSwitch(ts) {
  const d = bjDate(ts);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const da = d.getUTCDate();
  for (let k = 0; k < 9; k += 1) {
    const probe = new Date(Date.UTC(y, mo, da + k));
    const key = probe.toISOString().slice(0, 10);
    if (OFF_DAYS.has(key)) continue;
    const dow = probe.getUTCDay();
    if ((dow === 0 || dow === 6) && !WORKDAYS.has(key)) continue;
    for (const hour of [9, 12, 14, 18]) {
      const at = Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate(), hour, 0, 0) - BJ_OFFSET;
      if (at > ts) return { at, status: hour === 9 || hour === 14 ? 'peak' : 'valley' };
    }
  }
  return { at: ts + 3600_000, status: 'valley' };
}

/* ------------------------------------------------------------------ */
/* Session log decoding                                                */
/* ------------------------------------------------------------------ */

/**
 * Session logs are concatenated zstd frames; Node's zstd entry points stop after
 * the first frame. Split on the frame magic and stitch the frames back together.
 */
export function decodeSessionFile(file) {
  const buf = fs.readFileSync(file);
  const starts = [];
  let cursor = 0;
  for (;;) {
    const at = buf.indexOf(MAGIC, cursor);
    if (at < 0) break;
    starts.push(at);
    cursor = at + 4;
  }
  if (starts.length === 0) return buf.toString('utf8');
  const chunks = [];
  let index = 0;
  while (index < starts.length) {
    let accepted;
    for (let end = index + 1; end <= starts.length; end += 1) {
      const stop = end < starts.length ? starts[end] : buf.length;
      try {
        accepted = { data: zlib.zstdDecompressSync(buf.subarray(starts[index], stop)), next: end };
        break;
      } catch {
        /* a magic-looking byte inside a frame: keep growing the slice */
      }
    }
    if (!accepted) {
      index += 1;
      continue;
    }
    chunks.push(accepted.data);
    index = accepted.next;
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Session header: reads `cwd` from the first `type:"session"` record. */
export function parseSessionMeta(text) {
  const head = String(text || '').slice(0, 8192);
  for (const line of head.split('\n')) {
    if (!line.includes('"session"')) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record && record.type === 'session') {
      return { cwd: typeof record.cwd === 'string' && record.cwd.trim() ? record.cwd : null };
    }
  }
  return { cwd: null };
}

/**
 * Project identity for a session directory.
 *
 * The session log's absolute `cwd` is authoritative. Older/foreign logs without
 * a header fall back to the workspace directory slug, which hex-escapes some
 * bytes (`~5FAE~`); decode what we can and use the path as the display name.
 */
export function projectInfo(cwd, dirName) {
  if (typeof cwd === 'string' && cwd.trim()) {
    const clean = cwd.trim().replace(/[\\/]+$/, '') || cwd.trim();
    return { key: clean, name: path.basename(clean) || clean, path: clean };
  }
  const body = String(dirName || '').replace(/^--|--$/g, '');
  const decoded = body
    .replace(/~([0-9a-fA-F]{4})~/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .split('-')
    .filter(Boolean)
    .join('/');
  const label = decoded || String(dirName || 'unknown');
  return {
    key: `slug:${dirName || 'unknown'}`,
    name: label,
    path: label.startsWith('/') ? label : `/${label}`,
  };
}

/** One turn per billed model request: { t, model, input, cache, output }. */
export function parseSessionTurns(text, project) {
  const turns = [];
  for (const line of text.split('\n')) {
    if (line.length < 2) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type !== 'assistant/message') continue;
    const usage = record.data && record.data.usage;
    if (!usage) continue;
    const model = (record.data.message && record.data.message.source && record.data.message.source.model) || 'unknown';
    // Bill by request start, not completion: the first streamed chunk is emitted
    // when the provider starts answering, while record.time is the final chunk.
    let startedAt = null;
    if (Array.isArray(record.data.stream)) {
      for (const chunk of record.data.stream) {
        if (chunk && typeof chunk.time === 'number' && (startedAt === null || chunk.time < startedAt)) startedAt = chunk.time;
      }
    }
    const turn = {
      t: startedAt === null ? record.time : startedAt,
      model,
      input: usage.inputTokens || 0,
      cache: usage.cacheReadTokens || 0,
      output: usage.outputTokens || 0,
    };
    if (project) turn.project = project;
    turns.push(turn);
  }
  return turns;
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

const fileCache = new Map(); // file -> { mtimeMs, size, turns }
const snapshotCache = new Map(); // [window days, exact project key] -> { builtAt, payload }

export function normalizeDays(value) {
  const days = Number(value);
  return WINDOW_DAYS.includes(days) ? days : DEFAULT_DAYS;
}

export function collectTurns() {
  const root = path.join(os.homedir(), '.dsh', 'sessions');
  const turns = [];
  let workspaceDirs;
  try {
    workspaceDirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return turns;
  }
  for (const workspace of workspaceDirs) {
    if (!workspace.isDirectory()) continue;
    const workspacePath = path.join(root, workspace.name);
    let sessions;
    try {
      sessions = fs.readdirSync(workspacePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const dir = path.join(workspacePath, session.name);
      const file = path.join(dir, 'session.v4.jsonl.zstd');
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      let entry = fileCache.get(file);
      if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
        let parsed = [];
        try {
          const text = decodeSessionFile(file);
          parsed = parseSessionTurns(text, projectInfo(parseSessionMeta(text).cwd, workspace.name));
        } catch {
          parsed = [];
        }
        entry = { mtimeMs: stat.mtimeMs, size: stat.size, turns: parsed };
        fileCache.set(file, entry);
      }
      for (const turn of entry.turns) turns.push(turn);
    }
  }
  return turns;
}

export function emptyDay(day) {
  const hours = [];
  for (let hour = 0; hour < 24; hour += 1)
    hours.push({ hour, cost: 0, calls: 0, inputTokens: 0, cacheTokens: 0, outputTokens: 0 });
  return {
    day,
    calls: 0,
    inputTokens: 0,
    cacheTokens: 0,
    outputTokens: 0,
    cost: 0,
    costCache: 0,
    costMiss: 0,
    costOut: 0,
    peakCost: 0,
    valleyCost: 0,
    // What the peak-time tokens would have cost at that model's valley rates.
    peakAtValleyCost: 0,
    hours,
    models: {},
    firstAt: 0,
    lastAt: 0,
  };
}

export function addTurn(day, turn, pricing = PRICING) {
  const price = priceFor(turn.model, pricing);
  const peak = isPeakAt(turn.t);
  const offset = peak ? 1 : 0;
  const costCache = (turn.cache / 1e6) * price.hit[offset];
  const costMiss = (turn.input / 1e6) * price.miss[offset];
  const costOut = (turn.output / 1e6) * price.out[offset];
  const cost = costCache + costMiss + costOut;

  day.calls += 1;
  day.inputTokens += turn.input;
  day.cacheTokens += turn.cache;
  day.outputTokens += turn.output;
  day.cost += cost;
  day.costCache += costCache;
  day.costMiss += costMiss;
  day.costOut += costOut;
  if (peak) {
    day.peakCost += cost;
    day.peakAtValleyCost +=
      (turn.cache / 1e6) * price.hit[0] + (turn.input / 1e6) * price.miss[0] + (turn.output / 1e6) * price.out[0];
  } else {
    day.valleyCost += cost;
  }
  if (!day.firstAt || turn.t < day.firstAt) day.firstAt = turn.t;
  if (turn.t > day.lastAt) day.lastAt = turn.t;

  const hour = bjDate(turn.t).getUTCHours();
  const bucket = day.hours[hour];
  bucket.cost += cost;
  bucket.calls += 1;
  bucket.inputTokens += turn.input;
  bucket.cacheTokens += turn.cache;
  bucket.outputTokens += turn.output;

  const modelKey = price.id;
  const slot = day.models[modelKey] || (day.models[modelKey] = { calls: 0, cost: 0, tokens: 0 });
  slot.calls += 1;
  slot.cost += cost;
  slot.tokens += turn.input + turn.cache + turn.output;

  return { cost, peak, tokens: turn.input + turn.cache + turn.output };
}

export function readLedger() {
  const file = path.join(os.homedir(), '.dsh', '.dshw-usage.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      file,
      ok: true,
      date: raw.date,
      todayUsage: typeof raw.todayUsage === 'number' ? raw.todayUsage : null,
      balance: typeof raw.lastBalance === 'number' ? raw.lastBalance : null,
      dayStart: typeof raw.dayStart === 'number' ? raw.dayStart : null,
      history: raw.history && typeof raw.history === 'object' ? raw.history : {},
      updatedAt: fs.statSync(file).mtimeMs,
    };
  } catch {
    return { file, ok: false, history: {} };
  }
}

export function shapeDay(day) {
  const tokens = day.inputTokens + day.cacheTokens + day.outputTokens;
  const billable = day.cacheTokens + day.inputTokens;
  return {
    day: day.day,
    calls: day.calls,
    tokens,
    inputTokens: day.inputTokens,
    cacheTokens: day.cacheTokens,
    outputTokens: day.outputTokens,
    cost: round(day.cost),
    costCache: round(day.costCache),
    costMiss: round(day.costMiss),
    costOut: round(day.costOut),
    peakCost: round(day.peakCost),
    valleyCost: round(day.valleyCost),
    // How much the peak-time tokens would save at valley rates (can be negative
    // when a custom tariff makes peak cheaper than valley).
    savingIfValley: round(day.peakCost - day.peakAtValleyCost),
    peakShare: day.cost > 0 ? day.peakCost / day.cost : 0,
    holiday: OFF_DAYS.get(day.day) || null,
    hitRate: billable > 0 ? day.cacheTokens / billable : 0,
    avgTokens: day.calls > 0 ? Math.round(tokens / day.calls) : 0,
    firstAt: day.firstAt,
    lastAt: day.lastAt,
    models: day.models,
  };
}

export function round(value) {
  return Math.round(value * 10000) / 10000;
}

export function hoursOf(day) {
  const midnight = Date.parse(`${day.day}T00:00:00Z`) - BJ_OFFSET;
  return day.hours.map((bucket) => {
    const billable = bucket.inputTokens + bucket.cacheTokens;
    return {
      hour: bucket.hour,
      cost: round(bucket.cost),
      calls: bucket.calls,
      peak: isPeakAt(midnight + bucket.hour * 3600_000),
      tokens: bucket.inputTokens + bucket.cacheTokens + bucket.outputTokens,
      hitRate: billable > 0 ? bucket.cacheTokens / billable : 0,
    };
  });
}

/** Calendar years touched by the window that have no holiday data yet. */
function missingCalendarYears(window) {
  const years = new Set();
  for (const entry of window) {
    const year = yearOf(entry.day);
    if (!hasCalendar(year)) years.add(year);
  }
  return years.size > 0 ? [{ code: 'calendar-missing', years: [...years] }] : [];
}

export const RUNWAY_WARN_DAYS = 7;
export const RUNWAY_LOW_DAYS = 3;

/** How many days the current balance lasts at the recent daily burn rate. */
export function walletSummary(balance, avgPerDay) {
  const hasBalance = typeof balance === 'number' && Number.isFinite(balance);
  const perDay = typeof avgPerDay === 'number' && Number.isFinite(avgPerDay) && avgPerDay > 0 ? avgPerDay : 0;
  const runwayDays = hasBalance && perDay > 0 ? Math.max(0, balance / perDay) : null;
  const level =
    runwayDays === null ? 'unknown' : runwayDays < RUNWAY_LOW_DAYS ? 'low' : runwayDays < RUNWAY_WARN_DAYS ? 'warn' : 'ok';
  return {
    balance: hasBalance ? round(balance) : null,
    avgPerDay: round(perDay),
    runwayDays: runwayDays === null ? null : round(runwayDays),
    level,
  };
}

/**
 * Pure aggregation over decoded turns.
 *
 * The window is a contiguous calendar range ending today (Beijing): days
 * without any request are zero-filled so the chart keeps all its columns and
 * "last N days" means the same thing everywhere.
 */
export function aggregateTurns(turns, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const days = normalizeDays(options.days);
  const pricing = Array.isArray(options.pricing) ? normalizePricing(options.pricing) || PRICING : PRICING;
  // Keys are opaque identities: do not trim, prefix-match, or URL-decode here.
  // URLSearchParams already performs the single required HTTP decoding pass.
  const projectKey = typeof options.project === 'string' && options.project !== '' ? options.project : null;
  if (projectKey !== null) {
    const global = aggregateTurns(turns, { now, days, pricing });
    const filtered = aggregateTurns((turns || []).filter((turn) => turn?.project?.key === projectKey), { now, days, pricing });
    const known = global.projects.find((project) => project.key === projectKey);
    const selectedProject = known
      ? { key: known.key, name: known.name, path: known.path }
      : { key: projectKey, name: path.basename(projectKey) || projectKey, path: projectKey };
    return { ...filtered, selectedProject, projectOptions: global.projects };
  }
  const byDay = new Map();
  const byProject = new Map();
  const unknownModels = new Set();
  const firstKey = dayKey(now - (days - 1) * DAY_MS);
  const todayKey = dayKey(now);
  let attributedCost = 0;

  for (const turn of turns || []) {
    if (!turn || !Number.isFinite(turn.t)) continue;
    const key = dayKey(turn.t);
    if (key < firstKey || key > todayKey) continue;
    let day = byDay.get(key);
    if (!day) {
      day = emptyDay(key);
      byDay.set(key, day);
    }
    const priced = addTurn(day, turn, pricing);
    if (!/flash|pro/i.test(turn.model)) unknownModels.add(turn.model);
    if (turn.project && turn.project.key) {
      let project = byProject.get(turn.project.key);
      if (!project) {
        project = {
          key: turn.project.key,
          name: turn.project.name,
          path: turn.project.path,
          calls: 0,
          cost: 0,
          peakCost: 0,
          tokens: 0,
        };
        byProject.set(turn.project.key, project);
      }
      project.calls += 1;
      project.cost += priced.cost;
      project.tokens += priced.tokens;
      if (priced.peak) project.peakCost += priced.cost;
      attributedCost += priced.cost;
    }
  }

  const window = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKey(now - offset * DAY_MS);
    const day = byDay.get(key) || emptyDay(key);
    const shaped = shapeDay(day);
    shaped.hours = hoursOf(day);
    window.push(shaped);
  }

  const today = window[window.length - 1];
  const week = window.slice(-7).reduce(
    (acc, entry) => ({
      cost: acc.cost + entry.cost,
      calls: acc.calls + entry.calls,
      tokens: acc.tokens + entry.tokens,
      peakCost: acc.peakCost + entry.peakCost,
      costCache: acc.costCache + entry.costCache,
      costMiss: acc.costMiss + entry.costMiss,
      costOut: acc.costOut + entry.costOut,
      savingIfValley: acc.savingIfValley + entry.savingIfValley,
      days: acc.days + 1,
    }),
    { cost: 0, calls: 0, tokens: 0, peakCost: 0, costCache: 0, costMiss: 0, costOut: 0, savingIfValley: 0, days: 0 },
  );

  const models = pricing.map((price) => {
    let calls = 0;
    let cost = 0;
    let tokens = 0;
    for (const entry of window) {
      const slot = entry.models[price.id];
      if (!slot) continue;
      calls += slot.calls;
      cost += slot.cost;
      tokens += slot.tokens;
    }
    return { id: price.id, label: price.label, calls, cost: round(cost), tokens };
  });

  const projects = [...byProject.values()]
    .map((project) => ({
      ...project,
      cost: round(project.cost),
      peakCost: round(project.peakCost),
      share: round(attributedCost > 0 ? project.cost / attributedCost : 0),
    }))
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));

  return {
    windowDays: days,
    today,
    hours: today ? today.hours : [],
    window,
    projects,
    selectedProject: null,
    projectOptions: projects,
    week: {
      cost: round(week.cost),
      calls: week.calls,
      tokens: week.tokens,
      peakCost: round(week.peakCost),
      costCache: round(week.costCache),
      costMiss: round(week.costMiss),
      costOut: round(week.costOut),
      savingIfValley: round(week.savingIfValley),
      peakShare: week.cost > 0 ? week.peakCost / week.cost : 0,
      avgPerDay: week.days > 0 ? round(week.cost / week.days) : 0,
      avgTokensPerCall: week.calls > 0 ? Math.round(week.tokens / week.calls) : 0,
    },
    models,
    warnings: [
      ...(unknownModels.size > 0 ? [{ code: 'unknown-model', models: [...unknownModels] }] : []),
      ...missingCalendarYears(window),
    ],
  };
}

export function buildSnapshot(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const days = normalizeDays(options.days);
  const project = typeof options.project === 'string' && options.project !== '' ? options.project : null;
  const resolved = resolvePricing(options.pricing);
  const pricing = resolved.pricing;
  const pricingKey = resolved.custom ? encodePricing(pricing) : '';
  const cacheKey = JSON.stringify([days, project, pricingKey]);
  const cached = snapshotCache.get(cacheKey);
  if (cached && !options.fresh && now >= cached.builtAt && now - cached.builtAt < SNAPSHOT_TTL_MS) return cached.payload;

  const turns = collectTurns();
  const global = aggregateTurns(turns, { now, days, pricing });
  // Reuse the already-built directory rather than aggregating all projects twice.
  const selected = project === null ? null : global.projects.find((entry) => entry.key === project);
  const selectedProject = project === null ? null : selected
    ? { key: selected.key, name: selected.name, path: selected.path }
    : { key: project, name: path.basename(project) || project, path: project };
  const agg = project === null ? global : aggregateTurns(turns.filter((turn) => turn.project?.key === project), { now, days, pricing });
  const ledger = readLedger();
  // Ledger values are account-level, not attributable to an individual project.
  if (ledger.ok && project === null) {
    for (const entry of agg.window) {
      const booked = ledger.history && ledger.history[entry.day];
      entry.ledger = typeof booked === 'number' ? round(booked) : null;
    }
  }

  const switchPoint = nextSwitch(now);
  const peakNow = isPeakAt(now);
  const currentPrice = pricing[0];

  const payload = {
    ok: true,
    generatedAt: now,
    tz: 'Asia/Shanghai',
    version: VERSION,
    repo: REPO_URL,
    calendar: { years: CALENDAR_YEARS, holidays: OFF_DAYS.size, workdays: WORKDAYS.size },
    windowDays: days,
    now: {
      ts: now,
      day: dayKey(now),
      peak: peakNow,
      hour: bjDate(now).getUTCHours(),
      minutesIntoHour: bjDate(now).getUTCMinutes(),
      nextAt: switchPoint.at,
      nextStatus: switchPoint.status,
      price: {
        hit: currentPrice.hit[peakNow ? 1 : 0],
        miss: currentPrice.miss[peakNow ? 1 : 0],
        out: currentPrice.out[peakNow ? 1 : 0],
      },
    },
    today: agg.today,
    hours: agg.hours,
    days: agg.window,
    projects: agg.projects,
    selectedProject,
    projectOptions: global.projects,
    globalTodayCost: global.today.cost,
    week: agg.week,
    wallet: walletSummary(ledger.ok ? ledger.balance : null, global.week.avgPerDay),
    models: agg.models,
    pricing: pricing.map((price) => ({
      id: price.id,
      label: price.label,
      hit: price.hit,
      miss: price.miss,
      out: price.out,
    })),
    pricingCustom: resolved.custom,
    ledger,
    warnings: [
      ...(resolved.invalid ? [{ code: 'pricing-invalid' }] : []),
      ...agg.warnings,
    ],
  };

  // Project is user-controlled, so avoid retaining one snapshot for every
  // arbitrary key forever. Drop expired entries and bound live snapshots FIFO.
  for (const [key, entry] of snapshotCache) {
    if (now < entry.builtAt || now - entry.builtAt >= SNAPSHOT_TTL_MS) snapshotCache.delete(key);
  }
  snapshotCache.delete(cacheKey);
  while (snapshotCache.size >= MAX_SNAPSHOTS) snapshotCache.delete(snapshotCache.keys().next().value);
  snapshotCache.set(cacheKey, { builtAt: now, payload });
  return payload;
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

const CSV_FORMULA = /^[=+\-@\t\r]/;

/** RFC 4180 cell, with a guard against spreadsheet formula injection. */
export function csvEscape(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && CSV_FORMULA.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvTable(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

export function buildCsv(payload, scope = 'days') {
  if (scope === 'projects') {
    const rows = [['project', 'path', 'calls', 'tokens', 'cost', 'peak_cost', 'share']];
    for (const project of (payload && payload.projects) || []) {
      rows.push([project.name, project.path, project.calls, project.tokens, project.cost, project.peakCost, project.share]);
    }
    return csvTable(rows);
  }
  const rows = [
    [
      'day',
      'calls',
      'tokens',
      'cost',
      'cost_cache',
      'cost_miss',
      'cost_out',
      'peak_cost',
      'valley_cost',
      'saving_if_valley',
      'peak_share',
      'hit_rate',
      'holiday',
    ],
  ];
  for (const day of (payload && payload.days) || []) {
    rows.push([
      day.day,
      day.calls,
      day.tokens,
      day.cost,
      day.costCache,
      day.costMiss,
      day.costOut,
      day.peakCost,
      day.valleyCost,
      day.savingIfValley,
      round(day.peakShare),
      round(day.hitRate),
      day.holiday || '',
    ]);
  }
  return csvTable(rows);
}

/* ------------------------------------------------------------------ */
/* HTTP surface                                                        */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length),
  });
  res.end(body);
}

export const name = NS;

/**
 * Wait for the HTTP carrier before applying.
 *
 * Without this the bundle can be applied before `webServer` exists (cold start
 * ordering), the route never gets registered, and the client half sits on a 404
 * until someone reloads the plugin by hand.
 */
export const inject = ['webServer'];

export function apply(ctx) {
  const webServer = (typeof ctx.get === 'function' && ctx.get('webServer')) || ctx.webServer;
  if (!webServer || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.(`[${NS}] no webServer in this profile; dashboard route skipped`);
    return;
  }

  const trustCheck = (req, res) => {
    try {
      const connection = (typeof ctx.get === 'function' && ctx.get('connection')) || ctx.connection;
      if (!connection || typeof connection.requestRejection !== 'function') return false;
      const rejection = connection.requestRejection(req);
      if (rejection === undefined || rejection === null || rejection === false) return false;
      res.statusCode = typeof rejection === 'number' ? rejection : 403;
      res.end();
      return true;
    } catch {
      return false;
    }
  };

  const register = (route) => {
    try {
      return webServer.register(route);
    } catch (error) {
      // Hot reload can apply the new half before the old one finalises; a
      // duplicate route must not take the whole plugin down.
      ctx.logger?.warn?.(`[${NS}] route ${route.path} not registered: ${String((error && error.message) || error)}`);
      return () => {};
    }
  };

  const dispose = register({
    kind: 'exact',
    path: `${ROUTE_BASE}/data`,
    handler: async (req, res) => {
      if (trustCheck(req, res)) return;
      if ((req.method || 'GET').toUpperCase() !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const fresh = url.searchParams.get('fresh') === '1' || url.searchParams.get('fresh') === 'true';
      const days = normalizeDays(url.searchParams.get('days'));
      const project = url.searchParams.get('project');
      const pricing = url.searchParams.get('pricing');
      try {
        sendJson(res, 200, buildSnapshot({ days, fresh, project, pricing }));
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String((error && error.stack) || error) });
      }
    },
  });

  const disposeExport = register({
    kind: 'exact',
    path: `${ROUTE_BASE}/export.csv`,
    handler: async (req, res) => {
      if (trustCheck(req, res)) return;
      if ((req.method || 'GET').toUpperCase() !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const days = normalizeDays(url.searchParams.get('days'));
      const scope = url.searchParams.get('scope') === 'projects' ? 'projects' : 'days';
      const project = url.searchParams.get('project');
      const pricing = url.searchParams.get('pricing');
      try {
        const snapshot = buildSnapshot({ days, fresh: true, project, pricing });
        const body = Buffer.from(`\uFEFF${buildCsv(snapshot, scope)}`, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="dsh-usage-${dayKey(Date.now())}-${days}d-${scope}.csv"`,
          'Cache-Control': 'no-store',
          'Content-Length': String(body.length),
        });
        res.end(body);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String((error && error.stack) || error) });
      }
    },
  });

  ctx.effect(() => () => {
    dispose();
    disposeExport();
  }, `${NS}: dashboard route`);
}
