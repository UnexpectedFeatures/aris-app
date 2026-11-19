import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle, dtrTable } from "@/components/ui";
import Pager from "@/components/theme";
import {
  applyTransactionFilters,
  formatPunch,
  loadTransactions,
  useTransactionsStore,
} from "@/stores/biometricsTransactionsStore";
import { fetchBiometricsTransactions } from "@/services/biometricsService";
import { useAuth } from "@/app/authContext";
import { saveResource } from "@/services/dataSource";

type DtrPeriod = "first-half" | "second-half";

type PunchRecord = {
  punch_time: string;
  punch_state_display?: string | null;
  area_alias?: string | null;
};

const FETCH_ALL_PAGE_SIZE = 2000;
const FETCH_ALL_MAX_PAGES = 50;

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getDtrDateRange(monthValue: string, period: DtrPeriod) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) throw new Error("Select a valid month and year.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error("Select a valid month and year.");
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  const monthText = String(month).padStart(2, "0");
  const monthName = new Date(`${year}-${month}-01`).toLocaleString("en-PH", {
    month: "long",
  });
  const formatDate = (day: number) =>
    `${match[1]}-${monthText}-${String(day).padStart(2, "0")}`;

  const startDay = period === "first-half" ? 1 : 16;
  const endDay = period === "first-half" ? 15 : daysInMonth;
  const periodLabel =
    `${monthName} ${year} (${period === "first-half" ? "1–15" : "16–end"})`;

  return {
    startDate: formatDate(startDay),
    endDate: formatDate(endDay),
    periodLabel,
  };
}

// Fetches every page of punches for a range (the store only holds the current page)
async function fetchAllPunches(
  startDate: string,
  endDate: string,
): Promise<PunchRecord[]> {
  const all: PunchRecord[] = [];
  for (let page = 1; page <= FETCH_ALL_MAX_PAGES; page++) {
    const body = await fetchBiometricsTransactions({
      page,
      limit: FETCH_ALL_PAGE_SIZE,
      emp_code: "",
      start_date: startDate,
      end_date: endDate,
    });
    const batch = (body?.data ?? []) as PunchRecord[];
    all.push(...batch);
    if (batch.length < FETCH_ALL_PAGE_SIZE) break;
  }
  return all;
}

const fieldClass =
  "mt-1 h-10 rounded-xl border border-[#cad5cc] bg-white px-3 text-[13px] text-[#111c14] outline-none focus:border-[#009668]";

