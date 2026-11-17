import { useState } from "react";
import { useAuth } from "@/app/authContext";
import { BRAND } from "@/config/navigation";
import { useResource } from "@/hooks/useResource";
import { saveResource } from "@/services/dataSource";
import {
  Card,
  PageTitle,
  GhostButton,
  SearchInput,
  Badge,
  Avatar,
  Modal,
  Toggle,
  SubmissionDetail,
  type RecordKind,
  type RecordPayload,
  type StatusKind,
} from "@/components/ui";

// Where each support stage acts on the AR / DTR submissions routed to it:
// Checker → Secretary → HR → Accounting.

const STAGES = ["Checker", "Secretary", "HR", "Accounting"] as const;
type StageRole = (typeof STAGES)[number];

/** Staff account signed in at each stage. */
const STAGE_OWNER: Record<StageRole, string> = {
  Checker: "Prof. R. Alonzo",
  Secretary: "L. Bautista",
  HR: "Ana Bautista",
  Accounting: "Payroll Office",
};

const STAGE_COLOR: Record<StageRole, string> = {
  Checker: "#3a7d4e",
  Secretary: "#3f8ecc",
  HR: "#8a63c4",
  Accounting: "#d99a2b",
};

/** The next stage in the routing order, or undefined at the final stage. */
const nextStageOf = (stage: StageRole): StageRole | undefined =>
  STAGES[STAGES.indexOf(stage) + 1] as StageRole | undefined;

type ApprovalItem = {
  id: string;
  faculty: string;
  facultyNumber: string;
  type: RecordKind;
  period: string;
  reference: string;
  submitted: string;
  /** Stage the submission currently sits at. */
  stage: StageRole;
  status: StatusKind;
  event: string;
  record: RecordPayload;
};

/** Fixed "current time" for the mock decision log. */
const NOW = "Sep 17, 2026 · 2:45 PM";

const initialsOf = (name: string) =>
  name
    .replace(/^(Dr\.|Prof\.)\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);



/** How a submission reads from the acting role's point of view. */
function stageStatus(
  it: ApprovalItem,
  role: StageRole | null,
): { label: string; tone: "green" | "amber" | "red" | "gray"; note: string } {
  if (!role) return { label: "View only", tone: "gray", note: "no review role assigned" };
  const mine = STAGES.indexOf(role);
  const at = STAGES.indexOf(it.stage);
  if (it.status === "Disapproved") {
    return { label: "Disapproved", tone: "red", note: `at ${it.stage}` };
  }
  if (it.status === "Approved") {
    return { label: "Done", tone: "green", note: "cleared by Accounting" };
  }
  // Already approved at this role — it moved on to the next stage.
  if (at > mine) {
    return { label: "Done", tone: "green", note: `to ${it.stage}` };
  }
  if (at === mine) {
    return { label: "Pending", tone: "amber", note: "awaiting you" };
  }
  // Still upstream — it has not reached this role yet.
  return { label: "Waiting", tone: "gray", note: `at ${it.stage}` };
}

/* ─── Stage progress rail ──────────────────────────────────────────────────── */

