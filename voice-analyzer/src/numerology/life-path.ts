export interface BirthDate { year: number; month: number; day: number }

export type LifePath = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;

const MIN_YEAR = 1900;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A real calendar date (leap years included), from 1900 up to today; never in the future. */
export function isValidBirthDate(b: BirthDate, today: Date = new Date()): boolean {
  const { year, month, day } = b;
  if (![year, month, day].every(Number.isInteger)) return false;
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1) return false;
  if (day > daysInMonth(year, month)) return false;
  const t = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
  if (year !== t.y) return year < t.y;
  if (month !== t.m) return month < t.m;
  return day <= t.d;
}

const digitSum = (n: number): number => String(n).split('').reduce((a, c) => a + Number(c), 0);

/**
 * Life path number (Pythagorean method): add ALL the digits of YYYYMMDD, then keep replacing the
 * number by the sum of its digits until it is a single digit (1-9) or equals 11, 22 or 33.
 * The master numbers 11, 22 and 33 stop the reduction. Invalid dates give null.
 */
export function lifePathNumber(b: BirthDate, today: Date = new Date()): LifePath | null {
  if (!isValidBirthDate(b, today)) return null;
  const yyyymmdd = b.year * 10000 + b.month * 100 + b.day;
  let n = digitSum(yyyymmdd);
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = digitSum(n);
  return n as LifePath;
}

/** Parses the value of an `<input type="date">` ("YYYY-MM-DD"); empty or invalid gives null. */
export function parseBirthDate(value: string, today: Date = new Date()): BirthDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const b = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidBirthDate(b, today) ? b : null;
}
