/** UTC date helpers. All dates are 'YYYY-MM-DD' strings; months are 'YYYY-MM'. */

export function parseDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (formatDate(d) !== s) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonthsToMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function addMonthsToDate(s: string, n: number): string {
  const d = parseDate(s);
  const day = d.getUTCDate();
  const target = addMonthsToMonth(monthOf(s), n);
  return `${target}-${String(Math.min(day, daysInMonth(target))).padStart(2, "0")}`;
}

/** Whole calendar months from a to b (b later). Floors partial months; never negative. */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  let n = (yb - ya) * 12 + (mb - ma);
  if (db < da) n -= 1;
  return Math.max(0, n);
}

export function todayUtc(now: Date = new Date()): string {
  return formatDate(now);
}
