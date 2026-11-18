/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { PageTitle } from "@/components/ui";
import { useAuth } from "@/app/authContext";
import { loadResource, saveResource } from "@/services/dataSource";
import { supabase } from "@/services/supabase";
import { fetchProgramCodes } from "@/services/programService";
import {
  getPendingMeetTeachingLoadAutofills,
  clearPendingMeetTeachingLoadAutofills,
  recordAppliedMeetAutofills,
  parseCourseString,
  getDayAbbrev,
  formatTime12,
  type MeetTeachingLoadAutofill,
} from "@/services/meetAutofillService";
import { fetchMeetingsFromDb } from "@/services/meetingService";

const MANILA_TIME_ZONE = "Asia/Manila";
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

type ManilaDateParts = { year: number; month: number; day: number };
type PeriodParts = { month: number; year: number; half?: "I" | "II" };

function getManilaDateParts(value: string | Date): ManilaDateParts | null {
  if (typeof value === "string") {
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
    if (dateMatch) {
      const [, yearText, monthText, dayText, suffix] = dateMatch;
      const hasExplicitTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(suffix);
      if (!suffix || !hasExplicitTimeZone) {
        const parts = {
          year: Number(yearText),
          month: Number(monthText),
          day: Number(dayText),
        };
        const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
        if (
          check.getUTCFullYear() === parts.year &&
          check.getUTCMonth() === parts.month - 1 &&
          check.getUTCDate() === parts.day
        ) {
          return parts;
        }
        return null;
      }
      value = new Date(value);
    } else {
      value = new Date(value);
    }
  }

  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function parsePeriodLabel(value: string, defaultYear?: number): PeriodParts | null {
  const match = value.match(
    /^([A-Za-z]+)(?:\s+(\d{4}))?(?:\s+(I|II))?(?:\s+\([^)]*\))?$/i,
  );
  if (!match) return null;
  const month = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === match[1].toLowerCase(),
  );
  if (month < 0) return null;
  const year = match[2]
    ? Number(match[2])
    : defaultYear ?? getManilaDateParts(new Date())?.year;
  if (!year) return null;
  return {
    month: month + 1,
    year,
    half: match[3]?.toUpperCase() as "I" | "II" | undefined,
  };
}

function toPeriodLabel(parts: PeriodParts, half: "I" | "II" = "I") {
  return `${MONTH_NAMES[parts.month - 1]} ${parts.year} ${half}`;
}

function currentMonthName() {
  const now = getManilaDateParts(new Date());
  if (!now) return "";
  return toPeriodLabel(now, now.day <= 15 ? "I" : "II");
}

function parseSectionValue(value: string) {
  const match = value.trim().match(/^(.+?)\s+(\d+)\s*-?\s*([A-D])$/i);
  return match
    ? {
        program: match[1].trim().toUpperCase(),
        year: match[2],
        section: match[3].toUpperCase(),
      }
    : { program: "", year: "", section: "" };
}

export type DbCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  department_name?: string;
  description?: string;
};

export type ClassScheduleRow = {
  id: string;
  code: string;
  section: string;
  units: number | string;
  days: string;
  time: string;
  campus: string;
};

export type CourseBlock = {
  id: string;
  courseId?: string;
  code: string;
  title: string;
  units: number | string;
  datesHeld: string;
  topics: string;
  tasks: string;
  rows: ClassScheduleRow[];
};

type DayTimeDraft = { start: string; end: string };

type ClassRowDraft = {
  code: string;
  program: string;
  year: string;
  section: string;
  campus: string;
  dayTimes: Record<string, DayTimeDraft>;
  units: string;
  days: string[];
};

const emptyClassRow: ClassRowDraft = {
  code: "",
  program: "",
  year: "",
  section: "",
  campus: "CONGRESS",
  dayTimes: {
    MON: { start: "", end: "" },
    THU: { start: "", end: "" },
  },
  units: "5",
  days: ["MON", "THU"],
};

const DAYS_OPTIONS = [
  { label: "MON", value: "MON" },
  { label: "TUE", value: "TUE" },
  { label: "WED", value: "WED" },
  { label: "THU", value: "THU" },
  { label: "FRI", value: "FRI" },
  { label: "SAT", value: "SAT" },
  { label: "SUN", value: "SUN" },
];

function sortScheduleDays(days: string[]) {
  const dayOrder = DAYS_OPTIONS.map((day) => day.value);
  return [...days].sort(
    (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b),
  );
}

