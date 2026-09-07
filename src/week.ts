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

/** Human label for a week key, e.g. "2026-W37" -> "Week 37, 2026". */
export function weekLabel(weekKey: string): string {
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekKey;
  return `Week ${Number(m[2])}, ${m[1]}`;
}
