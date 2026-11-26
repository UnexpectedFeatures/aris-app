/* eslint-disable no-empty */
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Copy,
  Check,
  Calendar,
  Clock,
  Plus,
  PhoneOff,
  Link as LinkIcon,
  Radio,
  Maximize2,
  RefreshCw,
  Fingerprint,
  Usb,
} from "lucide-react";
import { BRAND } from "@/config/navigation";
import { useAuth } from "@/app/authContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  GhostButton,
  Badge,
  Modal,
  SearchInput,
} from "@/components/ui";
import {
  saveMeetingToDb,
  fetchMeetingsFromDb,
  updateMeetingAuthOut,
} from "@/services/meetingService";
import {
  queueMeetTeachingLoadAutofill,
  parseCourseString,
  formatTime12,
  getDayAbbrev,
  type MinimalCourseInfo,
} from "@/services/meetAutofillService";
import { loadResource } from "@/services/dataSource";
import { supabase } from "@/services/supabase";
import { authenticatorApi } from "@/services/rustMiddleware";
import { useAuthenticator } from "@/services/useAuthenticator";
import { toBridgeError } from "@/data/types";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type MeetSession = {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  scheduledAt?: string;
  scheduleDate?: string;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  startedAt?: string;
  endedAt?: string;
  attended?: boolean;
  cancelled?: boolean;
  duration?: string;
  code: string;
  url: string;
  status: "Upcoming" | "In Progress" | "Completed" | "Missed";
  participantsCount?: number;
  summaryId?: string;
  authIn?: boolean;
  authOut?: boolean;
};

type VerifyPurpose = "in" | "out";
type VerifyState = {
  open: boolean;
  purpose: VerifyPurpose;
  phase: "idle" | "scanning" | "failed";
  error: string | null;
};

const SCAN_TEXT: Record<string, string> = {
  no_match: "Fingerprint not recognised.",
  scan_timeout: "No finger detected in time.",
  sensor_unavailable: "Fingerprint sensor is not connected.",
  busy: "The authenticator is busy with another operation.",
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function buildMeetUrl(codeOrUrl: string, accountEmail?: string): string {
  let target = codeOrUrl.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) {
    target = `https://meet.google.com/${target}`;
  }
  try {
    const parsed = new URL(target);
    if (accountEmail && accountEmail.includes("@")) {
      parsed.searchParams.set("authuser", accountEmail.trim());
      parsed.searchParams.set("login_hint", accountEmail.trim());
    }
    return parsed.toString();
  } catch {
    return target;
  }
}

async function openInAppMeet(url: string, title?: string, hostName?: string) {
  try {
    await invoke("open_in_app_meet", {
      url,
      title: title ?? "ARIS — Google Meet",
      hostName: hostName || undefined,
    });
  } catch (err) {
    console.warn("Tauri in-app window invoke error:", err);
  }
}

async function closeInAppMeet() {
  try {
    await invoke("close_in_app_meet");
  } catch (err) {
    console.warn("Tauri close in-app window invoke error:", err);
  }
}

/** Call Google Meet REST API via Tauri backend (bypasses CORS) to create a real meeting space */
async function createMeetSpaceViaApi(
  accessToken: string,
): Promise<{ meetingUri: string; meetingCode: string }> {
  const data = (await invoke("create_meet_space", {
    accessToken,
  })) as { meetingUri?: string; meetingCode?: string; name?: string };

  const meetingCode =
    data.meetingCode ?? data.name?.replace("spaces/", "") ?? "";
  const meetingUri =
    data.meetingUri ?? `https://meet.google.com/${meetingCode}`;

  return { meetingUri, meetingCode };
}
void createMeetSpaceViaApi;

function generateRandomCode(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const part = (len: number) =>
    Array.from({ length: len }, () =>
      letters.charAt(Math.floor(Math.random() * letters.length)),
    ).join("");
  return `${part(3)}-${part(4)}-${part(3)}`;
}

