import { useEffect, useState, type ReactNode } from "react";
import { authenticatorApi as api } from "../../services/rustMiddleware";
import { blockedText, useAuthenticator } from "../../services/useAuthenticator";
import { toBridgeError, type BridgeError } from "../../data/types";
import {
  alertErr,
  alertOk,
  btn,
  btnDanger,
  btnPrimary,
  card,
  input,
} from "../../components/theme";
import { useAuth } from "@/app/authContext";

const STEPS = [
  "First scan",
  "Lift finger",
  "Second scan",
  "Processing",
  "Saved to ARIS",
];

const STEP_TEXT: Record<string, (s?: number) => string> = {
  place_finger: (s) =>
    s === 2
      ? "Place the same finger on the sensor again."
      : "Place your finger on the sensor.",
  finger_detected: () => "Finger detected. Keep it still…",
  remove_finger: () => "Remove your finger.",
  processing: () => "Processing fingerprint template…",
};

function stepIndex(step?: string, sample?: number) {
  switch (step) {
    case "place_finger":
    case "finger_detected":
      return sample === 2 ? 2 : 0;
    case "remove_finger":
      return 1;
    case "processing":
      return 3;
    default:
      return 0;
  }
}

function errText(e: BridgeError) {
  const hints: Record<string, string> = {
    enrollment_blocked: "Enrollment is blocked by the device. ",
    unauthorized: "The enrollment token was rejected; re-enter it. ",
    enroll_mismatch: "The two scans did not match; use the same finger. ",
    scan_timeout: "No finger was detected in time. ",
  };
  return `${hints[e.code] ?? ""}${e.message} (${e.code})`;
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-[#64748B]">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#D6D6D6] bg-[#F5F5F5] p-3">
      <p className="text-xs text-[#64748B]">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[#64748B]">{label}</dt>
      <dd className="truncate">{children}</dd>
    </>
  );
}

function EnrollSteps({
  current,
  failedAt,
}: {
  current: number;
  failedAt?: number;
}) {
  return (
    <ol className="flex items-start">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const failed = i === failedAt;
        const dot = failed
          ? "border-red-500 bg-red-50 text-red-600"
          : done
            ? "border-[#047857] bg-[#047857] text-white"
            : active
              ? "border-[#047857] bg-white text-[#047857]"
              : "border-[#D6D6D6] bg-white text-[#64748B]";
        return (
          <li key={label} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${dot}`}
              >
                {failed ? "!" : done ? "✓" : i + 1}
              </span>
              <span className="whitespace-nowrap text-[11px] text-[#64748B]">
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={`mx-1 mt-3.5 h-px flex-1 ${
                  done ? "bg-[#047857]" : "bg-[#D6D6D6]"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function AuthenticatorPage() {
  const { user } = useAuth();
  const role = user?.role;
  const a = useAuthenticator();
  const [port, setPort] = useState("");
  const [slot, setSlot] = useState(1);
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [tokenInput, setTokenInput] = useState("");
  const [advOut, setAdvOut] = useState("");
  const [delSlot, setDelSlot] = useState(1);
  const [confirm, setConfirm] = useState<null | "delete" | "clear">(null);
  const [clearText, setClearText] = useState("");

  const { status, info, enroll, sync } = a;
  const running = enroll.phase === "starting" || enroll.phase === "running";
  const dev = status.device;
  const connLabel = a.connecting
    ? "Connecting"
    : !status.connected
      ? "Disconnected"
      : running || status.busy
        ? "Operation in progress"
        : info && !info.sensorConnected
          ? "Sensor unavailable"
          : "Device detected";
  const canEnroll =
    status.connected &&
    !running &&
    sync.status !== "saving" &&
    !!info?.sensorConnected &&
    !!info?.enrollmentAllowed &&
    (a.tokenConfigured || !dev?.enrollAuthRequired);
  const unavailable = !status.connected || !info || !info.sensorConnected;
  const show = (v: number | null | undefined) =>
    unavailable || v == null ? "—" : String(v);

  const adv = async (label: string, fn: () => Promise<unknown>) => {
    try {
      setAdvOut(`${label}: ${JSON.stringify(await fn(), null, 2)}`);
    } catch (e) {
      setAdvOut(`${label} failed: ${errText(toBridgeError(e))}`);
    }
  };

  const enrollmentStatus = !status.connected
    ? "Connect to an authenticator"
    : running || status.busy
      ? "Enrollment blocked: another operation is running"
      : !info
        ? "Enrollment blocked: sensor communication error"
        : !info.sensorConnected
          ? "Enrollment blocked: sensor disconnected"
          : info.enrollmentAllowed
            ? "Ready for enrollment"
            : `Enrollment blocked: ${blockedText(info.enrollmentBlockedReason)}`;
  const ready = canEnroll && enrollmentStatus === "Ready for enrollment";

  const pill = status.connected
    ? "border-[#047857] bg-[#047857]/10 text-[#064E3B]"
    : "border-[#D6D6D6] bg-white text-[#64748B]";

  const showSteps = running || enroll.phase === "done";
  const stepCurrent =
    enroll.phase === "done"
      ? sync.status === "saved"
        ? STEPS.length
        : 4
      : stepIndex(enroll.step, enroll.sample);
  const stepFailed =
    enroll.phase === "done" && sync.status === "failed" ? 4 : undefined;

  useEffect(() => {
    if (status.connected && status.portName) {
      setPort(status.portName);
    } else if (!status.connected) {
      setPort("");
    }
  }, [status.connected, status.portName]);

  return (
    <div className="min-h-full bg-[#F5F5F5] text-[#1E293B]">
      <div className="mx-auto grid max-w-4xl gap-5 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Authenticator</h1>
            <p className="text-sm text-[#64748B]">
              Connect your ARIS authenticator and enroll your fingerprint.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${pill}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status.connected ? "bg-[#047857]" : "bg-[#D6D6D6]"
              }`}
            />
            {connLabel}
          </span>
        </header>

        {a.error && (
          <div className={alertErr} role="alert">
            {errText(a.error)}{" "}
            <button className="ml-2 underline" onClick={a.clearError}>
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Section
            title="USB connection"
            description="Close Arduino Serial Monitor first. Opening the port may reboot the ESP32 (~3 s)."
          >
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={`${input} min-w-0 flex-1`}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={status.connected}
              >
                <option value="">
                  {a.ports.length ? "Select a COM port" : "No devices detected"}
                </option>
                {a.ports.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.product ? ` — ${p.product}` : ""}
                  </option>
                ))}
              </select>
              <button
                className={btn}
                onClick={() => void a.refreshPorts()}
                disabled={status.connected}
              >
                Refresh
              </button>
            </div>
            <div className="flex gap-2">
              <button
                className={btnPrimary}
                onClick={() => void a.connect(port)}
                disabled={!port || status.connected || a.connecting}
              >
                {a.connecting ? "Connecting…" : "Connect"}
              </button>
              <button
                className={btn}
                onClick={() => void a.disconnect()}
                disabled={!status.connected || running}
              >
                Disconnect
              </button>
            </div>
            {dev && (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 border-t border-[#EDEDED] pt-3 text-sm">
                <Field label="Authenticator">{dev.deviceId}</Field>
                <Field label="Port / baud">
                  {status.portName} @ {status.baudRate}
                </Field>
                <Field label="Firmware">{dev.firmwareVersion ?? "—"}</Field>
                <Field label="Sensor model">{dev.model ?? "—"}</Field>
                <Field label="Sensor">
                  {info
                    ? info.sensorConnected
                      ? "connected"
                      : "disconnected"
                    : (dev.sensorStatus ?? "—")}
                </Field>
              </dl>
            )}
          </Section>

          <Section
            title="Fingerprint sensor"
            action={
              <button
                className={btn}
                onClick={() => void a.refreshInfo()}
                disabled={!status.connected || running}
              >
                Refresh
              </button>
            }
          >
            {a.infoError && (
              <div className={alertErr}>{errText(a.infoError)}</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Capacity" value={show(info?.capacity)} />
              <Stat label="Registered" value={show(info?.templateCount)} />
              <Stat label="Free slots" value={show(info?.slotsFree)} />
              <Stat label="Security level" value={show(info?.securityLevel)} />
            </div>
            <div
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                ready
                  ? "border-[#047857] bg-[#047857]/10 text-[#064E3B]"
                  : "border-[#D6D6D6] bg-[#EDEDED] text-[#1E293B]"
              }`}
            >
              {enrollmentStatus}
            </div>
            <p className="text-xs text-[#64748B]">
              Storage verification:{" "}
              {unavailable ? "—" : (info?.emptinessCheck ?? "—")}
            </p>
          </Section>
        </div>

        <Section
          title="Fingerprint enrollment"
          description="Enrolls a fingerprint on this authenticator for your signed-in account."
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-[#64748B]">
              Slot
              <input
                type="number"
                className={`${input} w-24`}
                min={0}
                max={Math.max(0, (info?.capacity ?? 1) - 1)}
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-xs text-[#64748B]">
              Step timeout (ms)
              <input
                type="number"
                className={`${input} w-32`}
                min={1000}
                max={60000}
                step={1000}
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value))}
              />
            </label>
            <button
              className={btnPrimary}
              disabled={!canEnroll}
              onClick={() => void a.startEnrollment(slot, timeoutMs)}
            >
              Start enrollment
            </button>
            <button
              className={btn}
              disabled={!running}
              onClick={() => void a.cancelEnrollment()}
            >
              Cancel
            </button>
          </div>
          {!canEnroll && status.connected && !running && (
            <p className="text-xs text-[#64748B]">
              {!a.tokenConfigured && dev?.enrollAuthRequired
                ? "Save the enrollment token. "
                : ""}
              {enrollmentStatus}
            </p>
          )}

          {showSteps && (
            <div className="rounded-md border border-[#D6D6D6] bg-[#F5F5F5] p-4">
              <EnrollSteps current={stepCurrent} failedAt={stepFailed} />
              {running && (
                <div className="mt-4 text-center text-sm" aria-live="polite">
                  <strong>
                    {enroll.step
                      ? (STEP_TEXT[enroll.step]?.(enroll.sample) ?? enroll.step)
                      : "Starting enrollment…"}
                  </strong>
                  {enroll.retry && (
                    <p className="mt-1 text-[#64748B]">
                      Capture retry: {enroll.retry.replace(/_/g, " ")}. Adjust
                      your finger and try again.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {enroll.phase === "done" && enroll.result && (
            <>
              {sync.status === "saving" && (
                <div className="rounded-md border border-[#D6D6D6] bg-[#F5F5F5] px-3 py-2 text-sm">
                  Fingerprint enrolled on device. Saving to ARIS…
                </div>
              )}
              {sync.status === "saved" && (
                <div className={alertOk}>
                  Fingerprint enrolled and saved to ARIS (ID{" "}
                  {enroll.result.fingerprintId}, templates:{" "}
                  {enroll.result.templateCount ?? "—"},{" "}
                  {Math.round(enroll.result.durationMs / 1000)} s).
                </div>
              )}
              {sync.status === "failed" && (
                <div className={alertErr} role="alert">
                  <p className="font-semibold">
                    Enrolled on device, but saving to ARIS failed.
                  </p>
                  <p className="mt-1">{sync.error}</p>
                  <p className="mt-1 text-xs">
                    Retry the save, or erase the device templates under Advanced
                    management. Until then this authenticator stays blocked.
                  </p>
                  <button className={`${btn} mt-2`} onClick={a.retrySave}>
                    Retry save
                  </button>
                </div>
              )}
            </>
          )}
          {enroll.phase === "cancelled" && (
            <div className={alertErr}>
              Enrollment cancelled. Nothing was stored.
            </div>
          )}
          {enroll.phase === "failed" && enroll.error && (
            <div className={alertErr}>
              Enrollment failed: {errText(enroll.error)}
            </div>
          )}
        </Section>

        <Section
          title="Enrollment token"
          description="Same value as ENROLL_AUTH_TOKEN in the firmware."
          action={
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                a.tokenConfigured
                  ? "border-[#047857] bg-[#047857]/10 text-[#064E3B]"
                  : "border-[#D6D6D6] bg-white text-[#64748B]"
              }`}
            >
              {a.tokenConfigured ? "Configured" : "Not configured"}
            </span>
          }
        >
          {dev && !dev.enrollAuthRequired && (
            <p className="text-sm text-[#64748B]">
              The device does not require a token.
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tokenInput.trim()) return;
              try {
                await api.saveToken(tokenInput);
                setTokenInput("");
                await a.refreshToken();
              } catch (err) {
                a.setError(toBridgeError(err));
              }
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="password"
              autoComplete="off"
              className={`${input} min-w-64 flex-1`}
              placeholder="Enrollment token (stored in the OS credential manager)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <button
              type="submit"
              className={btn}
              disabled={!tokenInput.trim()}
            >
              Save token
            </button>
            <button
              type="button"
              className={btn}
              disabled={!a.tokenConfigured}
              onClick={async () => {
                try {
                  await api.clearToken();
                  await a.refreshToken();
                } catch (e) {
                  a.setError(toBridgeError(e));
                }
              }}
            >
              Remove
            </button>
          </form>
        </Section>

        {role === "administrator" && (
          <details className={card}>
            <summary className="cursor-pointer text-base font-semibold">
              Advanced management
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={btn}
                disabled={!status.connected}
                onClick={() =>
                  void adv("health_check", () => api.send("health_check"))
                }
              >
                Health check
              </button>
              <button
                className={btn}
                disabled={!status.connected}
                onClick={() => void adv("ping", () => api.send("ping"))}
              >
                Ping
              </button>
              <button
                className={btn}
                disabled={!status.connected}
                onClick={() =>
                  void adv("get_status", () => api.send("get_status"))
                }
              >
                Get status
              </button>
              <button
                className={btn}
                disabled={!status.connected}
                onClick={() =>
                  void adv("finger_detected", () => api.send("finger_detected"))
                }
              >
                Finger detected
              </button>
            </div>
            {advOut && (
              <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-[#EDEDED] p-3 text-xs">
                {advOut}
              </pre>
            )}

            <h3 className="mt-4 text-sm font-semibold text-red-600">
              Destructive (requires enrollment token)
            </h3>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-[#64748B]">
                Slot
                <input
                  type="number"
                  className={`${input} w-24`}
                  min={0}
                  value={delSlot}
                  onChange={(e) => setDelSlot(Number(e.target.value))}
                />
              </label>
              <button
                className={btnDanger}
                disabled={!status.connected || running}
                onClick={() => setConfirm("delete")}
              >
                Delete template…
              </button>
              <button
                className={btnDanger}
                disabled={!status.connected || running}
                onClick={() => setConfirm("clear")}
              >
                Clear ALL templates…
              </button>
            </div>
            {confirm && (
              <div
                className="mt-3 space-y-2 rounded-md border border-red-500 bg-white p-3 text-sm"
                role="alertdialog"
              >
                {confirm === "delete" ? (
                  <p>
                    Delete the fingerprint template in slot{" "}
                    <strong>{delSlot}</strong>? This cannot be undone.
                  </p>
                ) : (
                  <>
                    <p>
                      <strong>
                        All fingerprint templates on this authenticator will be
                        erased.
                      </strong>{" "}
                      Everyone enrolled will lose access. Type ERASE to confirm.
                    </p>
                    <input
                      className={input}
                      value={clearText}
                      onChange={(e) => setClearText(e.target.value)}
                    />
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    className={btn}
                    onClick={() => {
                      setConfirm(null);
                      setClearText("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className={btnDanger}
                    disabled={confirm === "clear" && clearText !== "ERASE"}
                    onClick={async () => {
                      const which = confirm;
                      setConfirm(null);
                      setClearText("");
                      await adv(
                        which === "delete"
                          ? "delete_template"
                          : "clear_templates",
                        () =>
                          which === "delete"
                            ? api.deleteTemplate(delSlot)
                            : api.clearTemplates(),
                      );
                      void a.refreshInfo();
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </details>
        )}
      </div>
    </div>
  );
}