export default function DtrSubmitPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const s = useTransactionsStore();
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<DtrPeriod>("first-half");
  const [loaded, setLoaded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicatePeriod, setDuplicatePeriod] = useState<string | null>(null);
  const [duplicateModalConfirmed, setDuplicateModalConfirmed] = useState(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [monthsLoading, setMonthsLoading] = useState(true);

  const handleDuplicateModalClose = () => setShowDuplicateModal(false);
  const handleDuplicateModalConfirm = () => {
    setDuplicateModalConfirmed(true);
    setShowDuplicateModal(false);
  };

  // Load months that have biometric data so the selector only shows valid options
  const loadAvailableMonths = async () => {
    try {
      const now = new Date();
      const startDate = `${now.getFullYear() - 1}-01-01`;
      const endDate = `${now.getFullYear() + 1}-12-31`;

      const body = await fetchBiometricsTransactions({
        page: 1,
        limit: 2000,
        emp_code: "",
        start_date: startDate,
        end_date: endDate,
      });

      const records = (body?.data ?? []) as Array<{ punch_time: string }>;
      const monthSet = new Set<string>();
      records.forEach((rec) => {
        const d = new Date(rec.punch_time);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthSet.add(ym);
      });

      const months = Array.from(monthSet).sort();
      setAvailableMonths(months);

      // Default to current month if it has data, else first available month
      const current = currentMonth();
      if (months.includes(current)) {
        setMonth(current);
      } else if (months.length > 0) {
        setMonth(months[0]);
      }
    } catch {
      // Fall back to current month if discovery fails
      setMonth(currentMonth());
    } finally {
      setMonthsLoading(false);
    }
  };

  useEffect(() => {
    void loadAvailableMonths();
  }, []);

  const [modalAnimate, setModalAnimate] = useState(false);

  // Animate modal in when it opens
  useEffect(() => {
    if (showDuplicateModal) {
      setModalAnimate(true);
    } else {
      setModalAnimate(false);
    }
  }, [showDuplicateModal]);

  const loading = s.loading;
  const error = localError ?? s.error;
  const records = loaded ? s.records : [];

  const fetchRange = async () => {
    setSubmitNotice(null);
    setLocalError(null);

    try {
      const { startDate, endDate } = getDtrDateRange(month, period);
      await applyTransactionFilters({
        emp_code: "",
        start_date: startDate,
        end_date: endDate,
      });
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Failed to load DTR transactions.",
      );
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void fetchRange();
  }, [month, period]);

  const checkExistingSubmission = (periodLabel: string) => {
    const auditKeys = [
      "aris:demo:/audit",
      `aris:demo:/audit?email=${encodeURIComponent(user?.email ?? "")}`,
    ];
    for (const k of auditKeys) {
      try {
        const stored = localStorage.getItem(k);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          const isArr = Array.isArray(parsed);
          const logs: unknown[] = isArr
            ? (parsed as unknown[])
            : (((parsed as Record<string, unknown>)?.logs as unknown[]) ?? []);
          // Check if any existing entry has the same period label
          const matchingEntry = (
            logs as Array<{
              action: string;
              target: string;
            }>
          ).find(
            (entry) =>
              entry?.action?.includes(periodLabel) ||
              entry?.target?.includes(periodLabel),
          );
          if (matchingEntry) {
            return true;
          }
        }
      } catch {
        /* ignore per-key errors */
      }
    }
    return false;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);

    // Check for existing submission in the same month/period
    const { startDate, endDate, periodLabel } = getDtrDateRange(month, period);
    const hasExisting = checkExistingSubmission(periodLabel);

    if (hasExisting && !duplicateModalConfirmed) {
      setShowDuplicateModal(true);
      setDuplicatePeriod(periodLabel);
      setIsSubmitting(false);
      return;
    }

    // If we get here, either no duplicate or user confirmed the modal
    try {
      // Pull every page for the period, not just the one currently displayed
      const punches = await fetchAllPunches(startDate, endDate);
      const punchCount = punches.length;
      const punchCountLabel = `${punchCount} punch record${punchCount === 1 ? "" : "s"}`;

      const reference = `DTR-${Date.now()}`;
      const now = new Date().toLocaleString();
      const facultyName = user?.name?.toUpperCase() ?? "Faculty";
      const facultyNumber = user?.employee_id ?? "—";
      const college = "COLLEGE OF LIBERAL ARTS AND SCIENCES";

      // Build DTR rows for the record payload (matches backend audit format)
      const dtrRows = punches.map((rec) => {
        const { date, time } = formatPunch(rec.punch_time);
        return [
          date,
          time,
          rec.punch_state_display ?? "—",
          rec.area_alias ?? "—",
        ];
      });

      const tables = [
        dtrTable(
          `DTR Log Summary — ${startDate} – ${endDate}`,
          `${punchCountLabel} logged`,
          dtrRows,
        ),
      ];

      const record = {
        id: reference,
        reference,
        is_revision: false,
        type: "DTR" as const,
        period: periodLabel,
        units: punchCountLabel,
        submitted: now,
        status: "Pending" as const,
        stage: "Checker",
        currentStage: "Checker",
        stage_key: "DTR-AP-STG-1",
        approval_stage: "DTR-AP-STG-1",
        stage_order: 1,
        email: user?.email,
        facultyEmail: user?.email,
        facultyName,
        facultyNumber,
        event: `DTR submitted · ${periodLabel}`,
        // For the dedicated dtr-submissions endpoint:
        periodStart: startDate,
        periodEnd: endDate,
        record: {
          period: periodLabel,
          reference,
          email: user?.email,
          facultyEmail: user?.email,
          facultyName,
          facultyNumber,
          college,
          tables,
          notes: undefined as string | undefined,
          attachment: undefined as string | undefined,
          reviewer: "Faculty Checker",
          reviewedAt: now,
          remark: "Received and queued for review.",
        },
      };

      // Sync local demo audit store so History immediately shows the new submission
      try {
        const auditKeys = [
          "aris:demo:/audit",
          `aris:demo:/audit?email=${encodeURIComponent(user?.email ?? "")}`,
        ];
        const initials = facultyName
          .split(" ")
          .map((w: string) => w[0] ?? "")
          .join("")
          .slice(0, 2)
          .toUpperCase();
        const newAuditEntry = {
          id: reference,
          actor: facultyName,
          init: initials,
          type: "DTR",
          action: `DTR submitted · ${periodLabel}`,
          target: `${periodLabel} · ${punchCountLabel}`,
          time: now,
          result: "Pending",
          stage: "Checker",
          stage_role: "Checker",
          stage_key: "DTR-AP-STG-1",
          approval_stage: "DTR-AP-STG-1",
          stage_order: 1,
          record: record.record,
        };
        for (const k of auditKeys) {
          try {
            const stored = localStorage.getItem(k);
            if (stored) {
              const parsed = JSON.parse(stored) as unknown;
              const isArr = Array.isArray(parsed);
              const logs: unknown[] = isArr
                ? (parsed as unknown[])
                : (((parsed as Record<string, unknown>)?.logs as unknown[]) ??
                  []);
              const next = [newAuditEntry, ...logs];
              localStorage.setItem(
                k,
                JSON.stringify(
                  isArr ? next : { ...(parsed as object), logs: next },
                ),
              );
            } else {
              localStorage.setItem(k, JSON.stringify([newAuditEntry]));
            }
          } catch {
            /* ignore per-key errors */
          }
        }
      } catch (syncErr) {
        console.warn("Could not sync local audit store:", syncErr);
      }

      // 1. Try the dedicated DTR endpoint first
      try {
        await saveResource("/professor/dtr-submissions", record);
        navigate("/prof/history");
        return;
      } catch {
        // fall through to the generic submissions endpoint
      }

      // 2. Fallback: generic accomplishment-reports / submissions endpoint
      try {
        await saveResource("/professor/accomplishment-reports", record);
      } catch {
        await saveResource("/professor/submissions", record);
      }

      navigate("/prof/history");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Unable to submit DTR. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-32 sm:px-6">
      <PageTitle
        title="Submit DTR"
        subtitle="Review your biometric transactions for a semi-monthly period."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchRange();
        }}
        className="mb-6 rounded-2xl border border-[#e8eeea] bg-white p-5 shadow-sm"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {showDuplicateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
            <div
              className={`bg-white rounded-xl p-6 max-w-md w-full shadow-2xl transition-all duration-300 ease-out ${modalAnimate ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
              style={{}}
            >
              <h3 className="text-xl font-bold text-[#111c14] mb-4">
                DTR Already Submitted
              </h3>
              <p className="text-[#5a6b5e] mb-6">
                You have already submitted a DTR for {duplicatePeriod}. Would
                you like to submit again for this month?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDuplicateModalClose}
                  className="flex-1 rounded-xl border px-5 py-2.5 text-[13px] font-semibold text-[#5a6b5e] transition-all hover:bg-[#f7f9f8] active:scale-[0.98]"
                  style={{ borderColor: "#e8eeea" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateModalConfirm}
                  className="flex-1 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-all active:scale-[0.98]"
                  style={{
                    background:
                      "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
                  }}
                >
                  Submit Anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid text-[11px] font-bold uppercase tracking-wider text-[#5a6b5e]">
            Month and year
            <select
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={fieldClass}
              disabled={monthsLoading}
            >
              {monthsLoading ? (
                <option disabled>Loading months…</option>
              ) : availableMonths.length === 0 ? (
                <option disabled>No transactions found</option>
              ) : (
                availableMonths.map((m) => {
                  const [yr, mo] = m.split("-");
                  const monthName = new Date(`${yr}-${mo}-01`).toLocaleString(
                    "en-PH",
                    {
                      month: "long",
                      timeZone: "UTC",
                    },
                  );
                  return (
                    <option key={m} value={m}>
                      {monthName} {yr}
                    </option>
                  );
                })
              )}
            </select>
          </label>
          <label className="grid text-[11px] font-bold uppercase tracking-wider text-[#5a6b5e]">
            Period
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as DtrPeriod)}
              className={fieldClass}
            >
              <option value="first-half">1–15</option>
              <option value="second-half">16–end of month</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-xl px-5 text-[13px] font-bold text-white transition-opacity disabled:opacity-60 sm:w-28"
            style={{ background: "#009668" }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </form>

      <section
        className="rounded-2xl border border-[#e8eeea] bg-white p-5 shadow-sm"
        aria-live="polite"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-[#111c14]">
            Biometric Transactions
          </h2>
          {loaded && !error && (
            <span className="text-[12px] text-[#718076]">
              {s.total} {s.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {error}
          </div>
        )}
        {submitNotice && (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
          >
            {submitNotice}
          </div>
        )}
        {submitError && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {submitError}
          </div>
        )}

        <div className="min-h-[320px] overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left text-[13px]">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-[#718076]">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Verify</th>
                <th className="py-2 pr-4">Area</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2">Terminal</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                records.map((record) => {
                  const { date, time } = formatPunch(record.punch_time);
                  return (
                    <tr
                      key={record.id}
                      className="border-t border-[#edf1ee] text-[#26352a]"
                    >
                      <td className="truncate py-2.5 pr-4">{date}</td>
                      <td className="truncate py-2.5 pr-4">{time}</td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full bg-[#f0f4f1] px-2 py-1 text-[11px] text-[#5a6b5e]">
                          {record.verify_type_display}
                        </span>
                      </td>
                      <td className="truncate py-2.5 pr-4">
                        {record.area_alias ?? "—"}
                      </td>
                      <td className="truncate py-2.5 pr-4">
                        {record.punch_state_display ?? "—"}
                      </td>
                      <td className="truncate py-2.5 text-[12px] text-[#718076]">
                        {record.terminal_sn}
                      </td>
                    </tr>
                  );
                })}
              {(loading || !loaded) && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-[13px] text-[#718076]"
                  >
                    Loading transactions…
                  </td>
                </tr>
              )}
              {loaded && !loading && !error && records.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-[13px] text-[#718076]"
                  >
                    No transactions found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {loaded && !localError && (
          <Pager
            page={s.page}
            totalPages={s.totalPages}
            total={s.total}
            disabled={s.loading}
            onChange={(p) => void loadTransactions(p)}
          />
        )}
      </section>

      <footer
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 py-3 lg:left-64 lg:px-8 lg:py-4"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid #e8eeea",
          boxShadow: "0 -2px 16px 0 rgba(0,60,30,0.07)",
        }}
      >
        <div className="hidden items-center gap-2 sm:flex">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "#009668" }}
          />
          <span className="text-[12.5px] font-semibold text-[#009668]">
            Review your records before submitting
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/prof/submit")}
            className="rounded-xl border px-5 py-2.5 text-[13px] font-semibold text-[#5a6b5e] transition-all hover:bg-[#f7f9f8] active:scale-[0.98]"
            style={{ borderColor: "#e8eeea" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              !loaded ||
              loading ||
              isSubmitting ||
              !!error ||
              records.length === 0
            }
            className="min-w-[130px] rounded-xl px-6 py-2.5 text-[13px] font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
            }}
          >
            {isSubmitting ? "Submitting…" : "Submit DTR"}
          </button>
        </div>
      </footer>
    </div>
  );
}