function formatTime(time: string) {
  if (!time) return "";
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${match[2]} ${period}`;
}

function isValidTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatMeetingClock(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute > 59) return "";
  return formatTime(`${String(hour).padStart(2, "0")}:${match[2]}`);
}

function parseTimeRange(value: string) {
  const firstRange = value.split("|")[0]?.trim() ?? "";
  const match = firstRange.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?$/i,
  );
  if (!match) return { start: "", end: "" };

  const [, startHourText, startMinute, startMeridiem, endHourText, endMinute, endMeridiem] =
    match;
  const endHour = Number(endHourText);
  let startPeriod = startMeridiem?.toUpperCase() ?? endMeridiem?.toUpperCase();
  const endPeriod = endMeridiem?.toUpperCase() ?? startMeridiem?.toUpperCase();
  if (!startMeridiem && endPeriod) {
    const isAcrossMeridiem = Number(startHourText) > endHour;
    startPeriod = isAcrossMeridiem
      ? endPeriod === "PM"
        ? "AM"
        : "PM"
      : endPeriod;
  }

  const to24Hour = (hourText: string, minuteText: string, meridiem?: string) => {
    let hour = Number(hourText);
    if (meridiem) {
      if (hour < 1 || hour > 12) return "";
      hour = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    } else if (hour > 23) {
      return "";
    }
    const minute = Number(minuteText);
    if (minute > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  return {
    start: to24Hour(startHourText, startMinute, startPeriod),
    end: to24Hour(endHourText, endMinute, endPeriod),
  };
}

function isValidClassRowDraft(draft: ClassRowDraft) {
  return (
    Boolean(draft.program.trim()) &&
    Boolean(draft.year) &&
    Boolean(draft.section) &&
    draft.days.length > 0 &&
    draft.days.every((day) => {
      const time = draft.dayTimes[day];
      if (!time) return false;
      return (
        isValidTimeValue(time.start) &&
        isValidTimeValue(time.end) &&
        time.end > time.start
      );
    })
  );
}

function normalizePeriodLabel(value: string, defaultYear?: number) {
  const parts = parsePeriodLabel(value, defaultYear);
  return parts ? toPeriodLabel(parts, parts.half ?? "I") : currentMonthName();
}

function getPeriodTextMatch(value: string): PeriodParts | null {
  const match = value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?(?:\s+(I|II))?(?:\s+\(Whole Month\))?/i,
  );
  return match ? parsePeriodLabel(match[0]) : null;
}

function getHeldDates(value: string) {
  return value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function formatHeldDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

/* ─── Shared Label ─────────────────────────────────────── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[10.5px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: "#8fa394" }}
    >
      {children}
    </label>
  );
}

/* ─── Section Card ──────────────────────────────────────── */
function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border p-6 ${className}`}
      style={{
        borderColor: "#e8eeea",
        boxShadow: "0 1px 4px 0 rgba(0,60,30,0.06), 0 0 0 0 transparent",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Section Header ────────────────────────────────────── */
function SectionHeader({
  num,
  title,
  subtitle,
  extra,
  actions,
}: {
  num: string;
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl text-white font-black flex items-center justify-center text-[11px] tracking-wide flex-shrink-0 shadow-sm"
          style={{
            background: "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
          }}
        >
          {num}
        </div>

        <div
          className="h-8 w-px self-stretch"
          style={{ background: "#e8eeea" }}
        />
        <div>
          <div className="flex items-center gap-2.5">
            <h2
              className="text-[14.5px] font-bold"
              style={{ color: "#111c14" }}
            >
              {title}
            </h2>
            {extra}
          </div>
          {subtitle && (
            <p className="text-[11.5px] mt-0.5" style={{ color: "#8fa394" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const inputCls =
  "w-full h-11 px-3.5 rounded-xl border text-[13.5px] font-medium outline-none transition-colors bg-[#fafbfa]";
const inputStyle = { borderColor: "#e8eeea", color: "#111c14" };

export function parseTablesToCourseBlocks(
  tables?: any[],
  defaultTopics?: string,
  defaultTasks?: string,
): CourseBlock[] {
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    return [];
  }
  return tables.map((tbl, idx) => {
    const fullTitle = tbl.title || `Course ${idx + 1}`;
    let code = "";
    let title = fullTitle;
    if (fullTitle.includes("—")) {
      const parts = fullTitle.split("—");
      code = parts[0].trim();
      title = parts.slice(1).join("—").trim();
    } else if (fullTitle.includes(" - ")) {
      const parts = fullTitle.split(" - ");
      code = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    } else if (tbl.rows?.[0]?.[0]) {
      code = String(tbl.rows[0][0]).trim();
    }

    const rows: ClassScheduleRow[] = Array.isArray(tbl.rows)
      ? tbl.rows.map((row: any, rIdx: number) => ({
          id: `row_rev_${idx}_${rIdx}_${Math.random().toString(36).substring(2, 6)}`,
          code: String(row[0] || code || ""),
          section: String(row[1] || ""),
          units: row[2] ?? 3,
          days: String(row[3] || "MON | THU"),
          time: String(row[4] || ""),
          campus: String(row[5] || "CONGRESS"),
        }))
      : [];

    return {
      id: `course_rev_${idx}_${Date.now()}`,
      code,
      title: title || fullTitle,
      units: rows[0]?.units ?? 3,
      datesHeld:
        tbl.datesHeld || tbl.meta || "",
      topics: tbl.topics || defaultTopics || "",
      tasks: tbl.tasks || defaultTasks || "",
      rows:
        rows.length > 0
          ? rows
          : [
              {
                id: `row_rev_${idx}_default`,
                code,
                section: "",
                units: 3,
                days: "MON | THU",
                time: "",
                campus: "CONGRESS",
              },
            ],
    };
  });
}

export default function ProfSubmit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const reviseSubmission = (location.state as any)?.reviseSubmission;
  const [isRevision, setIsRevision] = useState<boolean>(
    Boolean(reviseSubmission),
  );
  const [revisionRef, setRevisionRef] = useState<string>(
    reviseSubmission?.record?.reference || reviseSubmission?.id || "",
  );
  const [revisionReason, setRevisionReason] = useState<string>(
    reviseSubmission?.record?.remark || reviseSubmission?.remark || "",
  );
  const [revisionReviewer, setRevisionReviewer] = useState<string>(
    reviseSubmission?.record?.reviewer ||
      reviseSubmission?.stage ||
      "Faculty Checker",
  );

  const [period, setPeriod] = useState(() =>
    normalizePeriodLabel(
      reviseSubmission?.period ||
        reviseSubmission?.record?.period ||
        currentMonthName(),
      getManilaDateParts(
        reviseSubmission?.created_at ||
          reviseSubmission?.record?.created_at ||
          "",
      )?.year,
    ),
  );
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(true);
  const [facultyName, setFacultyName] = useState(
    reviseSubmission?.record?.facultyName || user.name.toUpperCase(),
  );
  const [facultyNumber, setFacultyNumber] = useState(
    reviseSubmission?.record?.facultyNumber || "",
  );
  const [college, setCollege] = useState(
    reviseSubmission?.record?.college || "COLLEGE OF LIBERAL ARTS AND SCIENCES",
  );

  // Database courses state
  const [availableCourses, setAvailableCourses] = useState<DbCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [programCodes, setProgramCodes] = useState<string[]>([]);

  // Build half-month options from all months represented by AR or MEET data.
  const loadAvailableMonths = async () => {
    try {
      const monthSet = new Set<string>();

      // 1. Gather months from meeting data
      try {
        const meetings = await fetchMeetingsFromDb(user?.email);
        meetings.forEach((m) => {
          if (m.meeting_date) {
            const parts = getManilaDateParts(m.meeting_date);
            if (parts) {
              monthSet.add(`${parts.year}-${parts.month}`);
            }
          }
        });
      } catch {
        /* ignore meet fetch errors */
      }

      // 2. Gather months from existing AR submissions
      try {
        const arRecords = await loadResource(
          "/professor/accomplishment-reports",
          [],
        );
        const records = Array.isArray(arRecords) ? arRecords : [];
        records.forEach((r: any) => {
          const p = r?.period || r?.record?.period;
          if (p && typeof p === "string") {
            const recordDate = getManilaDateParts(
              r?.created_at ||
                r?.record?.created_at ||
                r?.submitted_at ||
                r?.record?.submitted_at ||
                "",
            );
            const parts = parsePeriodLabel(p, recordDate?.year);
            if (parts) {
              monthSet.add(`${parts.year}-${parts.month}`);
            }
          }
        });
      } catch {
        /* ignore AR fetch errors */
      }

      const current = getManilaDateParts(new Date());
      if (current) monthSet.add(`${current.year}-${current.month}`);
      const periods = Array.from(monthSet)
        .map((key) => key.split("-").map(Number))
        .sort(([yearA, monthA], [yearB, monthB]) =>
          yearA === yearB ? monthA - monthB : yearA - yearB,
        )
        .flatMap(([year, month]) => [
          toPeriodLabel({ year, month }, "I"),
          toPeriodLabel({ year, month }, "II"),
        ]);
      setAvailablePeriods(periods);

      const currentPeriod = normalizePeriodLabel(period);
      setPeriod(
        periods.includes(currentPeriod)
          ? currentPeriod
          : currentMonthName() || periods[0] || "",
      );
    } catch {
      setAvailablePeriods([]);
    } finally {
      setMonthsLoading(false);
    }
  };

  useEffect(() => {
    void loadAvailableMonths();
  }, [user?.email]);

  const lastAutoFilledMonth = useRef<string | null>(null);

  // Auto-fill courses from Google Meet data when the selected half-month changes.
  useEffect(() => {
    if (monthsLoading || !period) return;
    const selectedPeriod = parsePeriodLabel(period);
    if (!selectedPeriod?.half) return;

    const runAutoFill = async () => {
      try {
        const meetings = await fetchMeetingsFromDb(user?.email);

        const filtered = meetings.filter((m) => {
          if (!m.meeting_date) return false;
          const date = getManilaDateParts(m.meeting_date);
          if (!date) return false;
          return (
            date.year === selectedPeriod.year &&
            date.month === selectedPeriod.month &&
            (selectedPeriod.half === "I" ? date.day <= 15 : date.day >= 16)
          );
        });

        if (filtered.length === 0) return;

        // Convert SavedMeetingRecord[] → MeetTeachingLoadAutofill[]
        const autofillItems: MeetTeachingLoadAutofill[] = filtered.map((m) => {
          const parsed = parseCourseString(m.course ?? "", availableCourses);
          const dateParts = getManilaDateParts(m.meeting_date);
          const meetingDate = dateParts
            ? new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day))
            : new Date(Number.NaN);
          const startTime = m.start_time ? formatMeetingClock(m.start_time) : "";
          const endTime = m.end_time ? formatMeetingClock(m.end_time) : "";
          let meetingTime = "";
          if (startTime && endTime) {
            meetingTime = `${startTime} – ${endTime}`;
          } else if (m.start_time) {
            meetingTime = startTime;
          }

          return {
            id: m.id,
            meetingId: m.id,
            userEmail: user?.email,
            userId: user?.id,
            courseCode: parsed.courseCode,
            courseTitle: parsed.courseTitle,
            section: parsed.section,
            units: parsed.units,
            meetingDate: m.meeting_date,
            meetingDay: getDayAbbrev(meetingDate),
            meetingTime,
            meetingCode: m.meeting_code || `MEET-${m.id}`,
            durationMinutes: m.duration_minutes ?? 0,
            topics: m.info || `${parsed.courseCode} ONLINE CLASS LECTURE & DISCUSSION`,
            tasks: "Lecture and Discussion, Activity",
            campus: m.campus || "CONGRESS",
            createdAt: m.created_at || new Date().toISOString(),
          };
        });

        applyMeetAutofill(autofillItems);
        lastAutoFilledMonth.current = period;
      } catch (err) {
        console.warn("Auto-fill from Meet failed:", err);
      }
    };

    void runAutoFill();
  }, [period, user?.email, monthsLoading, availableCourses.length]);

  // Course blocks in report
  const initialCourses = useMemo(() => {
    if (reviseSubmission?.record?.tables) {
      const parsed = parseTablesToCourseBlocks(
        reviseSubmission.record.tables,
        reviseSubmission.record.topics,
        reviseSubmission.record.tasks,
      );
      if (parsed.length > 0) return parsed;
    }
    return [];
  }, [reviseSubmission]);

  const [courses, setCourses] = useState<CourseBlock[]>(initialCourses);

  useEffect(() => {
    if (reviseSubmission) {
      setIsRevision(true);
      setRevisionRef(
        reviseSubmission.record?.reference || reviseSubmission.id || "",
      );
      setRevisionReason(
        reviseSubmission.record?.remark ||
          reviseSubmission.remark ||
          "Returned for faculty correction. Please review entries and resubmit.",
      );
      setRevisionReviewer(
        reviseSubmission.record?.reviewer ||
          reviseSubmission.stage ||
          "Faculty Checker",
      );
      if (reviseSubmission.period || reviseSubmission.record?.period) {
        setPeriod(
          normalizePeriodLabel(
            reviseSubmission.period || reviseSubmission.record?.period,
            getManilaDateParts(
              reviseSubmission.created_at ||
                reviseSubmission.record?.created_at ||
                "",
            )?.year,
          ),
        );
      }
      if (reviseSubmission.record?.facultyName) {
        setFacultyName(reviseSubmission.record.facultyName);
      }
      if (reviseSubmission.record?.facultyNumber) {
        setFacultyNumber(reviseSubmission.record.facultyNumber);
      }
      if (reviseSubmission.record?.college) {
        setCollege(reviseSubmission.record.college);
      }
      if (reviseSubmission.record?.notes) {
        const rawNotes = reviseSubmission.record.notes;
        if (!/disapprov|reject|returned/i.test(rawNotes)) {
          setNotes(rawNotes);
        } else {
          setNotes("");
        }
      }
      if (
        reviseSubmission.record?.attachment &&
        reviseSubmission.record.attachment !== "None"
      ) {
        setUploadedFile(reviseSubmission.record.attachment);
      }
      const parsed = parseTablesToCourseBlocks(
        reviseSubmission.record?.tables,
        reviseSubmission.record?.topics,
        reviseSubmission.record?.tasks,
      );
      if (parsed.length > 0) {
        setCourses(parsed);
      }
    }
  }, [reviseSubmission]);

  // Class modal state
  const [classModalCourseId, setClassModalCourseId] = useState<string | null>(
    null,
  );
  const [pendingCourse, setPendingCourse] = useState<DbCourse | null>(null);
  const [classRowDraft, setClassRowDraft] =
    useState<ClassRowDraft>(emptyClassRow);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  // File & notes
  const [notes, setNotes] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicatePeriod, setDuplicatePeriod] = useState<string | null>(null);
  const [duplicateModalConfirmed, setDuplicateModalConfirmed] = useState(false);
  const [modalAnimate, setModalAnimate] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Animate modal in when it opens
  useEffect(() => {
    if (showDuplicateModal) {
      setModalAnimate(true);
    } else {
      setModalAnimate(false);
    }
  }, [showDuplicateModal]);

  // Google Meet Auto-Fill state
  const [autofillBanner, setAutofillBanner] = useState<{
    message: string;
    courseCode: string;
    details?: string;
  } | null>(null);
  const [isSyncingMeet, setIsSyncingMeet] = useState(false);

  // Core handler to apply autofilled info from Google Meet to Teaching Load courses
  const applyMeetAutofill = (items: MeetTeachingLoadAutofill[]) => {
    if (!items || items.length === 0) return;

    setCourses((prevCourses) => {
      const updated = [...prevCourses];

      for (const item of items) {
        const itemTopicUpper = (item.topics || `${item.courseCode} ONLINE CLASS LECTURE & DISCUSSION`).trim().toUpperCase();
        const itemTaskFormatted = item.tasks && !item.tasks.includes("Room:") ? item.tasks : "Lecture and Discussion, Activity";

        const existingIdx = updated.findIndex(
          (c) =>
            c.code.trim().toUpperCase() ===
            item.courseCode.trim().toUpperCase(),
        );

        if (existingIdx >= 0) {
          const ex = updated[existingIdx];
          // 1. Add held date (ignore dummy initial dates if they were default)
          const isDummyDates = ex.datesHeld === "2026-08-21,2026-08-23,2026-08-30";
          const dates = isDummyDates ? [] : getHeldDates(ex.datesHeld);
          const newDates = dates.includes(item.meetingDate)
            ? dates
            : [...dates, item.meetingDate].sort();

          // 2. Topics Discussed (Must be uppercase to follow Photo Format)
          let nextTopics = ex.topics;
          if (
            !nextTopics ||
            nextTopics.trim() === "" ||
            nextTopics === "DESIGNING LOG IN MODAL"
          ) {
            nextTopics = itemTopicUpper;
          } else if (
            !nextTopics.toUpperCase().includes(itemTopicUpper)
          ) {
            nextTopics = `${nextTopics} · ${itemTopicUpper}`;
          }

          // 3. Task/Activity Description (Follows standard "Lecture and Discussion, Activity" format)
          let nextTasks = ex.tasks;
          if (
            !nextTasks ||
            nextTasks.trim() === "" ||
            nextTasks.includes("Google Meet (Room:") ||
            nextTasks.includes("Duration:")
          ) {
            nextTasks = itemTaskFormatted;
          } else if (!nextTasks.includes(itemTaskFormatted)) {
            nextTasks = `${nextTasks} · ${itemTaskFormatted}`;
          }

          // 4. Class Section Row
          const rows = [...ex.rows];
          const isDummyRow =
            rows.length === 1 &&
            !rows[0].section.trim() &&
            Boolean(item.section.trim());

          const rowIdx = isDummyRow
            ? 0
            : rows.findIndex(
                (r) =>
                  r.section.trim().toUpperCase() ===
                  item.section.trim().toUpperCase(),
              );

          if (rowIdx >= 0) {
            const targetDays = rows[rowIdx].days || item.meetingDay;
            const dayParts = targetDays.split(" | ");
            const formattedTime =
              dayParts.length > 1
                ? Array(dayParts.length).fill(item.meetingTime).join(" | ")
                : item.meetingTime;

            rows[rowIdx] = {
              ...rows[rowIdx],
              code: item.courseCode,
              section: item.section,
              units: item.units || rows[rowIdx].units,
              days: targetDays,
              time: formattedTime,
              campus: rows[rowIdx].campus || item.campus || "CONGRESS",
            };
          } else {
            rows.push({
              id: `row_meet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              code: item.courseCode,
              section: item.section,
              units: item.units,
              days: item.meetingDay,
              time: item.meetingTime,
              campus: item.campus || "CONGRESS",
            });
          }

          updated[existingIdx] = {
            ...ex,
            datesHeld: newDates.join(","),
            topics: nextTopics,
            tasks: nextTasks,
            rows,
          };
        }
      }

      return updated;
    });

    const last = items[items.length - 1];
    setAutofillBanner({
      courseCode: last.courseCode,
      message: "Google Meet data synced",
      details: `${last.courseCode} (${last.courseTitle}) — Held on ${formatHeldDate(last.meetingDate)} at ${last.meetingTime}. Courses not already in this report are not added automatically.`,
    });

    clearPendingMeetTeachingLoadAutofills(user?.email || user?.id);
    recordAppliedMeetAutofills(items, user?.email || user?.id);
  };

  // Real-time listener & initial check for Google Meet autofills (scoped to authenticated professor)
  useEffect(() => {
    const userKey = user?.email || user?.id;
    const pending = getPendingMeetTeachingLoadAutofills(userKey);
    if (pending && pending.length > 0) {
      applyMeetAutofill(pending);
    }

    const handler = (e: Event) => {
      const customEvt = e as CustomEvent<MeetTeachingLoadAutofill>;
      if (customEvt.detail) {
        // Only accept if it belongs to this professor or is unscoped
        const evtDetail = customEvt.detail;
        if (
          !evtDetail.userEmail ||
          !user?.email ||
          evtDetail.userEmail.toLowerCase().trim() ===
            user.email.toLowerCase().trim()
        ) {
          applyMeetAutofill([evtDetail]);
        }
      }
    };

    window.addEventListener("aris:meet-autofill-added", handler);
    return () => {
      window.removeEventListener("aris:meet-autofill-added", handler);
    };
  }, [user?.email, user?.id]);

  // Manual sync button to pull recent completed Google Meet session into teaching load
  const handleSyncFromGoogleMeet = async () => {
    setIsSyncingMeet(true);
    try {
      const userKey = user?.email || user?.id;
      // 1. Check pending in localStorage scoped to this professor
      const pending = getPendingMeetTeachingLoadAutofills(userKey);
      if (pending.length > 0) {
        applyMeetAutofill(pending);
        setIsSyncingMeet(false);
        return;
      }

      // 2. Fetch completed meetings from DB scoped to this professor
      const dbMeetings = await fetchMeetingsFromDb(user?.email);
      const userEmailLower = (user?.email || "").toLowerCase().trim();
      const completed = (dbMeetings || []).filter((m) => {
        const isFinished =
          m.status === "completed" || m.status === "summarized";
        if (!isFinished) return false;
        // Verify owner if professor_id or email is present on the record
        if (m.professor_id && user?.id && m.professor_id === user.id)
          return true;
        if (
          (m as any).professor_email &&
          (m as any).professor_email.toLowerCase().trim() === userEmailLower
        )
          return true;
        // If no owner metadata was attached on older rows, allow matching
        return !m.professor_id;
      });

      if (completed.length === 0) {
        setAutofillBanner({
          courseCode: "INFO",
          message: "No Recent Google Meet Found",
          details:
            "Start and complete a Google Meet session on the Meet page first.",
        });
        setIsSyncingMeet(false);
        return;
      }

      // Take latest completed meeting
      const latest = completed[completed.length - 1];
      const parsed = parseCourseString(
        latest.course || "CC 105",
        availableCourses,
      );
      const sDate = latest.started_at
        ? new Date(latest.started_at)
        : new Date();
      const eDate = latest.ended_at
        ? new Date(latest.ended_at)
        : new Date(sDate.getTime() + (latest.duration_seconds || 3600) * 1000);
      const meetDate =
        latest.meeting_date ||
        (latest.started_at
          ? String(latest.started_at).split("T")[0]
          : new Date().toISOString().split("T")[0]);
      const meetTime =
        latest.start_time && latest.end_time
          ? `${latest.start_time} – ${latest.end_time}`
          : `${formatTime12(sDate)} – ${formatTime12(eDate)}`;
      const meetDay = getDayAbbrev(sDate);
      const meetTopic =
        latest.name &&
        !latest.name.startsWith("Instant Class") &&
        !latest.name.startsWith("Meeting (")
          ? latest.name.trim().toUpperCase()
          : `${parsed.courseCode} ONLINE CLASS LECTURE & DISCUSSION`;

      const item: MeetTeachingLoadAutofill = {
        id: latest.id,
        courseCode: parsed.courseCode,
        courseTitle: parsed.courseTitle,
        section: parsed.section,
        units: parsed.units,
        meetingDate: meetDate,
        meetingDay: meetDay,
        meetingTime: meetTime,
        meetingCode: latest.meeting_code,
        durationMinutes: latest.duration_minutes || 60,
        topics: meetTopic,
        tasks: "Lecture and Discussion, Activity",
        campus: "CONGRESS",
        createdAt: new Date().toISOString(),
      };

      applyMeetAutofill([item]);
    } catch (err) {
      console.warn("Sync from Google Meet failed:", err);
    } finally {
      setIsSyncingMeet(false);
    }
  };

  /* ── 1. Fetch available courses and professor info from DB ── */
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoadingCourses(true);
      let fetchedCourses: DbCourse[] = [];

      // A. Try API endpoint
      try {
        const res = await loadResource<DbCourse[]>(
          `/professor/courses?email=${encodeURIComponent(user.email)}`,
          [],
        );
        if (Array.isArray(res) && res.length > 0) {
          fetchedCourses = res;
        }
      } catch (err) {
        console.warn("Could not load from /professor/courses:", err);
      }

      // B. If empty, try Supabase directly
      if (fetchedCourses.length === 0 && supabase) {
        try {
          const { data, error } = await supabase
            .from("curriculum_courses")
            .select("id, code, title, units, department_name, description")
            .eq("is_active", true)
            .order("code", { ascending: true });

          if (!error && Array.isArray(data) && data.length > 0) {
            fetchedCourses = data;
          }
        } catch (sbErr) {
          console.warn("Supabase curriculum fallback error:", sbErr);
        }
      }

      // C. Fallback seeded courses if offline / demo
      if (fetchedCourses.length === 0) {
        fetchedCourses = [
          {
            id: "course-cc105",
            code: "CC 105",
            title: "INFORMATION MANAGEMENT",
            units: 3,
            department_name: "Computer Studies Department",
            description:
              "Database design and information system architectures.",
          },
        ];
      }

      if (!isCancelled) {
        setAvailableCourses(fetchedCourses);
        setLoadingCourses(false);
      }
    }

    loadData();

    // Also fetch professor profile details
    async function loadProfessorProfile() {
      try {
        if (supabase) {
          const { data } = await supabase
            .from("user_professors")
            .select("employee_id, department, firstname, lastname")
            .or(`email.eq.${user.email},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

          if (data && !isCancelled) {
            if (data.employee_id) setFacultyNumber(data.employee_id);
            if (data.department) setCollege(data.department.toUpperCase());
            if (data.firstname && data.lastname) {
              setFacultyName(
                `${data.firstname} ${data.lastname}`.toUpperCase(),
              );
            }
          }
        }
      } catch (err) {
        console.warn("Could not load professor profile:", err);
      }
    }

    loadProfessorProfile();

    return () => {
      isCancelled = true;
    };
  }, [user.email, user.id]);

  useEffect(() => {
    let isCancelled = false;
    fetchProgramCodes()
      .then((codes) => {
        if (!isCancelled) setProgramCodes(codes);
      })
      .catch((err) => {
        console.warn("Could not load program codes:", err);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  /* ── 2. Filter courses user can add ("you can't add a course if you're not in it") ── */
  const unaddedCourses = useMemo(() => {
    return availableCourses.filter(
      (dbC) =>
        !courses.some(
          (c) => c.code.trim().toUpperCase() === dbC.code.trim().toUpperCase(),
        ),
    );
  }, [availableCourses, courses]);

  /* ── 3. Course actions ── */
  const handleDeleteCourse = (courseId: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
  };

  const updateCourseField = (
    courseId: string,
    field: "title" | "datesHeld" | "topics" | "tasks",
    value: string,
  ) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, [field]: value } : c)),
    );
  };

  /* ── 4. Class Schedule Row actions ── */
  const openClassRowModal = (
    courseId: string,
    existingRow?: ClassScheduleRow,
    newCourse?: DbCourse,
  ) => {
    const targetCourse =
      newCourse ?? courses.find((course) => course.id === courseId);
    setPendingCourse(newCourse ?? null);
    if (existingRow) {
      setEditingRowId(existingRow.id);
      const dayArr = existingRow.days
        .split("|")
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
      const timeParts = (existingRow.time || "")
        .split("|")
        .map((time) => time.trim());
      const alignedTimeParts =
        timeParts.length < dayArr.length
          ? Array(dayArr.length).fill(timeParts[0] ?? "")
          : timeParts;
      const dayTimes = dayArr.reduce<Record<string, DayTimeDraft>>(
        (times, day, index) => {
          times[day] = parseTimeRange(alignedTimeParts[index] ?? "");
          return times;
        },
        {},
      );
      setClassRowDraft({
        code: existingRow.code || targetCourse?.code || "",
        ...parseSectionValue(existingRow.section || ""),
        campus: existingRow.campus || "CONGRESS",
        dayTimes,
        units: String(existingRow.units || targetCourse?.units || 3),
        days: dayArr,
      });
    } else {
      setEditingRowId(null);
      setClassRowDraft({
        ...emptyClassRow,
        code: targetCourse?.code || "",
        units: String(targetCourse?.units || 5),
        campus: "CONGRESS",
        dayTimes: Object.fromEntries(
          emptyClassRow.days.map((day) => [day, { start: "", end: "" }]),
        ),
      });
    }
    setClassModalCourseId(courseId);
  };

  const handleAddCourseFromDb = (course: DbCourse) => {
    setIsAddCourseModalOpen(false);
    openClassRowModal(course.id, undefined, course);
  };

  const closeClassRowModal = () => {
    setClassModalCourseId(null);
    setEditingRowId(null);
    setPendingCourse(null);
  };

  const saveClassRow = () => {
    if (!classModalCourseId) return;
    if (!isValidClassRowDraft(classRowDraft)) return;
    const sectionValue =
      `${classRowDraft.program.trim()} ${classRowDraft.year}-${classRowDraft.section}`
        .trim()
        .toUpperCase();
    const orderedDays = sortScheduleDays(classRowDraft.days);
    const daysStr = orderedDays.join(" | ");
    const timeStr = orderedDays
      .map((day) => {
        const times = classRowDraft.dayTimes[day] ?? {
          start: "",
          end: "",
        };
        return `${formatTime(times.start)} – ${formatTime(times.end)}`;
      })
      .join(" | ");
    const rowCode = classRowDraft.code.trim().toUpperCase();
    const rowUnits = Number(classRowDraft.units) || pendingCourse?.units || 3;
    const newRow: ClassScheduleRow = {
      id: `row_${Date.now()}`,
      code: rowCode,
      section: sectionValue,
      units: rowUnits,
      days: daysStr,
      time: timeStr,
      campus: classRowDraft.campus.trim().toUpperCase(),
    };

    if (pendingCourse) {
      const newBlock: CourseBlock = {
        id: `course_${Date.now()}`,
        courseId: pendingCourse.id,
        code: pendingCourse.code,
        title: pendingCourse.title,
        units: pendingCourse.units,
        datesHeld: "",
        topics: "",
        tasks: "",
        rows: [newRow],
      };
      setCourses((prev) => [...prev, newBlock]);
    } else {
      setCourses((prev) =>
        prev.map((course) => {
          if (course.id !== classModalCourseId) return course;
          if (editingRowId) {
            return {
              ...course,
              rows: course.rows.map((row) =>
                row.id === editingRowId
                  ? {
                      ...row,
                      ...newRow,
                      id: row.id,
                    }
                  : row,
              ),
            };
          }
          return { ...course, rows: [...course.rows, newRow] };
        }),
      );
    }
    closeClassRowModal();
  };

  const handleDeleteRow = (courseId: string, rowId: string) => {
    setCourses((prev) =>
      prev.map((c) => {
        if (c.id !== courseId) return c;
        return { ...c, rows: c.rows.filter((r) => r.id !== rowId) };
      }),
    );
  };

  /* ── 5. Form submission ── */
  const checkExistingSubmission = (periodLabel: string) => {
    const auditKeys = [
      "aris:demo:/audit",
      `aris:demo:/audit?email=${encodeURIComponent(user?.email ?? "")}`,
    ];
    for (const k of auditKeys) {
      try {
        const stored = localStorage.getItem(k);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          const isArr = Array.isArray(parsed);
          const logs: unknown[] = isArr
            ? (parsed as unknown[])
            : ((parsed as Record<string, unknown>)?.logs as unknown[]) ?? [];
          const selected = parsePeriodLabel(periodLabel);
          const matchingEntry = (logs as Array<{
            action: string;
            target: string;
          }>).find(
            (entry) => {
              const text = `${entry?.action ?? ""} ${entry?.target ?? ""}`;
              if (text.includes(periodLabel)) return true;
              const existing = getPeriodTextMatch(text);
              return Boolean(
                selected &&
                  existing &&
                  existing.month === selected.month &&
                  existing.year === selected.year &&
                  (!existing.half || existing.half === selected.half),
              );
            },
          );
          if (matchingEntry) {
            return true;
          }
        }
      } catch {
        /* ignore per-key errors */
      }
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    // Check for existing submission in the same month/period
    const hasExisting = checkExistingSubmission(period);
    if (hasExisting && !duplicateModalConfirmed) {
      setShowDuplicateModal(true);
      setDuplicatePeriod(period);
      setIsSubmitting(false);
      return;
    }

    const kind = "AR";
    const reference =
      isRevision && revisionRef ? revisionRef : `${kind}-${Date.now()}`;
    const now = new Date().toLocaleString("en-PH", {
      timeZone: MANILA_TIME_ZONE,
    });

    const combinedTopics = courses
      .map((c) => (c.topics ? `${c.code}: ${c.topics}` : ""))
      .filter(Boolean)
      .join(" · ");
    const combinedTasks = courses
      .map((c) => (c.tasks ? `${c.code}: ${c.tasks}` : ""))
      .filter(Boolean)
      .join(" · ");

    const existingId = isRevision
      ? reviseSubmission?.id || reviseSubmission?.record?.id
      : undefined;

    const record = {
      id: existingId || reference,
      report_id: existingId,
      reference,
      is_revision: isRevision,
      type: kind,
      period,
      units: `${courses.length} course${courses.length === 1 ? "" : "s"}`,
      submitted: now,
      status: "Pending",
      stage: "Checker",
      currentStage: "Checker",
      stage_key: "AR-AP-STG-1",
      approval_stage: "AR-AP-STG-1",
      stage_order: 1,
      email: user?.email,
      facultyEmail: user?.email,
      facultyName: facultyName || user?.name || "Faculty",
      facultyNumber: facultyNumber || "—",
      event: isRevision
        ? `${kind} resubmitted with corrections · ${period}`
        : `${kind} submitted · ${period}`,
      record: {
        id: existingId,
        report_id: existingId,
        period,
        reference,
        email: user?.email,
        facultyEmail: user?.email,
        facultyName: facultyName || user?.name || "Faculty",
        facultyNumber,
        college,
        tables: courses.map((course) => ({
          title: course.title.toUpperCase().includes(course.code.toUpperCase())
            ? course.title
            : `${course.code} — ${course.title}`,
          meta: course.datesHeld,
          datesHeld: course.datesHeld,
          topics: course.topics,
          tasks: course.tasks,
          columns: [
            "Code",
            "Program, Year & Section",
            "Units",
            "Days",
            "Time",
            "Campus",
          ],
          rows: course.rows.map((row) => [
            row.code,
            row.section,
            row.units,
            row.days,
            row.time,
            row.campus,
          ]),
        })),
        topics:
          combinedTopics || "Course syllabus alignment and lecture execution",
        tasks: combinedTasks || "Lecture and Discussion, Activity",
        notes:
          notes && !/disapprov|reject|returned/i.test(notes)
            ? notes
            : isRevision
              ? "Resubmitted with corrections."
              : notes,
        attachment: uploadedFile ?? undefined,
        reviewer: "Faculty Checker",
        reviewedAt: now,
        remark: isRevision
          ? "Resubmitted with corrections. Queued for Faculty Checker review."
          : "Received and queued for review.",
      },
    };

    // Synchronize local storage in demo mode so History immediately displays the revised submission
    try {
      const auditKeys = [
        "aris:demo:/audit",
        `aris:demo:/audit?email=${encodeURIComponent(user?.email || "")}`,
      ];
      for (const k of auditKeys) {
        const stored = localStorage.getItem(k);
        if (stored) {
          const parsed = JSON.parse(stored);
          const isArr = Array.isArray(parsed);
          const logs = isArr ? parsed : parsed?.logs || [];
          const updated = logs.map((log: any) => {
            const match =
              (log.id && log.id === record.id) ||
              (log.record?.reference && log.record.reference === reference);
            if (match) {
              return {
                ...log,
                result: "Pending",
                action: "AR resubmitted · Returned for correction addressed",
                time: now,
                stage: "Checker",
                stage_role: "Checker",
                stage_key: "AR-AP-STG-1",
                approval_stage: "AR-AP-STG-1",
                stage_order: 1,
                record: {
                  ...log.record,
                  ...record.record,
                },
              };
            }
            return log;
          });
          localStorage.setItem(
            k,
            JSON.stringify(isArr ? updated : { ...parsed, logs: updated }),
          );
        }
      }
    } catch (syncErr) {
      console.warn("Could not sync local audit store:", syncErr);
    }

    try {
      // Submit directly to accomplishment_reports (and report_entries)
      await saveResource("/professor/accomplishment-reports", record);
      navigate("/prof/history");
    } catch (reason) {
      try {
        await saveResource("/professor/submissions", record);
        navigate("/prof/history");
      } catch {
        setSubmitError(
          reason instanceof Error
            ? reason.message
            : "Unable to submit this record.",
        );
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="pb-32 max-w-[1180px] mx-auto">
      <PageTitle
        title={isRevision ? "Revise & Resubmit Record" : "Submit Record"}
        subtitle={
          isRevision
            ? `Make corrections to submission ${revisionRef} and resubmit for re-evaluation.`
            : "File an Accomplishment Report (AR) or DTR for the current cycle."
        }
      />

      {isRevision && (
        <div
          className="mb-6 rounded-2xl border p-5 shadow-sm"
          style={{
            background: "#fffaf5",
            borderColor: "#fcd34d",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "#fef3c7",
                  color: "#b45309",
                  border: "1px solid #fde68a",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="w-5 h-5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-[15px] font-bold text-[#92400e]">
                    Editing Rejected Submission ({revisionRef})
                  </h3>
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                    style={{
                      background: "#fee2e2",
                      color: "#b91c1c",
                      border: "1px solid #fca5a5",
                    }}
                  >
                    Returned for Revision
                  </span>
                </div>

                <div
                  className="mt-3 p-3.5 rounded-xl border bg-white"
                  style={{ borderColor: "#fde68a" }}
                >
                  <p className="text-[11px] uppercase tracking-wider font-bold text-[#b45309] mb-1">
                    Reviewer Feedback / Reason for Rejection:
                  </p>
                  <p className="text-[13px] font-semibold text-[#78350f] leading-relaxed">
                    {revisionReason ||
                      "Please review and correct the required entries before resubmitting."}
                  </p>
                  {revisionReviewer && (
                    <p className="text-[11.5px] text-[#92400e]/80 mt-1.5">
                      Returned by:{" "}
                      <span className="font-semibold text-[#92400e]">
                        {revisionReviewer}
                      </span>
                    </p>
                  )}
                </div>

                <p className="text-[12px] text-[#92400e] mt-2.5 leading-snug">
                  You can edit teaching loads, class schedules, dates held,
                  topics, tasks, and upload new documents below. Resubmitting
                  will reset the status to <strong>Pending</strong> and return
                  it to the <strong>Faculty Checker</strong> stage for review.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsRevision(false);
                setRevisionRef("");
                setRevisionReason("");
              }}
              className="px-3.5 py-1.5 rounded-xl border bg-white text-[12px] font-semibold text-[#b45309] hover:bg-[#fffbeb] transition-colors flex-shrink-0 cursor-pointer shadow-2xs"
              style={{ borderColor: "#fcd34d" }}
            >
              Exit Revision Mode
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px] flex items-center justify-between">
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="text-red-500 hover:text-red-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {showDuplicateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40"
        >
          <div
            className={`bg-white rounded-xl p-6 max-w-md w-full shadow-2xl transition-all duration-300 ease-out ${modalAnimate ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
            style={{}}
          >
            <h3 className="text-xl font-bold text-[#111c14] mb-4">
              AR Already Submitted
            </h3>
            <p className="text-[#5a6b5e] mb-6">
              You have already submitted an AR for {duplicatePeriod}. Would you like to submit again for this month?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="flex-1 rounded-xl border px-5 py-2.5 text-[13px] font-semibold text-[#5a6b5e] transition-all hover:bg-[#f7f9f8] active:scale-[0.98]"
                style={{ borderColor: "#e8eeea" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateModalConfirmed(true);
                  setShowDuplicateModal(false);
                }}
                className="flex-1 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#009668 0%,#00b87a 100%)" }}
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <form
        id="submit-form"
        onSubmit={handleSubmit}
        className="space-y-6"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {/* ── SECTION 01: Record Information ── */}
        <SectionCard>
          <SectionHeader
            num="01"
            title="Record Information"
            subtitle="Choose the type of record and the submission month."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Period</FieldLabel>
              <div className="relative">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className={`${inputCls} appearance-none pr-10`}
                  style={inputStyle}
                  disabled={monthsLoading}
                >
                  {monthsLoading ? (
                    <option disabled>Loading months…</option>
                  ) : availablePeriods.length === 0 ? (
                    <option disabled>No AR or MEET data found</option>
                  ) : (
                    availablePeriods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-[3px] rotate-45 border-b-2 border-r-2"
                  style={{ borderColor: "#111c14" }}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── SECTION 02: Faculty Information ── */}
        <SectionCard>
          <SectionHeader
            num="02"
            title="Faculty Information"
            subtitle="Shared instructor information applied to all course entries."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_0.75fr_2fr]">
            <div>
              <FieldLabel>Faculty Name</FieldLabel>
              <input
                type="text"
                required
                disabled
                value={facultyName}
                onChange={(e) => setFacultyName(e.target.value)}
                className={inputCls + " uppercase disabled:cursor-not-allowed disabled:opacity-70"}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Faculty #</FieldLabel>
              <input
                type="text"
                placeholder="e.g. P00001"
                disabled
                value={facultyNumber}
                onChange={(e) => setFacultyNumber(e.target.value)}
                className={inputCls + " disabled:cursor-not-allowed disabled:opacity-70"}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>College / Department</FieldLabel>
              <input
                type="text"
                disabled
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                className={inputCls + " uppercase disabled:cursor-not-allowed disabled:opacity-70"}
                style={inputStyle}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── SECTION 03+: Course Blocks (Exact match to Photo Format) ── */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#111c14]">
                  Teaching Load Courses ({courses.length})
                </h3>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#f0faf5] text-[#009668] border border-[#a3d9bc]">
                  Database Connected
                </span>
              </div>
              <p className="text-[12px] text-[#8fa394] mt-0.5">
                Each course includes schedule rows, held dates, and discussed
                topics.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#a3d9bc] bg-[#f0faf5] px-3 py-2 text-[11.5px] font-semibold text-[#007a55]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4 flex-shrink-0"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Click the highlighted fields to edit your teaching load details.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncFromGoogleMeet}
                disabled={isSyncingMeet}
                className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold border border-[#009668] bg-[#f0faf5] text-[#009668] hover:bg-[#e2f5ec] transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50 active:scale-98"
                title="Sync and auto-fill latest Google Meet sessions into Teaching Load"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className={`w-3.5 h-3.5 ${isSyncingMeet ? "animate-spin" : ""}`}
                >
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                {isSyncingMeet ? "Syncing Meet…" : "Auto-fill from Meet"}
              </button>

              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(true)}
                className="px-4 py-2 rounded-xl text-[12.5px] font-bold flex items-center gap-2 transition-all shadow-sm hover:shadow active:scale-98"
                style={{
                  background:
                    "linear-gradient(135deg, #009668 0%, #00b87a 100%)",
                  color: "#ffffff",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="w-4 h-4"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Course ({unaddedCourses.length} available)
              </button>
            </div>
          </div>

          {/* ── Google Meet Autofill Notification Banner ── */}
          {autofillBanner && (
            <div className="rounded-2xl border border-[#a3d9bc] bg-[#f0faf5] p-4 flex items-start justify-between gap-3 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#009668] text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="w-4 h-4"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-[13.5px] font-bold text-[#007a55]">
                      {autofillBanner.message}
                    </h4>
                    <span className="rounded-full bg-[#009668] px-2 py-0.5 text-[10.5px] font-bold text-white">
                      Live Synced
                    </span>
                  </div>
                  {autofillBanner.details && (
                    <p className="text-[12px] text-[#4b6a55] mt-0.5 leading-relaxed">
                      {autofillBanner.details}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutofillBanner(null)}
                className="text-[#718576] hover:text-[#111c14] text-[13px] font-bold p-1 rounded-lg hover:bg-[#e2f5ec]"
                title="Dismiss banner"
              >
                ✕
              </button>
            </div>
          )}

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#a3d9bc] bg-[#fafbfa] p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#eaf4ee] flex items-center justify-center text-[#009668]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <h4 className="text-[14px] font-bold text-[#111c14]">No Teaching Load Courses Added</h4>
              <p className="text-[12.5px] text-[#718576] mt-1 max-w-md mx-auto">
                Add an assigned course subject block below or auto-fill completed sessions from Google Meet.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSyncFromGoogleMeet}
                  disabled={isSyncingMeet}
                  className="px-3.5 py-2 rounded-xl text-[12px] font-bold border border-[#009668] bg-[#f0faf5] text-[#009668] hover:bg-[#e2f5ec] transition-all flex items-center gap-1.5"
                >
                  Auto-fill from Meet
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all shadow-sm"
                  style={{
                    background: "linear-gradient(135deg, #009668 0%, #00b87a 100%)",
                  }}
                >
                  Add Course ({unaddedCourses.length} available)
                </button>
              </div>
            </div>
          ) : (
            courses.map((course, idx) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border p-6 transition-all"
              style={{
                borderColor: "#a3d9bc",
                boxShadow: "0 2px 8px 0 rgba(0,30,15,0.06)",
              }}
            >
              {/* Course Top Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-[#eef2ef] mb-5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#009668] text-white text-[12px] font-black flex items-center justify-center">
                    0{idx + 3}
                  </span>
                  <div>
                    <h4 className="text-[14px] font-bold text-[#111c14] tracking-wide">
                      COURSE {idx + 1} · {course.code}
                    </h4>
                    <p className="text-[11.5px] text-[#718576]">
                      {course.units} Units · {course.rows.length} class section
                      {course.rows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#f0faf5] px-2.5 py-1.5 text-[11px] font-bold text-[#009668]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3.5 w-3.5"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Editable
                  </span>
                  <button
                    type="button"
                    onClick={() => openClassRowModal(course.id)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[#009668] text-[#009668] hover:bg-[#f0faf5] transition-colors flex items-center gap-1.5"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      className="w-3.5 h-3.5"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Class Row
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteCourse(course.id)}
                    className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
                    title="Remove Course"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-4 h-4"
                    >
                      <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── Table 1: Official Header & Schedule Grid (Photo Format) ── */}
              <div className="overflow-x-auto">
                <table
                  className="w-full border-collapse"
                  style={{
                    border: "1.5px solid #111c14",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  <tbody>
                    {/* Top Row: COURSE [N] | [COURSE TITLE] */}
                    <tr>
                      <td
                        style={{ border: "1.5px solid #111c14" }}
                        className="w-40 sm:w-44 px-4 py-3.5 text-center font-black text-[13px] tracking-wider uppercase bg-[#fafbfa] text-[#111c14]"
                      >
                        COURSE {idx + 1}
                      </td>
                      <td
                        colSpan={5}
                        style={{ border: "1.5px solid #111c14" }}
                        className="px-4 py-3.5 font-bold text-[13.5px] sm:text-[14px] tracking-wide uppercase bg-white text-[#111c14]"
                      >
                        {course.title}
                      </td>
                    </tr>

                    {/* Column Headers Row */}
                    <tr className="bg-[#fafbfa]">
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-24 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Code
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Program, Year &amp; Section
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-20 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Units
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-32 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Days
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Time
                      </th>
                      <th
                        style={{ border: "1px solid #111c14" }}
                        className="w-32 px-3 py-2.5 text-center text-[12px] font-bold text-[#111c14]"
                      >
                        Campus
                      </th>
                    </tr>

                    {/* Data Rows */}
                    {course.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ border: "1px solid #111c14" }}
                          className="text-center py-6 text-[12.5px] text-gray-500 bg-[#fefefe]"
                        >
                          No class section schedule added yet. Click &quot;Add
                          Class Row&quot; above to add one.
                        </td>
                      </tr>
                    ) : (
                      course.rows.map((row) => (
                        <tr
                          key={row.id}
                          className="group hover:bg-[#fbfcfb] transition-colors"
                        >
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold text-[#111c14]"
                          >
                            {row.code}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-semibold text-[#111c14]"
                          >
                            {row.section}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-semibold text-[#111c14]"
                          >
                            {row.units}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold text-[#111c14] tracking-wide"
                          >
                            {row.days}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12px] font-medium text-[#111c14]"
                          >
                            {row.time}
                          </td>
                          <td
                            style={{ border: "1px solid #111c14" }}
                            className="px-3 py-3 text-center text-[12.5px] font-bold uppercase text-[#111c14]"
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span>{row.campus}</span>
                              <div className="ml-1 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openClassRowModal(course.id, row)
                                  }
                                  className="rounded p-0.5 text-[#009668] hover:bg-[#eaf4ee]"
                                  title="Edit row"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="w-3.5 h-3.5"
                                  >
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteRow(course.id, row.id)
                                  }
                                  className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  title="Remove row"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="w-3.5 h-3.5"
                                  >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Classes held Row (Full width span) */}
                    <tr>
                      <td
                        colSpan={6}
                        style={{ border: "1.5px solid #111c14" }}
                        className="px-4 py-3 bg-[#fafbfa]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[12.5px] text-[#111c14] whitespace-nowrap">
                            Classes held:
                          </span>
                          <input
                            type="date"
                            value=""
                            aria-label={`Add a class date for ${course.code}`}
                            onChange={(e) =>
                              e.target.value &&
                              updateCourseField(
                                course.id,
                                "datesHeld",
                                [
                                  ...new Set([
                                    ...getHeldDates(course.datesHeld),
                                    e.target.value,
                                  ]),
                                ]
                                  .sort()
                                  .join(","),
                              )
                            }
                            className="h-11 rounded-xl border border-[#e8eeea] bg-[#fafbfa] px-3.5 text-[12.5px] font-semibold text-[#111c14] outline-none transition-colors focus:border-[#009668] focus:bg-white"
                          />
                          <span className="text-[11.5px] font-medium text-[#718576]">
                            Select each date from the calendar
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {getHeldDates(course.datesHeld).map((date) => (
                              <span
                                key={date}
                                className="inline-flex items-center gap-1 rounded-md border border-[#a3d9bc] bg-[#f0faf5] px-2 py-1 text-[11.5px] font-semibold text-[#007a55]"
                              >
                                {formatHeldDate(date)}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCourseField(
                                      course.id,
                                      "datesHeld",
                                      getHeldDates(course.datesHeld)
                                        .filter((heldDate) => heldDate !== date)
                                        .join(","),
                                    )
                                  }
                                  className="rounded text-[#718576] hover:bg-white hover:text-red-500"
                                  aria-label={`Remove ${formatHeldDate(date)}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ── Table 2: Topics Discussed & Task/Activity Description (Photo Format) ── */}
              <div className="mt-4 overflow-x-auto">
                <table
                  className="w-full border-collapse"
                  style={{
                    border: "1.5px solid #111c14",
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="w-48 sm:w-56 px-4 py-3 text-[12.5px] font-bold text-[#111c14] bg-[#fafbfa] align-top"
                      >
                        Topics Discussed
                      </td>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="px-4 py-2.5 text-[13px] text-[#111c14] bg-white"
                      >
                        <input
                          type="text"
                          value={course.topics}
                          placeholder="e.g. DESIGNING LOG IN MODAL"
                          onChange={(e) =>
                            updateCourseField(
                              course.id,
                              "topics",
                              e.target.value,
                            )
                          }
                          className={`${inputCls} uppercase tracking-wide placeholder:normal-case placeholder:font-normal placeholder:text-gray-400`}
                          style={inputStyle}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="w-48 sm:w-56 px-4 py-3 text-[12.5px] font-bold text-[#111c14] bg-[#fafbfa] align-top"
                      >
                        Task/Activity Description
                      </td>
                      <td
                        style={{ border: "1px solid #111c14" }}
                        className="px-4 py-2.5 text-[13px] text-[#111c14] bg-white"
                      >
                        <input
                          type="text"
                          value={course.tasks}
                          placeholder="e.g. Lecture and Discussion, Activity"
                          onChange={(e) =>
                            updateCourseField(
                              course.id,
                              "tasks",
                              e.target.value,
                            )
                          }
                          className={`${inputCls} placeholder:text-gray-400`}
                          style={inputStyle}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )))}

          {/* Add Course Button */}
          <button
            type="button"
            onClick={() => setIsAddCourseModalOpen(true)}
            className="w-full py-4 rounded-2xl border-2 border-dashed font-bold text-[13px] transition-all flex items-center justify-center gap-2 hover:bg-[#f0faf5] hover:border-[#009668] active:scale-[0.995]"
            style={{ borderColor: "#a3d9bc", color: "#009668" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="w-4 h-4"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Course Subject Block ({unaddedCourses.length} available from
            your load)
          </button>
        </div>

        {/* ── SECTIONS 04 & 05: Supporting Documents & Notes ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SectionCard>
            <SectionHeader
              num="04"
              title="Supporting Attachment"
              subtitle="Upload syllabus, meeting attendance, or proof of class."
            />
            <div
              onClick={() =>
                setUploadedFile("Accomplishment_Report_Docs_Sept.pdf")
              }
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files[0]) {
                  setUploadedFile(e.dataTransfer.files[0].name);
                }
              }}
              className="rounded-xl border-2 border-dashed p-7 flex flex-col items-center justify-center cursor-pointer transition-all select-none"
              style={{
                borderColor: isDragOver ? "#009668" : "#cad5cc",
                background: isDragOver
                  ? "#eaf4ee"
                  : uploadedFile
                    ? "#f0faf5"
                    : "#fafbfa",
              }}
            >
              {uploadedFile ? (
                <>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 bg-[#d4f0e4]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#009668"
                      strokeWidth="2"
                      className="w-5 h-5"
                    >
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-bold text-[#009668]">
                    {uploadedFile}
                  </p>
                  <p className="text-[11px] mt-1 text-[#8fa394]">
                    Click to replace attached document
                  </p>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 bg-[#eaf4ee]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#009668"
                      strokeWidth="2"
                      className="w-5 h-5"
                    >
                      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="text-[13px] font-semibold text-[#3d4a41]">
                    Browse or drag proof files here
                  </p>
                  <p className="text-[11px] mt-1 text-[#8fa394]">
                    PDF · DOCX · XLS · XLSX · JPG · PNG
                  </p>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeader
              num="05"
              title="Remarks &amp; Notes"
              subtitle="Optional memo for the department checker &amp; HR officer."
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Provide any additional clarifications, make-up classes, or notes..."
              className="w-full p-4 rounded-xl border text-[13px] leading-relaxed outline-none transition-colors resize-none placeholder:text-gray-300"
              style={{
                borderColor: "#e8eeea",
                color: "#3d4a41",
                background: "#fafbfa",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#009668")}
              onBlur={(e) => (e.target.style.borderColor = "#e8eeea")}
            />
          </SectionCard>
        </div>
      </form>

      {/* ── MODAL 1: Add Course from DB ("you can't add a course if you're not in it") ── */}
      {isAddCourseModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddCourseModalOpen(false);
          }}
        >
          <div className="w-full max-w-[540px] rounded-2xl bg-white p-6 shadow-2xl border border-[#cad5cc] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[16px] font-bold text-[#111c14]">
                  Add Course from Your Teaching Load
                </h3>
                <p className="text-[12px] text-[#718576] mt-0.5">
                  You can only file records for courses assigned to your
                  department load.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-[20px] leading-none"
              >
                ✕
              </button>
            </div>

            {loadingCourses ? (
              <div className="py-8 text-center text-[13px] text-gray-500">
                Fetching your assigned courses from the database...
              </div>
            ) : availableCourses.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-gray-500 bg-gray-50 rounded-xl">
                No active courses assigned to your department in the curriculum
                catalog.
              </div>
            ) : unaddedCourses.length === 0 ? (
              <div className="py-6 px-4 text-center rounded-xl bg-[#f0faf5] border border-[#a3d9bc]">
                <p className="text-[13px] font-bold text-[#009668]">
                  All Assigned Courses Already Added
                </p>
                <p className="text-[12px] text-[#4b6a55] mt-1">
                  All {availableCourses.length} courses in your assigned load
                  are currently part of this report. You cannot add courses that
                  are not assigned to you.
                </p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto space-y-2.5 pr-1">
                {availableCourses.map((dbC) => {
                  const isAdded = courses.some(
                    (c) =>
                      c.code.trim().toUpperCase() ===
                      dbC.code.trim().toUpperCase(),
                  );
                  return (
                    <div
                      key={dbC.id || dbC.code}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isAdded
                          ? "bg-gray-50 border-gray-200 opacity-60"
                          : "bg-white border-[#cad5cc] hover:border-[#009668] hover:bg-[#fbfdfc]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#eaf4ee] text-[#009668] border border-[#a3d9bc]">
                            {dbC.code}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-500">
                            {dbC.units} Units
                          </span>
                        </div>
                        <h4 className="text-[13px] font-bold text-[#111c14] mt-1 truncate">
                          {dbC.title}
                        </h4>
                        {dbC.department_name && (
                          <p className="text-[11px] text-[#718576] truncate">
                            {dbC.department_name}
                          </p>
                        )}
                      </div>

                      {isAdded ? (
                        <span className="text-[11px] font-bold text-gray-400 px-3 py-1.5 rounded-lg bg-gray-100 whitespace-nowrap">
                          Added
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddCourseFromDb(dbC)}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-[#009668] text-white hover:bg-[#008059] transition-colors whitespace-nowrap active:scale-95"
                        >
                          + Add Course
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-[#eef2ef] flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddCourseModalOpen(false)}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Add / Edit Class Row ── */}
      {classModalCourseId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeClassRowModal();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-class-title"
            onKeyDown={(e) => e.key === "Escape" && closeClassRowModal()}
            className="w-full max-w-[460px] rounded-2xl bg-white p-6 shadow-2xl border border-[#cad5cc]"
          >
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3
                  id="add-class-title"
                  className="text-[15px] font-bold text-[#111c14]"
                >
                  {editingRowId
                    ? "Edit Class Section Row"
                    : "Add Class Section Row"}
                </h3>
                <p className="text-[11.5px] text-[#718576]">
                  Enter section, schedule days, time, and campus.
                </p>
              </div>
              <button
                type="button"
                onClick={closeClassRowModal}
                className="text-gray-400 hover:text-gray-700 text-[20px] leading-none"
              >
                ✕
              </button>
            </header>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Course Code
                  <input
                    readOnly
                    value={classRowDraft.code}
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-bold uppercase bg-gray-50 border-[#cad5cc] text-[#111c14] cursor-not-allowed"
                  />
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Units
                  <input
                    type="number"
                    min="1"
                    value={classRowDraft.units}
                    onChange={(e) =>
                      setClassRowDraft({
                        ...classRowDraft,
                        units: e.target.value,
                      })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Program
                  <select
                    required
                    autoFocus
                    value={classRowDraft.program}
                    onChange={(e) =>
                      setClassRowDraft({
                        ...classRowDraft,
                        program: e.target.value,
                      })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-2 text-[12px] font-medium uppercase border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668] bg-white"
                  >
                    <option value="">Select</option>
                    {programCodes.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Year
                  <select
                    required
                    value={classRowDraft.year}
                    onChange={(e) =>
                      setClassRowDraft({
                        ...classRowDraft,
                        year: e.target.value,
                      })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-2 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668] bg-white"
                  >
                    <option value="">Select</option>
                    {["1", "2", "3", "4"].map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Section
                  <select
                    required
                    value={classRowDraft.section}
                    onChange={(e) =>
                      setClassRowDraft({
                        ...classRowDraft,
                        section: e.target.value,
                      })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-2 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668] bg-white"
                  >
                    <option value="">Select</option>
                    {["A", "B", "C", "D"].map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                  Campus
                  <select
                    value={classRowDraft.campus}
                    onChange={(e) =>
                      setClassRowDraft({
                        ...classRowDraft,
                        campus: e.target.value,
                      })
                    }
                    className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium uppercase border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668] bg-white"
                  >
                    <option value="CONGRESS">CONGRESS</option>
                    <option value="SOUTH">SOUTH</option>
                    <option value="CAMARIN">CAMARIN</option>
                    <option value="BAGONG SILANG">BAGONG SILANG</option>
                  </select>
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e] mb-1.5">
                  Schedule Days
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OPTIONS.map((day) => {
                    const isSelected = classRowDraft.days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const nextDays = isSelected
                            ? classRowDraft.days.filter((d) => d !== day.value)
                            : [...classRowDraft.days, day.value];
                          const nextDayTimes = { ...classRowDraft.dayTimes };
                          if (isSelected) {
                            delete nextDayTimes[day.value];
                          } else {
                            nextDayTimes[day.value] = { start: "", end: "" };
                          }
                          setClassRowDraft({
                            ...classRowDraft,
                            days: nextDays,
                            dayTimes: nextDayTimes,
                          });
                        }}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          isSelected
                            ? "bg-[#009668] text-white shadow-xs"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {sortScheduleDays(classRowDraft.days).map((day) => {
                  const times = classRowDraft.dayTimes[day] ?? {
                    start: "",
                    end: "",
                  };
                  return (
                    <div key={day} className="grid grid-cols-2 gap-3">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                        {day} — Time Start
                        <input
                          required
                          type="time"
                          value={times.start}
                          onChange={(e) =>
                            setClassRowDraft({
                              ...classRowDraft,
                              dayTimes: {
                                ...classRowDraft.dayTimes,
                                [day]: {
                                  ...times,
                                  start: e.target.value,
                                },
                              },
                            })
                          }
                          className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                        />
                      </label>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#5a6b5e]">
                        {day} — Time End
                        <input
                          required
                          type="time"
                          value={times.end}
                          onChange={(e) =>
                            setClassRowDraft({
                              ...classRowDraft,
                              dayTimes: {
                                ...classRowDraft.dayTimes,
                                [day]: {
                                  ...times,
                                  end: e.target.value,
                                },
                              },
                            })
                          }
                          className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-medium border-[#cad5cc] text-[#111c14] outline-none focus:border-[#009668]"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="mt-5 flex justify-end gap-2 border-t border-[#f0f4f1] pt-4">
              <button
                type="button"
                onClick={closeClassRowModal}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveClassRow}
                disabled={!isValidClassRowDraft(classRowDraft)}
                className="rounded-xl px-5 py-2 text-[12px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "#009668" }}
              >
                {editingRowId ? "Save Changes" : "Add Row"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* ── STICKY FOOTER ── */}
      <div
        className="fixed bottom-0 left-64 right-0 z-30 px-8 py-4 flex items-center justify-between"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid #e8eeea",
          boxShadow: "0 -2px 16px 0 rgba(0,60,30,0.07)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: isRevision ? "#c0392b" : "#009668" }}
          />
          <span
            className="text-[12.5px] font-semibold"
            style={{ color: isRevision ? "#c0392b" : "#009668" }}
          >
            {isRevision
              ? `Revision Mode: ${revisionRef}`
              : "Draft automatically synchronized"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/prof")}
            className="px-5 py-2.5 rounded-xl border text-[13px] font-semibold transition-all hover:bg-[#f7f9f8] active:scale-[0.98]"
            style={{ borderColor: "#e8eeea", color: "#5a6b5e" }}
          >
            Cancel
          </button>

          <button
            type="submit"
            form="submit-form"
            disabled={isSubmitting || courses.length === 0}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-70 shadow-md cursor-pointer"
            style={{
              background: isSubmitting
                ? "#5abf97"
                : isRevision
                  ? "linear-gradient(135deg,#c0392b 0%,#e74c3c 100%)"
                  : "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
            }}
          >
            {isSubmitting ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-4 h-4 animate-spin"
                >
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" />
                </svg>
                Submitting…
              </>
            ) : isRevision ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-4 h-4"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Resubmit with Changes
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-4 h-4"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Submit Accomplishment Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}