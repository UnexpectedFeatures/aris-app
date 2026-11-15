import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUpdater } from "@/providers/UpdateProvider";

function Icon({
  size = 18,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const AlertIcon = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Icon>
);

const UpdateIcon = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <polyline points="8 17 12 21 16 17" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29" />
  </Icon>
);

const CloseIcon = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);

/**
 * Renders nothing unless an update is available (or was just installed
 * and is waiting for restart). Check failures stay silent.
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

  // Only show when an update exists. `error` is displayed inside the card
  // (install failures), never on its own (e.g. failed/offline update check).
  const shouldShow = available && !dismissed && !installedPendingRestart;

  const handleDismiss = () => {
    dismissedVersionRef.current = version;
    setDismissed(true);
  };

  return (
    <div className="fixed top-4 right-4 z-1000 w-80 pointer-events-none">
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
              {error ? (
                <AlertIcon className="text-error mt-0.5 shrink-0" />
              ) : (
                <UpdateIcon className="text-primary mt-0.5 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                {error ? (
                  <>
                    <p className="text-sm font-semibold text-error mb-1">
                      Update failed
                    </p>
                    <p className="text-xs text-on-surface-variant break-words mb-3">
                      {error}
                    </p>
                    <button
                      type="button"
                      onClick={installUpdate}
                      className="w-full bg-surface-container-high text-on-surface text-xs font-semibold py-1.5 rounded-md hover:bg-surface-container-highest transition-colors"
                    >
                      Retry
                    </button>
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
                <CloseIcon size={16} />
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
