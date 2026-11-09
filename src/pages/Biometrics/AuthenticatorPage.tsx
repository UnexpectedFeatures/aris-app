import { useState, type ReactNode } from "react";
import { authenticatorApi as api } from "../../services/rustMiddleware";
import { blockedText, useAuthenticator } from "../../services/useAuthenticator";
import { toBridgeError, type BridgeError } from "../../data/types";

const card =
  "rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3";
const input =
  "rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50";
const btn =
  "rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary =
  "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger =
  "rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50";
const alertErr =
  "rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300";
const alertOk =
  "rounded-md border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export interface PersonnelRef {
  kind: "professor" | "staff";
  id: string;
  name: string;
}
function ManualPersonnelPicker({
  value,
  onChange,
}: {
  value: PersonnelRef;
  onChange: (p: PersonnelRef) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        className={input}
        value={value.kind}
        onChange={(e) =>
          onChange({ ...value, kind: e.target.value as PersonnelRef["kind"] })
        }
      >
        <option value="professor">Professor</option>
        <option value="staff">Staff</option>
      </select>
      <input
        className={`${input} min-w-64 flex-1`}
        placeholder="Personnel UUID (temporary manual entry)"
        value={value.id}
        onChange={(e) => onChange({ ...value, id: e.target.value })}
      />
      <input
        className={`${input} min-w-48 flex-1`}
        placeholder="Full name"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
    </div>
  );
}

const STEP_TEXT: Record<string, (s?: number) => string> = {
  place_finger: (s) =>
    s === 2
      ? "Place the same finger on the sensor again."
      : "Place your finger on the sensor.",
  finger_detected: () => "Finger detected. Keep it still…",
  remove_finger: () => "Remove your finger.",
  processing: () => "Processing fingerprint template…",
};

function errText(e: BridgeError) {
  const hints: Record<string, string> = {
    enrollment_blocked: "Enrollment is blocked by the device. ",
    unauthorized: "The enrollment token was rejected; re-enter it. ",
    enroll_mismatch: "The two scans did not match; use the same finger. ",
    scan_timeout: "No finger was detected in time. ",
  };
  return `${hints[e.code] ?? ""}${e.message} (${e.code})`;
}

