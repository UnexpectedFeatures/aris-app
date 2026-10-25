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
  type MeetingSummaryItem as MeetingSummary,
} from "@/services/meetingService";
import { RefreshCw, Video, Sparkles } from "lucide-react";

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
    tab: "Summary" | "Full Transcript";
  } | null>(null);

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
              tabs={["Summary", "Full Transcript"]}
              value={open?.tab ?? "Summary"}
              onChange={(t) =>
                setOpen({
                  id: active.id,
                  tab: t as "Summary" | "Full Transcript",
                })
              }
            />

            <div className="pt-1">
              {open?.tab === "Full Transcript" ? (
                <TranscriptView m={active} />
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
