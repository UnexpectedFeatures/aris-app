import { useState, useMemo, type ReactNode } from "react"
import { useAuth } from "@/app/authContext"
import { BRAND } from "@/config/navigation"
import { useResource } from "@/hooks/useResource"
import { demoAuditLogs, type AuditLog, type AuditApiResponse } from "@/data/demoAuditLogs"
import {
  Card,
  PageTitle,
  GhostButton,
  SearchInput,
  Badge,
  Tabs,
  Modal,
  statusTone,
  SubmissionDetail,
  StatCard,
  StatGrid,
  type RecordKind,
  type RecordPayload,
  type StatusKind,
} from "@/components/ui"

type HistoryRecord = {
  id?: string
  type: RecordKind
  period: string
  units: string
  submitted: string
  status: StatusKind
  stage?: string
  currentStage?: string
  /** One-line summary of the event shown in the detail modal. */
  event: string
  record: RecordPayload
}

export type LatestSubmission = {
  type: RecordKind
  period: string
  units: string
  reference: string
  filed: string
  status: StatusKind
  currentStage: string
  currentSince: string
}

/* ─── Latest submission routing ────────────────────────────────────────────── */

type StageState = "done" | "current" | "pending" | "rejected"

type RoutingStage = {
  label: string
  owner: string
  note: string
  when?: string
  state: StageState
  icon: ReactNode
}

const stageIcon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    {path}
  </svg>
)

const AMBER = "#d99a2b"
const RED = "#c0392b"

function getRoutingStages(submission: LatestSubmission): RoutingStage[] {
  const stage = (submission.currentStage || "Checker").toLowerCase()
  const isApproved = submission.status === "Approved"
  const isRejected = submission.status === "Rejected" || submission.status === "Disapproved"

  // Stage order:
  // 0: Device
  // 1: Checker
  // 2: Secretary
  // 3: HR
  // 4: Accounting

  const stageRank = isApproved
    ? 5
    : stage.includes("account") || stage.includes("payroll")
    ? 4
    : stage.includes("hr") || stage.includes("human")
    ? 3
    : stage.includes("sec") || stage.includes("dept") || stage.includes("department")
    ? 2
    : 1

  const getState = (rank: number): StageState => {
    if (rank < stageRank) return "done"
    if (rank === stageRank) return isApproved ? "done" : isRejected ? "rejected" : "current"
    return "pending"
  }

  return [
    {
      label: "Device",
      owner: "Your device",
      note: "Filed successfully",
      when: submission.filed,
      state: "done",
      icon: stageIcon(
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>,
      ),
    },
    {
      label: "Checker",
      owner: "Faculty Checker",
      note:
        getState(1) === "done"
          ? "Verified"
          : getState(1) === "current"
          ? "Reviewing entries"
          : getState(1) === "rejected"
          ? "Disapproved"
          : "Awaiting review",
      when: getState(1) === "done" || getState(1) === "current" || getState(1) === "rejected" ? submission.filed : undefined,
      state: getState(1),
      icon: stageIcon(
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 12l2 2 4-4" />
        </>,
      ),
    },
    {
      label: "Secretary",
      owner: "College Secretary",
      note:
        getState(2) === "done"
          ? "Endorsed"
          : getState(2) === "current"
          ? "Routing to HR"
          : getState(2) === "rejected"
          ? "Disapproved"
          : "Awaiting checker",
      when: getState(2) === "current" || (getState(2) === "done" && stageRank > 2) ? submission.currentSince : undefined,
      state: getState(2),
      icon: stageIcon(
        <>
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </>,
      ),
    },
    {
      label: "HR",
      owner: "Human Resources",
      note:
        getState(3) === "done"
          ? "Verified & Endorsed"
          : getState(3) === "current"
          ? "Auditing records"
          : getState(3) === "rejected"
          ? "Disapproved"
          : "Awaiting endorsement",
      when: getState(3) === "current" || (getState(3) === "done" && stageRank > 3) ? submission.currentSince : undefined,
      state: getState(3),
      icon: stageIcon(
        <>
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </>,
      ),
    },
    {
      label: "Accounting",
      owner: "Payroll Office",
      note: isApproved
        ? "Cleared for payroll"
        : getState(4) === "current"
        ? "Payroll computation"
        : getState(4) === "rejected"
        ? "Disapproved"
        : "Awaiting HR approval",
      when: isApproved || getState(4) === "current" ? submission.currentSince : undefined,
      state: getState(4),
      icon: stageIcon(
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h8" />
        </>,
      ),
    },
  ]
}

