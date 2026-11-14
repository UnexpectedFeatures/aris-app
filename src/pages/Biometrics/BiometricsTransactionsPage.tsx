import { useEffect, useState } from "react";
import {
  applyTransactionFilters,
  formatPunch,
  fullName,
  loadTransactions,
  TransactionFilters,
  useTransactionsStore,
} from "../../stores/biometricsTransactionsStore";
import Pager, {
  alertErr,
  btn,
  btnPrimary,
  card,
  input as inputCls,
} from "../../components/theme";

export default function BiometricsTransactionsPage() {
  const s = useTransactionsStore();
  const [draft, setDraft] = useState<TransactionFilters>(s.filters);

  useEffect(() => {
    void loadTransactions(1);
  }, []);

  const hasFilters = !!(s.filters.start_date || s.filters.end_date);

  return (
    <div className="pb-8">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "#111c14" }}>
              Biometric Transactions
            </h1>
            <p className="mt-0.5 text-[13.5px]" style={{ color: "#8fa394" }}>
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
        </div>

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
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-[#FAFBFA] text-[11px] uppercase tracking-wide text-[#B6C3BA]">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                  <th className="px-5 py-2.5 font-semibold">Employee</th>
                  <th className="px-5 py-2.5 font-semibold">Verify</th>
                  <th className="px-5 py-2.5 font-semibold">Area</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="px-5 py-2.5 font-semibold">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {s.records.map((r) => {
                  const { date, time } = formatPunch(r.punch_time);
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[#F2F4F2] text-[12.5px] text-[#111C14] transition-colors hover:bg-[#FAFBFA]"
                    >
                      <td className="px-5 py-3">{date}</td>
                      <td className="px-5 py-3">{time}</td>
                      <td className="px-5 py-3">
                        {fullName(r)}
                        <span className="ml-1 text-[11.5px] text-[#8FA394]">
                          #{r.emp_code}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-[#F0F2F0] px-2 py-1 text-[11px] text-[#5A6B5E]">
                          {r.verify_type_display}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#5A6B5E]">
                        {r.area_alias ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {r.punch_state_display ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[#718076]">
                        {r.terminal_sn}
                      </td>
                    </tr>
                  );
                })}
                {!s.records.length && !s.loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#8FA394]">
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
