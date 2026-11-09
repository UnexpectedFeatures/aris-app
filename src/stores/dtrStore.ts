import { useSyncExternalStore } from "react";
import { authenticatorApi } from "../services/rustMiddleware";
import { toBridgeError } from "../data/types";
import {
  fetchDtrRecords,
  getUserId,
  punch,
} from "../services/biometricsService";

export interface DtrRecord {
  id: string;
  professor_id: string | null;
  staff_id: string | null;
  authenticator_tag: string | null;
  time_in: string | null;
  time_out: string | null;
  total_hours: string;
  shift_date: string;
  on_site: boolean;
  created_at: string;
  updated_at: string;
  employee_id: string | null;
  name: string;
  missed_time_in: boolean;
  missed_time_out: boolean;
}

export type PunchAction =
  | "time_in"
  | "time_out"
  | "duplicate"
  | "already_completed";

export interface PunchResult {
  action: PunchAction;
  recordId: string;
  shiftDate: string;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: string;
  onSite: boolean;
}

export type NextAction = "time_in" | "time_out" | "completed";
export type PunchPhase = "idle" | "scanning" | "submitting" | "done" | "failed";

export interface PunchState {
  phase: PunchPhase;
  result: PunchResult | null;
  error: string | null;
}

interface DtrState {
  userId: string | null;
  records: DtrRecord[];
  loading: boolean;
  loadError: string | null;
  punch: PunchState;
}

const IDLE: PunchState = { phase: "idle", result: null, error: null };
const DAY_MS = 24 * 60 * 60 * 1000;

const SCAN_TEXT: Record<string, string> = {
  no_match: "Fingerprint not recognised.",
  scan_timeout: "No finger detected in time.",
  sensor_unavailable: "Fingerprint sensor is not connected.",
  busy: "The authenticator is busy with another operation.",
};

// ───────── store plumbing ─────────

let state: DtrState = {
  userId: null,
  records: [],
  loading: false,
  loadError: null,
  punch: IDLE,
};
const listeners = new Set<() => void>();

function set(patch: Partial<DtrState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useDtrStore = () => useSyncExternalStore(subscribe, () => state);

function message(e: unknown): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (m) return Array.isArray(m) ? m.join(", ") : m;
  return toBridgeError(e).message;
}

// ───────── selectors ─────────

export function selectMine(records: DtrRecord[], userId: string | null) {
  if (!userId) return [];
  return records
    .filter((r) => r.professor_id === userId || r.staff_id === userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

const todayManila = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

// Mirrors the server rule: open row inside 24h -> time out; today's closed row -> completed.
export function selectNextAction(mine: DtrRecord[]): NextAction {
  const last = mine[0];
  if (!last) return "time_in";
  const open =
    !!last.time_in &&
    !last.time_out &&
    Date.now() - Date.parse(last.created_at) < DAY_MS;
  if (open) return "time_out";
  if (last.shift_date === todayManila() && last.time_out) return "completed";
  return "time_in";
}

// ───────── actions ─────────

export async function loadDtr() {
  set({ loading: true, loadError: null });
  try {
    const [userId, body] = await Promise.all([getUserId(), fetchDtrRecords()]);
    const rows = (Array.isArray(body) ? body : body?.data) as
      | DtrRecord[]
      | undefined;
    set({ userId, records: rows ?? [], loading: false });
  } catch (e) {
    set({ loading: false, loadError: message(e) });
  }
}

let runId = 0;

export function resetPunch() {
  runId++;
  set({ punch: IDLE });
}

export async function cancelScan() {
  try {
    await authenticatorApi.send("cancel");
  } catch {
    /* nothing running */
  }
}

// 1) authenticator verifies the finger  2) app sends the punch  3) records reload
export async function punchNow(deviceId: string, timeoutMs = 10000) {
  const { phase } = state.punch;
  if (phase === "scanning" || phase === "submitting") return;

  const id = ++runId;
  const live = () => id === runId;
  set({ punch: { phase: "scanning", result: null, error: null } });

  try {
    await authenticatorApi.send("match", { timeoutMs });
  } catch (e) {
    if (!live()) return;
    const err = toBridgeError(e);
    set({
      punch:
        err.code === "cancelled"
          ? IDLE
          : {
              phase: "failed",
              result: null,
              error: SCAN_TEXT[err.code] ?? err.message,
            },
    });
    return;
  }
  if (!live()) return;

  set({ punch: { phase: "submitting", result: null, error: null } });
  try {
    const body = await punch({ authenticator_tag: deviceId });
    const result = (body?.data ?? body) as PunchResult;
    if (live()) set({ punch: { phase: "done", result, error: null } });
  } catch (e) {
    if (live())
      set({ punch: { phase: "failed", result: null, error: message(e) } });
  }
  void loadDtr(); // the server may have written a row even if the modal was closed
}
