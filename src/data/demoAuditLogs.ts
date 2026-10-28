import { arTable, dtrTable, type RecordKind, type RecordPayload, type StatusKind } from "@/components/ui";

export type ApprovalStage = {
  id: string;
  stage_key: string;
  label: string;
  stage_order: number;
  is_active: boolean;
  report_count?: number;
};

// Audit trail scoped to AR (Accomplishment Report) / DTR (Daily Time Record) submissions.
export type AuditLog = {
  id?: string;
  actor: string;
  init: string;
  type: RecordKind;
  action: string;
  target: string;
  time: string;
  result: StatusKind;
  stage?: string;
  stage_role?: string;
  stage_key?: string;
  approval_stage?: string;
  stage_order?: number;
  payroll_availability?: boolean;
  payroll_received?: boolean;
  record: RecordPayload;
};

export type AuditApiResponse = {
  logs: AuditLog[];
  stats?: {
    total: number;
    submitted: number;
    approved: number;
    rejected: number;
    flagged: number;
    missing: number;
  };
  stages?: ApprovalStage[];
};

export const demoAuditLogs: AuditLog[] = [
  {
    actor: "Dr. Maria Santos",
    init: "MS",
    type: "AR",
    action: "AR submitted",
    target: "Sep Cycle 1 · 18 outputs",
    time: "12:41 PM",
    result: "Submitted",
    stage: "Pending",
    stage_order: 1,
    record: {
      period: "September Cycle 1",
      reference: "AR-2026-0917-0142",
      facultyName: "Dr. Maria Santos",
      facultyNumber: "214",
      college: "College of Engineering",
      tables: [
        arTable("CS 102 — WEB DEVELOPMENT", "September 1–12, 2026", [
          ["CS 102", "BSIT 3A", 3, "Monday", "7:00AM–10:00AM", "CONGRESS"],
          ["CS 102", "BSIT 3B", 3, "Tuesday", "1:00PM–4:00PM", "CONGRESS"],
          ["CS 301", "BSCS 3A", 3, "Thursday", "8:00AM–11:00AM", "CONGRESS"],
        ]),
      ],
      topics: "a) HTML document structure\nb) Semantic tags and accessibility",
      tasks:
        "a) Discussed semantic elements and their use.\nb) Hands-on activity: build a personal profile page.\nc) Uploaded reference materials to G-Class.",
      notes: "Class suspended on September 8 due to typhoon; make-up session held on September 12.",
      attachment: "AR_Santos_SepCycle1.pdf · 1.2 MB",
      reviewer: "Department Chairperson",
      reviewedAt: "September 17, 2026 · 12:41 PM",
      remark: "Received and queued for Department validation.",
    },
  },
  {
    actor: "Ana Bautista (HR)",
    init: "AB",
    type: "AR",
    action: "AR rejected by HR",
    target: "Missing output attachments",
    time: "12:19 PM",
    result: "Rejected",
    stage: "HR",
    stage_order: 3,
    record: {
      period: "September Cycle 1",
      reference: "AR-2026-0917-0138",
      facultyName: "Marco Dela Cruz",
      facultyNumber: "342",
      college: "Arts & Sciences",
      tables: [
        arTable("GE 101 — UNDERSTANDING THE SELF", "September 2–11, 2026", [
          ["GE 101", "BSIT 1A", 3, "Wednesday", "9:00AM–12:00PM", "CONGRESS"],
        ]),
      ],
      topics: "a) The self from a philosophical perspective",
      tasks: "a) Lecture and small-group discussion.\nb) Reflection paper assigned and collected.",
      reviewer: "HR Office — Ana Bautista",
      reviewedAt: "September 17, 2026 · 12:19 PM",
      remark: "Returned to faculty. No output attachments were included for the September 11 session.",
    },
  },
  {
    actor: "James Reyes",
    init: "JR",
    type: "DTR",
    action: "DTR flagged · wrong name",
    target: "Name mismatch vs. roster",
    time: "11:58 AM",
    result: "Flagged",
    record: {
      period: "September Cycle 1",
      reference: "DTR-2026-0917-0121",
      facultyName: "James Reyes",
      facultyNumber: "301",
      college: "College of Engineering",
      tables: [
        dtrTable("DTR — September 1–15, 2026", "22 days logged", [
          ["Sep 01", "7:52 AM", "5:04 PM", 8.2],
          ["Sep 02", "8:31 AM", "5:10 PM", 7.7],
          ["Sep 03", "7:45 AM", "5:00 PM", 8.3],
        ]),
      ],
      attachment: "DTR_Reyes_SepCycle1.xlsx · 84 KB",
      reviewer: "HR Office — Ana Bautista",
      reviewedAt: "September 17, 2026 · 11:58 AM",
      remark: "Biometric entry “J. Reyes” does not match the roster entry “James R. Reyes”. Awaiting HR confirmation.",
    },
  },
];

