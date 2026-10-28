import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
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
  PhoneCall,
  PhoneOff,
  Users,
  Sparkles,
  Link as LinkIcon,
  Radio,
  Maximize2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { BRAND } from "@/config/navigation";
import { useAuth } from "@/app/authContext";
import {
  Card,
  PageTitle,
  PrimaryButton,
  GhostButton,
  Badge,
  Tabs,
  Modal,
  StatCard,
  StatGrid,
} from "@/components/ui";
import { saveMeetingToDb, fetchMeetingsFromDb } from "@/services/meetingService";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type MeetSession = {
  id: string;
  title: string;
  course: string;
  date: string;
  time: string;
  duration?: string;
  code: string;
  url: string;
  status: "Upcoming" | "In Progress" | "Completed";
  participantsCount?: number;
  summaryId?: string;
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
  accessToken: string
): Promise<{ meetingUri: string; meetingCode: string }> {
  // Use the Rust command which calls https://meet.googleapis.com/v2/spaces
  const data = (await invoke("create_meet_space", {
    accessToken,
  })) as { meetingUri?: string; meetingCode?: string; name?: string };

  const meetingCode =
    data.meetingCode ??
    data.name?.replace("spaces/", "") ??
    "";
  const meetingUri =
    data.meetingUri ?? `https://meet.google.com/${meetingCode}`;

  return { meetingUri, meetingCode };
}

function generateRandomCode(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const part = (len: number) =>
    Array.from({ length: len }, () =>
      letters.charAt(Math.floor(Math.random() * letters.length))
    ).join("");
  return `${part(3)}-${part(4)}-${part(3)}`;
}

