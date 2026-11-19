import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

interface UpdateContextValue {
  available: boolean;
  version: string | null;
  currentVersion: string | null;
  body: string | null;
  checking: boolean;
  downloading: boolean;
  downloadProgress: number; // 0-100
  installedPendingRestart: boolean;
  error: string | null;

  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  installOnRestart: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

const toMessage = (err: unknown, fallback: string) => {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return message || fallback;
};

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installedPendingRestart, setInstalledPendingRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false); // guards against double check/install

  useEffect(() => {
    if (!isTauri()) return;

    void getVersion()
      .then(setCurrentVersion)
      .catch((err) => {
        console.error("[getVersion] raw error:", err);
      });
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (busyRef.current) return;
    if (!isTauri()) return;

    busyRef.current = true;
    setChecking(true);
    setError(null);

    try {
      const update = await check();

      if (update) {
        updateRef.current = update;
        setAvailable(true);
        setVersion(update.version);
        setCurrentVersion(update.currentVersion);
        setBody(update.body ?? null);
      } else {
        updateRef.current = null;
        setAvailable(false);
      }
    } catch (err) {
      console.error("[checkForUpdate] raw error:", err);
      setError(toMessage(err, "Update check failed"));
    } finally {
      setChecking(false);
      busyRef.current = false;
    }
  }, []);

  const downloadAndInstall = useCallback(async (update: Update) => {
    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setDownloadProgress(Math.round((downloaded / contentLength) * 100));
          }
          break;
        case "Finished":
          setDownloadProgress(100);
          break;
      }
    });
  }, []);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;

    busyRef.current = true;
    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      await downloadAndInstall(update);
      await relaunch();
    } catch (err) {
      console.error("[installUpdate] raw error:", err);
      setDownloading(false);
      setError(toMessage(err, "Update install failed"));
    } finally {
      busyRef.current = false;
    }
  }, [downloadAndInstall]);

  const installOnRestart = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current) return;

    busyRef.current = true;
    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      // No relaunch(): new binary is swapped in on disk and used on next start.
      await downloadAndInstall(update);
      setDownloading(false);
      setAvailable(false);
      setInstalledPendingRestart(true);
    } catch (err) {
      console.error("[installOnRestart] raw error:", err);
      setDownloading(false);
      setError(toMessage(err, "Update install failed"));
    } finally {
      busyRef.current = false;
    }
  }, [downloadAndInstall]);

  const value = useMemo<UpdateContextValue>(
    () => ({
      available,
      version,
      currentVersion,
      body,
      checking,
      downloading,
      downloadProgress,
      installedPendingRestart,
      error,
      checkForUpdate,
      installUpdate,
      installOnRestart,
    }),
    [
      available,
      version,
      currentVersion,
      body,
      checking,
      downloading,
      downloadProgress,
      installedPendingRestart,
      error,
      checkForUpdate,
      installUpdate,
      installOnRestart,
    ],
  );

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdater() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdater must be used within <UpdateProvider>");
  return ctx;
}
