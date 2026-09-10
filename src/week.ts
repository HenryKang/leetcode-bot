// ISO-week helpers, computed in a fixed timezone so week boundaries are stable
// regardless of where the Worker runs (UTC).

const TZ = "America/New_York";

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Extract the Y/M/D that a unix instant falls on, in ET. */
function etYMD(tsSeconds: number): { y: number; m: number; d: number } {
  // en-CA gives YYYY-MM-DD
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsSeconds * 1000));
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** Standard ISO-8601 week key ("YYYY-Www") for a calendar date. */
function isoWeekKey(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  // Move to the Thursday of this ISO week (ISO weeks are identified by their Thursday).
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** ISO week key (in ET) for a given unix timestamp. */
export function weekKeyForTs(tsSeconds: number): string {
  const { y, m, d } = etYMD(tsSeconds);
  return isoWeekKey(y, m, d);
}

/** ISO week key (in ET) for right now. */
export function currentWeekKey(): string {
  return weekKeyForTs(nowSeconds());
}

/**
 * The week that just ended, relative to now. The weekly-summary cron runs Monday
 * morning ET; 24h earlier is Sunday, which is inside the week that just closed.
 */
export function endedWeekKey(): string {
  return weekKeyForTs(nowSeconds() - 24 * 3600);
}

/** The ISO week immediately before the one containing `fromTs`. */
export function previousWeekKey(fromTs: number = nowSeconds()): string {
  const range = etDayRange(fromTs);
  return weekKeyForTs(range.startTs - 7 * 86400 + 3600);
}

/** ET weekday (0=Sun..6=Sat) and hour (0..23) for a given instant. */
export function etWeekdayHour(tsSeconds: number = nowSeconds()): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(tsSeconds * 1000));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: map[wd] ?? 0, hour: Number(hourStr) % 24 };
}

/** Offset (seconds) of America/New_York at a given instant. EDT=-4h, EST=-5h. */
function etOffsetSeconds(tsSeconds: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(tsSeconds * 1000));
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0"; // e.g. "GMT-05:00"
  const m = raw.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 3600 + Number(m[3] ?? "0") * 60);
}

export interface DayRange {
  startTs: number; // unix seconds, inclusive (00:00:00 ET)
  endTs: number; // unix seconds, exclusive (next 00:00:00 ET)
  label: string; // e.g. "Tuesday, September 8"
}

/** The ET calendar day containing `refTs`, as a [start, end) unix range + label. */
export function etDayRange(refTs: number): DayRange {
  const { y, m, d } = etYMD(refTs);
  const midnightUtc = Date.UTC(y, m - 1, d) / 1000;
  // Solve for start: ET-midnight-as-unix = midnightUtc - offset. Offset depends on
  // the instant, so estimate then refine once (handles DST edges).
  let start = midnightUtc - etOffsetSeconds(refTs);
  start = midnightUtc - etOffsetSeconds(start);
  // End = next ET midnight (recompute offset in case DST flips overnight).
  const nextMidnightUtc = midnightUtc + 86400;
  let end = nextMidnightUtc - etOffsetSeconds(start);
  end = nextMidnightUtc - etOffsetSeconds(end);
  return { startTs: start, endTs: end, label: formatDateET(start + 3600) };
}

/** The ET day that ended most recently before now (i.e. "yesterday" in ET). */
export function previousEtDayRange(fromTs: number = nowSeconds()): DayRange {
  const today = etDayRange(fromTs);
  return etDayRange(today.startTs - 3600); // an hour before today's midnight = yesterday
}

/** Format a unix ts as a date in ET, e.g. "Sunday, September 7". */
export function formatDateET(tsSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(tsSeconds * 1000));
}

/** Date label of the upcoming Monday (the weekly reset) in ET, e.g. "Monday, September 8". */
export function nextResetDateLabel(fromTs: number = nowSeconds()): string {
  for (let i = 1; i <= 7; i++) {
    const ts = fromTs + i * 86400;
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(
      new Date(ts * 1000)
    );
    if (wd === "Mon") return formatDateET(ts);
  }
  return "Monday";
}

/** Human label for a week key, e.g. "2026-W37" -> "Week 37, 2026". */
export function weekLabel(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekKey;
  return `Week ${Number(m[2])}, ${m[1]}`;
}
