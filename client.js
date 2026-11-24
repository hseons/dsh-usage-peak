/**
 * dsh-usage-peak — Client half.
 *
 * Two surfaces over one data feed (/plugin/dsh-usage-peak/data):
 *  - a compact pill on its own row in the sidebar panel list,
 *  - a details page in Settings.
 *
 * Locale dictionaries are FLAT (`Record<string, string>`), as the client locale
 * service requires: nested objects silently fall back to the bare key.
 */
window.__ModuleLoader__.load({
  id: 'dsh-usage-peak',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const NS = 'dsh-usage-peak';
    const DATA_URL = '/plugin/dsh-usage-peak/data';
    const EXPORT_URL = '/plugin/dsh-usage-peak/export.csv';
    const DEFAULT_DAYS = 14;
    const WINDOW_DAYS = [7, 14, 30];

    const dicts = {
      zh: {
        'settings.title': '用量仪表盘',
        'settings.description': '峰谷时段与每天的花费、请求量、缓存命中',

        'widget.today': '今日',
        'widget.peak': '峰时',
        'widget.valley': '谷时',
        'widget.toPeak': '后转峰',
        'widget.toValley': '后转谷',
        'widget.soon': '即将切换',
        'widget.rail': '用量',
        'widget.railTitle': '用量仪表盘',
        'widget.failed': '读取失败',
        'widget.loading': '读取中',

        'page.title': '用量仪表盘',
        'page.subtitle': 'DeepSeek 峰谷计价 · 北京时区',
        'page.refresh': '刷新',
        'page.updated': '更新于',
        'page.loading': '正在统计会话日志…',
        'page.error': '读取失败',
        'page.retry': '重试',

        'status.peak': '峰时',
        'status.valley': '谷时',
        'status.holiday': '节假日',
        'status.makeup': '调休上班',
        'status.holidayTip': '法定节假日，全天按谷时计价',
        'status.makeupTip': '调休上班日，按工作日峰谷时段计价',
        'status.switchIn': '距转',

        'fmt.lang': 'zh',
        'unit.calls': '次',
        'unit.minute': '分',
        'warn.unknownModel': '未识别的模型已单列在「其他」，按 Flash 单价估算',
        'warn.unknownMore': '等 {n} 个',
        'warn.pricingInvalid': '自定义价目参数无效，已回退默认价目',
        'warn.calendarMissing': '以下年份还没有节假日数据，峰谷按周一至周五计算：',
        'footer.calendar': '峰谷已计入节假日与调休：',
        'footer.star': '给个 Star',
        'range.7': '近 7 天',
        'range.14': '近 14 天',
        'range.30': '近 30 天',

        'kpi.calls': '今日请求',
        'kpi.tokens': 'tokens',
        'kpi.hit': '缓存命中',
        'kpi.hitHint': '命中价为未命中的 1/50',
        'kpi.peakShare': '峰时占比',
        'kpi.perCall': '平均每次',
        'kpi.perDay': '日均',
        'kpi.balance': '余额',
        'kpi.today': '今日',
        'kpi.cache': '缓存',
        'kpi.out': '输出',
        'kpi.peakCost': '峰',
        'kpi.valleyCost': '谷',
        'kpi.saving': '谷时更省',
        'kpi.savingHint': '峰时按谷价计',
        'kpi.windowSaving': '近 7 天可省',
        'kpi.runway': '余额可撑',
        'kpi.runwayHint': '余额 ÷ 近 7 天日均',
        'unit.day': '天',
        'wallet.avg': '日均',
        'wallet.alert': '余额仅够',
        'wallet.runway': '可撑',
        'wallet.warn': '余额偏低',
        'wallet.low': '余额紧张',

        'projects.all': '全部项目',
        'projects.clear': '清除项目筛选',
        'projects.select': '筛选项目',
        'alerts.title': '全局预算与余额预警',
        'alerts.warn': '预警天数',
        'alerts.low': '紧张天数',
        'alerts.budget': '每日预算（元，可选）',
        'alerts.save': '保存阈值',
        'alerts.invalid': '请输入有限正数，且紧张天数必须小于预警天数。',
        'alerts.savedMemory': '存储不可用；仅本页生效，关闭页面后会丢失。',
        'alerts.saved': '已保存；当前页面所有面板同步生效。',
        'alerts.rules': '全局账户：余额可撑 <{warn} 天为琥珀、<{low} 天为红；每日花费 >预算为琥珀、≥120%预算为红。仅提示，不自动限流。',
        'alerts.exceeded': '全局每日预算已超出',
        'alerts.global': '全局今日',
        'projects.title': '按项目',
        'projects.hint': '按花费排序',
        'projects.name': '项目',
        'projects.calls': '请求',
        'projects.tokens': 'tokens',
        'projects.cost': '花费',
        'projects.share': '占比',
        'projects.empty': '这个窗口内还没有项目数据',
        'models.title': '按模型',
        'models.hint': '窗口内',
        'models.other': '其他 · 按 Flash 估算',
        'models.otherHint': '未识别的模型名，按 Flash 单价估算，金额为近似值',
        'models.empty': '暂无请求',
        'export.csv': '导出 CSV',
        'export.projects': '项目 CSV',
        'export.daysTitle': '导出每日数据 CSV',
        'export.projectsTitle': '导出项目数据 CSV',

        'chart.hours': '今日每小时花费',
        'chart.hoursHint': '橙 峰时 · 绿 谷时 · 悬停或聚焦看详情',
        'chart.days': '每天花费',
        'chart.daysHint': '橙 峰时 · 绿 谷时 · 悬停或聚焦看详情',
        'tip.cost': '花费',
        'tip.calls': '请求',
        'tip.tokens': 'tokens',
        'tip.hit': '缓存命中',
        'tip.hint': '用 ← → 浏览每小时 / 每天，Esc 关闭',

        'cost.title': '今日花费构成',
        'cost.cache': '缓存命中',
        'cost.miss': '未命中输入',
        'cost.out': '输出',

        'price.title': '价目表',
        'price.hint': '元 / 百万 tokens',
        'price.model': '模型',
        'price.period': '时段',
        'price.hit': '命中',
        'price.miss': '未命中',
        'price.out': '输出',
        'price.custom': '自定义价目',
        'pricing.title': '自定义价目表',
        'pricing.hint': '仅保存在本机；保存后所有金额与 CSV 立即按新价目重算。',
        'pricing.cache': '缓存命中',
        'pricing.input': '输入',
        'pricing.output': '输出',
        'pricing.valley': '谷',
        'pricing.peak': '峰',
        'pricing.save': '保存价目',
        'pricing.reset': '恢复默认',
        'pricing.saved': '已应用自定义价目；当前页面所有面板同步生效。',
        'pricing.savedMemory': '存储不可用；仅本页生效，关闭页面后会丢失。',
        'pricing.invalid': '请填写 0 或有限正数价格。',
        'pricing.resetDone': '已恢复默认价目。',
      },
      en: {
        'settings.title': 'Usage dashboard',
        'settings.description': 'Peak/valley windows with daily spend, requests and cache hits',

        'widget.today': 'Today',
        'widget.peak': 'Peak',
        'widget.valley': 'Valley',
        'widget.toPeak': ' to peak',
        'widget.toValley': ' to valley',
        'widget.soon': 'switching',
        'widget.rail': 'Usage',
        'widget.railTitle': 'Usage dashboard',
        'widget.failed': 'failed',
        'widget.loading': 'loading',

        'page.title': 'Usage dashboard',
        'page.subtitle': 'DeepSeek peak/valley pricing · Beijing time',
        'page.refresh': 'Refresh',
        'page.updated': 'Updated',
        'page.loading': 'Reading session logs…',
        'page.error': 'Failed to load',
        'page.retry': 'Retry',

        'status.peak': 'Peak',
        'status.valley': 'Valley',
        'status.holiday': 'holiday',
        'status.makeup': 'makeup workday',
        'status.holidayTip': 'public holiday — valley tariff all day',
        'status.makeupTip': 'makeup workday — weekday peak/valley windows',
        'status.switchIn': 'in',

        'fmt.lang': 'en',
        'unit.calls': 'req',
        'unit.minute': 'm',
        'warn.unknownModel': 'Unknown models are listed under “Other” and estimated at Flash rates',
        'warn.unknownMore': 'and {n} more',
        'warn.pricingInvalid': 'Invalid custom pricing; reverted to the default price list',
        'warn.calendarMissing': 'No holiday data for these years, peak hours fall back to Mon-Fri:',
        'footer.calendar': 'Peak hours include holidays and makeup workdays:',
        'footer.star': 'Star it',
        'range.7': 'Last 7 days',
        'range.14': 'Last 14 days',
        'range.30': 'Last 30 days',

        'kpi.calls': 'Requests',
        'kpi.tokens': 'tokens',
        'kpi.hit': 'Cache hit',
        'kpi.hitHint': 'hit costs 1/50 of miss',
        'kpi.peakShare': 'Peak share',
        'kpi.perCall': 'per request',
        'kpi.perDay': 'per day',
        'kpi.balance': 'Balance',
        'kpi.today': 'today',
        'kpi.cache': 'cache',
        'kpi.out': 'output',
        'kpi.peakCost': 'peak',
        'kpi.valleyCost': 'valley',
        'kpi.saving': 'Valley saving',
        'kpi.savingHint': 'peak tokens at valley price',
        'kpi.windowSaving': '7d saving',
        'kpi.runway': 'Runway',
        'kpi.runwayHint': 'balance ÷ 7-day average',
        'unit.day': 'd',
        'wallet.avg': 'avg',
        'wallet.alert': 'Balance covers',
        'wallet.runway': 'covers',
        'wallet.warn': 'Low balance',
        'wallet.low': 'Balance critical',

        'projects.all': 'All projects',
        'projects.clear': 'Clear project filter',
        'projects.select': 'Filter project',
        'alerts.title': 'Global budget and balance alerts',
        'alerts.warn': 'Warning days',
        'alerts.low': 'Critical days',
        'alerts.budget': 'Daily budget (CNY, optional)',
        'alerts.save': 'Save thresholds',
        'alerts.invalid': 'Use finite positive numbers; critical days must be less than warning days.',
        'alerts.savedMemory': 'Storage unavailable; applies only to this page until it closes.',
        'alerts.saved': 'Saved; all panels on this page are synchronized.',
        'alerts.rules': 'Global account: runway <{warn} days is amber, <{low} is red; daily spend >budget is amber, ≥120% is red. Alerts only, no rate limiting.',
        'alerts.exceeded': 'Global daily budget exceeded',
        'alerts.global': 'Global today',
        'projects.title': 'By project',
        'projects.hint': 'sorted by spend',
        'projects.name': 'Project',
        'projects.calls': 'req',
        'projects.tokens': 'tokens',
        'projects.cost': 'Spend',
        'projects.share': 'Share',
        'projects.empty': 'No project data in this window',
        'models.title': 'By model',
        'models.hint': 'in window',
        'models.other': 'Other · Flash estimate',
        'models.otherHint': 'Unrecognised model names are estimated at Flash rates; amounts are approximate',
        'models.empty': 'No requests yet',
        'export.csv': 'Export CSV',
        'export.projects': 'Projects CSV',
        'export.daysTitle': 'Export daily CSV',
        'export.projectsTitle': 'Export project CSV',

        'chart.hours': 'Cost per hour today',
        'chart.hoursHint': 'orange peak · green valley · hover or focus for details',
        'chart.days': 'Spend by day',
        'chart.daysHint': 'orange peak · green valley · hover or focus for details',
        'tip.cost': 'Spend',
        'tip.calls': 'Requests',
        'tip.tokens': 'tokens',
        'tip.hit': 'Cache hit',
        'tip.hint': 'Use ← → to browse hours or days, Esc to close',

        'cost.title': 'Today by token type',
        'cost.cache': 'Cache hits',
        'cost.miss': 'Missed input',
        'cost.out': 'Output',

        'price.title': 'Price list',
        'price.hint': 'CNY per million tokens',
        'price.model': 'Model',
        'price.period': 'Period',
        'price.hit': 'Hit',
        'price.miss': 'Miss',
        'price.out': 'Output',
        'price.custom': 'custom pricing',
        'pricing.title': 'Custom price list',
        'pricing.hint': 'Stored only in this browser; saving recalculates every figure and CSV immediately.',
        'pricing.cache': 'Cache hit',
        'pricing.input': 'Input',
        'pricing.output': 'Output',
        'pricing.valley': 'valley',
        'pricing.peak': 'peak',
        'pricing.save': 'Save prices',
        'pricing.reset': 'Restore defaults',
        'pricing.saved': 'Custom pricing applied; all panels on this page are synchronized.',
        'pricing.savedMemory': 'Storage unavailable; applies only to this page until it closes.',
        'pricing.invalid': 'Enter 0 or a finite positive price.',
        'pricing.resetDone': 'Default prices restored.',
      },
    };

    const C = {
      text: 'var(--dsw-alias-label-primary)',
      text2: 'var(--dsw-alias-label-secondary)',
      text3: 'var(--dsw-alias-label-tertiary)',
      border: 'var(--dsw-alias-border-l2)',
      layer1: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      peak: 'var(--dsw-alias-state-warn-primary)',
      valley: 'var(--dsw-alias-state-success-primary)',
      cache: 'var(--dsw-alias-state-business-primary)',
      miss: 'var(--dsw-alias-state-warn-primary)',
      out: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    };

    /* ------------------------------ formatting ------------------------------ */

    const yuan = (value, digits) =>
      value === null || value === undefined || Number.isNaN(value)
        ? '—'
        : `¥${Number(value).toFixed(digits === undefined ? 2 : digits)}`;

    /** Token count with the locale's own magnitude words: 1.2 万 / 1.2K. */
    function tokens(value, t) {      if (!value) return '0';
      const english = typeof t === 'function' && t('fmt.lang') === 'en';
      if (english) {
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
        if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
        return String(Math.round(value));
      }
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`;
      return String(Math.round(value));
    }

    /**
     * The unknown-model banner is one line inside a card: a user running many
     * third-party models would stretch it past the panel width. Show the first
     * few names, count the rest, and keep the full list in the tooltip.
     */
    const WARN_NAME_LIMIT = 3;
    function summarizeNames(names, t) {
      const list = (Array.isArray(names) ? names : []).filter((name) => typeof name === 'string' && name !== '');
      if (!list.length) return '';
      const head = list.slice(0, WARN_NAME_LIMIT).join(', ');
      if (list.length <= WARN_NAME_LIMIT) return head;
      return `${head} ${t('warn.unknownMore').replace('{n}', String(list.length - WARN_NAME_LIMIT))}`;
    }

    /** Ultra compact for the pill: 1.2B / 12.8M / 942K. */
    function shortTokens(value) {
      if (!value) return '0';
      if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
      if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
      return String(Math.round(value));
    }

    const percent = (value, digits) =>
      value === null || value === undefined || Number.isNaN(value)
        ? '—'
        : `${(value * 100).toFixed(digits === undefined ? 1 : digits)}%`;

    function clock(ts) {
      const date = new Date(ts);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    /** Short numeric countdown: 27分 / 1:27 / 3:19. */
    function countdown(ms, t) {
      const total = Math.max(0, Math.round(ms / 60000));
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}`;
      return `${minutes}${typeof t === 'function' ? t('unit.minute') : '分'}`;
    }

    /** Runway in days: 2.9 / 7 / <1 / 120. */
    function runway(value, t) {
      if (value === null || value === undefined || Number.isNaN(value)) return '—';
      const days = value <= 0 ? '0' : value < 1 ? '<1' : value >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
      return `${days} ${t('unit.day')}`;
    }

    /* --------------------------------- data --------------------------------- */

    const PREFS_KEY = 'dsh-usage-peak:alerts:v1';
    const PREFS_EVENT = 'dsh-usage-peak:alerts-change';
    const DEFAULT_PREFS = { warnDays: 7, lowDays: 3, dailyBudget: null };
    const PRICING_KEY = 'dsh-usage-peak:pricing:v1';
    const PRICING_EVENT = 'dsh-usage-peak:pricing-change';
    const DEFAULT_PRICING = [
      { id: 'flash', label: 'DeepSeek Flash', hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
      { id: 'pro', label: 'DeepSeek Pro', hit: [0.15, 0.3], miss: [4.5, 9], out: [13.5, 27] },
    ];
    const PRICING_IDS = DEFAULT_PRICING.map((price) => price.id);
    const PRICING_MAX = 1e7;
    const tint = (color, amount = 10) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

    function clonePricing(table) {
      return (table || DEFAULT_PRICING).map((price) => ({
        id: price.id,
        label: price.label,
        hit: [...price.hit],
        miss: [...price.miss],
        out: [...price.out],
      }));
    }

    function validatePricing(value) {
      if (!Array.isArray(value) || value.length !== PRICING_IDS.length) return null;
      const byId = new Map();
      for (const entry of value) {
        if (!entry || typeof entry !== 'object' || !PRICING_IDS.includes(entry.id) || byId.has(entry.id)) return null;
        const pair = (values) => {
          if (!Array.isArray(values) || values.length !== 2) return null;
          const nums = values.map((v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string' && v.trim() !== '') return Number(v);
            return NaN;
          });
          if (!nums.every((n) => Number.isFinite(n) && n >= 0 && n <= PRICING_MAX)) return null;
          return nums;
        };
        const hit = pair(entry.hit);
        const miss = pair(entry.miss);
        const out = pair(entry.out);
        if (!hit || !miss || !out) return null;
        const base = DEFAULT_PRICING.find((price) => price.id === entry.id);
        byId.set(entry.id, { id: entry.id, label: base.label, hit, miss, out });
      }
      return PRICING_IDS.every((id) => byId.has(id)) ? PRICING_IDS.map((id) => byId.get(id)) : null;
    }

    function encodePricing(table) {
      const normalized = validatePricing(table);
      if (!normalized) return '';
      return normalized
        .map((price) => `${price.id}:${[...price.hit, ...price.miss, ...price.out].join(',')}`)
        .join('|');
    }

    function pricingParam(table) {
      if (!table) return '';
      const encoded = encodePricing(table);
      return encoded && encoded !== encodePricing(DEFAULT_PRICING) ? encoded : '';
    }

    let memoryPricing = clonePricing(DEFAULT_PRICING);
    let pricingStorageFailed = false;
    function readPricing() {
      if (pricingStorageFailed) return clonePricing(memoryPricing);
      try {
        const raw = window.localStorage.getItem(PRICING_KEY);
        if (raw !== null) memoryPricing = validatePricing(JSON.parse(raw)) || clonePricing(DEFAULT_PRICING);
      } catch { /* Disabled storage: retain this page's last valid prices. */ }
      return clonePricing(memoryPricing);
    }
    function savePricing(value) {
      const next = validatePricing(value);
      if (!next) return false;
      memoryPricing = next;
      try { window.localStorage.setItem(PRICING_KEY, JSON.stringify(next)); pricingStorageFailed = false; } catch { pricingStorageFailed = true; }
      window.dispatchEvent(new CustomEvent(PRICING_EVENT, { detail: next }));
      return true;
    }
    function usePricing() {
      const [pricing, setPricing] = useState(readPricing);
      useEffect(() => {
        const sync = (event) => {
          if (event.type === 'storage' && event.key !== PRICING_KEY && event.key !== null) return;
          if (event.type === 'storage') pricingStorageFailed = false;
          if (event.type === 'storage' && event.key === PRICING_KEY && event.newValue === null) memoryPricing = clonePricing(DEFAULT_PRICING);
          setPricing(event.type === PRICING_EVENT ? clonePricing(memoryPricing) : readPricing());
        };
        window.addEventListener(PRICING_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => { window.removeEventListener(PRICING_EVENT, sync); window.removeEventListener('storage', sync); };
      }, []);
      return pricing;
    }

    function validatePrefs(value) {
      if (!value || typeof value !== 'object') return null;
      const positive = (v) => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
      if (!positive(value.warnDays) || !positive(value.lowDays) || Number(value.lowDays) >= Number(value.warnDays)) return null;
      const empty = value.dailyBudget === null || value.dailyBudget === undefined || value.dailyBudget === '';
      if (!empty && !positive(value.dailyBudget)) return null;
      return { warnDays: Number(value.warnDays), lowDays: Number(value.lowDays), dailyBudget: empty ? null : Number(value.dailyBudget) };
    }

    let memoryPrefs = { ...DEFAULT_PREFS };
    let storageFailed = false;
    function readPrefs() {
      if (storageFailed) return { ...memoryPrefs };
      try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (raw !== null) memoryPrefs = validatePrefs(JSON.parse(raw)) || { ...DEFAULT_PREFS };
      } catch { /* Disabled storage: retain this page's last valid values. */ }
      return { ...memoryPrefs };
    }
    function savePrefs(value) {
      const next = validatePrefs(value);
      if (!next) return false;
      memoryPrefs = next;
      try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); storageFailed = false; } catch { storageFailed = true; /* In-memory fallback even if reads still succeed. */ }
      window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
      return true;
    }
    function usePreferences() {
      const [prefs, setPrefs] = useState(readPrefs);
      useEffect(() => {
        const sync = (event) => {
          if (event.type === 'storage' && event.key !== PREFS_KEY && event.key !== null) return;
          if (event.type === 'storage') storageFailed = false;
          if (event.type === 'storage' && (event.key === PREFS_KEY || event.key === null) && event.newValue === null) memoryPrefs = { ...DEFAULT_PREFS };
          setPrefs(event.type === PREFS_EVENT ? { ...memoryPrefs } : readPrefs());
        };
        window.addEventListener(PREFS_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => { window.removeEventListener(PREFS_EVENT, sync); window.removeEventListener('storage', sync); };
      }, []);
      return prefs;
    }

    // Account-level signals only. Never substitute the selected project's cost.
    function alertState(data, prefs) {
      const rules = validatePrefs(prefs) || DEFAULT_PREFS;
      const days = data && data.wallet && data.wallet.runwayDays;
      const walletLevel = Number.isFinite(days) ? days < rules.lowDays ? 'low' : days < rules.warnDays ? 'warn' : 'ok' : 'unknown';
      const cost = data && data.globalTodayCost;
      const budgetLevel = rules.dailyBudget && Number.isFinite(cost)
        ? cost >= rules.dailyBudget * 1.2 ? 'low' : cost > rules.dailyBudget ? 'warn' : 'ok' : 'unknown';
      const rank = { unknown: 0, ok: 0, warn: 1, low: 2 };
      const level = rank[budgetLevel] > rank[walletLevel] ? budgetLevel : walletLevel;
      return { level, walletLevel, budgetLevel, budgetExceeded: rank[budgetLevel] > 0,
        active: rank[level] > 0, tone: level === 'low' ? C.error : level === 'warn' ? C.peak : C.text3 };
    }

    function feedUrl(base, days, project, fresh = false, pricing = '') {
      const pricePart = typeof pricing === 'string' ? pricing : pricingParam(pricing);
      return `${base}?days=${days || DEFAULT_DAYS}${project ? `&project=${encodeURIComponent(project)}` : ''}${pricePart ? `&pricing=${encodeURIComponent(pricePart)}` : ''}${fresh ? '&fresh=1' : ''}`;
    }

    // Keep the peak/valley countdown visible in the pill; the warning is an
    // accent plus a prefix, never a replacement for the status text.
    function pillStatus(alertActive, switchText) {
      return alertActive ? `⚠ ${switchText}` : switchText;
    }

    /**
     * Status wording for the pills. A public holiday is valley all day, a
     * makeup workday follows the weekday windows even on a weekend, and the
     * pill says which rule produced the current tariff.
     */
    function statusLabel(data, t) {
      if (!data || !data.now) return t('widget.loading');
      const now = data.now;
      if (!now.peak && now.holiday) return `${t('status.valley')} · ${t('status.holiday')}`;
      if (now.peak && now.makeup) return `${t('status.peak')} · ${t('status.makeup')}`;
      return now.peak ? t('status.peak') : t('status.valley');
    }

    /** Tooltip explaining why today is a holiday / makeup workday. */
    function statusTip(data, t) {
      const now = data && data.now;
      if (!now) return '';
      if (!now.peak && now.holiday) return `${now.holiday} · ${t('status.holidayTip')}`;
      if (now.makeup) return `${now.makeup} · ${t('status.makeupTip')}`;
      return '';
    }

    /** Clamp a tooltip's left edge so it stays inside its chart box. */
    function tipAnchor(center, tipWidth, boxWidth, inset = 4) {
      const limit = Math.max(inset, boxWidth - tipWidth - inset);
      return Math.min(Math.max(center - tipWidth / 2, inset), limit);
    }

    // Generation guard rejects old filter responses and older same-filter reloads.
    function requestGate() {
      let key = null;
      let serial = 0;
      return {
        select(next) { if (key !== next) { key = next; serial += 1; } },
        begin(next) { key = next; serial += 1; return { key, serial }; },
        current(ticket) { return ticket.key === key && ticket.serial === serial; },
        invalidate() { serial += 1; },
      };
    }
    function useFeed(days, project = '', pricing = null) {
      const windowDays = days || DEFAULT_DAYS;
      const pricingKey = pricingParam(pricing);
      const queryKey = JSON.stringify([windowDays, project, pricingKey]);
      const guard = useRef(null);
      if (!guard.current) guard.current = requestGate();
      guard.current.select(queryKey);
      const [state, setState] = useState({ key: queryKey, loading: true, error: null, data: null });
      const [tick, setTick] = useState(0);
      const load = useCallback((fresh) => {
        const ticket = guard.current.begin(queryKey);
        fetch(feedUrl(DATA_URL, windowDays, project, fresh, pricingKey), { headers: { accept: 'application/json' } })
          .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
          .then((data) => {
            if (!data || data.ok === false) throw new Error((data && data.error) || 'bad payload');
            if (guard.current.current(ticket)) setState({ key: queryKey, loading: false, error: null, data });
          })
          .catch((error) => {
            if (guard.current.current(ticket)) setState((previous) => ({ key: queryKey, loading: false, error: String(error && error.message), data: previous.key === queryKey ? previous.data : null }));
          });
      }, [queryKey, windowDays, project, pricingKey]);
      useEffect(() => {
        load(false);
        const timer = setInterval(() => load(false), 60_000);
        return () => { clearInterval(timer); guard.current.invalidate(); };
      }, [load]);
      const visible = state.key === queryKey ? state : { loading: true, error: null, data: null };
      useEffect(() => {
        if (!visible.error) return undefined;
        const timer = setTimeout(() => load(false), 5_000);
        return () => clearTimeout(timer);
      }, [visible.error, load]);
      useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), 15_000);
        return () => clearInterval(timer);
      }, []);
      return { ...visible, tick, reload: load };
    }

    /* -------------------------------- atoms --------------------------------- */

    function Pill(props) {
      return h(
        'span',
        {
          title: props.title,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 11px',
            borderRadius: 999,
            background: C.layer2,
            border: `1px solid ${C.border}`,
            fontSize: 12,
            lineHeight: '18px',
            color: C.text2,
            whiteSpace: 'nowrap',
            ...(props.style || {}),
          },
        },
        props.children,
      );
    }

    function Dot(props) {
      return h('span', {
        style: {
          width: 7,
          height: 7,
          borderRadius: 4,
          flex: 'none',
          background: props.tone,
          boxShadow: props.glow ? `0 0 0 3px ${tint(props.tone, 14)}` : 'none',
        },
      });
    }

    function Sep() {
      return h('span', { style: { color: C.text3, opacity: 0.7 } }, '·');
    }

    /* ----------------------------- sidebar widget ---------------------------- */

    /**
     * A row of its own in the sidebar's panel list.
     *
     * The list row is a normal nav row (36px), so the pill sits there as the
     * row's glyph with an empty label: nothing to squeeze, nothing to overlap.
     * Clicking the row opens the details page as a main panel.
     */
    function PanelGlyph(props) {
      const t = props.t;
      const pricing = usePricing();
      const { data } = useFeed(DEFAULT_DAYS, '', pricing);
      const rail = !!props.rail;
      const open = typeof props.onOpen === 'function' ? props.onOpen : null;
      const rootProps = { 'data-usage-widget': '', title: '' };

      const peak = data ? data.now.peak : null;
      const loading = !data;
      const tone = loading ? C.text3 : peak ? C.peak : C.valley;
      const word = loading ? t('widget.loading') : statusLabel(data, t);
      const english = t('fmt.lang') === 'en';
      const short = loading ? word : peak ? (english ? 'P' : '峰') : (english ? 'V' : '谷');
      const wallet = data && data.wallet ? data.wallet : null;
      const prefs = usePreferences();
      const alert = alertState(data, prefs);
      const walletAlert = alert.active;
      const walletTone = alert.tone;
      const walletText = walletAlert ? (alert.budgetExceeded ? t('alerts.exceeded') : `${t('wallet.alert')} ${runway(wallet && wallet.runwayDays, t)}`) : '';
      const remain = data ? Math.max(0, data.now.nextAt - Date.now()) : 0;
      const switchText =
        data && remain > 30_000
          ? `${countdown(remain, t)} ${peak ? t('widget.toValley') : t('widget.toPeak')}`
          : t('widget.soon');
      const today = data && data.today ? data.today.cost : null;
      const walletTip =
        wallet && wallet.balance !== null
          ? `${t('kpi.balance')} ${yuan(wallet.balance)}${walletText ? ` · ${walletText}` : ''}`
          : walletText;
      const tip = data
        ? `${word} · ${t('widget.today')} ${yuan(today)} · ${tokens(data.today ? data.today.tokens : 0, t)} tokens · ${t('status.switchIn')} ${switchText}${walletTip ? ` · ${walletTip}` : ''}${statusTip(data, t) ? ` · ${statusTip(data, t)}` : ''}`
        : word;

      // The seat is the shell's own flex row: the root takes a whole line (see
      // CSS) and the pill keeps its intrinsic width on it.
      const rootStyle = { display: 'flex', alignItems: 'center', minWidth: 0 };
      if (open) rootStyle.cursor = 'pointer';

      const pillStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 21,
        padding: '0 8px',
        borderRadius: 999,
        border: `1px solid ${walletAlert ? walletTone : C.border}`,
        background: walletAlert ? tint(walletTone, 8) : 'transparent',
        fontSize: 10.5,
        lineHeight: '19px',
        color: C.text2,
        maxWidth: '100%',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      };

      const pill = rail
        ? h(Dot, { tone: walletAlert ? walletTone : tone })
        : h(
            'span',
            { style: pillStyle },
            h(Dot, { tone, glow: true }),
            h('span', { style: { color: tone, fontWeight: 600, flex: 'none' } }, short),
            h('span', { style: { color: C.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flex: 'none' } }, yuan(today)),
            h(Sep),
            h(
              'span',
              {
                style: {
                  color: C.text2,
                  flex: '0 1 auto',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                },
              },
              data && data.today ? shortTokens(data.today.tokens) : '—',
              h('span', { style: { color: C.text3, marginLeft: 2 } }, 'tok'),
            ),
            h(Sep),
            h(
              'span',
              {
                style: {
                  color: walletAlert ? walletTone : C.text3,
                  fontWeight: walletAlert ? 600 : 400,
                  fontVariantNumeric: 'tabular-nums',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              },
              data ? pillStatus(walletAlert, switchText) : '',
            ),
          );

      return h('div', { ...rootProps, title: tip, onClick: open || undefined, style: rootStyle }, pill);
    }

    /* ------------------------------- page bits ------------------------------- */

    function Card(props) {
      return h(
        'section',
        {
          style: {
            background: C.layer1,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
            ...(props.style || {}),
          },
        },
        props.children,
      );
    }

    function CardTitle(props) {
      return h(
        'header',
        { style: { display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' } },
        h('h3', { style: { margin: 0, fontSize: 12.5, fontWeight: 600, color: C.text } }, props.title),
        props.hint || props.action
          ? h(
              'span',
              { style: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: C.text3 } },
              props.hint ? h('span', null, props.hint) : null,
              props.action || null,
            )
          : null,
      );
    }

    function Kpi(props) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.layer1,
            minWidth: 0,
          },
        },
        h('span', { style: { fontSize: 11, color: C.text3 } }, props.label),
        h(
          'strong',
          {
            style: {
              fontSize: 19,
              fontWeight: 600,
              lineHeight: 1.2,
              color: props.tone || C.text,
              fontVariantNumeric: 'tabular-nums',
            },
          },
          props.value,
        ),
        props.hint ? h('span', { style: { fontSize: 10.5, color: C.text3 } }, props.hint) : null,
      );
    }

    /* ------------------------------- chart tips ------------------------------ */

    const srOnly = {
      position: 'absolute',
      width: 1,
      height: 1,
      margin: -1,
      padding: 0,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
      border: 0,
    };

    /** Live width of an element, so dense charts can thin their labels. */
    function useBoxWidth(ref) {
      const [width, setWidth] = useState(0);
      useEffect(() => {
        const node = ref.current;
        if (!node) return undefined;
        const update = () => setWidth(node.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
      }, []);
      return width;
    }

    /**
     * Hover plus keyboard state for one chart.
     *
     * The tooltip is anchored to the hovered column's centre and clamped to the
     * chart box, so it never spills out of a narrow panel.
     */
    function useChartTip(count) {
      const [active, setActive] = useState(-1);
      const [focused, setFocused] = useState(false);
      const [anchor, setAnchor] = useState(null);
      const boxRef = useRef(null);
      const columns = useRef([]);
      const width = useBoxWidth(boxRef);
      const tipWidth = Math.min(216, Math.max(150, (width || 240) - 8));

      useEffect(() => {
        const column = active >= 0 ? columns.current[active] : null;
        if (!column || !width) {
          setAnchor(null);
          return;
        }
        setAnchor({ left: tipAnchor(column.offsetLeft + column.offsetWidth / 2, tipWidth, width), width: tipWidth });
      }, [active, width, tipWidth]);

      const step = (delta) =>
        setActive((current) => {
          const from = current < 0 ? (delta > 0 ? -1 : 0) : current;
          return (from + delta + count) % count;
        });

      const onKeyDown = (event) => {
        if (!count) return;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          step(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          step(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          setActive(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          setActive(count - 1);
        } else if (event.key === 'Escape') {
          setActive(-1);
        }
      };

      const onBlur = (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        setActive(-1);
      };

      return {
        active,
        anchor,
        boxRef,
        columns,
        width,
        focused,
        tipWidth,
        onKeyDown,
        onBlur,
        onFocus: () => setFocused(true),
        show: setActive,
        clear: () => setActive(-1),
      };
    }

    function ChartTip(props) {
      return h(
        'div',
        {
          role: 'tooltip',
          style: {
            position: 'absolute',
            top: 0,
            left: props.left,
            width: props.width,
            zIndex: 3,
            pointerEvents: 'none',
            boxSizing: 'border-box',
            padding: '6px 9px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.layer1,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
            fontSize: 10.5,
            lineHeight: '15px',
            color: C.text2,
          },
        },
        h(
          'div',
          {
            style: {
              color: C.text,
              fontWeight: 600,
              marginBottom: 3,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          props.title,
        ),
        (props.rows || []).map((row, index) =>
          h(
            'div',
            { key: index, style: { display: 'flex', justifyContent: 'space-between', gap: 12 } },
            h('span', { style: { color: C.text3, flex: 'none' } }, row[0]),
            h('span', { style: { color: C.text, fontVariantNumeric: 'tabular-nums', textAlign: 'right' } }, row[1]),
          ),
        ),
      );
    }

    function HourChart(props) {
      const hours = props.hours || [];
      const t = props.t;
      const max = Math.max(0.0001, ...hours.map((entry) => entry.cost));
      const tip = useChartTip(hours.length);
      const active = tip.active >= 0 ? hours[tip.active] : null;
      const label = active ? `${String(active.hour).padStart(2, '0')}:00 · ${active.peak ? t('status.peak') : t('status.valley')}` : '';
      const rows = active
        ? [
            [t('tip.cost'), yuan(active.cost)],
            [t('tip.calls'), `${active.calls} ${t('unit.calls')}`],
            [t('tip.tokens'), tokens(active.tokens || 0, t)],
            [t('tip.hit'), percent(active.hitRate || 0)],
          ]
        : [];
      return h(
        'div',
        {
          role: 'group',
          tabIndex: 0,
          'aria-label': t('chart.hours'),
          title: t('tip.hint'),
          onKeyDown: tip.onKeyDown,
          onFocus: tip.onFocus,
          onBlur: tip.onBlur,
          style: {
            position: 'relative',
            marginTop: 2,
            borderRadius: 6,
            outline: tip.focused ? `2px solid ${C.out}` : 'none',
            outlineOffset: 2,
          },
        },
        h(
          'div',
          {
            ref: tip.boxRef,
            onMouseLeave: tip.clear,
            style: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 108 },
          },
          hours.map((entry, index) =>
            h(
              'div',
              {
                key: entry.hour,
                ref: (node) => {
                  tip.columns.current[index] = node;
                },
                onMouseEnter: () => tip.show(index),
                style: {
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  height: '100%',
                  minWidth: 3,
                  borderRadius: 4,
                  outline: entry.hour === props.nowHour ? `1px solid ${C.border}` : 'none',
                  outlineOffset: 1,
                },
              },
              h('div', {
                style: {
                  height: `${Math.max(entry.cost > 0 ? 3 : 0, (entry.cost / max) * 100)}%`,
                  background: entry.peak ? C.peak : C.valley,
                  opacity: entry.cost > 0 ? (tip.active < 0 || tip.active === index ? 0.9 : 0.4) : 0,
                  borderRadius: 3,
                  transition: 'opacity 120ms',
                },
              }),
            ),
          ),
        ),
        tip.anchor ? h(ChartTip, { title: label, rows, left: tip.anchor.left, width: tip.anchor.width }) : null,
        active ? h('span', { 'aria-live': 'polite', style: srOnly }, `${label} · ${rows.map((row) => `${row[0]} ${row[1]}`).join(' · ')}`) : null,
      );
    }

    function DayChart(props) {
      const days = props.days || [];
      const t = props.t;
      const max = Math.max(0.0001, ...days.map((entry) => entry.cost));
      const tip = useChartTip(days.length);
      const dense = tip.width > 0 && days.length > 0 && tip.width / days.length < 26;
      const gap = dense ? 2 : 8;
      const labelStride = dense ? Math.max(1, Math.ceil(days.length / 7)) : 1;
      const active = tip.active >= 0 ? days[tip.active] : null;
      const label = active ? `${active.day}${active.holiday ? ` · ${active.holiday}` : ''}` : '';
      const rows = active
        ? [
            [t('tip.cost'), yuan(active.cost)],
            [t('tip.calls'), `${active.calls} ${t('unit.calls')}`],
            [t('tip.tokens'), tokens(active.tokens || 0, t)],
            [t('tip.hit'), percent(active.hitRate || 0)],
          ]
        : [];
      return h(
        'div',
        {
          role: 'group',
          tabIndex: 0,
          'aria-label': t('chart.days'),
          title: t('tip.hint'),
          onKeyDown: tip.onKeyDown,
          onFocus: tip.onFocus,
          onBlur: tip.onBlur,
          style: {
            position: 'relative',
            marginTop: 4,
            borderRadius: 6,
            outline: tip.focused ? `2px solid ${C.out}` : 'none',
            outlineOffset: 2,
          },
        },
        h(
          'div',
          {
            ref: tip.boxRef,
            onMouseLeave: tip.clear,
            style: { display: 'flex', alignItems: 'flex-end', gap, height: 128 },
          },
          days.map((entry, index) =>
            h(
              'div',
              {
                key: entry.day,
                ref: (node) => {
                  tip.columns.current[index] = node;
                },
                onMouseEnter: () => tip.show(index),
                style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%' },
              },
              dense
                ? null
                : h('span', { style: { fontSize: 9.5, color: C.text3, fontVariantNumeric: 'tabular-nums' } }, entry.cost > 0 ? entry.cost.toFixed(1) : ''),
              h(
                'div',
                {
                  style: {
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    borderRadius: 4,
                    overflow: 'hidden',
                    opacity: tip.active < 0 || tip.active === index ? 1 : 0.45,
                    transition: 'opacity 120ms',
                  },
                },
                h('div', { style: { height: `${(entry.peakCost / max) * 100}%`, background: C.peak, opacity: 0.9 } }),
                h('div', { style: { height: `${(entry.valleyCost / max) * 100}%`, background: C.valley, opacity: 0.9 } }),
              ),
              index % labelStride === 0
                ? h('span', { style: { fontSize: dense ? 9 : 9.5, color: C.text2, whiteSpace: 'nowrap' } }, dense ? entry.day.slice(8) : entry.day.slice(5))
                : h('span', { style: { height: dense ? 11 : 12 } }),
            ),
          ),
        ),
        tip.anchor ? h(ChartTip, { title: label, rows, left: tip.anchor.left, width: tip.anchor.width }) : null,
        active ? h('span', { 'aria-live': 'polite', style: srOnly }, `${label} · ${rows.map((row) => `${row[0]} ${row[1]}`).join(' · ')}`) : null,
      );
    }

    function CostSplit(props) {
      const total = Math.max(0.0001, props.cost || 0);
      const rows = [
        { key: 'cache', label: props.t('cost.cache'), value: props.costCache, fill: C.cache },
        { key: 'miss', label: props.t('cost.miss'), value: props.costMiss, fill: C.miss },
        { key: 'out', label: props.t('cost.out'), value: props.costOut, fill: C.out },
      ];
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
        h(
          'div',
          { style: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.layer2 } },
          rows.map((row) =>
            h('div', {
              key: row.key,
              title: `${row.label} ${yuan(row.value)}`,
              style: { width: `${((row.value || 0) / total) * 100}%`, background: row.fill },
            }),
          ),
        ),
        rows.map((row) =>
          h(
            'div',
            { key: row.key, style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 } },
            h('span', { style: { width: 7, height: 7, borderRadius: 2, background: row.fill, flex: 'none' } }),
            h('span', { style: { color: C.text2, flex: 1 } }, row.label),
            h('span', { style: { color: C.text, fontVariantNumeric: 'tabular-nums' } }, yuan(row.value)),
            h('span', { style: { color: C.text3, width: 42, textAlign: 'right' } }, percent((row.value || 0) / total)),
          ),
        ),
      );
    }

    function PriceTable(props) {
      const { pricing, peakNow, t } = props;
      const head = [t('price.model'), t('price.period'), t('price.hit'), t('price.miss'), t('price.out')];
      const rows = [];
      for (const model of pricing) {
        for (const offset of [0, 1]) {
          const isPeak = offset === 1;
          const current = isPeak === peakNow;
          rows.push(
            h(
              'tr',
              { key: `${model.id}-${offset}`, style: { background: current ? C.layer2 : 'transparent' } },
              h('td', { style: { padding: '4px 8px', color: C.text } }, offset === 0 ? model.label : ''),
              h(
                'td',
                { style: { padding: '4px 8px', color: C.text2, fontWeight: current ? 600 : 400 } },
                isPeak ? t('status.peak') : t('status.valley'),
              ),
              h('td', { style: { padding: '4px 8px', textAlign: 'right', color: C.text } }, model.hit[offset]),
              h('td', { style: { padding: '4px 8px', textAlign: 'right', color: C.text } }, model.miss[offset]),
              h('td', { style: { padding: '4px 8px', textAlign: 'right', color: C.text } }, model.out[offset]),
            ),
          );
        }
      }
      return h(
        'div',
        { style: { overflowX: 'auto', margin: '0 -2px' } },
        h(
          'table',
          { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 } },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              head.map((label, index) =>
                h(
                  'th',
                  {
                    key: label,
                    style: {
                      padding: '3px 8px',
                      textAlign: index >= 2 ? 'right' : 'left',
                      fontWeight: 500,
                      color: C.text3,
                      whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${C.border}`,
                    },
                  },
                  label,
                ),
              ),
            ),
          ),
          h('tbody', null, rows),
        ),
      );
    }

    const cellHead = (align) => ({
      padding: '3px 8px',
      textAlign: align,
      fontWeight: 500,
      color: C.text3,
      borderBottom: `1px solid ${C.border}`,
      whiteSpace: 'nowrap',
      position: 'sticky',
      top: 0,
      background: C.layer1,
      zIndex: 1,
    });

    const cellBody = {
      padding: '4px 8px',
      color: C.text2,
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    };

    function ProjectTable(props) {
      const { projects, t, onSelect } = props;
      if (!projects || !projects.length) {
        return h('span', { style: { fontSize: 11.5, color: C.text3 } }, t('projects.empty'));
      }
      const head = [t('projects.name'), t('projects.calls'), t('projects.tokens'), t('projects.cost'), t('projects.share')];
      return h(
        'div',
        { style: { maxHeight: 214, overflow: 'auto', margin: '0 -2px' } },
        h(
          'table',
          { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 } },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              head.map((label, index) =>
                h('th', { key: label, style: cellHead(index === 0 ? 'left' : 'right') }, label),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            projects.map((project) =>
              h(
                'tr',
                { key: project.key, title: project.path || project.name },
                h(
                  'td',
                  {
                    style: {
                      ...cellBody,
                      color: C.text,
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  },
                  h('button', { type: 'button', onClick: () => onSelect(project.key), title: project.path, style: { border: 0, background: 'transparent', padding: 0, color: C.cache, cursor: 'pointer', font: 'inherit', textAlign: 'left' } }, project.name),
                ),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, project.calls),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, tokens(project.tokens, t)),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, yuan(project.cost)),
                h('td', { style: { ...cellBody, textAlign: 'right', color: C.text3 } }, percent(project.share, 0), h('div', { style: { height: 3, minWidth: 38, background: C.layer2, borderRadius: 2 } }, h('div', { style: { height: '100%', width: `${Math.max(0, Math.min(100, (project.share || 0) * 100))}%`, background: C.cache, borderRadius: 2 } }))),
              ),
            ),
          ),
        ),
      );
    }

    function ModelTable(props) {
      const { models, t } = props;
      const rows = (models || []).filter((model) => model.calls > 0);
      if (!rows.length) {
        return h('span', { style: { fontSize: 11.5, color: C.text3 } }, t('models.empty'));
      }
      const head = [t('price.model'), t('projects.calls'), t('projects.tokens'), t('projects.cost')];
      return h(
        'div',
        { style: { overflowX: 'auto', margin: '0 -2px' } },
        h(
          'table',
          { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 } },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              head.map((label, index) =>
                h('th', { key: label, style: cellHead(index === 0 ? 'left' : 'right') }, label),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((model) =>
              h(
                'tr',
                { key: model.id, title: model.id === 'other' ? t('models.otherHint') : undefined },
                h(
                  'td',
                  { style: { ...cellBody, color: model.id === 'other' ? C.text2 : C.text } },
                  model.id === 'other' ? t('models.other') : model.label,
                ),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, model.calls),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, tokens(model.tokens, t)),
                h('td', { style: { ...cellBody, textAlign: 'right' } }, model.id === 'other' ? `≈ ${yuan(model.cost)}` : yuan(model.cost)),
              ),
            ),
          ),
        ),
      );
    }

    function AlertSettings({ prefs, t }) {
      const [draft, setDraft] = useState(prefs);
      const [message, setMessage] = useState('');
      useEffect(() => { setDraft(prefs); }, [prefs.warnDays, prefs.lowDays, prefs.dailyBudget]);
      const rules = t('alerts.rules').replace('{warn}', prefs.warnDays).replace('{low}', prefs.lowDays);
      return h(Card, null, h(CardTitle, { title: t('alerts.title') }),
        h('form', { onSubmit: (event) => { event.preventDefault(); setMessage(savePrefs(draft) ? (storageFailed ? 'alerts.savedMemory' : 'alerts.saved') : 'alerts.invalid'); }, style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' } },
          ['warnDays', 'lowDays', 'dailyBudget'].map((key) => h('label', { key, style: { fontSize: 11, color: C.text2, display: 'flex', flexDirection: 'column', gap: 3 } },
            t(key === 'warnDays' ? 'alerts.warn' : key === 'lowDays' ? 'alerts.low' : 'alerts.budget'),
            h('input', { type: 'number', min: 0, step: 'any', required: key !== 'dailyBudget', value: draft[key] ?? '', onChange: (event) => { setDraft({ ...draft, [key]: event.target.value }); setMessage(''); }, style: { width: key === 'dailyBudget' ? 155 : 85, padding: 5, borderRadius: 5, border: `1px solid ${C.border}`, color: C.text, background: C.layer2 } }))),
          h('button', { type: 'submit', style: { color: C.text, background: C.layer2, border: `1px solid ${C.border}`, padding: 5, borderRadius: 5, cursor: 'pointer' } }, t('alerts.save'))),
        h('span', { style: { color: C.text3, fontSize: 11 } }, rules),
        message ? h('span', { role: 'status', style: { color: message === 'alerts.invalid' ? C.error : C.valley, fontSize: 11 } }, t(message)) : null);
    }

    function PricingSettings(props) {
      const { pricing, t } = props;
      const pricingKey = encodePricing(pricing);
      const [draft, setDraft] = useState(() => clonePricing(pricing));
      const [message, setMessage] = useState('');
      useEffect(() => { setDraft(clonePricing(pricing)); }, [pricingKey]);
      const fields = [['hit', 'pricing.cache'], ['miss', 'pricing.input'], ['out', 'pricing.output']];
      const buttonStyle = { color: C.text, background: C.layer2, border: `1px solid ${C.border}`, padding: '5px 12px', borderRadius: 5, cursor: 'pointer' };
      const priceInput = (model, modelIndex, field, offset) => h('input', {
        key: offset,
        type: 'number',
        min: 0,
        step: 'any',
        inputMode: 'decimal',
        'aria-label': `${model.label} ${fields.find(([name]) => name === field)[1]} ${offset ? t('pricing.peak') : t('pricing.valley')}`,
        value: model[field][offset],
        onChange: (event) => {
          const raw = event.target.value;
          setDraft((previous) => previous.map((entry, index) => (index === modelIndex ? { ...entry, [field]: entry[field].map((value, i) => (i === offset ? raw : value)) } : entry)));
          setMessage('');
        },
        style: { width: '100%', minWidth: 0, padding: '4px 5px', borderRadius: 5, border: `1px solid ${C.border}`, color: C.text, background: C.layer2, fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box' },
      });
      const fieldGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(146px, 1fr))', gap: 8 };
      const fieldRow = (model, modelIndex, field, key) => h(
        'label',
        { key: field, style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } },
        h('span', { style: { fontSize: 10.5, color: C.text3 } }, `${t(key)} · ${t('pricing.valley')}/${t('pricing.peak')}`),
        h(
          'span',
          { style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } },
          priceInput(model, modelIndex, field, 0),
          h('span', { key: 'sep', style: { color: C.text3, fontSize: 10, flex: 'none' } }, '/'),
          priceInput(model, modelIndex, field, 1),
        ),
      );
      const rows = draft.map((model, modelIndex) => h(
        'div',
        {
          key: model.id,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            paddingBottom: 8,
            borderBottom: modelIndex === draft.length - 1 ? 'none' : `1px solid ${C.border}`,
          },
        },
        h('span', { key: 'label', style: { fontSize: 11.5, color: C.text, fontWeight: 600 } }, model.label),
        h('div', { key: 'fields', style: fieldGrid }, fields.map(([field, key]) => fieldRow(model, modelIndex, field, key))),
      ));
      return h(Card, null,
        h(CardTitle, { title: t('pricing.title'), hint: t('pricing.hint') }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, rows),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('button', {
            type: 'button',
            onClick: () => {
              if (savePricing(draft)) {
                setDraft(clonePricing(readPricing()));
                setMessage(pricingStorageFailed ? 'pricing.savedMemory' : 'pricing.saved');
              } else {
                setMessage('pricing.invalid');
              }
            },
            style: buttonStyle,
          }, t('pricing.save')),
          h('button', {
            type: 'button',
            onClick: () => {
              savePricing(clonePricing(DEFAULT_PRICING));
              setDraft(clonePricing(DEFAULT_PRICING));
              setMessage('pricing.resetDone');
            },
            style: buttonStyle,
          }, t('pricing.reset')),
          message ? h('span', { role: 'status', style: { fontSize: 11, color: message === 'pricing.invalid' ? C.error : C.valley } }, t(message)) : null),
      );
    }

    /* -------------------------------- settings ------------------------------- */

    function Dashboard(props) {
      const t = props.t;
      const [days, setDays] = useState(props.days || 14);
      const [project, setProject] = useState('');
      const pricing = usePricing();
      const pricingKey = pricingParam(pricing);
      const feed = useFeed(days, project, pricing);
      const data = feed.data;
      const windowDays = (data && data.windowDays) || days;
      const peakNow = data ? data.now.peak : false;
      const wallet = data && data.wallet ? data.wallet : null;
      const prefs = usePreferences();
      const alert = alertState(data, prefs);
      const walletAlert = alert.active;
      const walletTone = alert.tone;
      const runwayLabel = alert.walletLevel === 'low' || alert.walletLevel === 'warn' ? t('wallet.alert') : t('wallet.runway');
      const remain = data ? Math.max(0, data.now.nextAt - Date.now()) : 0;
      const switchText =
        data && remain > 30_000
          ? `${countdown(remain, t)} ${t(data.now.nextStatus === 'peak' ? 'widget.toPeak' : 'widget.toValley')}`
          : t('widget.soon');

      const body = [];

      if (feed.loading && !data) {
        body.push(h('div', { key: 'loading', style: { color: C.text2, fontSize: 13 } }, t('page.loading')));
      } else if (feed.error && !data) {
        body.push(
          h(
            Card,
            { key: 'error', style: { gap: 8 } },
            h(
              'span',
              { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12.5 } },
              `${t('page.error')}: ${feed.error}`,
            ),
            h(
              'button',
              {
                onClick: () => feed.reload(true),
                style: {
                  alignSelf: 'flex-start',
                  padding: '5px 13px',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.layer2,
                  color: C.text,
                  cursor: 'pointer',
                  fontSize: 12,
                },
              },
              t('page.retry'),
            ),
          ),
        );
      } else if (data) {
        const today = data.today || {};

        body.push(
          h(
            'div',
            { key: 'pills', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            h(
              Pill,
              {
                style: { background: peakNow ? tint(C.peak) : tint(C.valley), borderColor: 'transparent' },
                title: statusTip(data, t) || undefined,
              },
              h(Dot, { tone: peakNow ? C.peak : C.valley, glow: true }),
              h(
                'span',
                { style: { color: peakNow ? C.peak : C.valley, fontWeight: 600 } },
                statusLabel(data, t),
              ),
              h(Sep),
              h('span', { style: { color: C.text } }, yuan(today.cost)),
              h(Sep),
              h('span', { style: { color: C.text3 } }, `${t('status.switchIn')} ${switchText}`),
            ),
            statusTip(data, t)
              ? h('span', { style: { color: C.text3, fontSize: 11 } }, statusTip(data, t))
              : null,
            h(
              Pill,
              {
                style: walletAlert ? { borderColor: walletTone, background: tint(walletTone) } : null,
                title:
                  wallet && wallet.avgPerDay
                    ? `${t('wallet.avg')} ${yuan(wallet.avgPerDay)} · ${t('kpi.runwayHint')}`
                    : undefined,
              },
              `${t('kpi.balance')} `,
              h(
                'span',
                { style: { color: C.text } },
                data.ledger && typeof data.ledger.balance === 'number' ? yuan(data.ledger.balance) : '—',
              ),
              wallet && wallet.runwayDays !== null
                ? h(
                    'span',
                    { style: { color: walletTone, fontWeight: 600 } },
                    ` · ${runwayLabel} ${runway(wallet.runwayDays, t)}${alert.budgetExceeded ? ` · ${t('alerts.exceeded')}` : ''}`,
                  )
                : null,
            ),
            h(Pill, null, `${today.calls || 0} ${t('unit.calls')} · ${tokens(today.tokens, t)} tokens`),
          ),
        );

        if (data.warnings && data.warnings.length) {
          body.push(
            h(
              Card,
              { key: 'warnings', style: { borderColor: C.peak, gap: 4 } },
              data.warnings.map((warning, index) =>
                h(
                  'span',
                  {
                    key: index,
                    style: { fontSize: 11.5, color: C.text2, overflowWrap: 'anywhere' },
                    title:
                      warning && warning.code === 'unknown-model' ? (warning.models || []).join(', ') : undefined,
                  },
                  typeof warning === 'string'
                    ? warning
                    : warning.code === 'unknown-model'
                      ? `${t('warn.unknownModel')}: ${summarizeNames(warning.models, t)}`
                      : warning.code === 'pricing-invalid'
                        ? t('warn.pricingInvalid')
                        : warning.code === 'calendar-missing'
                        ? `${t('warn.calendarMissing')} ${(warning.years || []).join(' / ')}`
                        : String(warning.code || warning),
                ),
              ),
            ),
          );
        }

        body.push(
          h(
            'div',
            { key: 'kpi', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 } },
            h(Kpi, {
              label: t('kpi.runway'),
              value: wallet && wallet.runwayDays !== null ? runway(wallet.runwayDays, t) : '—',
              tone: walletAlert ? walletTone : C.text,
              hint:
                wallet && wallet.balance !== null
                  ? `${t('kpi.balance')} ${yuan(wallet.balance)} · ${t('wallet.avg')} ${yuan(wallet.avgPerDay)}${alert.budgetExceeded ? ` · ${t('alerts.exceeded')}` : ''}`
                  : t('kpi.runwayHint'),
            }),
            h(Kpi, {
              label: t('kpi.calls'),
              value: today.calls || 0,
              hint: `${t('kpi.perCall')} ${tokens(today.avgTokens, t)}`,
            }),
            h(Kpi, {
              label: t('kpi.tokens'),
              value: tokens(today.tokens, t),
              hint: `${t('kpi.cache')} ${tokens(today.cacheTokens, t)} · ${t('kpi.out')} ${tokens(today.outputTokens, t)}`,
            }),
            h(Kpi, { label: t('kpi.hit'), value: percent(today.hitRate), hint: t('kpi.hitHint') }),
            h(Kpi, {
              label: t('kpi.peakShare'),
              value: percent(today.peakShare, 0),
              tone: (today.peakShare || 0) > 0.5 ? C.peak : C.valley,
              hint: `${t('kpi.peakCost')} ${yuan(today.peakCost)} · ${t('kpi.valleyCost')} ${yuan(today.valleyCost)}`,
            }),
            h(Kpi, {
              label: t('kpi.saving'),
              value: yuan(today.savingIfValley),
              tone: C.valley,
              hint: `${t('kpi.windowSaving')} ${yuan(data.week.savingIfValley)}`,
            }),
          ),
        );

        body.push(
          h(
            'div',
            { key: 'charts', style: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' } },
            h(
              Card,
              { style: { flex: '1.5 1 340px', minWidth: 0 } },
              h(CardTitle, { title: t('chart.hours'), hint: t('chart.hoursHint') }),
              h(HourChart, { hours: data.hours, nowHour: data.now.hour, t }),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: C.text3 } },
                ['00', '06', '12', '18', '23'].map((label) => h('span', { key: label }, label)),
              ),
            ),
            h(
              Card,
              { style: { flex: '1 1 220px', minWidth: 0 } },
              h(CardTitle, { title: t('cost.title') }),
              h(CostSplit, {
                t,
                cost: today.cost || 0,
                costCache: today.costCache || 0,
                costMiss: today.costMiss || 0,
                costOut: today.costOut || 0,
              }),
            ),
          ),
        );

        body.push(
          h(
            Card,
            { key: 'days' },
            h(CardTitle, {
              title: t('chart.days'),
              hint: `${t(`range.${windowDays}`)} · ${t('kpi.perDay')} ${yuan(data.week.avgPerDay)} · ${t('kpi.perCall')} ${tokens(data.week.avgTokensPerCall, t)}`,
            }),
            h(DayChart, { days: data.days, t }),
            h('span', { style: { fontSize: 9.5, color: C.text3 } }, t('chart.daysHint')),
          ),
        );

        body.push(
          h(
            'div',
            { key: 'breakdown', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 10 } },
            h(
              Card,
              null,
              h(CardTitle, {
                title: t('projects.title'),
                hint: t('projects.hint'),
                action: h(
                  'a',
                  {
                    href: `${feedUrl(EXPORT_URL, windowDays, project, false, pricingKey)}&scope=projects`,
                    download: '',
                    title: t('export.projectsTitle'),
                    style: { color: C.cache, textDecoration: 'none', fontWeight: 500 },
                  },
                  t('export.projects'),
                ),
              }),
              h(ProjectTable, { projects: data.projects, t, onSelect: setProject }),
            ),
            h(
              Card,
              null,
              h(CardTitle, { title: t('models.title'), hint: t('models.hint') }),
              h(ModelTable, { models: data.models, t }),
            ),
          ),
        );

        body.push(
          h(
            Card,
            { key: 'price' },
            h(CardTitle, { title: t('price.title'), hint: `${t('price.hint')}${data.pricingCustom ? ` · ${t('price.custom')}` : ''}` }),
            h(PriceTable, { pricing: data.pricing, peakNow, t }),
          ),
        );

        body.push(h(PricingSettings, { key: 'pricing-settings', pricing, t }));
      }

      return h(
        'div',
        {
          style: {
            padding: '20px 24px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            color: C.text,
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
          },
        },
        h(
          'header',
          { style: { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' } },
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 1, flex: 1 } },
            h('h2', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, t('page.title')),
            h('span', { style: { fontSize: 11.5, color: C.text2 } }, t('page.subtitle')),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 2, padding: 2, borderRadius: 9, background: C.layer2, border: `1px solid ${C.border}` } },
            [7, 14, 30].map((value) =>
              h(
                'button',
                {
                  key: value,
                  onClick: () => setDays(value),
                  style: {
                    padding: '3px 10px',
                    borderRadius: 7,
                    border: 'none',
                    background: windowDays === value ? C.layer1 : 'transparent',
                    color: windowDays === value ? C.text : C.text3,
                    cursor: 'pointer',
                    fontSize: 11,
                  },
                },
                t(`range.${value}`),
              ),
            ),
          ),
          h(
            'span',
            { style: { fontSize: 10.5, color: C.text3 } },
            data ? `${t('page.updated')} ${clock(data.generatedAt)}` : '',
          ),
          h(
            'button',
            {
              onClick: () => feed.reload(true),
              style: {
                padding: '4px 12px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.layer1,
                color: C.text,
                cursor: 'pointer',
                fontSize: 11.5,
              },
            },
            t('page.refresh'),
          ),
          h(
            'a',
            {
              href: feedUrl(EXPORT_URL, windowDays, project, false, pricingKey),
              download: '',
              title: t('export.daysTitle'),
              style: {
                padding: '4px 12px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.layer1,
                color: C.text,
                textDecoration: 'none',
                fontSize: 11.5,
              },
            },
            t('export.csv'),
          ),
        ),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } },
          h('label', { style: { minWidth: 0, maxWidth: '100%' } }, t('projects.select'), ' ', h('select', { value: project, onChange: (event) => setProject(event.target.value), style: { color: C.text, background: C.layer1, border: `1px solid ${C.border}`, padding: 5, borderRadius: 6, maxWidth: '100%', minWidth: 0 } },
            h('option', { value: '' }, t('projects.all')),
            project && !(data && data.projectOptions || []).some((entry) => entry.key === project) ? h('option', { value: project }, project) : null,
            ((data && data.projectOptions) || []).map((entry) => h('option', { key: entry.key, value: entry.key }, entry.name)))) ,
          project ? h(Pill, { title: data && data.selectedProject ? data.selectedProject.path : project }, data && data.selectedProject ? data.selectedProject.name : project,
            h('button', { type: 'button', onClick: () => setProject(''), 'aria-label': t('projects.clear'), style: { border: 0, background: 'transparent', color: C.text, cursor: 'pointer' } }, '×')) : null),
        h(AlertSettings, { prefs, t }),
        feed.error && data ? h('div', { role: 'status', style: { color: C.peak, fontSize: 12 } }, t('page.error'), ': ', feed.error, ' ', h('button', { type: 'button', onClick: () => feed.reload(true) }, t('page.retry'))) : null,
        alert.budgetExceeded ? h(Pill, { style: { color: alert.tone, borderColor: alert.tone } }, t('alerts.exceeded'), ' · ', t('alerts.global'), ' ', yuan(data && data.globalTodayCost)) : null,
        body,
        h(
          'footer',
          {
            style: {
              marginTop: 2,
              paddingTop: 10,
              borderTop: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: 10.5,
              color: C.text3,
            },
          },
          h(
            'span',
            null,
            data && data.calendar && data.calendar.years && data.calendar.years.length
              ? `${t('footer.calendar')} ${data.calendar.years.join(' / ')}`
              : '',
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h(
              'a',
              {
                href: (data && data.repo) || 'https://github.com/hseons/dsh-usage-peak',
                target: '_blank',
                rel: 'noopener noreferrer',
                title: 'https://github.com/hseons/dsh-usage-peak',
                style: {
                  color: C.text2,
                  textDecoration: 'none',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                },
              },
              '⭐',
              'github.com/hseons/dsh-usage-peak',
              h('span', { style: { color: C.peak, fontWeight: 600 } }, `· ${t('footer.star')}`),
            ),
            data && data.version
              ? h(
                  'span',
                  {
                    style: {
                      padding: '1px 6px',
                      borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.layer2,
                      color: C.text2,
                      fontVariantNumeric: 'tabular-nums',
                    },
                  },
                  `v${data.version}`,
                )
              : null,
          ),
        ),
      );
    }

    /* --------------------------------- apply --------------------------------- */

    function makeT(ctx) {
      const { locale } = ctx;
      if (!locale || typeof locale.bind !== 'function') {
        return (key, fallback) => dicts.zh[key] || fallback || key;
      }
      const bound = locale.bind(NS);
      return (key, fallback) => {
        const value = bound(key);
        return value === key && fallback ? fallback : value;
      };
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale && ctx.locale.register(NS, dicts), 'dsh-usage-peak: dictionaries');
        const t = makeT(ctx);

        const openPanel = () => {
          try {
            ctx.layout && typeof ctx.layout.selectPanel === 'function' && ctx.layout.selectPanel('usage');
          } catch (err) {
            console.warn('[dsh-usage-peak] open panel failed', err);
          }
        };

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'usage', order: -10, label: () => '' },
            (props) => h(PanelGlyph, { ...props, t, rail: (props.size || 0) >= 18, onOpen: openPanel }),
          ),
        );

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'usage' }, () => h(Dashboard, { t })),
        );

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'dsh-usage-peak', order: 47, label: () => t('settings.title') },
            () => h(Dashboard, { t }),
          ),
        );
      },
    };
  },
});
