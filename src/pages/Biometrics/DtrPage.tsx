import { useEffect, useMemo, useState } from "react";
import { useAuthenticator } from "../../services/useAuthenticator";
import {
  cancelScan,
  loadDtr,
  punchNow,
  resetPunch,
  selectMine,
  selectNextAction,
  useDtrStore,
  type DtrRecord,
  type NextAction,
  type PunchResult,
} from "../../stores/dtrStore";
import {
  alertErr,
  alertOk,
  btn,
  btnPrimary,
  card,
} from "../../components/theme";

const LABEL = {
  time_in: "Time In",
  time_out: "Time Out",
  completed: "Completed",
} as const;

function lastPunchText(last?: DtrRecord) {
  if (!last) return "No punches recorded yet.";
  return last.time_out
    ? `Last punch: Time out at ${last.time_out} on ${last.shift_date}.`
    : `Last punch: Time in at ${last.time_in} on ${last.shift_date}.`;
}

function resultText(r: PunchResult) {
  switch (r.action) {
    case "time_in":
      return `Timed in at ${r.timeIn}.`;
    case "time_out":
      return `Timed out at ${r.timeOut}. Hours: ${Number(r.totalHours).toFixed(2)}.`;
    case "duplicate":
      return "Scan ignored: you punched less than a minute ago.";
    default:
      return "You already completed today's time in and time out.";
  }
}

function rowStatus(r: DtrRecord) {
  if (r.missed_time_in)
    return { label: "Missed time in", cls: "bg-red-50 text-red-700" };
  if (r.missed_time_out)
    return { label: "Missed time out", cls: "bg-red-50 text-red-700" };
  if (!r.time_out)
    return { label: "In progress", cls: "bg-[#EDEDED] text-[#64748B]" };
  return { label: "Complete", cls: "bg-[#047857]/10 text-[#064E3B]" };
}

function PunchModal({
  next,
  last,
  connected,
  deviceId,
  onClose,
}: {
  next: NextAction;
  last?: DtrRecord;
  connected: boolean;
  deviceId?: string;
  onClose: () => void;
}) {
  const { phase, result, error } = useDtrStore().punch;
  const busy = phase === "scanning" || phase === "submitting";

  const doneAction =
    phase === "done" &&
    result &&
    (result.action === "time_in" || result.action === "time_out")
      ? result.action
      : null;
  const title = doneAction ? LABEL[doneAction] : LABEL[next];

  const close = () => {
    if (phase === "scanning") void cancelScan();
    resetPunch();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E293B]/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm space-y-4 rounded-lg border border-[#D6D6D6] bg-white p-5 text-[#1E293B] shadow-lg"
      >
        <h2 className="text-lg font-semibold">{title}</h2>

        {phase === "done" && result ? (
          <div
            className={
              doneAction
                ? alertOk
                : "rounded-md border border-[#D6D6D6] bg-[#F5F5F5] px-3 py-2 text-sm"
            }
          >
            {resultText(result)}
          </div>
        ) : phase === "scanning" ? (
          <p className="text-sm" aria-live="polite">
            <strong>Place your finger on the sensor…</strong>
          </p>
        ) : phase === "submitting" ? (
          <p className="text-sm" aria-live="polite">
            Recording your punch…
          </p>
        ) : (
          <>
            <p className="text-sm text-[#64748B]">{lastPunchText(last)}</p>
            {next === "completed" ? (
              <p className="text-sm">
                You already completed today's time in and time out.
              </p>
            ) : (
              <p className="text-sm">
                Scan your fingerprint on the authenticator to{" "}
                {next === "time_in" ? "time in" : "time out"}.
              </p>
            )}
            {!connected && (
              <div className={alertErr}>
                Authenticator not connected. Connect it on the Authenticator
                page.
              </div>
            )}
            {phase === "failed" && error && (
              <div className={alertErr}>{error}</div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          {phase === "done" ? (
            <button className={btnPrimary} onClick={close}>
              Done
            </button>
          ) : (
            <>
              <button className={btn} onClick={close}>
                {phase === "scanning" ? "Cancel" : "Close"}
              </button>
              {!busy && (
                <button
                  className={btnPrimary}
                  disabled={!connected || !deviceId || next === "completed"}
                  onClick={() => deviceId && void punchNow(deviceId)}
                >
                  {phase === "failed" ? "Try again" : "Scan fingerprint"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DtrPage() {
  const s = useDtrStore();
  const { status } = useAuthenticator();
  const [open, setOpen] = useState(false);
  const [issuesOnly, setIssuesOnly] = useState(false);

  useEffect(() => {
    void loadDtr();
  }, []);

  const mine = useMemo(
    () => selectMine(s.records, s.userId),
    [s.records, s.userId],
  );
  const next = selectNextAction(mine);
  const last = mine[0];
  const connected = status.connected && !!status.device;
  const deviceId = status.device?.deviceId;

  const rows = issuesOnly
    ? s.records.filter((r) => r.missed_time_in || r.missed_time_out)
    : s.records;
  const multi =
    new Set(s.records.map((r) => r.professor_id ?? r.staff_id)).size > 1;

  return (
    <div className="min-h-full bg-[#F5F5F5] text-[#1E293B]">
      <div className="mx-auto grid max-w-4xl gap-5 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Daily Time Record</h1>
            <p className="text-sm text-[#64748B]">
              Time in and out with your authenticator and review your
              attendance.
            </p>
          </div>
          <button
            className={btnPrimary}
            disabled={!s.userId || next === "completed"}
            onClick={() => setOpen(true)}
          >
            {next === "completed" ? "Completed today" : LABEL[next]}
          </button>
        </header>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#64748B]">{lastPunchText(last)}</p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                connected
                  ? "border-[#047857] bg-[#047857]/10 text-[#064E3B]"
                  : "border-[#D6D6D6] bg-white text-[#64748B]"
              }`}
            >
              {connected
                ? `Authenticator ${deviceId}`
                : "Authenticator not connected"}
            </span>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Records</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[#64748B]">
                <input
                  type="checkbox"
                  className="accent-[#047857]"
                  checked={issuesOnly}
                  onChange={(e) => setIssuesOnly(e.target.checked)}
                />
                Missed punches only
              </label>
              <button
                className={btn}
                disabled={s.loading}
                onClick={() => void loadDtr()}
              >
                {s.loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {s.loadError && <div className={alertErr}>{s.loadError}</div>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-[#64748B]">
                  <th className="py-2 pr-4">Date</th>
                  {multi && <th className="py-2 pr-4">Employee</th>}
                  <th className="py-2 pr-4">Time in</th>
                  <th className="py-2 pr-4">Time out</th>
                  <th className="py-2 pr-4">Hours</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = rowStatus(r);
                  return (
                    <tr key={r.id} className="border-t border-[#EDEDED]">
                      <td className="py-2 pr-4">{r.shift_date}</td>
                      {multi && (
                        <td className="py-2 pr-4">
                          {r.name || "—"}
                          {r.employee_id && (
                            <span className="ml-1 text-xs text-[#64748B]">
                              {r.employee_id}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-4">{r.time_in ?? "—"}</td>
                      <td className="py-2 pr-4">{r.time_out ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {r.time_out ? Number(r.total_hours).toFixed(2) : "—"}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && !s.loading && (
                  <tr>
                    <td
                      colSpan={multi ? 6 : 5}
                      className="py-6 text-center text-[#64748B]"
                    >
                      No records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {open && (
        <PunchModal
          next={next}
          last={last}
          connected={connected}
          deviceId={deviceId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
