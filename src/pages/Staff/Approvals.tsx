import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
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
// Dynamically configurable with backward-compatible legacy pipeline fallback.

const STAGES = ["Checker", "Secretary", "HR", "Accounting"] as const;
type StageRole = string;

export type ApprovalStageItem = {
  id?: string;
  stage_key: string;
  label: string;
  role_name?: string;
  stage_order: number;
  document_type?: "AR" | "DTR" | "ALL";
  color?: string;
  description?: string;
  is_final?: boolean;
  is_active?: boolean;
};

/** Staff account signed in at each stage (fallback names). */
const STAGE_OWNER: Record<string, string> = {
  Checker: "Prof. R. Alonzo",
  Secretary: "L. Bautista",
  HR: "Ana Bautista",
  Accounting: "Payroll Office",
};

const STAGE_COLOR: Record<string, string> = {
  Checker: "#3a7d4e",
  Secretary: "#3f8ecc",
  HR: "#8a63c4",
  Accounting: "#d99a2b",
};

export const getStageColor = (stageName: string, item?: ApprovalItem | null): string => {
  if (item?.stageColor && item.stage === stageName) return item.stageColor;
  if (item?.stages) {
    const found = item.stages.find((s) => s.label === stageName || s.role_name === stageName);
    if (found?.color) return found.color;
  }
  return STAGE_COLOR[stageName] || "#3a7d4e";
};

export function matchesUserPosition(
  userPos?: string | null,
  stageRole?: string | null,
  stageLabel?: string | null,
): boolean {
  if (!userPos) return false;
  const pos = userPos.trim().toLowerCase();
  const r = (stageRole || "").trim().toLowerCase();
  const l = (stageLabel || "").trim().toLowerCase();

  if (pos.includes("check") && (r.includes("check") || l.includes("check"))) return true;
  if (pos.includes("sec") && (r.includes("sec") || l.includes("sec"))) return true;
  if ((pos.includes("hr") || pos.includes("human")) && (r.includes("hr") || l.includes("hr") || r.includes("human") || l.includes("human"))) return true;
  if ((pos.includes("account") || pos.includes("payroll")) && (r.includes("account") || l.includes("account") || r.includes("payroll") || l.includes("payroll"))) return true;

  if (r && (pos.includes(r) || r.includes(pos))) return true;
  if (l && (pos.includes(l) || l.includes(pos))) return true;
  return false;
}

export const getNextStage = (item: ApprovalItem): ApprovalStageItem | undefined => {
  if (!item) return undefined;
  const stages: ApprovalStageItem[] =
    item.stages && item.stages.length > 0
      ? item.stages
      : STAGES.map((name, i) => ({
          stage_key: `STG-${i + 1}`,
          label: name,
          role_name: name,
          stage_order: i + 1,
          color: STAGE_COLOR[name] || "#3a7d4e",
          is_final: i === STAGES.length - 1,
        }));
  const at = item.currentStageIndex ?? stages.findIndex((s) => s.label === item.stage);
  if (at === -1 || at >= stages.length - 1) return undefined;
  return stages[at + 1];
};

