import { useState, useEffect } from "react";
import { BRAND } from "@/config/navigation";
import {
  Card,
  PageTitle,
  GhostButton,
  Badge,
  Tabs,
  Modal,
  Avatar,
  initialsColor,
  StatCard,
  StatGrid,
} from "@/components/ui";
import {
  fetchMeetingSummariesFromDb,
  summarizeMeetingWithAI,
  type MeetingSummaryItem as MeetingSummary,
  type AiSummaryResult,
} from "@/services/meetingService";
import { RefreshCw, Video, Sparkles, Loader2 } from "lucide-react";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function durationInHours(duration: string) {
  const hours = Number(duration.match(/(\d+)h/)?.[1] ?? 0);
  const minutes = Number(duration.match(/(\d+)m/)?.[1] ?? 0);
  return hours + minutes / 60;
}

/* ─── Detail modal components ──────────────────────────────────────────────── */

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p
        className="text-[10.5px] font-bold uppercase tracking-widest"
        style={{ color: "#8fa394" }}
      >
        {label}
      </p>
      <p className="text-[13px] mt-1 font-medium" style={{ color: "#111c14" }}>
        {value}
      </p>
    </div>
  );
}

function SummaryView({ m }: { m: MeetingSummary }) {
  return (
    <div className="space-y-3.5">
      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "#eef1ef" }}
      >
        <p className="text-[12px] font-bold mb-2" style={{ color: "#111c14" }}>
          Overview
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "#5a6b5e" }}>
          {m.overview}
        </p>
      </div>

      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "#eef1ef" }}
      >
        <p
          className="text-[12px] font-bold mb-2.5"
          style={{ color: "#111c14" }}
        >
          Key Points
        </p>
        <ul className="space-y-2">
          {m.keyPoints.map((k) => (
            <li key={k} className="flex gap-2.5">
              <span
                className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0"
                style={{ background: BRAND }}
              />
              <span
                className="text-[13px] leading-relaxed"
                style={{ color: "#5a6b5e" }}
              >
                {k}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "#eef1ef" }}
      >
        <p
          className="text-[12px] font-bold mb-2.5"
          style={{ color: "#111c14" }}
        >
          Decisions & Takeaways
        </p>
        <ul className="space-y-2">
          {m.decisions.map((d) => (
            <li key={d} className="flex gap-2.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={BRAND}
                strokeWidth="2.4"
                className="w-3.5 h-3.5 mt-[3px] flex-shrink-0"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span
                className="text-[13px] leading-relaxed"
                style={{ color: "#5a6b5e" }}
              >
                {d}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "#eef1ef" }}
      >
        <div
          className="px-4 py-2.5 border-b"
          style={{ background: "#fafbfa", borderColor: "#eef1ef" }}
        >
          <p className="text-[12px] font-bold" style={{ color: "#111c14" }}>
            Action Items
          </p>
        </div>
        {m.actions.map((a, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 gap-2 border-t px-4 py-3 sm:grid-cols-[1.1fr_2.4fr_0.9fr] sm:items-center sm:gap-3"
            style={{ borderColor: "#f2f4f2" }}
          >
            <span
              className="text-[12.5px] font-semibold"
              style={{ color: "#111c14" }}
            >
              {a.owner}
            </span>
            <span className="text-[12.5px]" style={{ color: "#5a6b5e" }}>
              {a.task}
            </span>
            <span
              className="text-[12px] text-right tabular-nums"
              style={{ color: "#8fa394" }}
            >
              {a.due}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── AI Summary view ──────────────────────────────────────────────────────── */

function AiSummaryView({
  m,
  aiResult,
  aiLoading,
  aiError,
  onRequest,
}: {
  m: MeetingSummary;
  aiResult: AiSummaryResult | null;
  aiLoading: boolean;
  aiError: string | null;
  onRequest: () => void;
}) {
  if (aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: BRAND }}
        />
        <p className="text-[13px] font-semibold" style={{ color: "#111c14" }}>
          Summarizing with AI…
        </p>
        <p className="text-[12px]" style={{ color: "#8fa394" }}>
          Sending transcript to aris-llm · waiting for response
        </p>
      </div>
    );
  }

  if (aiError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-red-700">{aiError}</p>
        <button
          onClick={onRequest}
          className="flex items-center gap-2 h-8 px-3 rounded-xl text-[12px] font-semibold text-white"
          style={{ background: BRAND }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!aiResult) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "#f0f7f2" }}
        >
          <Sparkles className="w-7 h-7" style={{ color: BRAND }} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold" style={{ color: "#111c14" }}>
            AI hasn't summarized this meeting yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
            Click the button to send the transcript to aris-llm for processing.
          </p>
        </div>
        <button
          onClick={onRequest}
          className="flex items-center gap-2 h-9 px-5 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.99]"
          style={{ background: BRAND }}
        >
          <Sparkles className="w-4 h-4" />
          Summarize with AI
        </button>
        {m.transcript.length === 0 && (
          <p className="text-[11.5px] text-red-500">
            No transcript available — AI summary requires transcript data.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {aiResult.model && (
        <div
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px]"
          style={{ background: "#f0f7f2", color: "#2f7043" }}
        >
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          Generated by {aiResult.model} via aris-llm
        </div>
      )}

      <div
        className="rounded-2xl border p-4 whitespace-pre-wrap text-[13px] leading-relaxed"
        style={{ borderColor: "#eef1ef", color: "#3d4a41" }}
      >
        {aiResult.response}
      </div>

      <button
        onClick={onRequest}
        className="flex items-center gap-2 h-8 px-3 rounded-xl text-[12px] font-semibold border transition-colors hover:bg-[#f0f7f2]"
        style={{ borderColor: "#d2e7d8", color: "#3a7d4e" }}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Re-summarize
      </button>
    </div>
  );
}

function TranscriptView({ m }: { m: MeetingSummary }) {
  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px]"
        style={{ background: "#f0f7f2", color: "#2f7043" }}
      >
        <Video className="w-4 h-4 flex-shrink-0" />
        Recorded via Google Meet · {m.duration} · {m.words}
      </div>
      {m.transcript.map((l, i) => (
        <div key={i} className="flex gap-3">
          <span
            className="text-[11px] tabular-nums pt-0.5 w-14 flex-shrink-0"
            style={{ color: "#b6c3ba" }}
          >
            {l.t}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: BRAND }}>
              {l.who}
            </p>
            <p
              className="text-[12.5px] leading-relaxed mt-0.5"
              style={{ color: "#3d4a41" }}
            >
              {l.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function ProfSummaries() {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{
    id: string;
    tab: "Summary" | "Full Transcript" | "AI Summary";
  } | null>(null);

  // Per-meeting AI state keyed by meeting id
  const [aiResults, setAiResults] = useState<Record<string, AiSummaryResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  const handleAiSummarize = async (m: MeetingSummary) => {
    if (m.transcript.length === 0) {
      setAiErrors((e) => ({ ...e, [m.id]: "No transcript available to summarize." }));
      return;
    }
    setAiErrors((e) => ({ ...e, [m.id]: "" }));
    setAiLoading((l) => ({ ...l, [m.id]: true }));
    try {
      const result = await summarizeMeetingWithAI(m);
      setAiResults((r) => ({ ...r, [m.id]: result }));
    } catch (err) {
      setAiErrors((e) => ({
        ...e,
        [m.id]: err instanceof Error ? err.message : "Unknown error.",
      }));
    } finally {
      setAiLoading((l) => ({ ...l, [m.id]: false }));
    }
  };

  const loadSummaries = async () => {
    setLoading(true);
    try {
      const records = await fetchMeetingSummariesFromDb();
      setMeetings(records);
    } catch (err) {
      console.warn("Could not load summaries from DB:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummaries();
  }, []);

  const active = meetings.find((m) => m.id === open?.id) ?? null;

  return (
    <div className="pb-2">
      <PageTitle
        title="Meeting Summaries"
        subtitle="Google Meet recordings are transcribed and logged from PostgreSQL."
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => { if (!loading) void loadSummaries(); }}>
              <RefreshCw
                className={`w-4 h-4 text-[#3a7d4e] ${
                  loading ? "animate-spin" : ""
                }`}
              />
              Sync DB
            </GhostButton>
            <GhostButton>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="w-4 h-4"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export
            </GhostButton>
          </div>
        }
      />

      <StatGrid className="mb-4">
        {[
          ["Recordings", String(meetings.length)],
          ["Transcribed", String(meetings.length)],
          [
            "Summarized",
            String(
              meetings.filter((meeting) => meeting.status === "Summarized").length
            ),
          ],
          [
            "Hours Recorded",
            meetings
              .reduce(
                (hours, meeting) => hours + durationInHours(meeting.duration),
                0
              )
              .toFixed(1),
          ],
        ].map(([l, v]) => (
          <StatCard key={l} label={l} value={v} />
        ))}
      </StatGrid>

      {loading ? (
        <Card className="text-center py-12">
          <RefreshCw className="h-8 w-8 mx-auto text-[#3a7d4e] animate-spin mb-2 opacity-80" />
          <p className="text-[14px] font-semibold" style={{ color: "#111c14" }}>
            Loading meeting summaries from database...
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
            Fetching recorded sessions and transcripts from PostgreSQL.
          </p>
        </Card>
      ) : meetings.length === 0 ? (
        <Card className="text-center py-12">
          <Sparkles className="h-10 w-10 mx-auto text-[#8fa394] mb-2 opacity-60" />
          <p className="text-[14px] font-semibold" style={{ color: "#111c14" }}>
            No meeting summaries found
          </p>
          <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
            Google Meet sessions conducted on ARIS will appear here automatically with their room code, duration, and time in/out.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((m, i) => (
            <Card key={m.id} className="transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar initials="GM" color={initialsColor(i)} size={38} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p
                        className="text-[14px] font-bold tracking-tight truncate"
                        style={{ color: "#111c14" }}
                      >
                        {m.title}
                      </p>
                      {m.meeting_code && (
                        <span className="rounded-full bg-[#f0f7f2] px-2 py-0.5 text-[11px] font-mono font-semibold text-[#3a7d4e] border border-[#d2e7d8]">
                          {m.meeting_code}
                        </span>
                      )}
                    </div>
                    <p
                      className="text-[12px] mt-0.5"
                      style={{ color: "#8fa394" }}
                    >
                      {m.course} · {m.date} · {m.time} · {m.duration}
                    </p>
                  </div>
                </div>
                <Badge tone="green" dot>
                  {m.status}
                </Badge>
              </div>

              <p
                className="text-[12.5px] leading-relaxed mt-3 line-clamp-2"
                style={{ color: "#5a6b5e" }}
              >
                {m.overview}
              </p>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <span
                    className="px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "#f0f2f0", color: "#5a6b5e" }}
                  >
                    {m.words}
                  </span>
                  <span style={{ color: "#b6c3ba" }}>
                    {m.participants.length} participants
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton
                    onClick={() => setOpen({ id: m.id, tab: "Full Transcript" })}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
                      <path d="M19 11a7 7 0 01-14 0" />
                    </svg>
                    Full transcript
                  </GhostButton>
                  <button
                    onClick={() => {
                      setOpen({ id: m.id, tab: "AI Summary" });
                      if (!aiResults[m.id] && !aiLoading[m.id]) {
                        void handleAiSummarize(m);
                      }
                    }}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold border transition-colors hover:bg-[#f0f7f2]"
                    style={{ borderColor: "#d2e7d8", color: "#3a7d4e" }}
                  >
                    {aiLoading[m.id] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {aiLoading[m.id] ? "Summarizing…" : "Summarize with AI"}
                  </button>
                  <button
                    onClick={() => setOpen({ id: m.id, tab: "Summary" })}
                    className="flex items-center gap-2 h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.99]"
                    style={{ background: BRAND }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M4 6h16M4 11h16M4 16h9" />
                    </svg>
                    Summary
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!active}
        onClose={() => setOpen(null)}
        title={active ? active.title : "Meeting Summary"}
        size="lg"
        align="left"
        actions={<GhostButton onClick={() => setOpen(null)}>Close</GhostButton>}
      >
        {active && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoField label="Date" value={active.date} />
              <InfoField label="Time" value={active.time} />
              <InfoField label="Duration" value={active.duration} />
              <InfoField label="Transcript" value={active.words} />
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge tone="green" dot>
                {active.status}
              </Badge>
              {active.meeting_code && (
                <span className="font-mono text-[12px] text-[#3a7d4e] bg-[#f0f7f2] px-2 py-0.5 rounded-full border border-[#d2e7d8]">
                  Code: {active.meeting_code}
                </span>
              )}
              <span className="text-[12px]" style={{ color: "#8fa394" }}>
                Participants: {active.participants.join(" · ")}
              </span>
            </div>

            <Tabs
              tabs={["Summary", "Full Transcript", "AI Summary"]}
              value={open?.tab ?? "Summary"}
              onChange={(t) =>
                setOpen({
                  id: active.id,
                  tab: t as "Summary" | "Full Transcript" | "AI Summary",
                })
              }
            />

            <div className="pt-1">
              {open?.tab === "Full Transcript" ? (
                <TranscriptView m={active} />
              ) : open?.tab === "AI Summary" ? (
                <AiSummaryView
                  m={active}
                  aiResult={aiResults[active.id] ?? null}
                  aiLoading={aiLoading[active.id] ?? false}
                  aiError={aiErrors[active.id] ?? null}
                  onRequest={() => void handleAiSummarize(active)}
                />
              ) : (
                <SummaryView m={active} />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
