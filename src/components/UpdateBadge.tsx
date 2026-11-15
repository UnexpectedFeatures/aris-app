import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUpdater } from "@/providers/UpdateProvider";

/**
 * Renders nothing until an update is actually available.
 * Fixed-position toast, top-right. Mount once near the app root,
 * inside <UpdateProvider>.
 */
export function UpdateBadge() {
  const {
    available,
    version,
    downloading,
    downloadProgress,
    installedPendingRestart,
    error,
    checkForUpdate,
    installUpdate,
    installOnRestart,
  } = useUpdater();

  const [dismissed, setDismissed] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    if (available && version !== dismissedVersionRef.current) {
      setDismissed(false);
    }
  }, [available, version]);

  const shouldShow =
    (available || !!error) && !dismissed && !installedPendingRestart;

  const handleDismiss = () => {
    dismissedVersionRef.current = version;
    setDismissed(true);
  };

  return (
    <div className="fixed top-4 right-4 z-[100] w-80 pointer-events-none">
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-xl p-4"
          >
            <div className="flex items-start gap-2">
              <span
                className={`material-symbols-outlined text-[18px] mt-0.5 ${
                  error ? "text-error" : "text-primary"
                }`}
              >
                {error ? "error" : "system_update"}
              </span>

              <div className="flex-1 min-w-0">
                {error ? (
                  <>
                    <p className="text-sm font-semibold text-error mb-1">
                      Update failed
                    </p>
                    <p className="text-xs text-on-surface-variant break-words">
                      {error}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-on-surface mb-1">
                      Update available
                    </p>
                    <p className="text-xs text-on-surface-variant mb-3">
                      Version {version} is ready to install. Dismiss this and
                      you can still install it from Settings → About System.
                    </p>

                    {downloading ? (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-on-surface-variant text-center">
                          {downloadProgress}%
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={installUpdate}
                          className="flex-1 bg-primary text-on-primary text-xs font-semibold py-1.5 rounded-md hover:opacity-90 transition-opacity"
                        >
                          Install Now
                        </button>
                        <button
                          type="button"
                          onClick={installOnRestart}
                          className="flex-1 bg-surface-container-high text-on-surface text-xs font-semibold py-1.5 rounded-md hover:bg-surface-container-highest transition-colors"
                        >
                          On Next Restart
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="text-on-surface-variant hover:text-on-surface transition-colors -mt-0.5 -mr-0.5"
                title="Dismiss"
              >
                <span className="material-symbols-outlined text-[16px]">
                  close
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {installedPendingRestart && !downloading && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          className="pointer-events-auto bg-surface-container-lowest border border-outline-variant/30 rounded-lg shadow-xl p-3 mt-2"
        >
          <p className="text-xs text-on-surface-variant">
            Update v{version} will install on next restart.
          </p>
        </motion.div>
      )}
    </div>
  );
}
