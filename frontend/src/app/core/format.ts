/** Formatting for Malaysia: RM with two decimals, readable dates, Asia/Kuala_Lumpur "today". */
const KL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

/** Today's date in Kuala Lumpur as YYYY-MM-DD. */
export function todayKL(): string {
  return KL_DAY.format(new Date());
}

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from today (KL) to `date`; negative when it has passed. */
export function daysFrom(date: string | null): number | null {
  return date ? Math.round(utcDay(date) - utcDay(todayKL())) : null;
}

/** "1 November 2026" by default. */
export function formatDate(date: string | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-MY', { ...options, timeZone: 'UTC' });
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** RM 1,250.00 */
export function rm(sen: number | null | undefined): string {
  const v = Math.round(Number(sen) || 0);
  return (v < 0 ? '−' : '') + 'RM ' + (Math.abs(v) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse what someone typed ("1,250.50", "RM 80") into sen. Empty is 0; anything invalid or negative is null. */
export function toSen(input: string | number | null | undefined): number | null {
  const s = String(input ?? '').replace(/[,\sRMrm]/g, '');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function senToInput(sen: number | null | undefined): string {
  return sen ? (sen / 100).toFixed(2) : '';
}

export interface DueLabel { text: string; tone: '' | 'warn' | 'bad'; }

export function dueLabel(date: string | null): DueLabel | null {
  const n = daysFrom(date);
  if (n === null) return null;
  if (n < 0) return { text: `Overdue ${-n}d`, tone: 'bad' };
  if (n === 0) return { text: 'Due today', tone: 'warn' };
  if (n <= 7) return { text: `Due in ${n}d`, tone: 'warn' };
  return { text: formatDate(date, { day: 'numeric', month: 'short' }), tone: '' };
}

export interface Countdown { value: string; unit: string; word: boolean; }

/** Nothing until a date exists; a gentle past state once it has gone by (spec test case 8). */
export function countdown(date: string | null): Countdown | null {
  const n = daysFrom(date);
  if (n === null) return null;
  if (n > 1) return { value: String(n), unit: 'days to go', word: false };
  if (n === 1) return { value: 'Tomorrow', unit: 'Almost there', word: true };
  if (n === 0) return { value: 'Today', unit: "Today's the day", word: true };
  return { value: 'Alhamdulillah', unit: `${-n} day${n === -1 ? '' : 's'} ago`, word: true };
}

export function fileSize(bytes: number): string {
  return bytes > 1_048_576 ? (bytes / 1_048_576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
