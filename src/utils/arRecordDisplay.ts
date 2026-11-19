const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function adjustDateByDays(
  date: { year: number; month: number; day: number },
  days: number,
) {
  while (days > 0) {
    date.day += 1;
    if (date.day > daysInMonth(date.year, date.month)) {
      date.day = 1;
      date.month += 1;
      if (date.month > 12) {
        date.month = 1;
        date.year += 1;
      }
    }
    days -= 1;
  }
  while (days < 0) {
    date.day -= 1;
    if (date.day < 1) {
      date.month -= 1;
      if (date.month < 1) {
        date.month = 12;
        date.year -= 1;
      }
      date.day = daysInMonth(date.year, date.month);
    }
    days += 1;
  }
  return date;
}

function getManilaYear(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(AM|PM)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i,
  );

  if (isoMatch) {
    const [
      ,
      yearText,
      monthText,
      dayText,
      hourText,
      minuteText,
      meridiem,
      zone,
    ] = isoMatch;
    const date = {
      year: Number(yearText),
      month: Number(monthText),
      day: Number(dayText),
    };
    if (
      date.month < 1 ||
      date.month > 12 ||
      date.day < 1 ||
      date.day > daysInMonth(date.year, date.month)
    ) {
      return undefined;
    }

    let hour = hourText === undefined ? 0 : Number(hourText);
    const minute = minuteText === undefined ? 0 : Number(minuteText);
    if (minute < 0 || minute > 59) {
      return undefined;
    }
    if (meridiem) {
      if (hour < 1 || hour > 12) return undefined;
      hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
    } else if (hour < 0 || hour > 23) {
      return undefined;
    }

    let offsetMinutes = 480;
    if (zone) {
      if (zone.toUpperCase() === "Z") {
        offsetMinutes = 0;
      } else {
        const offsetMatch = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
        if (!offsetMatch) return undefined;
        const offsetHour = Number(offsetMatch[2]);
        const offsetMinute = Number(offsetMatch[3]);
        if (offsetHour > 23 || offsetMinute > 59) return undefined;
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        offsetMinutes = sign * (offsetHour * 60 + offsetMinute);
      }
    }

    const manilaMinutes = hour * 60 + minute + 480 - offsetMinutes;
    adjustDateByDays(date, Math.floor(manilaMinutes / 1440));
    return date.year;
  }

  const namedDateMatch = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s*[·,]?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM))?/i,
  );
  if (namedDateMatch) {
    const month = MONTH_NAMES.findIndex(
      (name) =>
        name.toLowerCase() === namedDateMatch[1].toLowerCase() ||
        name.slice(0, 3).toLowerCase() === namedDateMatch[1].toLowerCase(),
    );
    const year = Number(namedDateMatch[3]);
    const day = Number(namedDateMatch[2]);
    if (
      month < 0 ||
      day < 1 ||
      day > daysInMonth(year, month + 1) ||
      (namedDateMatch[4] &&
        (Number(namedDateMatch[4]) < 1 || Number(namedDateMatch[4]) > 12)) ||
      (namedDateMatch[5] && Number(namedDateMatch[5]) > 59)
    ) {
      return undefined;
    }
    return year;
  }

  const numericDateMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM))?$/,
  );
  if (numericDateMatch) {
    const month = Number(numericDateMatch[1]);
    const day = Number(numericDateMatch[2]);
    const year = Number(numericDateMatch[3]);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > daysInMonth(year, month) ||
      (numericDateMatch[4] &&
        (Number(numericDateMatch[4]) < 1 || Number(numericDateMatch[4]) > 12)) ||
      (numericDateMatch[5] && Number(numericDateMatch[5]) > 59)
    ) {
      return undefined;
    }
    return year;
  }
  return undefined;
}

export function formatArPeriodRange(period: string, submittedAt?: string) {
  const match = period.trim().match(
    /^([A-Za-z]+)(?:\s+(\d{4}))?(?:\s+(I|II))?(?:\s+\([^)]*\))?$/i,
  );
  if (!match) return period;

  const monthIndex = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === match[1].toLowerCase(),
  );
  if (monthIndex < 0) return period;

  const year = match[2] ? Number(match[2]) : getManilaYear(submittedAt);
  if (!year) return period;

  const monthName = MONTH_NAMES[monthIndex];
  const half = match[3]?.toUpperCase();
  if (half === "I") return `${monthName} 1 – 15, ${year}`;
  if (half === "II") {
    return `${monthName} 16 – ${daysInMonth(year, monthIndex + 1)}, ${year}`;
  }
  return `${monthName} 1 – ${daysInMonth(year, monthIndex + 1)}, ${year}`;
}