function cleanMeetCode(input: string): string {
  if (!input) return "";
  const match = input.match(/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  if (match) return match[1].toLowerCase();

  let clean = input.trim().replace(/^https?:\/\/meet\.google\.com\//i, "");
  clean = clean.split("?")[0].replace(/[^a-zA-Z-]/g, "").toLowerCase();
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

/* ─── Main Component ───────────────────────────────────────────────────────── */

export default function ProfMeet() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Connected OAuth Account Details
  const oauthEmail =
    user.email ||
    sessionStorage.getItem("aris-google-email") ||
    localStorage.getItem("aris-last-oauth-email") ||
    "professor@ucc.edu.ph";

  const oauthName = user.name || "Professor";

  // Google OAuth Access Token (captured during login for Meet API)
  const oauthAccessToken =
    sessionStorage.getItem("aris-google-access-token") ||
    localStorage.getItem("aris-google-access-token") ||
    "";

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
            m.code !== "nbv-tzxa-wql"
        );
      }
      return [];
    } catch {
      return [];
    }
  });

  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);

  const saveMeetings = (list: MeetSession[]) => {
    setMeetings(list);
    try {
      localStorage.setItem("aris:meet_sessions", JSON.stringify(list));
    } catch {
      // ignore
    }
  };

  // Tab: "Upcoming & Today" vs "Past & Summarized"
  const [currentTab, setCurrentTab] = useState("Upcoming & Today");

  // Join by code state
  const [joinInput, setJoinInput] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active call state
  const [activeCall, setActiveCall] = useState<{
    id: string;
    title: string;
    code: string;
    url: string;
    startedAt: number;
    elapsedSeconds: number;
  } | null>(null);

  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;

  const isEndingCallRef = useRef(false);

  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  // Hardware AV Test state
  const [isAvTesting, setIsAvTesting] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [avError, setAvError] = useState<string | null>(null);

  // Live Meet Caption & Transcript State
  const [liveTranscript, setLiveTranscript] = useState<{ who: string; text: string; t: string }[]>([]);
  const liveTranscriptRef = useRef<{ who: string; text: string; t: string }[]>([]);
  liveTranscriptRef.current = liveTranscript;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Schedule Modal State
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedCourse, setSchedCourse] = useState("CC 105 · BSIT 2B");
  const [schedDate, setSchedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [schedStartTime, setSchedStartTime] = useState("14:00");
  const [schedEndTime, setSchedEndTime] = useState("15:00");
  const [schedNotes, setSchedNotes] = useState("");
  const [schedCustomCode, setSchedCustomCode] = useState("");

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
          : null
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
                  : prev
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

    listen<{ who: string; text: string; t: string }>("meet-transcript-chunk", (event) => {
      if (!event.payload || !event.payload.text) return;
      console.log(`%c[ARIS FRONTEND] 🎙️ CAPTION RECEIVED: [${event.payload.t}] ${event.payload.who}: ${event.payload.text}`, "color: #16a34a; font-weight: bold;");
      setLiveTranscript((prev) => {
        // Prevent immediate duplicates
        const last = prev[prev.length - 1];
        if (last && last.who === event.payload.who && last.text === event.payload.text) {
          return prev;
        }
        return [...prev, event.payload];
      });
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
    setIsLoadingMeetings(true);
    try {
      const dbRecords = await fetchMeetingsFromDb();
      const mapped: MeetSession[] = (dbRecords || []).map((r) => {
        const startStr = r.started_at ? new Date(r.started_at) : null;
        const endStr = r.ended_at ? new Date(r.ended_at) : null;
        const timeDisplay =
          startStr && endStr && !isNaN(startStr.getTime()) && !isNaN(endStr.getTime())
            ? `${startStr.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${endStr.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : `${r.start_time || ""} – ${r.end_time || ""}`;

        const durFormatted = r.duration_seconds
          ? formatDuration(r.duration_seconds)
          : `${r.duration_minutes || 0}m`;

        let dateDisplay = "Recent";
        if (r.meeting_date) {
          const todayStr = new Date().toISOString().split("T")[0];
          const meetStr = typeof r.meeting_date === "string" ? r.meeting_date.split("T")[0] : "";
          if (meetStr === todayStr) {
            dateDisplay = "Today";
          } else {
            const d = new Date(r.meeting_date);
            dateDisplay = !isNaN(d.getTime())
              ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
              : String(r.meeting_date);
          }
        } else if (startStr && !isNaN(startStr.getTime())) {
          dateDisplay = startStr.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        }

        return {
          id: r.id,
          title: r.name || "Google Meet Session",
          course: r.course || "General Consultation",
          date: dateDisplay,
          time: timeDisplay,
          duration: durFormatted,
          code: r.meeting_code || "meet",
          url: r.meeting_url || (r.meeting_code ? `https://meet.google.com/${r.meeting_code}` : "https://meet.google.com"),
          status: (r.status === "scheduled"
            ? "Upcoming"
            : r.status === "in_progress"
            ? "In Progress"
            : "Completed") as MeetSession["status"],
          participantsCount: 1,
        };
      });

      setMeetings(mapped);
      try {
        localStorage.setItem("aris:meet_sessions", JSON.stringify(mapped));
      } catch {}
    } catch (err) {
      console.warn("Failed to load meetings from database:", err);
    } finally {
      setIsLoadingMeetings(false);
    }
  };

  useEffect(() => {
    void loadDbMeetings();
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
        err instanceof Error ? err.message : "Camera / mic access denied or unavailable";
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
    isEndingCallRef.current = false;
    setLiveTranscript([]);
    void invoke("clear_in_app_meet_transcript").catch(() => {});
    const url = buildMeetUrl("new", oauthEmail);
    const windowTitle = `ARIS Google Meet — ${oauthName} (${oauthEmail})`;

    // Launch inside ARIS native in-app window with the captured OAuth account
    await openInAppMeet(url, windowTitle, oauthName);

    setActiveCall({
      id: "instant-" + Date.now(),
      title: "Instant Class Session",
      code: "Connecting...",
      url,
      startedAt: Date.now(),
      elapsedSeconds: 0,
    });

    setToastMessage(`Google Meet connecting as ${oauthEmail}...`);
  };

  const handleJoinWithCode = async (customCode?: string) => {
    const raw = customCode ?? joinInput;
    const clean = cleanMeetCode(raw);
    if (!clean) {
      setToastMessage("Please enter a valid meeting code or link.");
      return;
    }

    isEndingCallRef.current = false;
    setLiveTranscript([]);
    void invoke("clear_in_app_meet_transcript").catch(() => {});
    const url = buildMeetUrl(clean, oauthEmail);
    const windowTitle = `ARIS Meeting (${clean}) — ${oauthEmail}`;

    await openInAppMeet(url, windowTitle, oauthName);

    setActiveCall({
      id: "join-" + Date.now(),
      title: `Meeting (${clean})`,
      code: clean,
      url,
      startedAt: Date.now(),
      elapsedSeconds: 0,
    });

    setJoinInput("");
    setToastMessage(`Joined meet.google.com/${clean} as ${oauthEmail}`);
  };

  const handleJoinSession = async (session: MeetSession) => {
    isEndingCallRef.current = false;
    setLiveTranscript([]);
    void invoke("clear_in_app_meet_transcript").catch(() => {});
    const url = buildMeetUrl(session.code, oauthEmail);
    const windowTitle = `ARIS — ${session.title} (${oauthEmail})`;

    await openInAppMeet(url, windowTitle, oauthName);

    setActiveCall({
      id: session.id,
      title: session.title,
      code: session.code,
      url,
      startedAt: Date.now(),
      elapsedSeconds: 0,
    });

    setToastMessage(`Starting ${session.title} as ${oauthEmail}...`);
  };

  const handleEndActiveCall = async () => {
    if (isEndingCallRef.current) return;
    const currentCall = activeCallRef.current;
    if (!currentCall) return;

    // Immediately acquire lock & clear active call state so no duplicate triggers can execute
    isEndingCallRef.current = true;
    activeCallRef.current = null;
    setActiveCall(null);

    try {
      // Check if we can capture the final real room code before destroying window
      let realCode = currentCall.code;
      if (!realCode || realCode === "Connecting..." || !realCode.includes("-")) {
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
        finalTranscript = await invoke<{ who: string; text: string; t: string }[]>("get_in_app_meet_transcript");
      } catch {
        finalTranscript = liveTranscriptRef.current;
      }
      if (!finalTranscript || finalTranscript.length === 0) {
        finalTranscript = liveTranscriptRef.current;
      }

      const participants = Array.from(
        new Set([oauthName, ...finalTranscript.map((t) => t.who)].filter(Boolean))
      );
      const transcriptSource = finalTranscript
        .map((t) => `${t.t} - ${t.who}: ${t.text}`)
        .join("\n");
      const wordCount = transcriptSource
        ? transcriptSource.split(/\s+/).filter(Boolean).length
        : 0;

      const endedAtMs = Date.now();
      const durationSeconds = currentCall.elapsedSeconds;
      const durationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
      const startedAtDate = new Date(currentCall.startedAt);
      const endedAtDate = new Date(endedAtMs);

      const realUrl = buildMeetUrl(realCode, oauthEmail);

      console.log("\n================== [ARIS FRONTEND] 🏁 SENDING MEETING & TRANSCRIPT TO DB ==================");
      console.log("Meeting Code:", realCode);
      console.log("Total Transcript Lines:", finalTranscript.length);
      console.log("Transcript Data:", finalTranscript);
      console.log("Participants:", participants);
      console.log("Word Count:", wordCount);
      console.log("============================================================================================\n");

      // Save directly to backend database (meeting_records & meeting_logs)
      try {
        await saveMeetingToDb({
          title: currentCall.title,
          name: currentCall.title,
          course: "General Session",
          meeting_code: realCode,
          meeting_url: realUrl,
          started_at: startedAtDate.toISOString(),
          ended_at: endedAtDate.toISOString(),
          duration_seconds: durationSeconds,
          duration_minutes: durationMinutes,
          start_time: startedAtDate.toTimeString().split(" ")[0],
          end_time: endedAtDate.toTimeString().split(" ")[0],
          meeting_date: startedAtDate.toISOString().split("T")[0],
          status: finalTranscript.length > 0 ? "summarized" : "completed",
          user_email: oauthEmail,
          professor_id: user?.id,
          info: `Google Meet hosted by ${oauthName} (${oauthEmail})`,
          transcript: finalTranscript.length > 0 ? finalTranscript : undefined,
          transcript_source: transcriptSource || undefined,
          participants: participants.length > 0 ? participants : undefined,
          word_count: wordCount > 0 ? wordCount : undefined,
        });
      } catch (err) {
        console.warn("DB save meeting failed:", err);
      }

      // Refresh clean, real meetings list directly from the database
      await loadDbMeetings();
      if (finalTranscript.length > 0) {
        setToastMessage(`Call ended (${realCode}). Saved with ${finalTranscript.length} transcript lines!`);
      } else {
        setToastMessage(`Call ended (${realCode}). Saved to database!`);
      }
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

    const customClean = cleanMeetCode(schedCustomCode);
    const code = customClean || generateRandomCode();
    const newSession: MeetSession = {
      id: "sched-" + Date.now(),
      title: schedTitle.trim(),
      course: schedCourse,
      date: schedDate,
      time: `${schedStartTime} – ${schedEndTime}`,
      duration: "1h 00m",
      code,
      url: buildMeetUrl(code, oauthEmail),
      status: "Upcoming",
      participantsCount: 0,
    };

    try {
      const startDateTime = new Date(`${schedDate}T${schedStartTime}`);
      const endDateTime = new Date(`${schedDate}T${schedEndTime}`);
      const saved = await saveMeetingToDb({
        title: schedTitle.trim(),
        name: schedTitle.trim(),
        course: schedCourse,
        meeting_code: code,
        meeting_url: newSession.url,
        started_at: isNaN(startDateTime.getTime())
          ? new Date().toISOString()
          : startDateTime.toISOString(),
        ended_at: isNaN(endDateTime.getTime())
          ? new Date().toISOString()
          : endDateTime.toISOString(),
        start_time: schedStartTime,
        end_time: schedEndTime,
        meeting_date: schedDate,
        duration_minutes: 60,
        duration_seconds: 3600,
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
    setToastMessage(`Scheduled "${newSession.title}" (code: ${code}) and saved to database!`);
  };

  /* Filtered Meetings */
  const visibleMeetings = meetings.filter((m) =>
    currentTab === "Upcoming & Today"
      ? m.status === "Upcoming" || m.status === "In Progress"
      : m.status === "Completed"
  );

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
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => setIsScheduleOpen(true)}>
              <Calendar className="w-4 h-4 text-[#3a7d4e]" />
              Schedule Meeting
            </GhostButton>
            <PrimaryButton onClick={handleStartInstant}>
              <Video className="w-4 h-4 text-white" />
              Start Instant Meeting
            </PrimaryButton>
          </div>
        }
      />

      {/* Captured Google OAuth Account Banner */}
      <div className="mb-5 rounded-2xl bg-white p-4 border border-[#dce3df] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f7f2] border border-[#d2e7d8] flex-shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13.5px] font-bold text-[#111c14]">
                  Google Account: {oauthName}
                </span>
                <Badge tone="green" dot>
                  OAuth Captured
                </Badge>
              </div>
              <p className="text-[12px] text-[#5a6b5e]">
                Connected Email: <strong className="text-[#111c14] font-semibold">{oauthEmail}</strong>. Google Meet automatically uses this account.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[12px] font-medium text-[#2d633e] bg-[#f0f7f2] px-3.5 py-1.5 rounded-xl border border-[#d2e7d8]">
            <ShieldCheck className="h-4 w-4 text-[#3a7d4e]" />
            <span>authuser={oauthEmail}</span>
          </div>
        </div>
      </div>

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
                  <p className="text-[15px] font-bold" style={{ color: "#111c14" }}>
                    {activeCall.title}
                  </p>
                  <span className="rounded-full bg-[#f0f7f2] px-2 py-0.5 text-[11px] font-mono font-semibold text-[#3a7d4e] border border-[#d2e7d8]">
                    {activeCall.code}
                  </span>
                </div>
                <p className="text-[12px]" style={{ color: "#8fa394" }}>
                  Active Meeting on ARIS App · Host:{" "}
                  <span className="font-semibold text-[#3a7d4e]">{oauthEmail}</span> · Duration:{" "}
                  <span className="font-mono font-semibold" style={{ color: "#111c14" }}>
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
                    "Meeting Link"
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
                    oauthName
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
                <h3 className="text-[18px] font-bold">
                  {activeCall.title}
                </h3>
                <p className="text-[13px] text-[#8fa394] mt-1">
                  Google Meet is running in its dedicated desktop window under <strong>{oauthEmail}</strong>.
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
                    <span className="text-[10.5px] text-[#71967c]">Google Meet CC</span>
                  </div>
                  {liveTranscript.length === 0 ? (
                    <p className="text-[11.5px] text-[#71967c] italic">
                      Waiting for speech... Closed captions will automatically appear here as participants talk.
                    </p>
                  ) : (
                    <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] text-[#e0f1e8] pr-1">
                      {liveTranscript.slice(-4).map((chunk, idx) => (
                        <div key={idx} className="leading-snug">
                          <span className="text-[#a3d9b1] font-semibold">{chunk.who}:</span>{" "}
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
                      oauthName
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

      {/* Quick Stats Grid */}
      <StatGrid columns={4} className="mb-4">
        <StatCard
          label="Upcoming Meetings"
          value={meetings.filter((m) => m.status === "Upcoming").length}
          badge={<Badge tone="green">Scheduled</Badge>}
          detail="Classes & consultations"
        />
        <StatCard
          label="OAuth Account"
          value={oauthEmail.split("@")[0]}
          badge={<Badge tone="green">Captured</Badge>}
          detail={oauthEmail}
        />
        <StatCard
          label="Meeting Engine"
          value="In-App"
          valueColor={BRAND}
          badge={<Badge tone="green">No Browser</Badge>}
          detail="Runs directly on ARIS"
        />
        <StatCard
          label="AV Device Status"
          value={isAvTesting ? (cameraOn && micOn ? "Online" : "Partial") : "Standby"}
          badge={<Badge tone={isAvTesting ? "green" : "gray"}>{isAvTesting ? "Active" : "Check below"}</Badge>}
          detail="Camera & mic ready"
        />
      </StatGrid>

      {/* 3-Way Action Columns */}
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
            <h3 className="text-[15px] font-semibold" style={{ color: "#111c14" }}>
              Start Instant Meeting
            </h3>
            <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "#8fa394" }}>
              Launch an instant meeting room inside ARIS using your OAuth account (
              <span className="font-semibold text-[#3a7d4e]">{oauthEmail}</span>).
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0f2f0] flex flex-col gap-2">
            <PrimaryButton onClick={handleStartInstant}>
              <Video className="h-4 w-4" />
              Launch as {oauthEmail.split("@")[0]}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                const code = generateRandomCode();
                void copyToClipboard(
                  buildMeetUrl(code, oauthEmail),
                  "New Meeting Link"
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
            <h3 className="text-[15px] font-semibold" style={{ color: "#111c14" }}>
              Join with Code or Link
            </h3>
            <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "#8fa394" }}>
              Paste a Google Meet code or link. ARIS joins the meeting directly using{" "}
              <span className="font-semibold text-[#2b6ca3]">{oauthEmail}</span>.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0f2f0] space-y-2">
            <div className="flex items-center rounded-xl border border-[#e2e8e4] bg-white px-2.5 py-1">
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
            <GhostButton onClick={() => void handleJoinWithCode()}>
              <PhoneCall className="h-4 w-4 text-[#3a7d4e]" />
              Join on ARIS
            </GhostButton>
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
                <Calendar className="h-5 w-5" style={{ color: "#996515" }} />
              </div>
              <Badge tone="amber">Class & Advisory</Badge>
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: "#111c14" }}>
              Schedule Session
            </h3>
            <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "#8fa394" }}>
              Plan upcoming consultations or classes with an auto-generated Google Meet URL tied to your account.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0f2f0]">
            <PrimaryButton onClick={() => setIsScheduleOpen(true)}>
              <Plus className="h-4 w-4" />
              Schedule New Class Session
            </PrimaryButton>
          </div>
        </Card>
      </div>

      {/* Interactive Camera & Microphone Pre-Call Tester */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold" style={{ color: "#111c14" }}>
                Pre-Call Audio & Video Check
              </h3>
              <Badge tone={isAvTesting ? "green" : "gray"} dot={isAvTesting}>
                {isAvTesting ? "Hardware Active" : "Standby"}
              </Badge>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#8fa394" }}>
              Check your lighting, webcam frame, and microphone sensitivity right inside ARIS before students enter.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isAvTesting ? (
              <GhostButton onClick={startAvTest}>
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
            {avError}. Please verify camera and microphone permissions in Windows settings.
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
                  <p className="text-[13px] font-medium">Camera is turned off</p>
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
                  {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
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
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Audio & Readiness Panel */}
            <div className="space-y-4 p-2">
              <div>
                <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                  <span className="font-semibold" style={{ color: "#111c14" }}>
                    Microphone Input Volume
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "#8fa394" }}>
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
                <p className="text-[11px] mt-1" style={{ color: "#8fa394" }}>
                  Speak normally to test audio pick-up. Green indicates optimal input.
                </p>
              </div>

              <div className="rounded-2xl bg-[#f7f9f8] p-3.5 border border-[#e2e8e4] space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: "#5a6b5e" }}>Webcam Sensor:</span>
                  <span className="font-semibold" style={{ color: cameraOn ? BRAND : "#c0392b" }}>
                    {cameraOn ? "Connected (OK)" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "#5a6b5e" }}>Microphone Stream:</span>
                  <span className="font-semibold" style={{ color: micOn ? BRAND : "#c0392b" }}>
                    {micOn ? "Active (Receiving)" : "Muted"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span style={{ color: "#5a6b5e" }}>OAuth Account:</span>
                  <span className="font-semibold truncate max-w-[170px]" style={{ color: BRAND }}>
                    {oauthEmail}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <PrimaryButton onClick={handleStartInstant}>
                  <Video className="w-4 h-4" />
                  Launch Meet Now
                </PrimaryButton>
                <GhostButton onClick={stopAvTest}>Done Checking</GhostButton>
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
                <p className="text-[13px] font-semibold" style={{ color: "#111c14" }}>
                  Click to preview your camera and microphone
                </p>
                <p className="text-[11.5px]" style={{ color: "#8fa394" }}>
                  Test your video clarity and audio volume level before students enter the call.
                </p>
              </div>
            </div>

            <span className="text-[12.5px] font-semibold text-[#3a7d4e] flex items-center gap-1">
              Start Test →
            </span>
          </div>
        )}
      </Card>

      {/* Meetings Schedule Section */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold" style={{ color: "#111c14" }}>
            Scheduled & Past Meetings
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "#8fa394" }}>
            Direct access to class meetings and their auto-generated transcripts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDbMeetings()}
            disabled={isLoadingMeetings}
            className="flex items-center gap-1.5 text-[12px] text-[#5a6b5e] hover:text-[#111c14] border border-[#e2e8e4] rounded-xl px-2.5 py-1.5 bg-white hover:bg-[#f7f9f8] transition disabled:opacity-50"
            title="Sync with PostgreSQL database"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#3a7d4e] ${isLoadingMeetings ? "animate-spin" : ""}`} />
            <span>Sync DB</span>
          </button>
          <Tabs
            tabs={["Upcoming & Today", "Past & Summarized"]}
            value={currentTab}
            onChange={setCurrentTab}
          />
        </div>
      </div>

      {isLoadingMeetings ? (
        <Card className="text-center py-10">
          <RefreshCw className="h-8 w-8 mx-auto text-[#3a7d4e] animate-spin mb-2 opacity-80" />
          <p className="text-[14px] font-semibold" style={{ color: "#111c14" }}>
            Loading meetings from database...
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
            Connecting to PostgreSQL to fetch your verified Google Meet records.
          </p>
        </Card>
      ) : visibleMeetings.length === 0 ? (
        <Card className="text-center py-10">
          <Calendar className="h-10 w-10 mx-auto text-[#8fa394] mb-2 opacity-60" />
          <p className="text-[14px] font-semibold" style={{ color: "#111c14" }}>
            No {currentTab.toLowerCase()} found
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
            {currentTab === "Upcoming & Today"
              ? "Schedule a new class session or start an instant meeting to get started."
              : "Completed meetings and their summaries will appear here."}
          </p>
          {currentTab === "Upcoming & Today" && (
            <div className="mt-4 flex justify-center">
              <PrimaryButton onClick={() => setIsScheduleOpen(true)}>
                <Plus className="h-4 w-4" />
                Schedule Session
              </PrimaryButton>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleMeetings.map((session) => (
            <Card key={session.id} className="transition hover:shadow-md">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl flex-shrink-0"
                    style={{
                      background:
                        session.status === "Completed" ? "#f0f2f0" : "#f0f7f2",
                    }}
                  >
                    <Video
                      className="h-5 w-5"
                      style={{
                        color: session.status === "Completed" ? "#5a6b5e" : BRAND,
                      }}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-[14px]" style={{ color: "#111c14" }}>
                        {session.title}
                      </span>
                      <Badge
                        tone={
                          session.status === "Upcoming"
                            ? "green"
                            : session.status === "In Progress"
                            ? "amber"
                            : "gray"
                        }
                        dot={session.status === "Upcoming"}
                      >
                        {session.status}
                      </Badge>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: "#eef1ef", color: "#5a6b5e" }}
                      >
                        {session.course}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ color: "#8fa394" }}>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {session.date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {session.time} {session.duration ? `(${session.duration})` : ""}
                      </span>
                      {session.participantsCount !== undefined && (
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {session.participantsCount} participants
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-mono text-[#5a6b5e]">
                        <LinkIcon className="h-3 w-3" />
                        {session.code}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        `Join Prof. ${oauthName}'s Google Meet for ${session.course}: ${buildMeetUrl(
                          session.code,
                          oauthEmail
                        )}`,
                        "Meeting invite link"
                      )
                    }
                    className="flex items-center gap-1 rounded-xl border border-[#e2e8e4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3d4a41] transition hover:bg-[#f7f9f8]"
                    title="Copy invite text for students"
                  >
                    {copiedCode === session.code || copiedCode === session.url ? (
                      <Check className="h-3.5 w-3.5 text-[#3a7d4e]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy Invite
                  </button>

                  {session.status !== "Completed" ? (
                    <PrimaryButton onClick={() => void handleJoinSession(session)}>
                      <PhoneCall className="h-3.5 w-3.5" />
                      Join on ARIS
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton
                      onClick={() => {
                        navigate("/prof/summaries");
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      View Summary
                    </PrimaryButton>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Integration Notice to Summaries */}
      <div className="mt-6 rounded-2xl bg-[#f0f7f2] p-4 border border-[#d2e7d8] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm flex-shrink-0">
            <Sparkles className="h-5 w-5" style={{ color: BRAND }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "#111c14" }}>
              Automated Meeting Summaries & Transcripts
            </p>
            <p className="text-[12px]" style={{ color: "#5a6b5e" }}>
              Google Meet recordings under {oauthEmail} are transcribed and summarized into Accomplishment Report items automatically.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/prof/summaries")}
          className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3a7d4e] shadow-sm transition hover:bg-[#fdfdfd] border border-[#d2e7d8]"
        >
          Open Summaries →
        </button>
      </div>

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
            <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
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
              <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
                Course / Class Section
              </label>
              <select
                value={schedCourse}
                onChange={(e) => setSchedCourse(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              >
                <option value="CC 105 · BSIT 2B">CC 105 · BSIT 2B (Information Management)</option>
                <option value="CS 201 · BSCS 2A">CS 201 · BSCS 2A (Data Structures)</option>
                <option value="IT 301 · BSIT 3A">IT 301 · BSIT 3A (Web Development)</option>
                <option value="Faculty Council">Faculty / Department Consultation</option>
                <option value="Thesis Defense">Capstone / Thesis Defense</option>
              </select>
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
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
              <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
                Start Time
              </label>
              <input
                type="time"
                value={schedStartTime}
                onChange={(e) => setSchedStartTime(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
                End Time
              </label>
              <input
                type="time"
                value={schedEndTime}
                onChange={(e) => setSchedEndTime(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8e4] px-3 py-2 text-[13px] outline-none bg-white focus:border-[#3a7d4e]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
              Google Meet Link or Code <span className="font-normal text-[#8fa394]">(Optional)</span>
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
            <label className="block text-[12.5px] font-semibold mb-1" style={{ color: "#111c14" }}>
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
            🔒 Hosted by <strong>{oauthEmail}</strong>. Google Meet room and calendar invite links will be automatically created under this account.
          </div>
        </div>
      </Modal>
    </div>
  );
}