function cleanMeetCode(input: string): string {
  if (!input) return "";
  const match = input.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  if (match) return match[1].toLowerCase();

  let clean = input.trim().replace(/^https?:\/\/meet\.google\.com\//i, "");
  clean = clean
    .split("?")[0]
    .replace(/[^a-zA-Z-]/g, "")
    .toLowerCase();
  return clean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    const remainingMins = mins % 60;
    return `${hrs}:${remainingMins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

function parseManilaDateTime(
  dateValue?: string | null,
  timeValue?: string | null,
): Date | null {
  const dateMatch = dateValue?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = timeValue?.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second = "0"] = timeMatch;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const numericSecond = Number(second);
  if (
    numericMonth < 1 ||
    numericMonth > 12 ||
    numericDay < 1 ||
    numericHour > 23 ||
    numericMinute > 59 ||
    numericSecond > 59
  ) {
    return null;
  }

  const result = new Date(
    Date.UTC(
      numericYear,
      numericMonth - 1,
      numericDay,
      numericHour - 8,
      numericMinute,
      numericSecond,
    ),
  );
  const manilaDate = new Date(result.getTime() + 8 * 60 * 60_000);
  if (
    manilaDate.getUTCFullYear() !== numericYear ||
    manilaDate.getUTCMonth() !== numericMonth - 1 ||
    manilaDate.getUTCDate() !== numericDay ||
    manilaDate.getUTCHours() !== numericHour ||
    manilaDate.getUTCMinutes() !== numericMinute ||
    manilaDate.getUTCSeconds() !== numericSecond
  ) {
    return null;
  }
  return result;
}

function getMeetingScheduleRange(meeting: MeetSession) {
  const start = parseManilaDateTime(
    meeting.scheduleDate,
    meeting.scheduleStartTime,
  );
  const end = parseManilaDateTime(
    meeting.scheduleDate,
    meeting.scheduleEndTime,
  );
  return start && end && end > start ? { start, end } : null;
}

function findMeetingConflict(
  start: Date,
  end: Date,
  meetings: MeetSession[],
  excludeMeetingId?: string,
): MeetSession | undefined {
  return meetings.find((meeting) => {
    if (
      meeting.id === excludeMeetingId ||
      meeting.cancelled
    ) {
      return false;
    }

    const range = getMeetingScheduleRange(meeting);
    return Boolean(range && start < range.end && end > range.start);
  });
}

function getCourseUnits(
  selectedCourse: string,
  courses: MinimalCourseInfo[],
): number | null {
  const selectedCode = selectedCourse.split("·", 1)[0].trim().toLowerCase();
  const course = courses.find(
    (item) => item.code.trim().toLowerCase() === selectedCode,
  );
  if (!course || String(course.units ?? "").trim() === "") return null;

  const units = Number(course.units);
  return Number.isFinite(units) && units >= 0 ? units : null;
}

function computeCourseEndTime(
  startTime: string,
  units: number,
): { endTime: string; crossesMidnight: boolean } | null {
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  if (startHour > 23 || startMinute > 59) return null;

  const durationMinutes = Math.round(units * 60);
  if (!Number.isFinite(durationMinutes)) return null;
  const startMinutes = startHour * 60 + startMinute;
  const totalMinutes = startMinutes + durationMinutes;
  const minutesAfterMidnight = totalMinutes % (24 * 60);
  const hours = Math.floor(minutesAfterMidnight / 60);
  const minutes = minutesAfterMidnight % 60;
  const endHour = String(hours).padStart(2, "0");
  const endMinute = String(minutes).padStart(2, "0");

  return {
    endTime: `${endHour}:${endMinute}`,
    crossesMidnight: totalMinutes >= 24 * 60,
  };
}

function formatManilaTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getScheduledMeetingStatus(
  meetingDate: string,
  startTime: string,
  endTime: string,
  startedAt: string | undefined,
  endedAt: string | undefined,
  attended: boolean,
  fallbackStatus: MeetSession["status"],
  now = new Date(),
): MeetSession["status"] {
  const pastStatus = attended ? "Completed" : "Missed";
  const parseTimestamp = (value: string | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const parseLocalDateTime = (time: string) => {
    const dateMatch = meetingDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!dateMatch || !timeMatch) return null;

    const [, year, month, day] = dateMatch;
    const [, hour, minute, second = "0"] = timeMatch;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day) ||
      Number(hour) > 23 ||
      Number(minute) > 59 ||
      Number(second) > 59
    ) {
      return null;
    }
    return date;
  };

  const start = parseTimestamp(startedAt) ?? parseLocalDateTime(startTime);
  const end = parseTimestamp(endedAt) ?? parseLocalDateTime(endTime);
  if (start && end) {
    if (now < start) return "Upcoming";
    return now < end ? "In Progress" : pastStatus;
  }
  if (start) return now < start ? "Upcoming" : pastStatus;
  if (end) return now < end ? "Upcoming" : pastStatus;

  const dateMatch = meetingDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const meetingDay = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    );
    if (
      meetingDay.getFullYear() === Number(year) &&
      meetingDay.getMonth() === Number(month) - 1 &&
      meetingDay.getDate() === Number(day)
    ) {
      const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      return meetingDay < today ? pastStatus : "Upcoming";
    }
  }

  return fallbackStatus;
}

function getMeetingBadgeStatus(
  meeting: MeetSession,
  now: Date,
): MeetSession["status"] {
  if (meeting.cancelled) {
    return meeting.status;
  }

  const range = getMeetingScheduleRange(meeting);
  if (range && now >= range.start && now < range.end) {
    return "In Progress";
  }

  if (
    meeting.scheduleDate &&
    meeting.scheduleStartTime &&
    meeting.scheduleEndTime
  ) {
    return getScheduledMeetingStatus(
      meeting.scheduleDate,
      meeting.scheduleStartTime,
      meeting.scheduleEndTime,
      meeting.startedAt,
      meeting.endedAt,
      meeting.attended === true,
      meeting.status,
      now,
    );
  }

  return meeting.status;
}

type MeetingFilter =
  | "All"
  | "Upcoming"
  | "Ongoing"
  | "Completed"
  | "Missed";

type MeetingsHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  meetings: MeetSession[];
  now: Date;
};

const meetingFilters: MeetingFilter[] = [
  "All",
  "Upcoming",
  "Ongoing",
  "Completed",
  "Missed",
];

function getMeetingDate(meeting: MeetSession): Date | null {
  if (meeting.scheduledAt) {
    const scheduledDate = new Date(meeting.scheduledAt);
    if (!Number.isNaN(scheduledDate.getTime())) return scheduledDate;
  }

  const date =
    meeting.date === "Today" ? new Date() : new Date(meeting.date);
  if (Number.isNaN(date.getTime())) return null;

  const timeMatch = meeting.time.match(
    /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
  );
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const meridiem = timeMatch[4]?.toUpperCase();
    if (meridiem) {
      hour %= 12;
      if (meridiem === "PM") hour += 12;
    }
    date.setHours(hour, Number(timeMatch[2]), Number(timeMatch[3] || 0), 0);
  }
  return date;
}

function getMeetingTimestamp(meeting: MeetSession): number {
  return getMeetingDate(meeting)?.getTime() ?? 0;
}

function isSameMeetingDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getMeetingDateGroup(date: Date | null, now: Date): string {
  if (!date) return "Date unavailable";
  if (isSameMeetingDay(date, now)) return "Today";

  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  if (date >= weekStart && date < nextWeek) return "This week";

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getMeetingStatusLabel(status: MeetSession["status"]): string {
  return status === "In Progress" ? "Ongoing" : status;
}

function getMeetingStatusTone(
  status: MeetSession["status"],
): "green" | "amber" | "gray" {
  if (status === "Missed") return "gray";
  if (status === "In Progress") return "amber";
  return "green";
}

function getMeetingFilterCount(
  meetings: MeetSession[],
  filter: MeetingFilter,
  now: Date,
): number {
  if (filter === "All") return meetings.length;
  return meetings.filter((meeting) =>
    matchesMeetingFilter(meeting, filter, now),
  ).length;
}

function matchesMeetingFilter(
  meeting: MeetSession,
  filter: MeetingFilter,
  now: Date,
): boolean {
  if (filter === "All") return true;
  const status = getMeetingBadgeStatus(meeting, now);
  if (filter === "Ongoing") return status === "In Progress";
  return status === filter;
}

function MeetingsHistoryModal({
  isOpen,
  onClose,
  meetings,
  now,
}: MeetingsHistoryModalProps) {
  const [activeFilter, setActiveFilter] = useState<MeetingFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredMeetings = meetings
    .filter((meeting) => matchesMeetingFilter(meeting, activeFilter, now))
    .filter(
      (meeting) =>
        !query ||
        `${meeting.title} ${meeting.course}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => {
      const direction =
        activeFilter === "Upcoming" || activeFilter === "Ongoing" ? 1 : -1;
      return direction * (getMeetingTimestamp(a) - getMeetingTimestamp(b));
    });

  const groups: { title: string; meetings: MeetSession[] }[] = [];
  filteredMeetings.forEach((meeting) => {
    const title = getMeetingDateGroup(getMeetingDate(meeting), now);
    const group = groups[groups.length - 1];
    if (group?.title === title) {
      group.meetings.push(meeting);
    } else {
      groups.push({ title, meetings: [meeting] });
    }
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="All Meetings"
      size="lg"
      align="left"
      actions={
        <div className="flex w-full justify-end">
          <GhostButton onClick={onClose}>Close</GhostButton>
        </div>
      }
    >
      <div className="w-full space-y-4">
        <SearchInput
          placeholder="Search title, course, or section..."
          value={searchQuery}
          onChange={setSearchQuery}
          className="w-full"
        />

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-[#f0f2f0] p-0.5">
          {meetingFilters.map((filter) => {
            const selected = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveFilter(filter)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background: selected ? "#fff" : "transparent",
                  color: selected ? "#111c14" : "#8fa394",
                  boxShadow: selected ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {filter}
                <span className="text-[11px] tabular-nums">
                  {getMeetingFilterCount(meetings, filter, now)}
                </span>
              </button>
            );
          })}
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dce3df] px-4 py-10 text-center">
            <p className="text-[13px] font-semibold text-[#111c14]">
              No meetings found
            </p>
            <p className="mt-1 text-[12px] text-[#8fa394]">
              Try another status or search term.
            </p>
          </div>
        ) : (
          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((group) => (
              <section key={group.title}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8fa394]">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.meetings.map((meeting) => {
                    const date = getMeetingDate(meeting);
                    return (
                      <div
                        key={meeting.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[#dce3df] bg-[#f7f9f8] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-[#111c14]">
                            {meeting.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11.5px] text-[#5a6b5e]">
                            {meeting.course}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#8fa394]">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {date
                                ? isSameMeetingDay(date, now)
                                  ? "Today"
                                  : date.toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                : meeting.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {meeting.time}
                            </span>
                          </div>
                        </div>
                        <Badge
                          tone={getMeetingStatusTone(
                            getMeetingBadgeStatus(meeting, now),
                          )}
                          dot
                        >
                          {getMeetingStatusLabel(
                            getMeetingBadgeStatus(meeting, now),
                          )}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

export default function ProfMeet() {
  const { user } = useAuth();

  // Authenticator (USB fingerprint device)
  const auth = useAuthenticator();
  const { status: authStatus } = auth;
  const authConnected = authStatus.connected && !!authStatus.device;
  const [authPort, setAuthPort] = useState("");

  useEffect(() => {
    if (authStatus.connected && authStatus.portName) {
      setAuthPort(authStatus.portName);
    } else if (!authStatus.connected) {
      setAuthPort("");
    }
  }, [authStatus.connected, authStatus.portName]);

  // Connected OAuth Account Details
  const oauthEmail =
    user.email ||
    sessionStorage.getItem("aris-google-email") ||
    localStorage.getItem("aris-last-oauth-email") ||
    "professor@ucc.edu.ph";

  const oauthName = user.name || "Professor";

  // Meetings List State — strictly loaded from database
  const [meetings, setMeetings] = useState<MeetSession[]>(() => {
    try {
      const saved = localStorage.getItem("aris:meet_sessions");
      if (saved) {
        const parsed = JSON.parse(saved) as MeetSession[];
        return parsed.filter(
          (m) =>
            m.id &&
            !m.id.startsWith("m-") &&
            m.id !== "m01" &&
            m.id !== "m02" &&
            m.code !== "xyt-omwb-qsk" &&
            m.code !== "pqa-vrbn-mto" &&
            m.code !== "gkc-qrfz-dxy" &&
            m.code !== "nbv-tzxa-wql",
        );
      }
      return [];
    } catch {
      return [];
    }
  });
  const [statusClock, setStatusClock] = useState(() => Date.now());
  const statusNow = new Date(statusClock);

  // Join by code state
  const [joinInput, setJoinInput] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Courses for Teaching Load allocation
  const [availableCourses, setAvailableCourses] = useState<MinimalCourseInfo[]>(
    [],
  );
  const [instantCourse, setInstantCourse] = useState("");

  // Load professor's assigned curriculum courses
  useEffect(() => {
    let isCancelled = false;
    async function loadCourses() {
      let list: MinimalCourseInfo[] = [];
      try {
        const res = await loadResource<MinimalCourseInfo[]>(
          `/professor/courses?email=${encodeURIComponent(user.email)}`,
          [],
        );
        if (Array.isArray(res) && res.length > 0) list = res;
      } catch {}
      if (list.length === 0 && supabase) {
        try {
          const { data } = await supabase
            .from("curriculum_courses")
            .select("code, title, units")
            .eq("is_active", true)
            .order("code", { ascending: true });
          if (data && data.length > 0) list = data;
        } catch {}
      }
      if (!isCancelled) {
        setAvailableCourses(list);
        if (list.length > 0) {
          setInstantCourse((prev) => prev || list[0].code);
          setSchedCourse((prev) => prev || list[0].code);
        }
      }
    }
    loadCourses();
    return () => {
      isCancelled = true;
    };
  }, [user.email]);

  // Active call state
  const [activeCall, setActiveCall] = useState<{
    id: string;
    title: string;
    course: string;
    code: string;
    url: string;
    startedAt: number;
    elapsedSeconds: number;
    authIn: boolean;
  } | null>(null);

  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;

  const isEndingCallRef = useRef(false);

  // Fingerprint verification modal state
  const [verify, setVerify] = useState<VerifyState>({
    open: false,
    purpose: "in",
    phase: "idle",
    error: null,
  });
  const verifyResolveRef = useRef<((ts: string | null) => void) | null>(null);
  const scanIdRef = useRef(0);

  // Hardware AV Test state
  const [isAvTesting, setIsAvTesting] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [avError, setAvError] = useState<string | null>(null);

  // Live Meet Caption & Transcript State
  const [liveTranscript, setLiveTranscript] = useState<
    { who: string; text: string; t: string }[]
  >([]);
  const liveTranscriptRef = useRef<{ who: string; text: string; t: string }[]>(
    [],
  );
  liveTranscriptRef.current = liveTranscript;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Schedule Modal State
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isMeetingsHistoryOpen, setIsMeetingsHistoryOpen] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedCourse, setSchedCourse] = useState("");
  const [schedDate, setSchedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [schedStartTime, setSchedStartTime] = useState("14:00");
  const [schedEndTime, setSchedEndTime] = useState("15:00");
  const [schedNotes, setSchedNotes] = useState("");
  const [schedCustomCode, setSchedCustomCode] = useState("");
  const selectedCourseUnits = getCourseUnits(schedCourse, availableCourses);
  const computedCourseEnd = selectedCourseUnits === null
    ? null
    : computeCourseEndTime(schedStartTime, selectedCourseUnits);
  const computedEndTime = computedCourseEnd?.endTime ?? null;
  const crossesMidnight = computedCourseEnd?.crossesMidnight ?? false;

  useEffect(() => {
    if (computedEndTime !== null) setSchedEndTime(computedEndTime);
  }, [schedCourse, schedStartTime, selectedCourseUnits, computedEndTime]);

  useEffect(() => {
    if (isScheduleOpen && crossesMidnight) {
      setToastMessage(
        "Course duration crosses midnight. Choose an earlier start time.",
      );
    }
  }, [isScheduleOpen, schedCourse, schedStartTime, crossesMidnight]);

  /* ─── Fingerprint verification ───────────────────────────────────────────── */

  const runScan = async () => {
    const id = ++scanIdRef.current;
    setVerify((v) => ({ ...v, phase: "scanning", error: null }));
    try {
      await authenticatorApi.send("match", { timeoutMs: 10000 });
      if (id !== scanIdRef.current) return;
      const ts = new Date().toISOString();
      const resolve = verifyResolveRef.current;
      verifyResolveRef.current = null;
      setVerify((v) => ({ ...v, open: false, phase: "idle", error: null }));
      resolve?.(ts);
    } catch (e) {
      if (id !== scanIdRef.current) return;
      const err = toBridgeError(e);
      setVerify((v) => ({
        ...v,
        phase: "failed",
        error: SCAN_TEXT[err.code] ?? err.message,
      }));
    }
  };

  /** Opens the verify modal and auto-starts a scan. Resolves with an ISO timestamp, or null if cancelled/skipped. */
  const requestVerify = (purpose: VerifyPurpose) =>
    new Promise<string | null>((resolve) => {
      verifyResolveRef.current = resolve;
      setVerify({ open: true, purpose, phase: "idle", error: null });
      void runScan();
    });

  const cancelVerify = () => {
    scanIdRef.current++; // invalidate any in-flight scan
    void authenticatorApi.send("cancel").catch(() => {});
    const resolve = verifyResolveRef.current;
    verifyResolveRef.current = null;
    setVerify((v) => ({ ...v, open: false, phase: "idle", error: null }));
    resolve?.(null);
  };

  /* ─── Effects ────────────────────────────────────────────────────────────── */

  // Live Timer & dynamic meeting code detection for active call
  useEffect(() => {
    if (!activeCall) return;
    const interval = setInterval(async () => {
      setActiveCall((prev) =>
        prev
          ? {
              ...prev,
              elapsedSeconds: Math.floor((Date.now() - prev.startedAt) / 1000),
            }
          : null,
      );

      // Periodically check if Google has allocated the real room code
      const currentCall = activeCallRef.current;
      if (
        currentCall &&
        (!currentCall.code ||
          currentCall.code === "Connecting..." ||
          !currentCall.code.includes("-"))
      ) {
        try {
          const detected = await invoke<string | null>("get_in_app_meet_code");
          if (detected && detected.includes("-")) {
            const clean = cleanMeetCode(detected);
            if (clean) {
              setActiveCall((prev) =>
                prev && prev.code !== clean
                  ? {
                      ...prev,
                      code: clean,
                      url: buildMeetUrl(clean, oauthEmail),
                    }
                  : prev,
              );
            }
          }
        } catch {
          // non-blocking
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [Boolean(activeCall), oauthEmail]);

  // Listen for real Google Meet code captured from WebView2
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    listen<string>("meet-code-detected", (event) => {
      const realCode = cleanMeetCode(event.payload || "");
      if (!realCode) return;

      setActiveCall((prev) => {
        if (!prev) return null;
        if (prev.code === realCode) return prev;
        return {
          ...prev,
          code: realCode,
          url: buildMeetUrl(realCode, oauthEmail),
        };
      });

      setToastMessage(`Google Meet room confirmed: ${realCode}`);
    }).then((fn) => {
      if (isCancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, [oauthEmail]);

  // Listen for real-time live caption chunks captured from Google Meet WebView
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    listen<{ who: string; text: string; t: string }>(
      "meet-transcript-chunk",
      (event) => {
        if (!event.payload || !event.payload.text) return;
        console.log(
          `%c[ARIS FRONTEND] 🎙️ CAPTION RECEIVED: [${event.payload.t}] ${event.payload.who}: ${event.payload.text}`,
          "color: #16a34a; font-weight: bold;",
        );
        setLiveTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (
            last &&
            last.who === event.payload.who &&
            last.text === event.payload.text
          ) {
            return prev;
          }
          return [...prev, event.payload];
        });
      },
    ).then((fn) => {
      if (isCancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Clean up AV stream on unmount
  useEffect(() => {
    return () => {
      stopAvTest();
    };
  }, []);

  // Fetch purely real meeting records from database
  const loadDbMeetings = async () => {
    try {
      const dbRecords = await fetchMeetingsFromDb();
      const mapped: MeetSession[] = (dbRecords || []).map((raw) => {
        const r = raw;
        const startStr = r.started_at ? new Date(r.started_at) : null;
        const endStr = r.ended_at ? new Date(r.ended_at) : null;
        const localStartStr = r.meeting_date
          ? new Date(
              `${r.meeting_date.split("T")[0]}T${r.start_time || "00:00:00"}`,
            )
          : null;
        const scheduledStart =
          startStr && !Number.isNaN(startStr.getTime())
            ? startStr
            : localStartStr && !Number.isNaN(localStartStr.getTime())
              ? localStartStr
              : null;
        const timeDisplay =
          startStr &&
          endStr &&
          !isNaN(startStr.getTime()) &&
          !isNaN(endStr.getTime())
            ? `${startStr.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${endStr.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : `${r.start_time || ""} – ${r.end_time || ""}`;

        const durFormatted = r.duration_seconds
          ? formatDuration(r.duration_seconds)
          : `${r.duration_minutes || 0}m`;

        let dateDisplay = "Recent";
        if (r.meeting_date) {
          const todayStr = new Date().toISOString().split("T")[0];
          const meetStr =
            typeof r.meeting_date === "string"
              ? r.meeting_date.split("T")[0]
              : "";
          if (meetStr === todayStr) {
            dateDisplay = "Today";
          } else {
            const d = new Date(r.meeting_date);
            dateDisplay = !isNaN(d.getTime())
              ? d.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : String(r.meeting_date);
          }
        } else if (startStr && !isNaN(startStr.getTime())) {
          dateDisplay = startStr.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }

        const cancelled =
          r.status?.toLowerCase() === "cancelled" ||
          r.status?.toLowerCase() === "canceled";
        const fallbackStatus = (r.status === "scheduled"
          ? "Upcoming"
          : r.status === "in_progress"
            ? "In Progress"
            : "Completed") as MeetSession["status"];

        return {
          id: r.id,
          title: r.name || "Google Meet Session",
          course: r.course || "General Consultation",
          date: dateDisplay,
          time: timeDisplay,
          scheduledAt: scheduledStart?.toISOString(),
          scheduleDate: r.meeting_date,
          scheduleStartTime: r.start_time,
          scheduleEndTime: r.end_time,
          startedAt: r.started_at ?? undefined,
          endedAt: r.ended_at ?? undefined,
          attended: r.auth_in === true,
          cancelled,
          duration: durFormatted,
          code: r.meeting_code || "meet",
          url:
            r.meeting_url ||
            (r.meeting_code
              ? `https://meet.google.com/${r.meeting_code}`
              : "https://meet.google.com"),
          status: cancelled
            ? fallbackStatus
            : getScheduledMeetingStatus(
                r.meeting_date,
                r.start_time,
                r.end_time,
                r.started_at,
                r.ended_at,
                r.auth_in === true,
                fallbackStatus,
              ),
          participantsCount: 1,
          authIn: r.auth_in === true,
          authOut: r.auth_out === true,
        };
      });

      setMeetings(mapped);
      try {
        localStorage.setItem("aris:meet_sessions", JSON.stringify(mapped));
      } catch {}
    } catch (err) {
      console.warn("Failed to load meetings from database:", err);
    }
  };

  useEffect(() => {
    void loadDbMeetings();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setStatusClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  /* ─── Hardware Check Handlers ────────────────────────────────────────────── */

  const startAvTest = async () => {
    setAvError(null);
    try {
      if (streamRef.current) {
        stopAvTest();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
      setIsAvTesting(true);
      setCameraOn(true);
      setMicOn(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Camera / mic access denied or unavailable";
      setAvError(msg);
      setIsAvTesting(false);
    }
  };

  const stopAvTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsAvTesting(false);
    setAudioLevel(0);
  };

  const toggleCamera = () => {
    if (!streamRef.current) return;
    const videoTracks = streamRef.current.getVideoTracks();
    const nextState = !cameraOn;
    videoTracks.forEach((t) => (t.enabled = nextState));
    setCameraOn(nextState);
  };

  const toggleMic = () => {
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    const nextState = !micOn;
    audioTracks.forEach((t) => (t.enabled = nextState));
    setMicOn(nextState);
  };

  /* ─── Call Actions (Using Captured OAuth Account) ────────────────────────── */

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      setToastMessage(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      setToastMessage("Copied!");
    }
  };

  const handleStartInstant = async () => {
    if (activeCallRef.current || verify.open) return;

    const verifiedAt = await requestVerify("in");
    if (!verifiedAt) return;

    isEndingCallRef.current = false;
    setLiveTranscript([]);
    void invoke("clear_in_app_meet_transcript").catch(() => {});
    const url = buildMeetUrl("new", oauthEmail);
    const windowTitle = `ARIS Google Meet — ${oauthName} (${oauthEmail})`;

    // Launch inside ARIS native in-app window with the captured OAuth account
    await openInAppMeet(url, windowTitle, oauthName);

    const courseForMeeting =
      instantCourse || (availableCourses[0]?.code ?? "Online Class");
    const courseCodeOnly = courseForMeeting.split(/[·\-–]/)[0].trim();

    setActiveCall({
      id: "instant-" + Date.now(),
      title: `${courseCodeOnly} Online Class Session`,
      course: courseForMeeting,
      code: "Connecting...",
      url,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      authIn: true,
    });

    setToastMessage(
      `Verified. Google Meet connecting for ${courseForMeeting}...`,
    );
  };

  const handleJoinWithCode = async (customCode?: string) => {
    const raw = customCode ?? joinInput;
    const clean = cleanMeetCode(raw);
    if (!clean) {
      setToastMessage("Please enter a valid meeting code or link.");
      return;
    }

    if (activeCallRef.current || verify.open) return;

    const verifiedAt = await requestVerify("in");
    if (!verifiedAt) return;

    isEndingCallRef.current = false;
    setLiveTranscript([]);
    void invoke("clear_in_app_meet_transcript").catch(() => {});
    const url = buildMeetUrl(clean, oauthEmail);
    const windowTitle = `ARIS Meeting (${clean}) — ${oauthEmail}`;

    await openInAppMeet(url, windowTitle, oauthName);

    setActiveCall({
      id: "join-" + Date.now(),
      title: `Meeting (${clean})`,
      course: instantCourse || (availableCourses[0]?.code ?? "Online Class"),
      code: clean,
      url,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      authIn: true,
    });

    setJoinInput("");
    setToastMessage(`Joined meet.google.com/${clean} as ${oauthEmail}`);
  };

  const handleEndActiveCall = async () => {
    if (isEndingCallRef.current) return;
    const currentCall = activeCallRef.current;
    if (!currentCall) return;

    // Immediately acquire lock & clear active call state so no duplicate triggers can execute
    isEndingCallRef.current = true;
    activeCallRef.current = null;
    setActiveCall(null);

    // Capture the end time now so the verification wait is not counted in the duration
    const endedAtMs = Date.now();

    try {
      // Check if we can capture the final real room code before destroying window
      let realCode = currentCall.code;
      if (
        !realCode ||
        realCode === "Connecting..." ||
        !realCode.includes("-")
      ) {
        try {
          const detected = await invoke<string | null>("get_in_app_meet_code");
          if (detected) {
            const clean = cleanMeetCode(detected);
            if (clean) realCode = clean;
          }
        } catch {}
      }

      // Close in-app meeting window
      await closeInAppMeet();

      // Retrieve full captured transcript from Tauri backend
      let finalTranscript: { who: string; text: string; t: string }[] = [];
      try {
        finalTranscript = await invoke<
          { who: string; text: string; t: string }[]
        >("get_in_app_meet_transcript");
      } catch {
        finalTranscript = liveTranscriptRef.current;
      }
      if (!finalTranscript || finalTranscript.length === 0) {
        finalTranscript = liveTranscriptRef.current;
      }

      const participants = Array.from(
        new Set(
          [oauthName, ...finalTranscript.map((t) => t.who)].filter(Boolean),
        ),
      );
      const transcriptSource = finalTranscript
        .map((t) => `${t.t} - ${t.who}: ${t.text}`)
        .join("\n");
      const wordCount = transcriptSource
        ? transcriptSource.split(/\s+/).filter(Boolean).length
        : 0;

      const durationSeconds = currentCall.elapsedSeconds;
      const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
      const startedAtDate = new Date(currentCall.startedAt);
      const endedAtDate = new Date(endedAtMs);

      const realUrl = buildMeetUrl(realCode, oauthEmail);

      // Parse course & section info for Teaching Load autofill
      const rawCourse =
        currentCall.course ||
        instantCourse ||
        (availableCourses[0]?.code ?? "");
      const parsedCourse = parseCourseString(rawCourse, availableCourses);
      const meetingDay = getDayAbbrev(startedAtDate);
      const meetingTime = `${formatTime12(startedAtDate)} – ${formatTime12(endedAtDate)}`;
      const meetingDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
      }).format(startedAtDate);
      const autofillTopic =
        currentCall.title &&
        !currentCall.title.startsWith("Instant Class") &&
        !currentCall.title.startsWith("Meeting (")
          ? currentCall.title.trim().toUpperCase()
          : `${parsedCourse.courseCode} ONLINE CLASS LECTURE & DISCUSSION`;
      const autofillTask = "Lecture and Discussion, Activity";

      console.log(
        "\n================== [ARIS FRONTEND] 🏁 SAVING MEETING & QUEUING TEACHING LOAD ==================",
      );
      console.log("Meeting Code:", realCode);
      console.log("Allocated Course:", parsedCourse);
      console.log("Held Date:", meetingDateStr);
      console.log("Meeting Time:", meetingTime);
      console.log("Total Transcript Lines:", finalTranscript.length);
      console.log(
        "============================================================================================\n",
      );

      // Auto-queue teaching load autofill for Submit page (scoped to authenticated professor)
      queueMeetTeachingLoadAutofill(
        {
          id: `meet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          meetingId: currentCall.id,
          userEmail: user?.email || oauthEmail,
          userId: user?.id,
          courseCode: parsedCourse.courseCode,
          courseTitle: parsedCourse.courseTitle,
          section: parsedCourse.section,
          units: parsedCourse.units,
          meetingDate: meetingDateStr,
          meetingDay,
          meetingTime,
          meetingCode: realCode,
          durationMinutes,
          topics: autofillTopic,
          tasks: autofillTask,
          campus: "CONGRESS",
          createdAt: new Date().toISOString(),
        },
        user?.email || oauthEmail,
      );

      // Save to backend first (auth_out is attached afterwards) so the record
      // exists even if verification is skipped or the app closes mid-scan.
      let savedId: string | undefined;
      try {
        const saved = await saveMeetingToDb({
          title: currentCall.title,
          name: currentCall.title,
          course: `${parsedCourse.courseCode} · ${parsedCourse.section}`,
          meeting_code: realCode,
          meeting_url: realUrl,
          started_at: startedAtDate.toISOString(),
          ended_at: endedAtDate.toISOString(),
          duration_seconds: durationSeconds,
          duration_minutes: durationMinutes,
          start_time: startedAtDate.toTimeString().split(" ")[0],
          end_time: endedAtDate.toTimeString().split(" ")[0],
          meeting_date: meetingDateStr,
          status: finalTranscript.length > 0 ? "summarized" : "completed",
          user_email: oauthEmail,
          professor_id: user?.id,
          info: `Google Meet hosted by ${oauthName} (${oauthEmail})`,
          transcript: finalTranscript.length > 0 ? finalTranscript : undefined,
          transcript_source: transcriptSource || undefined,
          participants: participants.length > 0 ? participants : undefined,
          word_count: wordCount > 0 ? wordCount : undefined,
          auth_in: currentCall.authIn,
        });
        savedId = saved?.id;
      } catch (err) {
        console.warn("DB save meeting failed:", err);
      }

      await loadDbMeetings();

      // Time-out verification. Skipping leaves auth_out empty; the history row
      // then shows a "Verify Time Out" fail-safe button.
      let timedOut = false;
      if (savedId && currentCall.authIn) {
        const authOut = await requestVerify("out");
        if (authOut) {
          try {
            await updateMeetingAuthOut(savedId);
            timedOut = true;
          } catch (err) {
            console.warn("auth_out save failed:", err);
          }
          await loadDbMeetings();
        }
      }

      setToastMessage(
        timedOut
          ? `Call ended (${realCode}). Time out verified.`
          : currentCall.authIn
            ? `Call ended (${realCode}). Time out not verified.`
            : `Call ended (${realCode}). Auto-added ${parsedCourse.courseCode} to Teaching Load on Submit page!`,
      );
    } finally {
      isEndingCallRef.current = false;
    }
  };

  // Automatically end the active session in ARIS when Google Meet window is closed or call ends
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isCancelled = false;

    listen("meet-session-ended", () => {
      if (activeCallRef.current && !isEndingCallRef.current) {
        void handleEndActiveCall();
      }
    }).then((fn) => {
      if (isCancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleScheduleSubmit = async () => {
    if (!schedTitle.trim()) {
      setToastMessage("Please provide a title for the meeting.");
      return;
    }

    const courseEnd =
      selectedCourseUnits === null
        ? null
        : computeCourseEndTime(schedStartTime, selectedCourseUnits);
    if (selectedCourseUnits !== null && !courseEnd) {
      setToastMessage("Enter a valid start time.");
      return;
    }
    if (courseEnd?.crossesMidnight) {
      setToastMessage(
        "Course duration crosses midnight. Choose an earlier start time.",
      );
      return;
    }

    const endTime = schedEndTime;
    const newStart = parseManilaDateTime(schedDate, schedStartTime);
    const newEnd = parseManilaDateTime(schedDate, endTime);
    if (!newStart || !newEnd) {
      setToastMessage("Enter a valid meeting date and time.");
      return;
    }
    if (newEnd <= newStart) {
      setToastMessage("End time must be after start time.");
      return;
    }

    const conflict = findMeetingConflict(newStart, newEnd, meetings);
    if (conflict) {
      const conflictRange = getMeetingScheduleRange(conflict);
      if (conflictRange) {
        setToastMessage(
          `This time conflicts with "${conflict.title}" (${formatManilaTime(
            conflictRange.start,
          )} – ${formatManilaTime(conflictRange.end)}).`,
        );
        return;
      }
    }

    const customClean = cleanMeetCode(schedCustomCode);
    const code = customClean || generateRandomCode();
    const newSession: MeetSession = {
      id: "sched-" + Date.now(),
      title: schedTitle.trim(),
      course: schedCourse,
      date: schedDate,
      time: `${schedStartTime} – ${endTime}`,
      scheduleDate: schedDate,
      scheduleStartTime: schedStartTime,
      scheduleEndTime: endTime,
      duration: "1h 00m",
      code,
      url: buildMeetUrl(code, oauthEmail),
      status: "Upcoming",
      participantsCount: 0,
    };

    try {
      const durationMinutes = Math.round(
        (newEnd.getTime() - newStart.getTime()) / 60_000,
      );
      const saved = await saveMeetingToDb({
        title: schedTitle.trim(),
        name: schedTitle.trim(),
        course: schedCourse,
        meeting_code: code,
        meeting_url: newSession.url,
        started_at: newStart.toISOString(),
        ended_at: newEnd.toISOString(),
        start_time: schedStartTime,
        end_time: endTime,
        meeting_date: schedDate,
        duration_minutes: durationMinutes,
        duration_seconds: durationMinutes * 60,
        status: "scheduled",
        info: schedNotes,
        user_email: oauthEmail,
        professor_id: user?.id,
      });
      if (saved?.id) {
        newSession.id = saved.id;
      }
    } catch (err) {
      console.warn("DB schedule meeting failed:", err);
    }

    await loadDbMeetings();
    setIsScheduleOpen(false);
    setSchedTitle("");
    setSchedNotes("");
    setSchedCustomCode("");
    setToastMessage(
      `Scheduled "${newSession.title}" (code: ${code}) and saved to database!`,
    );
  };

  /* Filtered Meetings */
  const getScheduledTimestamp = (meeting: MeetSession) => {
    const timestamp = meeting.scheduledAt
      ? new Date(meeting.scheduledAt).getTime()
      : Number.NaN;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };
  const upcomingMeetings = [
    ...meetings
      .filter(
        (meeting) =>
          meeting.status === "Upcoming" || meeting.status === "In Progress",
      )
      .sort(
        (a, b) => getScheduledTimestamp(a) - getScheduledTimestamp(b),
      ),
    ...meetings
      .filter(
        (meeting) =>
          meeting.status === "Completed" || meeting.status === "Missed",
      )
      .sort(
        (a, b) => getScheduledTimestamp(b) - getScheduledTimestamp(a),
      )
      .slice(0, 3),
  ].slice(0, 4);

  return (
    <div className="pb-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-[#0d1a10] px-4 py-3 text-[13px] font-medium text-white shadow-xl animate-fade-in border border-[#2b4c33]">
          <Check className="h-4 w-4 text-[#4cd964]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <PageTitle
        title="Google Meet"
        subtitle="Host consultations, lectures, and departmental meetings directly on ARIS."
      />

      {/* Active In-App Meeting Screen */}
      {activeCall && (
        <div className="mb-6 rounded-3xl bg-white p-5 border border-[#dce3df] shadow-md">
          {/* Top In-App Meeting Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#eef1ef]">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p
                    className="text-[15px] font-bold"
                    style={{ color: "#111c14" }}
                  >
                    {activeCall.title}
                  </p>
                  <span className="rounded-full bg-[#f0f7f2] px-2 py-0.5 text-[11px] font-mono font-semibold text-[#3a7d4e] border border-[#d2e7d8]">
                    {activeCall.code}
                  </span>
                  {activeCall.authIn && (
                    <span className="flex items-center gap-1 rounded-full bg-[#f0f7f2] px-2 py-0.5 text-[11px] font-semibold text-[#3a7d4e] border border-[#d2e7d8]">
                      <Fingerprint className="h-3 w-3" />
                      Fingerprint verified
                    </span>
                  )}
                </div>
                <p className="text-[12px]" style={{ color: "#8fa394" }}>
                  Active Meeting on ARIS App · Host:{" "}
                  <span className="font-semibold text-[#3a7d4e]">
                    {oauthEmail}
                  </span>{" "}
                  · Duration:{" "}
                  <span
                    className="font-mono font-semibold"
                    style={{ color: "#111c14" }}
                  >
                    {formatDuration(activeCall.elapsedSeconds)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Join Prof. ${oauthName}'s Google Meet: ${activeCall.url}`,
                    "Meeting Link",
                  )
                }
                className="flex items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-[#f7f9f8] px-3 py-1.5 text-[12.5px] font-medium text-[#3d4a41] hover:bg-[#eef1ef] transition"
              >
                {copiedCode === activeCall.url ? (
                  <Check className="h-3.5 w-3.5 text-[#3a7d4e]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy Student Invite
              </button>

              <button
                type="button"
                onClick={() =>
                  void openInAppMeet(
                    activeCall.url,
                    `ARIS Google Meet — ${oauthName} (${oauthEmail})`,
                    oauthName,
                  )
                }
                className="flex items-center gap-1.5 rounded-xl border border-[#d2e7d8] bg-[#f0f7f2] px-3 py-1.5 text-[12.5px] font-medium text-[#3a7d4e] hover:bg-[#e3f0e6] transition"
                title="Focus the in-app meeting window"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Focus Meeting Window
              </button>

              <button
                type="button"
                onClick={handleEndActiveCall}
                className="flex items-center gap-1.5 rounded-xl bg-[#c0392b] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-[#a93226]"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                End Session
              </button>
            </div>
          </div>

          {/* Active Call Control Card */}
          <div className="mt-4 rounded-2xl bg-[#0d1a10] p-6 text-white border border-[#2b4c33]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2b4c33] px-3 py-1 text-[11.5px] font-semibold text-[#a3d9b1] mb-2">
                  <span className="h-2 w-2 rounded-full bg-[#4cd964] animate-pulse"></span>
                  ARIS In-App Window Running
                </span>
                <h3 className="text-[18px] font-bold">{activeCall.title}</h3>
                <p className="text-[13px] text-[#8fa394] mt-1">
                  Google Meet is running in its dedicated desktop window under{" "}
                  <strong>{oauthEmail}</strong>.
                </p>
                <p className="text-[12px] text-[#a3d9b1] font-mono mt-1">
                  {activeCall.url}
                </p>

                {/* Live Caption & Transcript Feed */}
                <div className="mt-4 rounded-xl bg-[#142618] border border-[#2b4c33] p-3 text-left">
                  <div className="flex items-center justify-between text-[11px] mb-1.5 font-semibold text-[#a3d9b1]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#4cd964] animate-pulse" />
                      Live Meet Transcript ({liveTranscript.length} captured)
                    </span>
                    <span className="text-[10.5px] text-[#71967c]">
                      Google Meet CC
                    </span>
                  </div>
                  {liveTranscript.length === 0 ? (
                    <p className="text-[11.5px] text-[#71967c] italic">
                      Waiting for speech... Closed captions will automatically
                      appear here as participants talk.
                    </p>
                  ) : (
                    <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] text-[#e0f1e8] pr-1">
                      {liveTranscript.slice(-4).map((chunk, idx) => (
                        <div key={idx} className="leading-snug">
                          <span className="text-[#a3d9b1] font-semibold">
                            {chunk.who}:
                          </span>{" "}
                          <span>{chunk.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void openInAppMeet(
                      activeCall.url,
                      `ARIS Google Meet — ${oauthName} (${oauthEmail})`,
                      oauthName,
                    )
                  }
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#0d1a10] transition hover:bg-[#eef1ef]"
                >
                  <Maximize2 className="h-4 w-4" />
                  Bring Window to Front
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3-Way Action Columns */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-5">
            {/* Card 1: Start Instant Meeting */}
            <Card className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ background: "#eaf4ee" }}
                  >
                    <Video className="h-5 w-5" style={{ color: BRAND }} />
                  </div>
                  <Badge tone="green" dot>
                    OAuth Linked
                  </Badge>
                </div>
                <h3
                  className="text-[15px] font-semibold"
                  style={{ color: "#111c14" }}
                >
                  Start Instant Meeting
                </h3>
                <p
                  className="text-[12.5px] mt-1 leading-relaxed"
                  style={{ color: "#8fa394" }}
                >
                  Launch an instant meeting room inside ARIS using your OAuth
                  account (
                  <span className="font-semibold text-[#3a7d4e]">
                    {oauthEmail}
                  </span>
                  ). Fingerprint verification is required.
                </p>

                <div className="mt-3">
                  <label className="block text-[10.5px] font-bold text-[#5a6b5e] uppercase tracking-wider mb-1">
                    Course for Teaching Load:
                  </label>
                  <select
                    value={instantCourse}
                    onChange={(e) => setInstantCourse(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[#d2e7d8] bg-[#f9fbf9] px-2 text-[12px] font-semibold text-[#111c14] outline-none focus:border-[#3a7d4e]"
                  >
                    {availableCourses.map((c) => (
                      <option key={c.code} value={`${c.code} · ${c.title}`}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                    <option value="Faculty Council">
                      Faculty / Department Consultation
                    </option>
                  </select>
                </div>

                {/* Authenticator connection */}
                <div className="mt-3 rounded-xl border border-[#d2e7d8] bg-[#f9fbf9] p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#5a6b5e] uppercase tracking-wider">
                      <Usb className="h-3.5 w-3.5" />
                      Authenticator
                    </span>
                    <Badge
                      tone={authConnected ? "green" : "gray"}
                      dot={authConnected}
                    >
                      {auth.connecting
                        ? "Connecting"
                        : authConnected
                          ? (authStatus.device?.deviceId ?? "Connected")
                          : "Not connected"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={authPort}
                      onChange={(e) => setAuthPort(e.target.value)}
                      disabled={authStatus.connected}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-[#d2e7d8] bg-white px-2 text-[12px] text-[#111c14] outline-none focus:border-[#3a7d4e] disabled:opacity-60"
                    >
                      <option value="">
                        {auth.ports.length
                          ? "Select a COM port"
                          : "No devices detected"}
                      </option>
                      {auth.ports.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                          {p.product ? ` — ${p.product}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void auth.refreshPorts()}
                      disabled={authStatus.connected}
                      title="Refresh ports"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d2e7d8] bg-white text-[#3a7d4e] hover:bg-[#f0f7f2] disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {authStatus.connected ? (
                    <button
                      type="button"
                      onClick={() => void auth.disconnect()}
                      disabled={verify.open}
                      className="h-8 w-full rounded-lg border border-[#e2e8e4] bg-white text-[12px] font-medium text-[#3d4a41] hover:bg-[#f7f9f8] disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void auth.connect(authPort)}
                      disabled={!authPort || auth.connecting}
                      className="h-8 w-full rounded-lg bg-[#3a7d4e] text-[12px] font-semibold text-white hover:bg-[#2d633e] disabled:opacity-50"
                    >
                      {auth.connecting ? "Connecting…" : "Connect"}
                    </button>
                  )}
                  {auth.error && (
                    <p className="text-[11px] text-red-600">
                      {auth.error.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#f0f2f0] flex flex-col gap-2">
                <PrimaryButton onClick={handleStartInstant}>
                  <Fingerprint className="h-4 w-4" />
                  Verify &amp; Launch Meet
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => {
                    const code = generateRandomCode();
                    void copyToClipboard(
                      buildMeetUrl(code, oauthEmail),
                      "New Meeting Link",
                    );
                  }}
                  className="flex items-center justify-center gap-1.5 py-1 text-[12px] font-medium text-[#5a6b5e] hover:text-[#111c14] transition"
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Generate & Copy Link for Later
                </button>
              </div>
            </Card>

            {/* Card 2: Join Meeting with Code */}
            <Card className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ background: "#e7f1fa" }}
                  >
                    <Radio className="h-5 w-5" style={{ color: "#2b6ca3" }} />
                  </div>
                  <Badge tone="blue">Join Existing</Badge>
                </div>
                <h3
                  className="text-[15px] font-semibold"
                  style={{ color: "#111c14" }}
                >
                  Join with Code or Link
                </h3>
                <p
                  className="text-[12.5px] mt-1 leading-relaxed"
                  style={{ color: "#8fa394" }}
                >
                  Paste a Google Meet code or link. Fingerprint verification is
                  required. ARIS joins the meeting directly using{" "}
                  <span className="font-semibold text-[#2b6ca3]">
                    {oauthEmail}
                  </span>
                  .
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#f0f2f0] space-y-2">
                <div className="flex min-h-11 items-center rounded-xl border border-[#e2e8e4] bg-white px-3 py-2">
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleJoinWithCode();
                    }}
                    placeholder="e.g. abc-defg-hij"
                    className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#8fa394]"
                    style={{ color: "#111c14" }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        setJoinInput(text);
                      } catch {
                        // ignore
                      }
                    }}
                    title="Paste from clipboard"
                    className="text-[11px] font-medium text-[#8fa394] hover:text-[#111c14] px-1"
                  >
                    Paste
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleJoinWithCode()}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[13px] font-medium transition-colors hover:bg-[#f7f9f8]"
                  style={{ borderColor: "#e2e8e4", color: "#3d4a41" }}
                >
                  <Fingerprint className="h-4 w-4 text-[#3a7d4e]" />
                  Verify &amp; Join on ARIS
                </button>
              </div>
            </Card>

            {/* Card 3: Schedule Class Session */}
            <Card className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ background: "#fbf1de" }}
                  >
                    <Calendar
                      className="h-5 w-5"
                      style={{ color: "#996515" }}
                    />
                  </div>
                  <Badge tone="amber">Class & Advisory</Badge>
                </div>
                <h3
                  className="text-[15px] font-semibold"
                  style={{ color: "#111c14" }}
                >
                  Schedule Session
                </h3>
                <p
                  className="text-[12.5px] mt-1 leading-relaxed"
                  style={{ color: "#8fa394" }}
                >
                  Plan upcoming consultations or classes with an auto-generated
                  Google Meet URL tied to your account.
                </p>
              </div>

              <div className="mt-4 flex justify-center border-t border-[#f0f2f0] pt-3">
                <PrimaryButton onClick={() => setIsScheduleOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Schedule Class Session
                </PrimaryButton>
              </div>
            </Card>
          </div>

          {/* Interactive Camera & Microphone Pre-Call Tester */}
          <Card className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    className="text-[15px] font-semibold"
                    style={{ color: "#111c14" }}
                  >
                    Pre-Call Audio & Video Check
                  </h3>
                  <Badge
                    tone={isAvTesting ? "green" : "gray"}
                    dot={isAvTesting}
                  >
                    {isAvTesting ? "Hardware Active" : "Standby"}
                  </Badge>
                </div>
                <p className="text-[12px] mt-0.5" style={{ color: "#8fa394" }}>
                  Check your lighting, webcam frame, and microphone sensitivity
                  right inside ARIS before students enter.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isAvTesting ? (
                  <GhostButton
                    onClick={startAvTest}
                    className="min-w-[220px] justify-center whitespace-nowrap"
                  >
                    <Video className="w-4 h-4 text-[#3a7d4e]" />
                    Test Camera & Microphone
                  </GhostButton>
                ) : (
                  <GhostButton onClick={stopAvTest}>
                    <VideoOff className="w-4 h-4 text-[#c0392b]" />
                    Stop AV Test
                  </GhostButton>
                )}
              </div>
            </div>

            {avError && (
              <div className="mb-3 rounded-xl bg-red-50 p-3 text-[12px] text-red-700 border border-red-200">
                {avError}. Please verify camera and microphone permissions in
                Windows settings.
              </div>
            )}

            {isAvTesting ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 items-center pt-2">
                {/* Live Video Preview Box */}
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-[#dce3df] shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${cameraOn ? "" : "hidden"}`}
                  />
                  {!cameraOn && (
                    <div className="flex h-full w-full flex-col items-center justify-center text-white/70">
                      <VideoOff className="h-10 w-10 mb-2 opacity-50" />
                      <p className="text-[13px] font-medium">
                        Camera is turned off
                      </p>
                    </div>
                  )}

                  {/* Video Overlay Badges */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                      <span className="h-2 w-2 rounded-full bg-[#4cd964] animate-pulse"></span>
                      Live Preview
                    </span>
                  </div>

                  {/* In-Preview Controls */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-2xl bg-black/70 px-3 py-1.5 backdrop-blur-md">
                    <button
                      type="button"
                      onClick={toggleCamera}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                        cameraOn
                          ? "bg-white/20 text-white hover:bg-white/30"
                          : "bg-[#c0392b] text-white"
                      }`}
                      title={cameraOn ? "Turn off camera" : "Turn on camera"}
                    >
                      {cameraOn ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <VideoOff className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                        micOn
                          ? "bg-white/20 text-white hover:bg-white/30"
                          : "bg-[#c0392b] text-white"
                      }`}
                      title={micOn ? "Mute microphone" : "Unmute microphone"}
                    >
                      {micOn ? (
                        <Mic className="h-4 w-4" />
                      ) : (
                        <MicOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Audio & Readiness Panel */}
                <div className="space-y-4 p-2">
                  <div>
                    <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                      <span
                        className="font-semibold"
                        style={{ color: "#111c14" }}
                      >
                        Microphone Input Volume
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: "#8fa394" }}
                      >
                        {micOn ? `${audioLevel}%` : "Muted"}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-[#eef1ef]">
                      <div
                        className="h-full transition-all duration-75 rounded-full"
                        style={{
                          width: `${micOn ? audioLevel : 0}%`,
                          background:
                            audioLevel > 70
                              ? "#d99a2b"
                              : audioLevel > 20
                                ? BRAND
                                : "#8fa394",
                        }}
                      />
                    </div>
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: "#8fa394" }}
                    >
                      Speak normally to test audio pick-up. Green indicates
                      optimal input.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#f7f9f8] p-3.5 border border-[#e2e8e4] space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span style={{ color: "#5a6b5e" }}>Webcam Sensor:</span>
                      <span
                        className="font-semibold"
                        style={{ color: cameraOn ? BRAND : "#c0392b" }}
                      >
                        {cameraOn ? "Connected (OK)" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: "#5a6b5e" }}>
                        Microphone Stream:
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: micOn ? BRAND : "#c0392b" }}
                      >
                        {micOn ? "Active (Receiving)" : "Muted"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: "#5a6b5e" }}>Authenticator:</span>
                      <span
                        className="font-semibold"
                        style={{ color: authConnected ? BRAND : "#c0392b" }}
                      >
                        {authConnected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: "#5a6b5e" }}>OAuth Account:</span>
                      <span
                        className="font-semibold truncate max-w-[170px]"
                        style={{ color: BRAND }}
                      >
                        {oauthEmail}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <PrimaryButton onClick={handleStartInstant}>
                      <Fingerprint className="w-4 h-4" />
                      Verify &amp; Launch Now
                    </PrimaryButton>
                    <GhostButton onClick={stopAvTest}>
                      Done Checking
                    </GhostButton>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl p-4 cursor-pointer transition hover:bg-[#f7f9f8] border border-dashed border-[#dce3df]"
                onClick={startAvTest}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: "#f0f7f2" }}
                  >
                    <Video className="h-5 w-5" style={{ color: BRAND }} />
                  </div>
                  <div>
                    <p
                      className="text-[13px] font-semibold"
                      style={{ color: "#111c14" }}
                    >
                      Click to preview your camera and microphone
                    </p>
                    <p className="text-[11.5px]" style={{ color: "#8fa394" }}>
                      Test your video clarity and audio volume level before
                      students enter the call.
                    </p>
                  </div>
                </div>

                <span className="text-[12.5px] font-semibold text-[#3a7d4e] flex items-center gap-1">
                  Start Test →
                </span>
              </div>
            )}
          </Card>
        </div>

        <aside className="min-w-0">
          <Card className="h-fit">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  className="text-[16px] font-semibold"
                  style={{ color: "#111c14" }}
                >
                  Upcoming Meetings
                </h2>
                <p className="mt-0.5 text-[12px]" style={{ color: "#8fa394" }}>
                  Upcoming sessions and recent meetings.
                </p>
              </div>
              <Calendar className="h-5 w-5 flex-shrink-0 text-[#3a7d4e]" />
            </div>

            {upcomingMeetings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dce3df] p-4 text-center">
                <p
                  className="text-[12.5px] font-semibold"
                  style={{ color: "#111c14" }}
                >
                  No upcoming meetings
                </p>
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(true)}
                  className="mt-3 text-[12px] font-semibold text-[#3a7d4e] hover:underline"
                >
                  Schedule a session →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingMeetings.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-[#dce3df] bg-[#f7f9f8] p-3.5"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p className="min-w-0 text-[13px] font-semibold text-[#111c14]">
                        {session.title}
                      </p>
                      <Badge
                        tone={getMeetingStatusTone(
                          getMeetingBadgeStatus(session, statusNow),
                        )}
                        dot
                      >
                        {getMeetingStatusLabel(
                          getMeetingBadgeStatus(session, statusNow),
                        )}
                      </Badge>
                    </div>
                    <p className="truncate text-[11.5px] text-[#5a6b5e]">
                      {session.course}
                    </p>
                    <div className="mt-2 space-y-1 text-[11.5px] text-[#8fa394]">
                      <p className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {session.date}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {session.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-[#eef1ef] pt-3">
              <GhostButton
                className="w-full justify-center"
                onClick={() => setIsMeetingsHistoryOpen(true)}
              >
                View all meetings
              </GhostButton>
            </div>
          </Card>
        </aside>
      </div>

      <MeetingsHistoryModal
        isOpen={isMeetingsHistoryOpen}
        onClose={() => setIsMeetingsHistoryOpen(false)}
        meetings={meetings}
        now={statusNow}
      />

      {/* Fingerprint Verification Modal */}
      <Modal
        isOpen={verify.open}
        onClose={cancelVerify}
        title={
          verify.purpose === "in" ? "Verify to Launch Meet" : "Verify Time Out"
        }
        actions={
          <div className="flex items-center justify-end gap-2 w-full">
            <GhostButton onClick={cancelVerify}>
              {verify.purpose === "in" ? "Cancel" : "Skip for now"}
            </GhostButton>
            {verify.phase === "failed" && (
              <PrimaryButton onClick={() => void runScan()}>
                <Fingerprint className="h-4 w-4" />
                Try again
              </PrimaryButton>
            )}
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full ${
              verify.phase === "failed" ? "bg-red-50" : "bg-[#f0f7f2]"
            }`}
          >
            <Fingerprint
              className={`h-8 w-8 ${
                verify.phase === "failed"
                  ? "text-red-600"
                  : verify.phase === "scanning"
                    ? "animate-pulse text-[#3a7d4e]"
                    : "text-[#3a7d4e]"
              }`}
            />
          </div>
          {verify.phase === "failed" ? (
            <p className="text-[13px] text-red-700">{verify.error}</p>
          ) : (
            <p
              className="text-[13px] font-semibold text-[#111c14]"
              aria-live="polite"
            >
              Place your finger on the authenticator…
            </p>
          )}
          <p className="text-[12px] text-[#8fa394]">
            {verify.purpose === "in"
              ? "Verification is required before the meeting can start."
              : "The meeting has ended. Verify to record your time out."}
          </p>
        </div>
      </Modal>

      {/* Schedule Meeting Modal */}
      <Modal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Schedule Google Meet Session"
        size="lg"
        actions={
          <div className="flex items-center justify-end gap-2 w-full">
            <GhostButton onClick={() => setIsScheduleOpen(false)}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={handleScheduleSubmit}>
              Schedule & Generate Link
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-4 text-left">
          <div>
            <label
              className="block text-[12.5px] font-semibold mb-1"
              style={{ color: "#111c14" }}
            >
              Meeting Title / Topic
            </label>
            <input
              type="text"
              value={schedTitle}
              onChange={(e) => setSchedTitle(e.target.value)}
              placeholder="e.g. CC 105 — Week 5 Lab Consultation"
              className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none focus:border-[#3a7d4e]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[12.5px] font-semibold mb-1"
                style={{ color: "#111c14" }}
              >
                Course / Class Section
              </label>
              <select
                value={schedCourse}
                onChange={(e) => {
                  const nextCourse = e.target.value;
                  setSchedCourse(nextCourse);
                  const units = getCourseUnits(nextCourse, availableCourses);
                  const courseEnd =
                    units === null
                      ? null
                      : computeCourseEndTime(schedStartTime, units);
                  if (courseEnd) setSchedEndTime(courseEnd.endTime);
                }}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              >
                {availableCourses.map((c) => (
                  <option key={c.code} value={`${c.code} · ${c.title}`}>
                    {c.code} — {c.title}
                  </option>
                ))}
                <option value="Faculty Council">
                  Faculty / Department Consultation
                </option>
                <option value="Thesis Defense">
                  Capstone / Thesis Defense
                </option>
              </select>
            </div>

            <div>
              <label
                className="block text-[12.5px] font-semibold mb-1"
                style={{ color: "#111c14" }}
              >
                Date
              </label>
              <input
                type="date"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[12.5px] font-semibold mb-1"
                style={{ color: "#111c14" }}
              >
                Start Time
              </label>
              <input
                type="time"
                value={schedStartTime}
                onChange={(e) => {
                  const nextStartTime = e.target.value;
                  setSchedStartTime(nextStartTime);
                  if (selectedCourseUnits !== null) {
                    const courseEnd = computeCourseEndTime(
                      nextStartTime,
                      selectedCourseUnits,
                    );
                    if (courseEnd) setSchedEndTime(courseEnd.endTime);
                  }
                }}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              />
            </div>

            <div>
              <label
                className="block text-[12.5px] font-semibold mb-1"
                style={{ color: "#111c14" }}
              >
                End Time
              </label>
              <input
                type="time"
                value={schedEndTime}
                onChange={(e) => setSchedEndTime(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              />
              {selectedCourseUnits === null && (
                <p className="text-[11px] text-[#8fa394] mt-1">
                  Course units are unavailable. Enter the end time manually.
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              className="block text-[12.5px] font-semibold mb-1"
              style={{ color: "#111c14" }}
            >
              Google Meet Link or Code{" "}
              <span className="font-normal text-[#8fa394]">(Optional)</span>
            </label>
            <input
              type="text"
              value={schedCustomCode}
              onChange={(e) => setSchedCustomCode(e.target.value)}
              placeholder="e.g. gkc-qrfz-dxy or https://meet.google.com/..."
              className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none focus:border-[#3a7d4e]"
            />
            <p className="text-[11px] text-[#8fa394] mt-1">
              Leave blank to automatically assign a room code.
            </p>
          </div>

          <div>
            <label
              className="block text-[12.5px] font-semibold mb-1"
              style={{ color: "#111c14" }}
            >
              Agenda / Notes for Students
            </label>
            <textarea
              rows={3}
              value={schedNotes}
              onChange={(e) => setSchedNotes(e.target.value)}
              placeholder="e.g. Please review the SQL aggregate functions problem set before attending."
              className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none focus:border-[#3a7d4e]"
            />
          </div>

          <div className="rounded-xl bg-[#f0f7f2] p-3 text-[12px] text-[#2d633e] border border-[#d2e7d8]">
            🔒 Hosted by <strong>{oauthEmail}</strong>. Google Meet room and
            calendar invite links will be automatically created under this
            account.
          </div>
        </div>
      </Modal>
    </div>
  );
}