export function formatArMonth(period: string, submittedAt?: string) {
  const text = period.trim();
  const monthFirst = text.match(
    /^([A-Za-z]+)(?:\s+(\d{4}))?(?:\s+(I|II))?(?:\s+\([^)]*\))?/i,
  );
  if (monthFirst) {
    const monthIndex = MONTH_NAMES.findIndex(
      (name) =>
        name.toLowerCase() === monthFirst[1].toLowerCase() ||
        name.slice(0, 3).toLowerCase() === monthFirst[1].toLowerCase(),
    );
    if (monthIndex >= 0) {
      const year = monthFirst[2]
        ? Number(monthFirst[2])
        : getManilaYear(submittedAt);
      if (year) return `${MONTH_NAMES[monthIndex]} ${year}`;
    }
  }

  const isoMonth = text.match(/^(\d{4})-(\d{1,2})(?:-|$)/);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const monthIndex = Number(isoMonth[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTH_NAMES[monthIndex]} ${year}`;
    }
  }

  const formatted = formatArPeriodRange(text, submittedAt);
  const formattedMatch = formatted.match(/^([A-Za-z]+)\s+\d{1,2}\s*[–-]\s*\d{1,2},\s*(\d{4})$/);
  if (formattedMatch) return `${formattedMatch[1]} ${formattedMatch[2]}`;

  const submittedYear = getManilaYear(submittedAt);
  if (submittedYear) {
    const isoMatch = submittedAt?.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
    if (isoMatch) {
      const monthIndex = Number(isoMatch[2]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${MONTH_NAMES[monthIndex]} ${submittedYear}`;
      }
    }
    const numericMatch = submittedAt?.match(/^(\d{1,2})\/\d{1,2}\/\d{4}/);
    if (numericMatch) {
      const monthIndex = Number(numericMatch[1]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${MONTH_NAMES[monthIndex]} ${submittedYear}`;
      }
    }
    const namedMatch = submittedAt?.match(/^([A-Za-z]{3,})\s+\d{1,2}/i);
    if (namedMatch) {
      const monthIndex = MONTH_NAMES.findIndex(
        (name) => name.toLowerCase().startsWith(namedMatch[1].toLowerCase()),
      );
      if (monthIndex >= 0) return `${MONTH_NAMES[monthIndex]} ${submittedYear}`;
    }
  }

  return text;
}

export function formatProgramSection(value: string | number | null | undefined) {
  const section = String(value ?? "").trim();
  return section || "—";
}

export function formatStoredTimeRange(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})$/,
  );
  if (!match) return trimmed;

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return trimmed;
  }

  const formatClock = (hour: number, minute: number) => {
    const displayHour = hour % 12 || 12;
    const meridiem = hour >= 12 ? "PM" : "AM";
    return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem}`;
  };
  return `${formatClock(startHour, startMinute)} – ${formatClock(endHour, endMinute)}`;
}

export function formatManilaTimestamp(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const millisecond = Number((match[7] ?? "").slice(0, 3).padEnd(3, "0"));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return value;
  }

  let sourceOffsetMinutes = 0;
  const zone = match[8];
  if (zone && zone.toUpperCase() !== "Z") {
    const offsetMatch = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (!offsetMatch) return value;
    const offsetHour = Number(offsetMatch[2]);
    const offsetMinute = Number(offsetMatch[3]);
    if (offsetHour > 23 || offsetMinute > 59) return value;
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    sourceOffsetMinutes = sign * (offsetHour * 60 + offsetMinute);
  }

  let utcMilliseconds = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  if (year >= 0 && year < 100) {
    const utcDate = new Date(utcMilliseconds);
    utcDate.setUTCFullYear(year);
    utcMilliseconds = utcDate.getTime();
  }
  const manilaDate = new Date(
    utcMilliseconds + (480 - sourceOffsetMinutes) * 60_000,
  );
  const displayHour = manilaDate.getUTCHours() % 12 || 12;
  const meridiem = manilaDate.getUTCHours() >= 12 ? "PM" : "AM";
  const displayTime = `${displayHour}:${String(manilaDate.getUTCMinutes()).padStart(2, "0")} ${meridiem}`;
  return `${SHORT_MONTH_NAMES[manilaDate.getUTCMonth()]} ${manilaDate.getUTCDate()}, ${manilaDate.getUTCFullYear()} · ${displayTime}`;
}

export type ScheduleDayTime = { day: string; time: string };

export function getScheduleDayTimes(
  days?: string | number,
  time?: string | number,
): ScheduleDayTime[] {
  const dayParts = String(days ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  const timeParts = String(time ?? "")
    .split("|")
    .map((part) => part.trim());

  return dayParts.map((day, index) => ({
    day,
    time:
      timeParts.length === 1
        ? timeParts[0]
        : timeParts[index] ?? "",
  }));
}
