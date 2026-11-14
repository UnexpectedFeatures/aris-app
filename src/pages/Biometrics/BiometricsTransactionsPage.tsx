import { useEffect, useState } from "react";
import {
  applyTransactionFilters,
  formatPunch,
  fullName,
  loadTransactions,
  TransactionFilters,
  useTransactionsStore,
} from "../../stores/biometricsTransactionsStore";
import Pager, { alertErr, btn, btnPrimary, card } from "../../components/theme";
const inputCls =
  "rounded-md border border-[#D6D6D6] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#047857]";

export default function BiometricsTransactionsPage() {
  const s = useTransactionsStore();
  const [draft, setDraft] = useState<TransactionFilters>(s.filters);

  useEffect(() => {
    void loadTransactions(1);
  }, []);

  const hasFilters = !!(s.filters.start_date || s.filters.end_date);

  return (
    <div className="min-h-full bg-[#F5F5F5] text-[#1E293B]">
      <div className="mx-auto grid max-w-5xl gap-5 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Biometric Transactions</h1>
            <p className="text-sm text-[#64748B]">
              Raw punch logs from the authenticator terminal.
            </p>
          </div>
          <button
            className={btn}
            disabled={s.loading}
            onClick={() => void loadTransactions()}
          >
            {s.loading ? "Loading…" : "Refresh"}
          </button>
        </header>

        <section className={card}>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void applyTransactionFilters(draft);
            }}
          >
            <label className="grid gap-1 text-xs text-[#64748B]">
              Start date
              <input
                type="date"
                className={inputCls}
                value={draft.start_date}
                onChange={(e) =>
                  setDraft({ ...draft, start_date: e.target.value })
                }
              />
            </label>
            <label className="grid gap-1 text-xs text-[#64748B]">
              End date
              <input
                type="date"
                className={inputCls}
                value={draft.end_date}
                onChange={(e) =>
                  setDraft({ ...draft, end_date: e.target.value })
                }
              />
            </label>
            <button type="submit" className={btnPrimary} disabled={s.loading}>
              Apply
            </button>
            {hasFilters && (
              <button
                type="button"
                className={btn}
                disabled={s.loading}
                onClick={() => {
                  const empty = { emp_code: "", start_date: "", end_date: "" };
                  setDraft(empty);
                  void applyTransactionFilters(empty);
                }}
              >
                Clear
              </button>
            )}
          </form>

          {s.error && <div className={alertErr}>{s.error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-[#64748B]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Verify</th>
                  <th className="py-2 pr-4">Area</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {s.records.map((r) => {
                  const { date, time } = formatPunch(r.punch_time);
                  return (
                    <tr key={r.id} className="border-t border-[#EDEDED]">
                      <td className="py-2 pr-4">{date}</td>
                      <td className="py-2 pr-4">{time}</td>
                      <td className="py-2 pr-4">
                        {fullName(r)}
                        <span className="ml-1 text-xs text-[#64748B]">
                          #{r.emp_code}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-[#EDEDED] px-2 py-0.5 text-xs text-[#64748B]">
                          {r.verify_type_display}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{r.area_alias ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {r.punch_state_display ?? "—"}
                      </td>
                      <td className="py-2 text-xs text-[#64748B]">
                        {r.terminal_sn}
                      </td>
                    </tr>
                  );
                })}
                {!s.records.length && !s.loading && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[#64748B]">
                      No transactions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pager
            page={s.page}
            totalPages={s.totalPages}
            total={s.total}
            disabled={s.loading}
            onChange={(p) => void loadTransactions(p)}
          />
        </section>
      </div>
    </div>
  );
}
