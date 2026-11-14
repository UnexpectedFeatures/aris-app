import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "@/components/ui";
import Pager from "@/components/theme";
import {
  applyTransactionFilters,
  formatPunch,
  loadTransactions,
  useTransactionsStore,
} from "@/stores/biometricsTransactionsStore";

type DtrPeriod = "first-half" | "second-half";

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
  const startDay = period === "first-half" ? 1 : 16;
  const endDay = period === "first-half" ? 15 : daysInMonth;
  const formatDate = (day: number) =>
    `${match[1]}-${monthText}-${String(day).padStart(2, "0")}`;

  return { startDate: formatDate(startDay), endDate: formatDate(endDay) };
}

const fieldClass =
  "mt-1 h-10 rounded-xl border border-[#cad5cc] bg-white px-3 text-[13px] text-[#111c14] outline-none focus:border-[#009668]";

export default function DtrSubmitPage() {
  const navigate = useNavigate();
  const s = useTransactionsStore();
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<DtrPeriod>("first-half");
  const [loaded, setLoaded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

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

  const handleSubmit = () => {
    setSubmitNotice("DTR submission is not available yet.");
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid text-[11px] font-bold uppercase tracking-wider text-[#5a6b5e]">
            Month and year
            <input
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={fieldClass}
            />
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
            className="h-10 rounded-xl px-5 text-[13px] font-bold text-white transition-opacity disabled:opacity-60"
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

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
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
              {records.map((record) => {
                const { date, time } = formatPunch(record.punch_time);
                return (
                  <tr
                    key={record.id}
                    className="border-t border-[#edf1ee] text-[#26352a]"
                  >
                    <td className="py-2.5 pr-4">{date}</td>
                    <td className="py-2.5 pr-4">{time}</td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-[#f0f4f1] px-2 py-1 text-[11px] text-[#5a6b5e]">
                        {record.verify_type_display}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{record.area_alias ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      {record.punch_state_display ?? "—"}
                    </td>
                    <td className="py-2.5 text-[12px] text-[#718076]">
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
            onClick={handleSubmit}
            disabled={!loaded || loading || !!error || records.length === 0}
            className="rounded-xl px-6 py-2.5 text-[13px] font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg,#009668 0%,#00b87a 100%)",
            }}
          >
            Submit DTR
          </button>
        </div>
      </footer>
    </div>
  );
}
