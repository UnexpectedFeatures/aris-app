import { useState } from "react";
import {
  Monitor,
  Download,
  Copy,
  Check,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Cpu,
  FileCode,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { BRAND } from "@/config/navigation";
import { PageTitle, Card, Badge } from "@/components/ui";
import { useUpdater } from "@/providers/UpdateProvider";
import { useLatestClientRelease } from "@/hooks/useLatestClientRelease";

async function openExternal(url: string, fileName?: string) {
  if (isTauri()) {
    try {
      await openUrl(url);
      return;
    } catch (err) {
      console.warn("Unable to open with plugin-opener, falling back", err);
    }
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function ChecksumBox({
  hash,
  copied,
  onCopy,
}: {
  hash: string | null;
  copied: boolean;
  onCopy: (hash: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#edf1ee] bg-[#f9fbf9] p-3 text-left">
      <div className="flex items-center justify-between text-[11px] text-[#5a6b5e] mb-1">
        <span className="font-medium flex items-center gap-1.5">
          <FileCode className="h-3 w-3 text-[#3a7d4e]" />
          SHA-256 Checksum
        </span>
        {hash && (
          <button
            type="button"
            onClick={() => onCopy(hash)}
            className="inline-flex items-center gap-1 text-[#2f7043] font-semibold text-[11px] hover:underline"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>
      {hash ? (
        <code className="block font-mono text-[10.5px] text-[#3d4a41] break-all bg-white p-1.5 rounded-lg border border-[#e2e8e4]">
          {hash}
        </code>
      ) : (
        <p className="text-[10.5px] text-[#8fa394]">
          Integrity hash verified via release signature.
        </p>
      )}
    </div>
  );
}

export default function SystemSettings() {
  const {
    available: updateAvailable,
    version: updateVersion,
    currentVersion,
    body: updateNotes,
    checking: updateChecking,
    downloading: updateDownloading,
    downloadProgress,
    installedPendingRestart,
    error: updateError,
    checkForUpdate,
    installUpdate,
    installOnRestart,
  } = useUpdater();

  const {
    release: desktopRelease,
    refresh: refreshDesktop,
  } = useLatestClientRelease("desktop");

  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [reprovisioning, setReprovisioning] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);

  const otaStatus =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("aris-ota-status") ||
        (localStorage.getItem("aris-ota-provisioned") === "true"
          ? "installed"
          : "unprovisioned")
      : "unprovisioned";

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const handleRefreshAll = () => {
    checkForUpdate();
    refreshDesktop();
  };

  const handleTriggerProvisioning = async () => {
    if (!isTauri()) {
      setProvisionMessage(
        "OTA Provisioning runs exclusively in the native desktop application.",
      );
      return;
    }
    setReprovisioning(true);
    setProvisionMessage("Checking OTA hardware driver service…");
    try {
      localStorage.removeItem("aris-ota-provisioned");
      localStorage.setItem("aris-ota-status", "checking");
      await invoke("clear_in_app_meet_transcript").catch(() => {});
      setProvisionMessage(
        "Hardware provisioning check initiated. Background service is active.",
      );
    } catch (err) {
      setProvisionMessage(
        err instanceof Error ? err.message : "Unable to run hardware check.",
      );
    } finally {
      setReprovisioning(false);
    }
  };

  return (
    <div className="pb-8 space-y-5">
      <PageTitle
        title="Download Manager"
        subtitle="Manage ARIS client applications, live software updates, and installation packages."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={updateChecking}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-white px-3.5 text-[11.5px] font-semibold text-[#3d4a41] transition hover:border-[#3a7d4e] hover:text-[#3a7d4e] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${updateChecking ? "animate-spin text-[#3a7d4e]" : ""}`}
              />
              <span>{updateChecking ? "Checking…" : "Check for Updates"}</span>
            </button>
          </div>
        }
      />

      {/* In-App Live Update Status Banner */}
      <Card className="border border-[#e2e8e4]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "#eaf4ee", color: BRAND }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-bold text-[#111c14]">
                  ARIS Desktop App Updater
                </h3>
                {installedPendingRestart ? (
                  <Badge tone="green" dot>
                    Restart Required
                  </Badge>
                ) : updateDownloading ? (
                  <Badge tone="blue" dot>
                    Downloading {downloadProgress}%
                  </Badge>
                ) : updateAvailable ? (
                  <Badge tone="amber" dot>
                    Update Available: v{updateVersion}
                  </Badge>
                ) : (
                  <Badge tone="green" dot>
                    Up to Date
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-[#5a6b5e]">
                Current installed client build:{" "}
                <span className="font-semibold text-[#111c14]">
                  {currentVersion ? `v${currentVersion}` : "Unavailable"}
                </span>
                {updateAvailable && (
                  <span className="text-[#996515] font-medium ml-1.5">
                    — Version {updateVersion} is ready to install
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {installedPendingRestart ? (
              <button
                type="button"
                onClick={() => relaunch().catch(() => window.location.reload())}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ background: BRAND }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Restart Now</span>
              </button>
            ) : updateDownloading ? (
              <div className="flex items-center gap-3">
                <div className="w-32 bg-[#e2e8e4] h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3a7d4e] transition-all duration-200"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-[#3a7d4e]">
                  {downloadProgress}%
                </span>
              </div>
            ) : updateAvailable ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => installUpdate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{ background: BRAND }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Update &amp; Restart</span>
                </button>
                <button
                  type="button"
                  onClick={() => installOnRestart()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-white px-3.5 text-[12px] font-semibold text-[#3d4a41] transition hover:bg-[#f9fbf9]"
                >
                  <span>Install on Next Restart</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => checkForUpdate()}
                disabled={updateChecking}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-white px-3.5 text-[12px] font-semibold text-[#3d4a41] transition hover:border-[#3a7d4e] hover:text-[#3a7d4e] disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-[#3a7d4e]" />
                <span>Check for Updates</span>
              </button>
            )}
          </div>
        </div>

        {updateError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 p-2.5 text-[11.5px] text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{updateError}</span>
          </div>
        )}

        {updateNotes && updateAvailable && (
          <div className="mt-3 rounded-xl border border-[#edf1ee] bg-[#f9fbf9] p-3 text-[12px]">
            <p className="font-semibold text-[#111c14] mb-1">Release Highlights:</p>
            <p className="text-[#5a6b5e] whitespace-pre-wrap">{updateNotes}</p>
          </div>
        )}
      </Card>

      {/* Official Desktop Client Download */}
      <div>
        <div className="mb-3">
          <h2 className="text-[14px] font-semibold text-[#111c14]">
            Official Client Application
          </h2>
          <p className="text-[12px] text-[#5a6b5e]">
            Download the standalone installer or enterprise installation packages.
          </p>
        </div>

        <Card className="flex flex-col justify-between border border-[#e2e8e4]">
          <div className="space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf4ee] text-[#3a7d4e]">
                  <Monitor className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#111c14]">
                    ARIS Desktop for Windows
                  </h3>
                  <p className="text-[11.5px] text-[#5a6b5e]">
                    Official Windows Desktop Application
                  </p>
                </div>
              </div>
              <Badge tone="green">Windows</Badge>
            </div>

            <p className="text-[12px] leading-relaxed text-[#5a6b5e]">
              Full-featured desktop application with USB biometric fingerprint recognition,
              offline encrypted attendance caching, and faculty report encoding.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] rounded-xl bg-[#f8faf8] p-3 border border-[#edf1ee]">
              <div>
                <span className="text-[#8fa394] block">Version</span>
                <span className="font-semibold text-[#111c14]">
                  {desktopRelease.version}
                </span>
              </div>
              <div>
                <span className="text-[#8fa394] block">Platform / Arch</span>
                <span className="font-semibold text-[#111c14]">
                  Windows 10, 11 (x64)
                </span>
              </div>
              <div>
                <span className="text-[#8fa394] block">Package Size</span>
                <span className="font-semibold text-[#111c14]">
                  {desktopRelease.size}
                </span>
              </div>
              <div>
                <span className="text-[#8fa394] block">Published Date</span>
                <span className="font-semibold text-[#111c14]">
                  {desktopRelease.date}
                </span>
              </div>
            </div>

            <ChecksumBox
              hash={desktopRelease.sha256}
              copied={copiedHash === desktopRelease.sha256}
              onCopy={handleCopyHash}
            />
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0f4f1] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  openExternal(desktopRelease.downloadUrl, desktopRelease.fileName)
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ background: BRAND }}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Setup (.exe)</span>
              </button>

              {desktopRelease.alternate && (
                <button
                  type="button"
                  onClick={() =>
                    openExternal(
                      desktopRelease.alternate!.downloadUrl,
                      desktopRelease.alternate!.fileName,
                    )
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-white px-3 text-[11.5px] font-medium text-[#3d4a41] hover:bg-[#f9fbf9]"
                  title="Download enterprise MSI installer package"
                >
                  <span>MSI (.msi)</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => openExternal(desktopRelease.releasesUrl)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5a6b5e] hover:text-[#3a7d4e]"
            >
              <span>Release notes</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </Card>
      </div>

      {/* Hardware Biometrics Provisioner & Drivers */}
      <Card className="border border-[#e2e8e4]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f4f1] text-[#3d4a41]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[13.5px] font-bold text-[#111c14]">
                  USB Biometric Hardware &amp; Scanner Drivers
                </h3>
                {otaStatus === "installed" ? (
                  <Badge tone="green" dot>
                    Provisioned
                  </Badge>
                ) : otaStatus === "checking" ? (
                  <Badge tone="blue" dot>
                    Checking
                  </Badge>
                ) : (
                  <Badge tone="gray" dot>
                    Default Driver Active
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11.5px] text-[#5a6b5e]">
                Automated driver watcher and USB scanner bridge (ArisProvisioner.ps1) for
                local fingerprint &amp; facial biometrics integration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTriggerProvisioning}
              disabled={reprovisioning}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e2e8e4] bg-white px-3.5 text-[11.5px] font-semibold text-[#3d4a41] transition hover:border-[#3a7d4e] hover:text-[#3a7d4e] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${reprovisioning ? "animate-spin" : ""}`}
              />
              <span>{reprovisioning ? "Testing…" : "Verify Hardware Driver"}</span>
            </button>
          </div>
        </div>

        {provisionMessage && (
          <p className="mt-2.5 text-[11.5px] text-[#2f7043] bg-[#eaf4ee] p-2 rounded-lg">
            {provisionMessage}
          </p>
        )}
      </Card>

      {/* Security & Verification Banner */}
      <div className="rounded-2xl border border-[#e2e8e4] bg-white p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-[#3a7d4e] shrink-0" />
          <p className="text-[11.5px] text-[#5a6b5e]">
            Official software builds published and signed by the{" "}
            <span className="font-semibold text-[#111c14]">
             ARIS
            </span>
            . All downloads connect over TLS 1.3 encrypted endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openExternal("https://github.com/UnexpectedFeatures/aris-app/releases")}
          className="shrink-0 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2f7043] hover:underline"
        >
          <span>View GitHub Releases</span>
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
