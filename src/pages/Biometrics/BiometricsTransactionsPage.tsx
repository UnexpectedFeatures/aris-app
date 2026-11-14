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

  const hasFilters = !!(
    s.filters.emp_code ||
    s.filters.start_date ||
    s.filters.end_date
  );

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
              Employee code
              <input
                className={`${inputCls} w-32`}
                value={draft.emp_code}
                onChange={(e) =>
                  setDraft({ ...draft, emp_code: e.target.value })
                }
              />
            </label>
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
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#8FA394]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Verify</th>
                  <th className="py-2 pr-4">Area</th>
                  <th className="py-2">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {s.records.map((r) => {
                  const { date, time } = formatPunch(r.punch_time);
                  return (
                    <tr key={r.id} className="border-t border-[#F2F4F2]">
                      <td className="py-2 pr-4">{date}</td>
                      <td className="py-2 pr-4">{time}</td>
                      <td className="py-2 pr-4">
                        {fullName(r)}
                        <span className="ml-1 text-xs text-[#64748B]">
                          #{r.emp_code}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-[#F0F2F0] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#5A6B5E]">
                          {r.verify_type_display}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{r.area_alias ?? "—"}</td>
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