type ApprovalItem = {
  id: string;
  faculty: string;
  facultyNumber: string;
  type: RecordKind;
  period: string;
  reference: string;
  submitted: string;
  /** Stage the submission currently sits at. */
  stage: string;
  stageRole?: string;
  stageColor?: string;
  stageOrder?: number;
  currentStageIndex?: number;
  isPastFlow?: boolean;
  stages?: ApprovalStageItem[];
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
  role: string | null,
): { label: string; tone: "green" | "amber" | "red" | "gray"; note: string } {
  const stages: ApprovalStageItem[] =
    it.stages && itemStagesValid(it.stages)
      ? it.stages
      : STAGES.map((s, idx) => ({
          stage_key: `STG-${idx + 1}`,
          label: s,
          role_name: s,
          stage_order: idx + 1,
          color: STAGE_COLOR[s] || "#3a7d4e",
          is_final: idx === 3,
        }));

  let at = it.currentStageIndex ?? stages.findIndex((s) => s.label === it.stage);
  if (at === -1) at = 0;

  if (it.status === "Disapproved") {
    return { label: "Disapproved", tone: "red", note: `at ${it.stage}` };
  }
  if (it.status === "Approved") {
    return { label: "Done", tone: "green", note: "cleared for payroll" };
  }

  if (!role) return { label: "View only", tone: "gray", note: `at ${it.stage}` };

  const mine = stages.findIndex((s) => matchesUserPosition(role, s.role_name, s.label));
  if (mine === -1) {
    return { label: it.status, tone: "amber", note: `at ${it.stage}` };
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

function itemStagesValid(stages?: ApprovalStageItem[]): boolean {
  return Array.isArray(stages) && stages.length > 0;
}

/* ─── Stage progress rail ──────────────────────────────────────────────────── */

function StageProgress({ item }: { item: ApprovalItem }) {
  const stages: ApprovalStageItem[] =
    item.stages && itemStagesValid(item.stages)
      ? item.stages
      : STAGES.map((name, i) => ({
          stage_key: `STG-${i + 1}`,
          label: name,
          role_name: name,
          stage_order: i + 1,
          color: STAGE_COLOR[name] || "#3a7d4e",
          is_final: i === STAGES.length - 1,
        }));

  let at = item.currentStageIndex ?? stages.findIndex((s) => s.label === item.stage);
  if (at === -1) at = 0;
  const finished = item.status === "Approved";
  const rejected = item.status === "Disapproved";

  return (
    <div>
      <div className="flex items-center gap-1.5 mt-4 flex-wrap">
        {stages.map((stg, i) => {
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
            <span key={stg.stage_key || `${stg.label}-${i}`} className="flex items-center gap-1.5">
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
                {stg.label}
              </span>
            </span>
          );
        })}
      </div>
      {item.isPastFlow && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#718576]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0 text-[#8fa394]">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Retaining original approval paper flow (legacy 4-stage process).</span>
        </div>
      )}
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

function QueueCard({
  item,
  role,
  onOpen,
}: {
  item: ApprovalItem;
  role: string | null;
  onOpen: () => void;
}) {
  const st = stageStatus(item, role);
  const decided = item.status !== "Pending";
  const accent =
    item.status === "Approved"
      ? "#2f7043"
      : item.status === "Disapproved"
        ? "#c0392b"
        : getStageColor(item.stage, item);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white rounded-2xl p-3 border transition-all hover:shadow-md cursor-pointer"
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
        {item.isPastFlow && (
          <span className="text-[9.5px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">
            Past flow
          </span>
        )}
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
  const navigate = useNavigate();
  const isAdmin = user.role === "administrator";
  const userStaffRole = user.staffStage || (isAdmin ? "Admin" : null);

  const { data: rawStages } = useResource<ApprovalStageItem[]>("/approvals/stages", []);
  const allStages = Array.isArray(rawStages) ? rawStages : [];

  const { data: rawQueue, setData: setQueue, loading } = useResource<ApprovalItem[]>("/approvals", []);
  const queue = Array.isArray(rawQueue) ? rawQueue : [];

  const [query, setQuery] = useState("");
  const [showDecided, setShowDecided] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Dynamic board columns derived from active stages
  const boardColumns = useMemo(() => {
    if (allStages.length > 0) {
      const active = allStages
        .filter((s) => s.is_active !== false)
        .sort((a, b) => a.stage_order - b.stage_order);
      const seen = new Set<string>();
      const cols: { key: string; label: string; role_name: string; color: string }[] = [];
      for (const stg of active) {
        if (!seen.has(stg.label)) {
          seen.add(stg.label);
          cols.push({
            key: stg.stage_key || stg.label,
            label: stg.label,
            role_name: stg.role_name || stg.label,
            color: stg.color || STAGE_COLOR[stg.label] || "#3a7d4e",
          });
        }
      }
      if (cols.length > 0) return cols;
    }
    return STAGES.map((s) => ({
      key: s,
      label: s,
      role_name: s,
      color: STAGE_COLOR[s],
    }));
  }, [allStages]);

  const open = queue.find((it) => it.id === openId) ?? null;
  const openStatus = open ? stageStatus(open, userStaffRole) : null;
  const next = useMemo(() => (open ? getNextStage(open) : undefined), [open]);

  const isTerminal = useMemo(() => {
    if (!open) return false;
    if (open.stages && itemStagesValid(open.stages)) {
      const idx = open.currentStageIndex ?? open.stages.findIndex((s) => s.label === open.stage);
      return Boolean(open.stages[idx]?.is_final || idx === open.stages.length - 1);
    }
    return open.stage === "Accounting" || userStaffRole === "Accounting";
  }, [open, userStaffRole]);

  const canAct =
    !!open &&
    (open.status === "Pending" || (isTerminal && open.status !== "Approved")) &&
    (isAdmin || matchesUserPosition(userStaffRole, open.stageRole, open.stage));

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

  const column = (colLabel: string, colRole: string) =>
    visible.filter((it) => it.stage === colLabel || it.stageRole === colRole || it.stage === colRole);

  const awaiting = userStaffRole
    ? queue.filter(
        (it) =>
          it.status === "Pending" &&
          (isAdmin || matchesUserPosition(userStaffRole, it.stageRole, it.stage)),
      ).length
    : 0;
  const inPipeline = queue.filter((it) => it.status === "Pending").length;

  const decide = async (item: ApprovalItem, action: "Approve" | "Disapprove") => {
    if (!canAct) return;
    const reviewer = `${user.name} (${userStaffRole || "Reviewer"})`;
    const target = next?.label;

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
              `Disapproved at the ${item.stage} stage. Returned to the faculty for correction.`,
          },
        };
      }
      return {
        ...it,
        stage: target ?? it.stage,
        currentStageIndex: target && it.currentStageIndex !== undefined ? it.currentStageIndex + 1 : it.currentStageIndex,
        status: target ? ("Pending" as StatusKind) : ("Approved" as StatusKind),
        record: {
          ...it.record,
          reviewer,
          reviewedAt: NOW,
          remark:
            remark.trim() ||
            (target
              ? `Approved at the ${item.stage} stage. Forwarded to ${target}.`
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
          <div className="flex items-center gap-3">
            {isAdmin && (
              <GhostButton onClick={() => navigate("/admin/approvals/workflow")}>
                Configure Approval Flow
              </GhostButton>
            )}
            <SearchInput
              placeholder="Search faculty, reference or period"
              value={query}
              onChange={setQuery}
              className="w-60"
            />
          </div>
        }
      />

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{
                background: userStaffRole
                  ? STAGE_COLOR[userStaffRole] || BRAND
                  : "#8fa394",
              }}
            >
              {userStaffRole ? userStaffRole.slice(0, 3).toUpperCase() : "VIEW"}
            </span>
            <div className="min-w-0">
              <p
                className="text-[13px] font-semibold"
                style={{ color: "#111c14" }}
              >
                {isAdmin
                  ? "Administrator Access (Full Pipeline View)"
                  : userStaffRole
                    ? `Assigned role: ${userStaffRole}`
                    : "Read-only access"}
              </p>
              <p className="text-[11.5px]" style={{ color: "#8fa394" }}>
                {userStaffRole
                  ? `${user.name} · ${awaiting} to review`
                  : "No review role assigned. Contact an administrator for access."}
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
            {!userStaffRole && !isAdmin && <Badge tone="gray">View only</Badge>}
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
            className="transition-opacity hover:opacity-60 cursor-pointer"
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

      {/* Pipeline board — dynamic columns per stage */}
      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {boardColumns.map((col) => {
          const cards = column(col.label, col.role_name);
          const isMine = isAdmin || matchesUserPosition(userStaffRole, col.role_name, col.label);
          return (
            <div
              key={col.key}
              className="rounded-3xl p-2.5 min-h-[440px] flex flex-col"
              style={{
                background: isMine && !isAdmin ? "#f0f7f2" : "#f4f6f5",
                boxShadow: isMine && !isAdmin ? `inset 0 0 0 1.5px ${BRAND}33` : "none",
              }}
            >
              <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: col.color }}
                  />
                  <p
                    className="text-[12.5px] font-bold truncate"
                    style={{ color: "#111c14" }}
                  >
                    {col.label}
                  </p>
                  {isMine && !isAdmin && (
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
                {STAGE_OWNER[col.label] || col.role_name}
              </p>

              <div className="space-y-2 overflow-y-auto max-h-[520px] pr-0.5">
                {cards.map((it) => (
                  <QueueCard
                    key={it.id}
                    item={it}
                    role={userStaffRole}
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
                    ? `Approving forwards this to ${next.label}.`
                    : "Final stage — approving clears it for payroll."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide(open, "Disapprove")}
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold border transition-colors hover:bg-[#fdf3f2] cursor-pointer"
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
                    className="h-9 px-4 rounded-xl text-[13px] font-semibold text-white transition-transform active:scale-[0.99] cursor-pointer"
                    style={{ background: BRAND }}
                  >
                    {next ? `Approve & forward to ${next.label}` : "Approve & clear"}
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
                {open.isPastFlow && (
                  <Badge tone="amber">Past Flow (Preserved)</Badge>
                )}
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
                  {!userStaffRole && !isAdmin
                    ? "Your account has no assigned review stage. You can view submissions but cannot change them."
                    : open.status === "Approved"
                    ? "Fully approved — no further action needed."
                    : open.status === "Disapproved"
                      ? `Disapproved at the ${open.stage} stage and returned to the faculty.`
                      : openStatus.label === "Done"
                        ? `Already approved by your stage — it is now with ${open.stage}.`
                        : `Not yet at your stage — currently with ${open.stage}.`}
                </span>
              </div>
            )}

            <SubmissionDetail
              record={open.record}
              type={open.type}
              status={open.status}
              initials={initialsOf(open.faculty)}
              colorIndex={open.currentStageIndex ?? 0}
              loggedAt={open.submitted}
              event={open.event}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
