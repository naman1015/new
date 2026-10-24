const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // UTC+05:30

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Extract calendar & clock components in Asia/Kolkata regardless of host OS timezone.
 */
function getISTParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = {};
  for (const part of formatter.formatToParts(d)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Intl hour12:false can occasionally format midnight as "24"
  const rawHour = Number(parts.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const dayOfWeek = WEEKDAY_MAP[parts.weekday] ?? new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const timeStr = `${pad(hour)}:${pad(minute)}`;
  const timeStrWithSeconds = `${pad(hour)}:${pad(minute)}:${pad(second)}`;

  return {
    year,
    month,
    day,
    dayOfWeek,
    hour,
    minute,
    second,
    dateStr,
    timeStr,
    timeStrWithSeconds,
  };
}

/**
 * Construct a UTC Date object corresponding to the given wall-clock time in Asia/Kolkata.
 */
function createISTDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms) - IST_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Return a Date for "HH:MM" on the Asia/Kolkata day of `baseDate`.
 */
function getISTDateForClockTime(clockTimeStr, baseDate = new Date()) {
  const [h, m] = String(clockTimeStr).split(':').map(Number);
  const { year, month, day } = getISTParts(baseDate);
  return createISTDate(
    year,
    month,
    day,
    Number.isNaN(h) ? 0 : h,
    Number.isNaN(m) ? 0 : m,
    0,
    0
  );
}

/**
 * Return start-of-day and end-of-day Date objects in Asia/Kolkata for a YYYY-MM-DD string or Date.
 */
function getISTDayBounds(dateInput = new Date()) {
  let year, month, day;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    [year, month, day] = dateInput.trim().split('-').map(Number);
  } else {
    ({ year, month, day } = getISTParts(dateInput));
  }
  const startOfDay = createISTDate(year, month, day, 0, 0, 0, 0);
  const endOfDay = createISTDate(year, month, day, 23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

/**
 * Format a Date as an Asia/Kolkata time string.
 */
function formatISTTime(date = new Date(), includeSeconds = true) {
  const { timeStr, timeStrWithSeconds } = getISTParts(date);
  return includeSeconds ? timeStrWithSeconds : timeStr;
}

module.exports = {
  IST_TIMEZONE,
  getISTParts,
  createISTDate,
  getISTDateForClockTime,
  getISTDayBounds,
  formatISTTime,
};