export default function AuthenticatorPage() {
  const a = useAuthenticator();
  const [port, setPort] = useState("");
  const [slot, setSlot] = useState(1);
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [person, setPerson] = useState<PersonnelRef>({
    kind: "professor",
    id: "",
    name: "",
  });
  const [tokenInput, setTokenInput] = useState("");
  const [advOut, setAdvOut] = useState("");
  const [delSlot, setDelSlot] = useState(1);
  const [confirm, setConfirm] = useState<null | "delete" | "clear">(null);
  const [clearText, setClearText] = useState("");

  const { status, info, enroll } = a;
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
    !!info?.sensorConnected &&
    !!info?.enrollmentAllowed &&
    !!person.id.trim() &&
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

  const badge = status.connected
    ? "border-green-600 text-green-700 dark:text-green-400"
    : "border-neutral-300 text-neutral-500 dark:border-neutral-700";

  return (
    <div className="mx-auto grid max-w-3xl gap-5 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Authenticator Management</h1>
        <p className="text-sm text-neutral-500">
          Manage your ARIS biometric authenticator, inspect fingerprint sensor
          information, and enroll personnel fingerprints.
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${badge}`}
          >
            {connLabel}
          </span>
          <span className="text-xs text-neutral-400">
            Temporary development page
          </span>
        </div>
      </header>

      {a.error && (
        <div className={alertErr} role="alert">
          {errText(a.error)}{" "}
          <button className="ml-2 underline" onClick={a.clearError}>
            Dismiss
          </button>
        </div>
      )}

      <Section title="USB connection">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${input} min-w-56`}
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
            Refresh ports
          </button>
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
        <p className="text-xs text-neutral-500">
          Close Arduino Serial Monitor (or any program using the port) first.
          Opening the port may reboot the ESP32; allow ~3 s.
        </p>
        {dev && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
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

      <Section title="Fingerprint sensor">
        <button
          className={btn}
          onClick={() => void a.refreshInfo()}
          disabled={!status.connected || running}
        >
          Refresh
        </button>
        {a.infoError && <div className={alertErr}>{errText(a.infoError)}</div>}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <Field label="Capacity">{show(info?.capacity)}</Field>
          <Field label="Registered fingerprints">
            {show(info?.templateCount)}
          </Field>
          <Field label="Free slots">{show(info?.slotsFree)}</Field>
          <Field label="Security level">{show(info?.securityLevel)}</Field>
          <Field label="Storage verification">
            {unavailable ? "—" : (info?.emptinessCheck ?? "—")}
          </Field>
          <Field label="Enrollment">
            <strong>{enrollmentStatus}</strong>
          </Field>
        </dl>
      </Section>

      <Section title="Enrollment token">
        <p className="text-sm">
          {a.tokenConfigured
            ? "Configured (stored in the OS credential manager)."
            : "Not configured."}
          {dev && !dev.enrollAuthRequired
            ? " The device does not require a token."
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            className={`${input} min-w-64 flex-1`}
            placeholder="Same value as ENROLL_AUTH_TOKEN in the firmware"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button
            className={btn}
            disabled={!tokenInput.trim()}
            onClick={async () => {
              try {
                await api.saveToken(tokenInput);
                setTokenInput("");
                await a.refreshToken();
              } catch (e) {
                a.setError(toBridgeError(e));
              }
            }}
          >
            Save token
          </button>
          <button
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
        </div>
      </Section>

      <Section title="Fingerprint enrollment">
        <ManualPersonnelPicker value={person} onChange={setPerson} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-neutral-500">
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
          <label className="grid gap-1 text-xs text-neutral-500">
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
            Cancel enrollment
          </button>
        </div>
        {!canEnroll && status.connected && !running && (
          <p className="text-xs text-neutral-500">
            {!person.id.trim() ? "Select a personnel record. " : ""}
            {!a.tokenConfigured && dev?.enrollAuthRequired
              ? "Save the enrollment token. "
              : ""}
            {enrollmentStatus}
          </p>
        )}

        {running && (
          <div
            className="rounded-md border border-dashed border-neutral-400 p-3 text-sm"
            aria-live="polite"
          >
            <strong>
              {enroll.step
                ? (STEP_TEXT[enroll.step]?.(enroll.sample) ?? enroll.step)
                : "Starting enrollment…"}
            </strong>
            {enroll.retry && (
              <p className="mt-1 text-neutral-500">
                Capture retry: {enroll.retry.replace(/_/g, " ")}. Adjust your
                finger and try again.
              </p>
            )}
          </div>
        )}
        {enroll.phase === "done" && enroll.result && (
          <div className={alertOk}>
            Fingerprint enrolled on device (ID {enroll.result.fingerprintId},
            templates: {enroll.result.templateCount ?? "—"},{" "}
            {Math.round(enroll.result.durationMs / 1000)} s).
            <div className="font-semibold">
              Fingerprint enrolled on device — personnel association pending.
            </div>
            <div className="mt-1 break-all text-xs opacity-80">
              Association payload:{" "}
              {JSON.stringify({
                personnelType: person.kind,
                personnelId: person.id,
                deviceId: enroll.result.deviceId,
                fingerprintId: enroll.result.fingerprintId,
              })}
              . No ARIS backend endpoint is called yet.
            </div>
          </div>
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
            onClick={() => void adv("get_status", () => api.send("get_status"))}
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
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-neutral-100 p-3 text-xs dark:bg-neutral-900">
            {advOut}
          </pre>
        )}

        <h3 className="mt-4 text-sm font-semibold text-red-600">
          Destructive (requires enrollment token)
        </h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-neutral-500">
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
            className="mt-3 space-y-2 rounded-md border border-red-500 p-3 text-sm"
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
                    which === "delete" ? "delete_template" : "clear_templates",
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
    </div>
  );
}
