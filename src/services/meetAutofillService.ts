export interface MeetTeachingLoadAutofill {
  id: string;
  meetingId?: string;
  userEmail?: string;
  userId?: string;
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

const pendingKey = (userKey?: string) =>
  userKey ? `aris:meet_pending_teaching_load:${userKey.toLowerCase().trim()}` : "aris:meet_pending_teaching_load";
const appliedKey = (userKey?: string) =>
  userKey ? `aris:meet_applied_teaching_load:${userKey.toLowerCase().trim()}` : "aris:meet_applied_teaching_load";

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
        section = secMatch[1].trim().toUpperCase();
      }
      return {
        courseCode: c.code.trim().toUpperCase(),
        courseTitle: c.title.trim().toUpperCase(),
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
      section = secMatch[1].trim().toUpperCase();
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

export function queueMeetTeachingLoadAutofill(
  item: MeetTeachingLoadAutofill,
  userKey?: string,
): void {
  try {
    const key = pendingKey(userKey || item.userEmail || item.userId);
    const raw = localStorage.getItem(key);
    const list: MeetTeachingLoadAutofill[] = raw ? JSON.parse(raw) : [];
    // Deduplicate by meetingCode & meetingDate
    const filtered = list.filter(
      (m) => !(m.meetingCode === item.meetingCode && m.meetingDate === item.meetingDate)
    );
    filtered.push(item);
    localStorage.setItem(key, JSON.stringify(filtered));

    // Also maintain legacy global key for compatibility
    if (key !== "aris:meet_pending_teaching_load") {
      try {
        localStorage.setItem(
          "aris:meet_pending_teaching_load",
          JSON.stringify([item]),
        );
      } catch {}
    }

    // Dispatch window custom event so an active Submit page receives it immediately
    window.dispatchEvent(
      new CustomEvent("aris:meet-autofill-added", { detail: item })
    );
  } catch (err) {
    console.warn("Failed to queue Google Meet autofill:", err);
  }
}

export function getPendingMeetTeachingLoadAutofills(userKey?: string): MeetTeachingLoadAutofill[] {
  try {
    if (userKey) {
      const scopedRaw = localStorage.getItem(pendingKey(userKey));
      if (scopedRaw) return JSON.parse(scopedRaw) as MeetTeachingLoadAutofill[];
    }
    const raw = localStorage.getItem("aris:meet_pending_teaching_load");
    if (!raw) return [];
    const list = JSON.parse(raw) as MeetTeachingLoadAutofill[];
    if (!userKey) return list;
    const target = userKey.toLowerCase().trim();
    return list.filter(
      (m) =>
        (m.userEmail && m.userEmail.toLowerCase().trim() === target) ||
        (m.userId && m.userId.toLowerCase().trim() === target),
    );
  } catch {
    return [];
  }
}

export function clearPendingMeetTeachingLoadAutofills(userKey?: string): void {
  try {
    if (userKey) {
      localStorage.removeItem(pendingKey(userKey));
    }
    localStorage.removeItem("aris:meet_pending_teaching_load");
  } catch {}
}

export function recordAppliedMeetAutofills(
  items: MeetTeachingLoadAutofill[],
  userKey?: string,
): void {
  try {
    const key = appliedKey(userKey);
    const raw = localStorage.getItem(key);
    const list: MeetTeachingLoadAutofill[] = raw ? JSON.parse(raw) : [];
    const combined = [...list, ...items];
    localStorage.setItem(key, JSON.stringify(combined.slice(-30)));
  } catch {}
}

export function getAppliedMeetAutofills(userKey?: string): MeetTeachingLoadAutofill[] {
  try {
    const raw = localStorage.getItem(appliedKey(userKey));
    return raw ? (JSON.parse(raw) as MeetTeachingLoadAutofill[]) : [];
  } catch {
    return [];
  }
}

