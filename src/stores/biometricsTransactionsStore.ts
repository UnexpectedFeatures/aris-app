import { useSyncExternalStore } from "react";
import { fetchBiometricsTransactions } from "../services/biometricsService";
export interface BiometricTransaction {
  id: string;
  emp: string;
  emp_code: string;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  position: string | null;
  punch_time: string;
  punch_state: string;
  punch_state_display: string;
  verify_type: number;
  verify_type_display: string;
  work_code: string;
  area_alias: string | null;
  terminal_sn: string;
  terminal_alias: string | null;
  upload_time: string;
  created_at: string;
}

export interface TransactionFilters {
  emp_code: string;
  start_date: string;
  end_date: string;
}

interface TransactionsState {
  records: BiometricTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  filters: TransactionFilters;
  loading: boolean;
  error: string | null;
}

let state: TransactionsState = {
  records: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
  filters: { emp_code: "", start_date: "", end_date: "" },
  loading: false,
  error: null,
};

const listeners = new Set<() => void>();
let requestId = 0;

function setState(patch: Partial<TransactionsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useTransactionsStore = () =>
  useSyncExternalStore(subscribe, () => state);

export async function loadTransactions(page = state.page) {
  const id = ++requestId;
  const { limit, filters } = state;
  setState({ loading: true, error: null });
  try {
    const body = await fetchBiometricsTransactions({
      page,
      limit,
      emp_code: filters.emp_code.trim() || undefined,
      start_date: filters.start_date || undefined,
      end_date: filters.end_date || undefined,
    });
    if (id !== requestId) return; // a newer request superseded this one
    const p = body?.pagination;
    setState({
      records: (body?.data ?? []) as BiometricTransaction[],
      page: p?.page ?? page,
      total: p?.total ?? 0,
      totalPages: Math.max(1, p?.totalPages ?? 1),
      loading: false,
    });
  } catch (e) {
    if (id !== requestId) return;
    setState({
      loading: false,
      error: e instanceof Error ? e.message : "Failed to load transactions.",
    });
  }
}

export function applyTransactionFilters(filters: TransactionFilters) {
  setState({ filters });
  return loadTransactions(1);
}

export function fullName(r: BiometricTransaction) {
  return [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
}

// Device sends Manila wall-clock time with a "Z" suffix; format in UTC to show it as-is.
const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatPunch(iso: string) {
  const d = new Date(iso);
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
}
