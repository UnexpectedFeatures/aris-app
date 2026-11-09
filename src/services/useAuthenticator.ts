import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatorApi as api, EVT, on } from "./rustMiddleware";
import { enrollFingerprint } from "./biometricsService";
import {
  toBridgeError,
  type BridgeError,
  type ConnectionStatus,
  type DeviceEvent,
  type EnrollResult,
  type EnrollState,
  type PortInfo,
  type TemplateInfo,
} from "../data/types";

const DISCONNECTED: ConnectionStatus = {
  connected: false,
  portName: null,
  baudRate: 115200,
  busy: false,
  device: null,
};
const IDLE: EnrollState = { phase: "idle" };

export interface SyncState {
  status: "idle" | "saving" | "saved" | "failed";
  error: string | null;
}
const SYNC_IDLE: SyncState = { status: "idle", error: null };

function serverMessage(e: unknown): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (m) return Array.isArray(m) ? m.join(", ") : m;
  return e instanceof Error ? e.message : "Could not save to ARIS.";
}

export function useAuthenticator() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>(DISCONNECTED);
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  const [infoError, setInfoError] = useState<BridgeError | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [enroll, setEnroll] = useState<EnrollState>(IDLE);
  const [sync, setSync] = useState<SyncState>(SYNC_IDLE);
  const [error, setError] = useState<BridgeError | null>(null);
  const enrollingRef = useRef(false);

  const refreshPorts = useCallback(async () => {
    try {
      setPorts(await api.listPorts());
    } catch (e) {
      setError(toBridgeError(e));
    }
  }, []);

  const refreshInfo = useCallback(async () => {
    try {
      const t = await api.templateInfo();
      setInfo(t);
      setInfoError(null);
      return t;
    } catch (e) {
      setInfo(null); // never show stale/zero values when the read failed
      setInfoError(toBridgeError(e));
      return null;
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      setTokenConfigured(await api.tokenConfigured());
    } catch (e) {
      setTokenConfigured(false);
      setError(toBridgeError(e));
    }
  }, []);

  useEffect(() => {
    void refreshPorts();
    void refreshToken();
    void api
      .connectionStatus()
      .then(setStatus)
      .catch(() => undefined);

    const subs = [
      on<ConnectionStatus>(EVT.connected, setStatus),
      on<unknown>(EVT.disconnected, () => {
        setStatus(DISCONNECTED);
        setInfo(null);
        setInfoError(null);
        if (enrollingRef.current)
          setEnroll({
            phase: "failed",
            error: {
              code: "disconnected",
              message: "Device disconnected during enrollment",
              retryable: true,
            },
          });
      }),
      on<BridgeError>(EVT.error, (e) => setError(toBridgeError(e))),
      on<DeviceEvent>(EVT.enrollmentProgress, (ev) => {
        const d = ev.data ?? {};
        if (ev.event === "capture_retry") {
          setEnroll((s) => ({
            ...s,
            phase: "running",
            retry: String(d.reason ?? "retry"),
          }));
        } else {
          setEnroll((s) => ({
            ...s,
            phase: "running",
            step: String(d.step ?? ""),
            sample: Number(d.sample ?? 0),
            retry: undefined,
          }));
        }
      }),
    ];
    return () => {
      subs.forEach((p) => void p.then((un) => un()));
    };
  }, [refreshPorts, refreshToken]);

  const connect = useCallback(
    async (port: string) => {
      setConnecting(true);
      setError(null);
      try {
        setStatus(await api.connect(port));
        await refreshInfo();
      } catch (e) {
        setError(toBridgeError(e));
      } finally {
        setConnecting(false);
      }
    },
    [refreshInfo],
  );

  const disconnect = useCallback(async () => {
    try {
      setStatus(await api.disconnect());
      setInfo(null);
    } catch (e) {
      setError(toBridgeError(e));
    }
  }, []);

  // Saves the enrolled fingerprint to ARIS for the signed-in account.
  const saveEnrollment = useCallback(async (result: EnrollResult) => {
    setSync({ status: "saving", error: null });
    try {
      await enrollFingerprint({
        authenticator_tag: result.deviceId,
        biometrics_fingerprint: String(result.fingerprintId),
      });
      setSync({ status: "saved", error: null });
    } catch (e) {
      setSync({ status: "failed", error: serverMessage(e) });
    }
  }, []);

  const startEnrollment = useCallback(
    async (slot: number, timeoutMs: number) => {
      setError(null);
      setSync(SYNC_IDLE);
      setEnroll({ phase: "starting" });
      // Pre-flight with FRESH device data; the firmware stays the final authority.
      const t = await refreshInfo();
      const fail = (err: BridgeError) =>
        setEnroll({ phase: "failed", error: err });
      if (!status.connected || !status.device)
        return fail({
          code: "not_connected",
          message: "Connect to an authenticator first",
          retryable: false,
        });
      if (!tokenConfigured && status.device.enrollAuthRequired)
        return fail({
          code: "token_not_configured",
          message: "Save the enrollment token first",
          retryable: false,
        });
      if (!t)
        return fail({
          code: "info_unavailable",
          message: "Could not read sensor information",
          retryable: true,
        });
      if (!t.sensorConnected)
        return fail({
          code: "sensor_unavailable",
          message: "Fingerprint sensor is not connected",
          retryable: true,
        });
      if (!t.enrollmentAllowed)
        return fail({
          code: "enrollment_blocked",
          message: blockedText(t.enrollmentBlockedReason),
          retryable: false,
        });
      if (t.capacity != null && (slot < 0 || slot >= t.capacity))
        return fail({
          code: "invalid_slot",
          message: `Slot must be between 0 and ${t.capacity - 1}`,
          retryable: false,
        });

      enrollingRef.current = true;
      try {
        const result = await api.enroll(slot, timeoutMs);
        setEnroll({ phase: "done", result });
        void saveEnrollment(result);
      } catch (e) {
        const err = toBridgeError(e);
        setEnroll(
          err.code === "cancelled"
            ? { phase: "cancelled", error: err }
            : { phase: "failed", error: err },
        );
      } finally {
        enrollingRef.current = false;
        void refreshInfo();
      }
    },
    [refreshInfo, saveEnrollment, status, tokenConfigured],
  );

  const retrySave = useCallback(() => {
    if (enroll.phase === "done" && enroll.result) {
      void saveEnrollment(enroll.result);
    }
  }, [enroll, saveEnrollment]);

  const cancelEnrollment = useCallback(async () => {
    try {
      await api.send("cancel");
    } catch (e) {
      setError(toBridgeError(e));
    }
  }, []);

  return {
    ports,
    status,
    connecting,
    info,
    infoError,
    tokenConfigured,
    enroll,
    sync,
    error,
    clearError: () => setError(null),
    resetEnroll: () => {
      setEnroll(IDLE);
      setSync(SYNC_IDLE);
    },
    refreshPorts,
    refreshInfo,
    refreshToken,
    connect,
    disconnect,
    startEnrollment,
    retrySave,
    cancelEnrollment,
    setError,
  };
}

export function blockedText(reason: string | null): string {
  switch (reason) {
    case "templates_present":
      return "A fingerprint is already registered on this authenticator";
    case "sensor_disconnected":
      return "The fingerprint sensor is disconnected";
    case "sensor_comm_error":
      return "Sensor communication error";
    case "emptiness_unverified":
      return "Could not verify that sensor storage is empty";
    default:
      return reason ?? "Enrollment is not available";
  }
}