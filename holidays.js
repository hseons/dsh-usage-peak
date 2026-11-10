/**
 * Mainland China public holidays and makeup workdays.
 *
 * Peak pricing only applies on working days; a public holiday is billed at the
 * valley tariff all day, while a makeup workday ("调休上班", including a
 * weekend) follows the normal weekday peak windows.
 *
 * Source: State Council notice
 * https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
 * Cross-checked against NateScarlet/holiday-cn (2026.json), which cites the
 * same notice.
 *
 * To support a new year, append its dates here and add the year to
 * CALENDAR_YEARS. Years without data fall back to the weekday rule and raise a
 * `calendar-missing` warning in the snapshot.
 */

/** Years covered by the data below. */
export const CALENDAR_YEARS = [2026];

/** Public holidays: date -> name. Billed at the valley tariff all day. */
export const OFF_DAYS = new Map([
  ['2026-01-01', '元旦'],
  ['2026-01-02', '元旦'],
  ['2026-01-03', '元旦'],
  ['2026-02-15', '春节'],
  ['2026-02-16', '春节'],
  ['2026-02-17', '春节'],
  ['2026-02-18', '春节'],
  ['2026-02-19', '春节'],
  ['2026-02-20', '春节'],
  ['2026-02-21', '春节'],
  ['2026-02-22', '春节'],
  ['2026-02-23', '春节'],
  ['2026-04-04', '清明节'],
  ['2026-04-05', '清明节'],
  ['2026-04-06', '清明节'],
  ['2026-05-01', '劳动节'],
  ['2026-05-02', '劳动节'],
  ['2026-05-03', '劳动节'],
  ['2026-05-04', '劳动节'],
  ['2026-05-05', '劳动节'],
  ['2026-06-19', '端午节'],
  ['2026-06-20', '端午节'],
  ['2026-06-21', '端午节'],
  ['2026-09-25', '中秋节'],
  ['2026-09-26', '中秋节'],
  ['2026-09-27', '中秋节'],
  ['2026-10-01', '国庆节'],
  ['2026-10-02', '国庆节'],
  ['2026-10-03', '国庆节'],
  ['2026-10-04', '国庆节'],
  ['2026-10-05', '国庆节'],
  ['2026-10-06', '国庆节'],
  ['2026-10-07', '国庆节'],
]);

/** Makeup workdays: date -> the holiday they belong to. */
export const WORKDAYS = new Map([
  ['2026-01-04', '元旦'],
  ['2026-02-14', '春节'],
  ['2026-02-28', '春节'],
  ['2026-05-09', '劳动节'],
  ['2026-09-20', '国庆节'],
  ['2026-10-10', '国庆节'],
]);

/** Calendar year of a `YYYY-MM-DD` day key, as a number. */
export function yearOf(dayKey) {
  return Number(String(dayKey).slice(0, 4));
}

export function hasCalendar(year) {
  return CALENDAR_YEARS.includes(Number(year));
}