function StageNode({ s }: { s: RoutingStage }) {
  const accent =
    s.state === "done"
      ? BRAND
      : s.state === "current"
      ? AMBER
      : s.state === "rejected"
      ? RED
      : "#c8d2cb"

  return (
    <div className="flex flex-col items-center text-center px-2">
      <span
        className="relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all"
        style={{
          background: s.state === "done" ? BRAND : s.state === "rejected" ? RED : "#fff",
          border: `2px solid ${accent}`,
          color: s.state === "done" || s.state === "rejected" ? "#fff" : accent,
          boxShadow: s.state === "current" ? `0 0 0 4px ${AMBER}22` : s.state === "rejected" ? `0 0 0 4px ${RED}22` : "none",
        }}
      >
        {s.state === "done" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : s.state === "rejected" ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          s.icon
        )}
      </span>
      <p
        className="text-[12.5px] font-semibold mt-2.5"
        style={{
          color:
            s.state === "current"
              ? "#996515"
              : s.state === "rejected"
              ? "#c0392b"
              : s.state === "done"
              ? "#111c14"
              : "#b6c3ba",
        }}
      >
        {s.label}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "#8fa394" }}>
        {s.owner}
      </p>
      <p
        className="text-[10.5px] mt-1 leading-snug"
        style={{
          color:
            s.state === "pending"
              ? "#c8d2cb"
              : s.state === "rejected"
              ? "#c0392b"
              : "#5a6b5e",
        }}
      >
        {s.note}
      </p>
      <p
        className="text-[10.5px] mt-1 tabular-nums"
        style={{ color: s.state === "pending" ? "#c8d2cb" : "#8fa394" }}
      >
        {s.when ?? "—"}
      </p>
    </div>
  )
}

function LatestSubmissionCard({
  submission,
}: {
  submission: LatestSubmission | null
}) {
  if (!submission || !submission.reference) {
    return (
      <Card className="mb-4 py-8 text-center border-dashed">
        <p className="text-[13px] font-medium" style={{ color: "#5a6b5e" }}>
          No active submissions filed yet
        </p>
        <p className="text-[12px] mt-1" style={{ color: "#8fa394" }}>
          Submit an Accomplishment Report or DTR to track real-time approval routing.
        </p>
      </Card>
    )
  }

  const isApproved = submission.status === "Approved"
  const isRejected = submission.status === "Rejected" || submission.status === "Disapproved"
  const routingStages = getRoutingStages(submission)

  const stage = (submission.currentStage || "Checker").toLowerCase()
  const stageRank = isApproved
    ? 5
    : stage.includes("account") || stage.includes("payroll")
    ? 4
    : stage.includes("hr") || stage.includes("human")
    ? 3
    : stage.includes("sec") || stage.includes("dept") || stage.includes("department")
    ? 2
    : 1

  const nextStop =
    stageRank === 1
      ? "College Secretary"
      : stageRank === 2
      ? "Human Resources"
      : stageRank === 3
      ? "Accounting (Payroll Office)"
      : "Payroll Disbursement"

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: "#111c14" }}>
            Latest Submission
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "#8fa394" }}>
            {submission.type} · {submission.period} · {submission.units} · filed {submission.filed}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge tone={statusTone[submission.status]} dot>
            {submission.status}
          </Badge>
          <span
            className="text-[11.5px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "#f0f2f0", color: "#5a6b5e" }}
          >
            Ref {submission.reference}
          </span>
        </div>
      </div>

      <div
        className="flex items-center gap-2 mt-3.5 px-3.5 py-2.5 rounded-xl text-[12px]"
        style={{
          background: isApproved ? "#eaf4ee" : isRejected ? "#fbecec" : "#fbf1de",
          color: isApproved ? "#2f7043" : isRejected ? "#c0392b" : "#996515",
        }}
      >
        {isApproved ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : isRejected ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0">
            <circle cx="12" cy="12" r="9" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        )}
        <span>
          {isApproved
            ? "Fully verified and approved for payroll processing."
            : isRejected
            ? `Disapproved at the ${submission.currentStage} stage — returned for faculty correction.`
            : `Currently with the ${submission.currentStage} since ${submission.currentSince} — next stop: ${nextStop}.`}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="relative min-w-[720px]">
          {/* connector rail: from the centre of each stage to the next */}
          <div className="absolute top-[17px] left-0 right-0 h-[2px]">
            {[0, 1, 2, 3].map((i) => {
              const fromDone = routingStages[i].state === "done"
              const toReached = routingStages[i + 1].state !== "pending"
              const toRejected = routingStages[i + 1].state === "rejected"
              const color = toRejected ? RED : fromDone && toReached ? BRAND : "#e2e8e4"

              return (
                <span
                  key={i}
                  className="absolute h-[2px] rounded-full transition-colors"
                  style={{
                    left: `${10 + i * 20}%`,
                    width: "20%",
                    background: color,
                  }}
                />
              )
            })}
          </div>
          <div className="relative grid grid-cols-5">
            {routingStages.map((s) => (
              <StageNode key={s.label} s={s} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11.5px] mt-3" style={{ color: "#b6c3ba" }}>
        The record moves automatically to the next stage upon verification.
      </p>
    </Card>
  )
}

