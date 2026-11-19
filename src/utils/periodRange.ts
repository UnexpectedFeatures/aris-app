const MONTHS = [
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

const SHORT_MONTHS = [
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

export type PeriodRange = {
  start: string;
  end: string;
  label: string;
};

export function getPeriodRange(
  periodLabel: string,
  fallbackYear?: number,
): PeriodRange | null {
  const match = periodLabel.trim().match(/^([A-Za-z]+)(?:\s+(\d{4}))?\s+(I|II)$/i);
  if (!match) return null;

  const monthIndex = MONTHS.findIndex(
    (month) => month.toLowerCase() === match[1].toLowerCase(),
  );
  const year = match[2] ? Number(match[2]) : fallbackYear;
  if (monthIndex < 0 || !year || !Number.isInteger(year) || year < 1) {
    return null;
  }

  const half = match[3].toUpperCase();
  const startDay = half === "I" ? 1 : 16;
  const endDay =
    half === "I" ? 15 : new Date(year, monthIndex + 1, 0).getDate();
  const month = String(monthIndex + 1).padStart(2, "0");
  const formatDate = (day: number) =>
    `${year}-${month}-${String(day).padStart(2, "0")}`;
  const formatLabelDate = (day: number) =>
    `${SHORT_MONTHS[monthIndex]} ${day}, ${year}`;

  return {
    start: formatDate(startDay),
    end: formatDate(endDay),
    label: `${formatLabelDate(startDay)} – ${formatLabelDate(endDay)}`,
  };
}
