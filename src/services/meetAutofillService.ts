export interface MeetTeachingLoadAutofill {
  id: string;
  meetingId?: string;
  courseCode: string;
  courseTitle: string;
  section: string;
  units: number | string;
  meetingDate: string; // "YYYY-MM-DD"
  meetingDay: string;  // "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"
  meetingTime: string; // e.g. "10:00 AM – 11:30 AM"
  meetingCode: string; // "abc-defg-hij"
  durationMinutes: number;
  topics: string;
  tasks: string;
  campus: string;
  createdAt: string;
}

export interface MinimalCourseInfo {
  code: string;
  title: string;
  units: number | string;
}

const PENDING_STORAGE_KEY = "aris:meet_pending_teaching_load";
const APPLIED_STORAGE_KEY = "aris:meet_applied_teaching_load";

export function formatTime12(date: Date): string {
  if (isNaN(date.getTime())) return "08:00 AM";
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${displayHours}:${displayMinutes} ${period}`;
}

export function getDayAbbrev(date: Date): string {
  if (isNaN(date.getTime())) return "MON";
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days[date.getDay()] || "MON";
}

export function parseCourseString(
  rawCourse: string,
  availableCourses: MinimalCourseInfo[] = []
): {
  courseCode: string;
  courseTitle: string;
  section: string;
  units: number | string;
} {
  const trimmed = (rawCourse || "").trim();

  // 1. Try matching with known courses from database catalog
  for (const c of availableCourses) {
    if (c.code && trimmed.toUpperCase().includes(c.code.toUpperCase())) {
      let section = "BSIT 2B";
      const secMatch = trimmed.match(/[·\-–]\s*([A-Z0-9\s\-]+?)(?:\s*\(|$)/i);
      if (secMatch && secMatch[1]) {
        section = secMatch[1].trim();
      }
      return {
        courseCode: c.code,
        courseTitle: c.title,
        section,
        units: c.units,
      };
    }
  }

  // 2. Regex for code patterns e.g. "CC 105 · BSIT 2B (Information Management)"
  const codeMatch = trimmed.match(/^([A-Z]{2,4}\s*\d{2,4}[A-Z]?)/i);
  if (codeMatch) {
    const courseCode = codeMatch[1].toUpperCase();
    let section = "BSIT 2B";
    const secMatch = trimmed.match(/[·\-–]\s*([A-Z0-9\s\-]+?)(?:\s*\(|$)/i);
    if (secMatch && secMatch[1]) {
      section = secMatch[1].trim();
    }
    const titleMatch = trimmed.match(/\(([^)]+)\)/);
    const courseTitle = titleMatch
      ? titleMatch[1].trim().toUpperCase()
      : `${courseCode} ONLINE COURSE`;

    return {
      courseCode,
      courseTitle,
      section,
      units: 3,
    };
  }

  // 3. Fallback for consultations or general sessions
  if (trimmed.toLowerCase().includes("consult") || trimmed.toLowerCase().includes("general")) {
    return {
      courseCode: "CC 105",
      courseTitle: "INFORMATION MANAGEMENT",
      section: "BSIT 2B",
      units: 3,
    };
  }

  return {
    courseCode: "CC 116",
    courseTitle: "ADVANCED WEB SYSTEMS AND TECHNOLOGIES",
    section: "BSCS 3-B",
    units: 5,
  };
}

export function queueMeetTeachingLoadAutofill(item: MeetTeachingLoadAutofill): void {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    const list: MeetTeachingLoadAutofill[] = raw ? JSON.parse(raw) : [];
    // Deduplicate by meetingCode & meetingDate
    const filtered = list.filter(
      (m) => !(m.meetingCode === item.meetingCode && m.meetingDate === item.meetingDate)
    );
    filtered.push(item);
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(filtered));

    // Dispatch window custom event so an active Submit page receives it immediately
    window.dispatchEvent(
      new CustomEvent("aris:meet-autofill-added", { detail: item })
    );
  } catch (err) {
    console.warn("Failed to queue Google Meet autofill:", err);
  }
}

export function getPendingMeetTeachingLoadAutofills(): MeetTeachingLoadAutofill[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MeetTeachingLoadAutofill[]) : [];
  } catch {
    return [];
  }
}

export function clearPendingMeetTeachingLoadAutofills(): void {
  try {
    localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {}
}

export function recordAppliedMeetAutofills(items: MeetTeachingLoadAutofill[]): void {
  try {
    const raw = localStorage.getItem(APPLIED_STORAGE_KEY);
    const list: MeetTeachingLoadAutofill[] = raw ? JSON.parse(raw) : [];
    const combined = [...list, ...items];
    localStorage.setItem(APPLIED_STORAGE_KEY, JSON.stringify(combined.slice(-30)));
  } catch {}
}

export function getAppliedMeetAutofills(): MeetTeachingLoadAutofill[] {
  try {
    const raw = localStorage.getItem(APPLIED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MeetTeachingLoadAutofill[]) : [];
  } catch {
    return [];
  }
}