export default function ProfHistory() {
  const { user } = useAuth()
  const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : ""
  // Sourced directly from /audit, identical to how aris-web in audit logs gets it
  const { data: rawData, loading, reload } = useResource<AuditApiResponse | AuditLog[]>(
    `/audit${emailQuery}`,
    demoAuditLogs,
  )

  const logs: AuditLog[] = useMemo(() => {
    if (Array.isArray(rawData)) return rawData
    if (rawData && Array.isArray((rawData as AuditApiResponse).logs)) {
      return (rawData as AuditApiResponse).logs
    }
    return demoAuditLogs
  }, [rawData])

  const allRecords: HistoryRecord[] = useMemo(() => {
    return logs.map((log: any) => {
      if (log.units && log.period && log.submitted && log.status) {
        return log as HistoryRecord
      }
      const stageKey = (log.stage_key || log.approval_stage || "").toUpperCase()
      const stageOrder =
        log.stage_order ||
        (stageKey === "AR-AP-STG-4" ? 4 : stageKey === "AR-AP-STG-3" ? 3 : stageKey === "AR-AP-STG-2" ? 2 : 1)

      const stageRole =
        log.stage_role ||
        (stageOrder === 4
          ? "Accounting"
          : stageOrder === 3
          ? "HR"
          : stageOrder === 2
          ? "Secretary"
          : "Checker")

      const status: StatusKind =
        log.result === "Missing"
          ? "Flagged"
          : log.result === "Approved"
          ? "Approved"
          : log.result === "Rejected" || log.result === "Disapproved"
          ? "Rejected"
          : "Pending"

      const units = log.target?.includes("·")
        ? log.target.split("·")[1].trim()
        : log.record?.tables?.length
          ? `${log.record.tables.length} course${log.record.tables.length === 1 ? "" : "s"}`
          : log.type === "DTR"
            ? "22 days"
            : "3 courses"
      const period =
        log.record?.period ||
        (log.target?.includes("·") ? log.target.split("·")[0].trim() : "Current Cycle")
      const submitted = log.record?.reviewedAt || log.time || "Recently"

      return {
        id: log.id || log.record?.reference,
        type: log.type,
        period,
        units,
        submitted,
        status,
        stage: stageRole,
        currentStage: stageRole,
        event: log.action ? `${log.action} · ${log.target}` : log.target || `${log.type} submitted`,
        record: log.record,
      } as HistoryRecord
    })
  }, [logs])

  // Scope to the logged in professor if matched, otherwise show all records
  const records: HistoryRecord[] = useMemo(() => {
    if (!user?.email && !user?.name) return allRecords
    const userEmail = user?.email?.toLowerCase().trim()
    const userName = user?.name?.toLowerCase().trim()

    const matched = allRecords.filter((r) => {
      const rec = r.record
      if (!rec) return false
      const fName = rec.facultyName?.toLowerCase().trim() || ""
      const email = ((rec as any).email || "").toLowerCase().trim()
      return (
        (userEmail && email && email === userEmail) ||
        (userName && fName && (fName.includes(userName) || userName.includes(fName)))
      )
    })

    return matched.length > 0 ? matched : allRecords
  }, [allRecords, user])

  const latestSubmission: LatestSubmission | null = useMemo(() => {
    if (records.length === 0) return null
    const sorted = [...records].sort((a, b) => {
      const timeA = new Date(a.record?.reviewedAt || a.submitted).getTime()
      const timeB = new Date(b.record?.reviewedAt || b.submitted).getTime()
      if (!isNaN(timeA) && !isNaN(timeB)) return timeB - timeA
      return 0
    })
    const latest = sorted[0] || records[0]
    return {
      type: latest.type,
      period: latest.period,
      units: latest.units,
      reference: latest.record?.reference || latest.id || "AR-001",
      filed: latest.submitted,
      status: latest.status,
      currentStage: latest.currentStage || latest.stage || "Checker",
      currentSince: latest.submitted,
    }
  }, [records])
  const [tab, setTab] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [selected, setSelected] = useState<{
    row: HistoryRecord
    idx: number
  } | null>(null)
  const tabs = ["All", "AR", "DTR"]
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "ME"

  const rows = records.filter((r) => {
    if (tab !== "All" && r.type !== tab) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchPeriod = r.period?.toLowerCase().includes(q)
      const matchRef =
        r.id?.toLowerCase().includes(q) ||
        r.record?.reference?.toLowerCase().includes(q)
      const matchUnits = r.units?.toLowerCase().includes(q)
      const matchStage = r.stage?.toLowerCase().includes(q)
      const matchStatus = r.status?.toLowerCase().includes(q)
      return Boolean(matchPeriod || matchRef || matchUnits || matchStage || matchStatus)
    }
    return true
  })
  const approvedCount = records.filter((record) => record.status === "Approved").length
  const pendingCount = records.filter((record) => record.status === "Pending").length
  const rejectedCount = records.filter(
    (record) => record.status === "Rejected" || record.status === "Disapproved",
  ).length

  return (
    <div className="pb-2">
      <PageTitle
        title="Submission History"
        subtitle="Every AR / DTR you have filed, with its verification outcome."
        action={
          <div className="flex items-center gap-2">
            <GhostButton onClick={() => reload()}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              >
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
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

      <LatestSubmissionCard submission={latestSubmission} />

      <StatGrid className="mb-4">
        {[
          ["Total Filed", String(records.length)],
          ["Approved", String(approvedCount)],
          ["Pending", String(pendingCount)],
          ["Rejected", String(rejectedCount)],
        ].map(([l, v]) => (
          <StatCard key={l} label={l} value={v} />
        ))}
      </StatGrid>

      <Card className="p-0 overflow-x-auto">
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: "#eef1ef" }}
        >
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search records by period, reference..."
          />
        </div>
        <div
          className="grid min-w-[760px] grid-cols-[0.7fr_1.2fr_1.1fr_1.1fr_1.4fr_1fr] px-5 py-2.5 text-[11px] uppercase tracking-wide font-semibold"
          style={{ color: "#b6c3ba", background: "#fafbfa" }}
        >
          <span>Type</span>
          <span>Period</span>
          <span>Units</span>
          <span>Stage</span>
          <span>Submitted</span>
          <span className="text-right">Status</span>
        </div>
        {rows.length === 0 ? (
          <div className="py-14 text-center text-[#8fa394] text-[13px]">
            {loading ? "Loading submissions..." : "No submission records found."}
          </div>
        ) : (
          rows.map((r, i) => (
            <button
              key={r.id || i}
              type="button"
              onClick={() => setSelected({ row: r, idx: i })}
              title="View submission detail"
              className="grid min-w-[760px] w-full text-left grid-cols-[0.7fr_1.2fr_1.1fr_1.1fr_1.4fr_1fr] items-center px-5 py-3 border-t transition-colors hover:bg-[#fafbfa] cursor-pointer"
              style={{ borderColor: "#f2f4f2" }}
            >
              <span
                className="text-[12px] font-semibold"
                style={{ color: r.type === "DTR" ? BRAND : "#3f8ecc" }}
              >
                {r.type}
              </span>
              <span className="text-[13px]" style={{ color: "#3d4a41" }}>
                {r.period}
              </span>
              <span
                className="text-[13px] tabular-nums"
                style={{ color: "#8fa394" }}
              >
                {r.units}
              </span>
              <span className="text-[12px]">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium text-[11.5px]"
                  style={{
                    background:
                      r.stage === "Accounting"
                        ? "#eaf4ee"
                        : r.stage === "HR"
                        ? "#fdf3e7"
                        : r.stage === "Secretary"
                        ? "#eef3fb"
                        : "#f3f5f3",
                    color:
                      r.stage === "Accounting"
                        ? "#2f7043"
                        : r.stage === "HR"
                        ? "#b45309"
                        : r.stage === "Secretary"
                        ? "#1d4ed8"
                        : "#5a6b5e",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        r.stage === "Accounting"
                          ? "#2f7043"
                          : r.stage === "HR"
                          ? "#b45309"
                          : r.stage === "Secretary"
                          ? "#1d4ed8"
                          : "#8fa394",
                    }}
                  />
                  {r.stage || "Checker"}
                </span>
              </span>
              <span className="text-[13px]" style={{ color: "#8fa394" }}>
                {r.submitted}
              </span>
              <span className="flex justify-end">
                <Badge tone={statusTone[r.status]} dot>
                  {r.status}
                </Badge>
              </span>
            </button>
          ))
        )}
      </Card>

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `${selected.row.type === "AR" ? "AR" : "DTR"} Submission Detail`
            : "Submission Detail"
        }
        size="lg"
        align="left"
        actions={
          <GhostButton onClick={() => setSelected(null)}>Close</GhostButton>
        }
      >
        {selected && (
          <SubmissionDetail
            record={selected.row.record}
            type={selected.row.type}
            status={selected.row.status}
            initials={initials}
            colorIndex={selected.idx}
            loggedAt={selected.row.submitted}
            event={selected.row.event}
          />
        )}
      </Modal>
    </div>
  )
}