function StageProgress({ item }: { item: ApprovalItem }) {
  const at = STAGES.indexOf(item.stage);
  const finished = item.status === "Approved";
  const rejected = item.status === "Disapproved";

  return (
    <div className="flex items-center gap-1.5 mt-4 flex-wrap">
      {STAGES.map((s, i) => {
        const isRejected = rejected && i === at;
        const isDone = !isRejected && (finished || i < at);
        const isCurrent = !isRejected && !isDone && i === at;
        const bg = isRejected
          ? "#fbecec"
          : isDone
            ? "#eaf4ee"
            : isCurrent
              ? "#fbf1de"
              : "#f4f6f5";
        const fg = isRejected
          ? "#c0392b"
          : isDone
            ? "#2f7043"
            : isCurrent
              ? "#996515"
              : "#b6c3ba";
        return (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d6ded8"
                strokeWidth="2.4"
                strokeLinecap="round"
                className="w-3 h-3 flex-shrink-0"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold"
              style={{
                background: bg,
                color: fg,
                boxShadow: isCurrent ? "0 0 0 1px #e6cf9b inset" : "none",
              }}
            >
              {isDone && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isRejected && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="w-3 h-3"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
              {s}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

/* ─── Page ─────────────────────────────────────────────────────────────────── */

function QueueCard({
  item,
  role,
  onOpen,
}: {
  item: ApprovalItem;
  role: StageRole | null;
  onOpen: () => void;
}) {
  const st = stageStatus(item, role);
  const decided = item.status !== "Pending";
  const accent =
    item.status === "Approved"
      ? "#2f7043"
      : item.status === "Disapproved"
        ? "#c0392b"
        : STAGE_COLOR[item.stage];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white rounded-2xl p-3 border transition-all hover:shadow-md"
      style={{
        borderColor: decided
          ? item.status === "Approved"
            ? "#cfe6d8"
            : "#f0cfcb"
          : "#e8eeea",
      }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar initials={initialsOf(item.faculty)} color={accent} size={28} />
        <div className="flex-1 min-w-0">
          <p
            className="text-[12.5px] font-semibold truncate"
            style={{ color: "#111c14" }}
          >
            {item.faculty}
          </p>
          <p className="text-[10.5px] truncate" style={{ color: "#8fa394" }}>
            {item.reference}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2.5">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
          style={{
            background: item.type === "AR" ? "#e7f1fa" : "#eaf4ee",
            color: item.type === "AR" ? "#2b6ca3" : "#2f7043",
          }}
        >
          {item.type}
        </span>
        <span className="text-[10.5px] truncate" style={{ color: "#8fa394" }}>
          {item.period}
        </span>
      </div>

      <div
        className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t"
        style={{ borderColor: "#f4f6f5" }}
      >
        <span
          className="text-[10.5px] tabular-nums"
          style={{ color: "#b6c3ba" }}
        >
          {item.submitted.replace(", 2026", "")}
        </span>
        {decided ? (
          <Badge tone={st.tone} dot>
            {item.status === "Approved" ? "Approved" : "Disapproved"}
          </Badge>
        ) : (
          <span
            className="text-[10.5px] font-semibold"
            style={{ color: st.label === "Pending" ? "#996515" : "#8fa394" }}
          >
            {st.label === "Pending" ? "Awaiting you" : st.label}
          </span>
        )}
      </div>
    </button>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const { data: queue, setData: setQueue, loading } = useResource<ApprovalItem[]>("/approvals", []);
  const role = user.role === "staff" && STAGES.includes(user.staffStage as StageRole)
    ? user.staffStage as StageRole
    : null;
  const [query, setQuery] = useState("");
  const [showDecided, setShowDecided] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const open = queue.find((it) => it.id === openId) ?? null;
  const openStatus = open ? stageStatus(open, role) : null;
  const canAct = !!open && !!role && open.status === "Pending" && open.stage === role;
  const next = open ? nextStageOf(open.stage) : undefined;

  const q = query.trim().toLowerCase();
  const visible = queue.filter((it) => {
    if (!showDecided && it.status !== "Pending") return false;
    if (!q) return true;
    return (
      it.faculty.toLowerCase().includes(q) ||
      it.reference.toLowerCase().includes(q) ||
      it.period.toLowerCase().includes(q)
    );
  });
  const column = (s: StageRole) => visible.filter((it) => it.stage === s);

  const awaiting = role
    ? queue.filter((it) => it.status === "Pending" && it.stage === role).length
    : 0;
  const inPipeline = queue.filter((it) => it.status === "Pending").length;

  const decide = async (item: ApprovalItem, action: "Approve" | "Disapprove") => {
    if (!role || item.status !== "Pending" || item.stage !== role) return;
    const reviewer = `${user.name} (${role})`;
    const target = nextStageOf(item.stage);
    setFlash(
      action === "Disapprove"
        ? `Disapproved · ${item.faculty}'s ${item.type} returned for correction`
        : target
          ? `Approved · ${item.type} forwarded to ${target}`
          : `Approved · ${item.type} cleared for payroll`,
    );
    const updatedQueue = queue.map((it) => {
        if (it.id !== item.id) return it;
        if (action === "Disapprove") {
          return {
            ...it,
            status: "Disapproved" as StatusKind,
            record: {
              ...it.record,
              reviewer,
              reviewedAt: NOW,
              remark:
                remark.trim() ||
                `Disapproved at the ${role} stage. Returned to the faculty for correction.`,
            },
          };
        }
        return {
          ...it,
          stage: target ?? it.stage,
          status: target ? ("Pending" as StatusKind) : ("Approved" as StatusKind),
          record: {
            ...it.record,
            reviewer,
            reviewedAt: NOW,
            remark:
              remark.trim() ||
              (target
                ? `Approved at the ${role} stage. Forwarded to ${target}.`
                : "Approved at the final stage and cleared for payroll."),
          },
        };
      });
    try {
      await saveResource("/approvals", updatedQueue, "PUT");
      setQueue(updatedQueue);
    } catch (reason) {
      setFlash(reason instanceof Error ? reason.message : "Unable to save the decision.");
      return;
    }
    setOpenId(null);
    setRemark("");
  };

  const close = () => {
    setOpenId(null);
    setRemark("");
  };

  return (
    <div className="pb-2">
      <PageTitle
        title="Approvals"
        subtitle={
          loading
            ? "Loading approval pipeline..."
            : `${awaiting} submission${
                awaiting === 1 ? "" : "s"
              } awaiting your action · ${inPipeline} in the pipeline`
        }
        action={
          <SearchInput
            placeholder="Search faculty, reference or period"
            value={query}
            onChange={setQuery}
            className="w-60"
          />
        }
      />

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: role ? STAGE_COLOR[role] : "#8fa394" }}
            >
              {role ? role.slice(0, 3).toUpperCase() : "VIEW"}
            </span>
            <div className="min-w-0">
              <p
                className="text-[13px] font-semibold"
                style={{ color: "#111c14" }}
              >
                {role ? `Assigned role: ${role}` : "Read-only access"}
              </p>
              <p className="text-[11.5px]" style={{ color: "#8fa394" }}>
                {role ? `${user.name} · ${awaiting} to review` : "No review role assigned. Contact an administrator for access."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <label
              className="flex items-center gap-2 text-[12px] font-medium select-none cursor-pointer"
              style={{ color: "#5a6b5e" }}
            >
              <Toggle on={showDecided} onChange={setShowDecided} />
              Show decided
            </label>
            {!role && <Badge tone="gray">View only</Badge>}
          </div>
        </div>
      </Card>

      {flash && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl mb-3 text-[12.5px] font-medium"
          style={{ background: "#eaf4ee", color: "#2f7043" }}
        >
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            {flash}
          </span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="transition-opacity hover:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="w-3.5 h-3.5"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {/* Pipeline board — one column per stage */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {STAGES.map((s) => {
          const cards = column(s);
          const isMine = s === role;
          return (
            <div
              key={s}
              className="rounded-3xl p-2.5 min-h-[440px] flex flex-col"
              style={{
                background: isMine ? "#f0f7f2" : "#f4f6f5",
                boxShadow: isMine ? `inset 0 0 0 1.5px ${BRAND}33` : "none",
              }}
            >
              <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: STAGE_COLOR[s] }}
                  />
                  <p
                    className="text-[12.5px] font-bold truncate"
                    style={{ color: "#111c14" }}
                  >
                    {s}
                  </p>
                  {isMine && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white flex-shrink-0"
                      style={{ color: BRAND }}
                    >
                      YOU
                    </span>
                  )}
                </div>
                <span
                  className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-white flex-shrink-0"
                  style={{ color: "#8fa394" }}
                >
                  {cards.length}
                </span>
              </div>
              <p
                className="text-[10.5px] px-1.5 pt-0.5 pb-2.5 truncate"
                style={{ color: "#b6c3ba" }}
              >
                {STAGE_OWNER[s]}
              </p>

              <div className="space-y-2 overflow-y-auto max-h-[520px] pr-0.5">
                {cards.map((it) => (
                  <QueueCard
                    key={it.id}
                    item={it}
                    role={role}
                    onOpen={() => {
                      setOpenId(it.id);
                      setRemark("");
                      setFlash(null);
                    }}
                  />
                ))}
                {cards.length === 0 && (
                  <div
                    className="text-center text-[11.5px] py-10 rounded-2xl border border-dashed"
                    style={{ color: "#b6c3ba", borderColor: "#e2e8e4" }}
                  >
                    {loading ? "Loading…" : "Empty"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Review + decide */}
      <Modal
        isOpen={!!open}
        onClose={close}
        title={open ? `${open.faculty} · ${open.type}` : "Submission"}
        size="lg"
        align="left"
        actions={
          canAct && open ? (
            <div className="w-full space-y-3">
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
                placeholder="Add a remark — required context when disapproving…"
                className="w-full px-3 py-2 rounded-xl border text-[13px] outline-none resize-none"
                style={{
                  borderColor: "#e8eeea",
                  color: "#111c14",
                  background: "#fafbfa",
                }}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11.5px]" style={{ color: "#8fa394" }}>
                  {next
                    ? `Approving forwards this to ${next}.`
                    : "Final stage — approving clears it for payroll."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide(open, "Disapprove")}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold border transition-colors hover:bg-[#fdf3f2]"
                    style={{
                      borderColor: "#edc9c5",
                      color: "#c0392b",
                      background: "#fff",
                    }}
                  >
                    Disapprove &amp; return
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(open, "Approve")}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.99]"
                    style={{ background: BRAND }}
                  >
                    {next ? "Approve & forward" : "Approve & clear"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <GhostButton onClick={close}>Close</GhostButton>
          )
        }
      >
        {open && openStatus && (
          <div className="space-y-3.5">
            <div
              className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 flex-wrap"
              style={{ background: "#fafbfa", border: "1px solid #eef1ef" }}
            >
              <div className="flex items-center gap-2.5">
                <Badge tone={openStatus.tone} dot>
                  {openStatus.label}
                </Badge>
                <span className="text-[12.5px]" style={{ color: "#5a6b5e" }}>
                  {openStatus.note}
                </span>
              </div>
              <span className="text-[11.5px]" style={{ color: "#b6c3ba" }}>
                Ref {open.reference} · filed {open.submitted}
              </span>
            </div>

            <StageProgress item={open} />

            {!canAct && (
              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[12.5px]"
                style={{
                  background: openStatus.tone === "red" ? "#fbecec" : "#eaf4ee",
                  color: openStatus.tone === "red" ? "#c0392b" : "#2f7043",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 flex-shrink-0"
                >
                  {openStatus.tone === "red" ? (
                    <path d="M6 6l12 12M18 6L6 18" />
                  ) : (
                    <path d="M5 13l4 4L19 7" />
                  )}
                </svg>
                <span>
                  {!role
                    ? "Your account has no assigned review stage. You can view submissions but cannot change them."
                    : open.status === "Approved"
                    ? "Fully approved — no further action needed."
                    : open.status === "Disapproved"
                      ? `Disapproved at the ${open.stage} stage and returned to the faculty.`
                      : openStatus.label === "Done"
                        ? `Already approved by you — it is now with ${open.stage}.`
                        : `Not yet at your stage — currently with ${open.stage}.`}
                </span>
              </div>
            )}

            <SubmissionDetail
              record={open.record}
              type={open.type}
              status={open.status}
              initials={initialsOf(open.faculty)}
              colorIndex={STAGES.indexOf(open.stage)}
              loggedAt={open.submitted}
              event={open.event}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
