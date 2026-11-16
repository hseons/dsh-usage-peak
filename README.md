# 用量峰谷仪表盘（DSH Usage Dashboard）

给 DeepSeek Harness 用的用量/花费仪表盘：一眼看清现在是不是**峰时**、今天花了多少钱、烧了多少 tokens、钱花在哪个项目，以及余额还能撑几天。

全部在本地读取 DSH 自己的会话日志，不联网、不上报。

## 效果

侧栏常驻一行：峰/谷、今日花费、tokens、距离下次切价的时间，一眼看完。

![侧栏胶囊：谷时 ¥17.10 · 170.3M tok · 13:56 后转峰](assets/sidebar-pill.webp)

## 功能

- **侧栏常驻胶囊**：`● 峰  ¥14.70 · 12.8M tok · 2:43 后转谷`，点一下打开完整面板。侧栏折叠时收成一个小圆点。可撑天数不足 7 天时胶囊转琥珀色，不足 3 天转红色。
- **峰谷状态**：当前时段、距离下次切换的倒计时、当前时段单价（缓存命中 / 全价输入 / 输出）。
- **今日概况**：花费、请求数、tokens、缓存命中率、峰时花费占比、**谷时更省**（把这些峰时用量挪到谷时能省下的钱）、余额、**余额可撑天数**（余额 ÷ 近 7 天日均花费）。
- **今日 24 小时分布**：每小时花费柱状，峰时与谷时用不同颜色，当前小时高亮。
- **花费构成**：缓存命中 / 全价输入 / 输出 三段占比，直接看出钱花在哪。
- **近 7 / 14 / 30 天趋势**：右上角切换窗口，按天堆叠柱状，缺数据的日期补零，列数恒定；可对照峰时占比判断"贵在哪天"。
- **按项目**：按会话头里的工作目录（`cwd`）聚合，倒序列出每个项目的请求数、tokens、花费与占比，直接回答「哪个项目最烧钱」。
- **按模型**：Flash / Pro 各自的请求数、tokens、花费。
- **导出 CSV**：每日数据与项目数据都能导出（UTF-8 BOM，Excel 直接打开不乱码；单元格做了公式注入防护）。
- **价目表**：当前时段那一行高亮，方便解释账单。
- **节假日与调休**：按国务院办公厅公布的安排判断——法定节假日全天谷时，调休上班的周末按工作日峰谷计算；当前覆盖 2026–2027 年，缺失年份会在面板给出提示并回落到周一至周五规则。
- **页脚**：GitHub 仓库链接（可顺手点个 Star）、当前版本号与日历覆盖年份。

设置页里的入口是「用量仪表盘」，侧栏胶囊就是同一份数据的浓缩版。

## 价格模型

单位：元 / 百万 tokens，`[谷时, 峰时]`。

| 模型 | 缓存命中 | 全价输入 | 输出 |
| --- | --- | --- | --- |
| DeepSeek Flash | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| DeepSeek Pro | 0.15 / 0.30 | 4.5 / 9 | 13.5 / 27 |

峰时 = 工作日 09:00–12:00、14:00–18:00（北京时间）；其余时间、周末与法定节假日为谷时，单价减半。调休上班日（包括周末）按工作日的峰谷窗口计算。

节假日数据在 [`holidays.js`](holidays.js)，来源为国务院办公厅 [2026 年](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)、[2027 年](https://www.gov.cn/zhengce/zhengceku/202611/content_7085102.htm) 放假安排通知，并与 [holiday-cn](https://github.com/NateScarlet/holiday-cn) 交叉核对。新一年安排公布后，补一组日期并把年份加进 `CALENDAR_YEARS` 即可。

## 数据来源

- `~/.dsh/sessions/<项目 slug>/<会话 id>/session.v4.jsonl.zstd`：每条 `assistant/message` 的 `usage`（输入、缓存读取、输出）与模型，按请求发生的时刻判断峰谷；项目归属取会话头里的绝对 `cwd`，没有会话头时才回落到目录 slug。
- `~/.dsh/.dshw-usage.json`：鲸鱼记账本的余额与当日花费，用作交叉校验。

日志是**多帧 zstd**，Node 自带的 `zlib.zstdDecompressSync` 只解第一帧，所以插件内部按 zstd magic 切帧、逐帧解压再拼接（不需要 `zstd` 命令行）。

- 数据接口支持 `?days=7|14|30` 选择统计窗口（默认 14，白名单之外的取值回落到 14）；快照按窗口分别缓存 15 秒，面板上的「刷新」按钮会带 `?fresh=1` 强制重算。
- 导出接口为 `/plugin/dsh-usage-peak/export.csv?days=7|14|30&scope=days|projects`，带 `Content-Disposition: attachment` 与 UTF-8 BOM。

峰时单价恰为谷时 2 倍，所以「谷时更省」= 峰时花费 ÷ 2：它衡量的是这些峰时用量如果改在谷时发生能省多少，而不是已经省下的钱。

## 安装

```sh
dsh plugin add dsh-usage-peak
```

也可以在 DSH 插件市场搜索 `dsh-usage-peak` 安装。

装好后：

- 侧栏图标列表最上方出现用量胶囊；
- 设置 → **用量仪表盘** 打开完整面板。

## 兼容性

- DeepSeek Harness 0.2.1-rc.3（见 `package.json` 的 `dsh.compatibility.dshReleases`）。
- Node.js >= 22.15（需要 `zlib.zstdDecompressSync`）。
- 纯 JS，无构建步骤：`client.js` 直接用 `window.__ModuleLoader__` 注册，`require('react')` 由宿主提供。

## 已知限制

- 依赖 DSH 会话日志的**内部格式**（`session.v4.jsonl.zstd` 与 `assistant/message.data.usage`）。DSH 改格式时需要跟进；读不到数据时面板会显示为空态而不是报错。
- 只统计本机会话日志覆盖到的历史，鲸鱼记账本从 2026-11-02 才开始记账。
- 项目归属依赖会话头中的 `cwd`；极少数没有会话头的旧日志会回落到 workspace slug，slug 会转义部分字节，显示名可能不如真实路径精确。

## 许可

MIT

---

## English

A usage and cost dashboard for DeepSeek Harness. It reads the local session logs (`session.v4.jsonl.zstd`) and the whale ledger, then shows:

![Sidebar pill: valley ¥17.10 · 170.3M tok · switching to peak in 13:56](assets/sidebar-pill.webp)

- a persistent sidebar pill with peak/valley state, today's spend, tokens and the countdown to the next price switch; the pill turns amber when the balance runway is under 7 days and red under 3 days;
- China public holidays and makeup workdays: holidays are valley all day, makeup weekend workdays follow the weekday windows (2026–2027 calendars shipped; missing years fall back to Mon-Fri with a visible warning);
- a footer with the GitHub repository link, the running version and the covered calendar years;
- a details page (Settings → Usage dashboard) with KPIs (including balance runway), an hourly breakdown, cost composition, a 7/14/30-day trend switch, spend by project, a per-model table, CSV export and the price list;
- a "valley saving" KPI: since peak costs exactly 2x valley, moving the same peak usage to valley time would have saved half of the peak spend.

Pricing (`[valley, peak]`, CNY per million tokens): Flash cache-hit 0.02/0.04, miss 1/2, output 4/8; Pro cache-hit 0.15/0.30, miss 4.5/9, output 13.5/27. Peak hours are 09:00–12:00 and 14:00–18:00 Beijing time on weekdays; everything else is valley (half price).

Everything stays local — no network calls, no telemetry. Multi-frame zstd logs are decoded frame by frame with Node's built-in `zlib`, so no `zstd` binary is required.
