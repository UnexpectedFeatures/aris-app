import { useState } from "react"
import { PageTitle } from "@/components/ui"
import { useResource } from "@/hooks/useResource"
import { saveResource } from "@/services/dataSource"

type SystemSettingsData = {
  institutionName: string
  department: string
  maintenanceMode: boolean
  twoFactorAuthentication: boolean
  campusSso: boolean
  sessionTimeout: string
  automaticBackups: boolean
  aiGrading: boolean
  emailAlerts: boolean
}

const defaultSettings: SystemSettingsData = {
  institutionName: "ARIS University",
  department: "CSD",
  maintenanceMode: false,
  twoFactorAuthentication: true,
  campusSso: true,
  sessionTimeout: "30 minutes",
  automaticBackups: true,
  aiGrading: true,
  emailAlerts: true,
}

function SettingsCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5">
      <h2 className="mb-3 text-[13px] font-semibold" style={{ color: "#111c14" }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function SettingsField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[11px] font-medium" style={{ color: "#3d4a41" }}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block h-9 w-full rounded-xl border px-3 text-[12px] font-normal outline-none focus:border-[#3a7d4e]"
        style={{ borderColor: "#e2e8e4", color: "#111c14" }}
      />
    </label>
  )
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 border-t first:border-t-0" style={{ borderColor: "#f0f4f1" }}>
      <div className="min-w-0">
        <p className="text-[11px] font-medium" style={{ color: "#111c14" }}>{title}</p>
        <p className="mt-0.5 text-[10px]" style={{ color: "#8fa394" }}>{description}</p>
      </div>
      {children}
    </div>
  )
}

function SettingSwitch({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex h-5 w-[30px] flex-shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3a7d4e]"
      style={{ background: on ? "#3a7d4e" : "#d6ded8" }}
    >
      <span
        className="h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(10px)" : "translateX(0)", boxShadow: "0 1px 2px rgba(0,0,0,0.16)" }}
      />
    </button>
  )
}

function StatusBadge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "gray" }) {
  const isGreen = tone === "green"
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold"
      style={{ color: isGreen ? "#2f7043" : "#5a6b5e", background: isGreen ? "#eaf4ee" : "#f0f2f0" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: isGreen ? "#3a7d4e" : "#8fa394" }} />
      {children}
    </span>
  )
}

export default function SystemSettings() {
  const { data: settings, setData: setSettings, loading, error } = useResource("/settings/system", defaultSettings)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const update = <K extends keyof SystemSettingsData>(key: K, value: SystemSettingsData[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaved(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveResource("/settings/system", settings, "PUT")
      setSaved(true)
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Unable to save system settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-4">
      <PageTitle
        title="System Settings"
        subtitle="Institution-wide configuration for ARIS."
        action={
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="h-9 rounded-xl px-4 text-[11px] font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "#3a7d4e" }}
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
          </button>
        }
      />

      {(error || saveError) && (
        <p role="alert" className="mb-3 text-[12px] text-red-700">{error ?? saveError}</p>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SettingsCard title="General">
          <div className="space-y-3">
            <SettingsField
              label="Institution name"
              value={settings.institutionName}
              onChange={(value) => update("institutionName", value)}
            />
            <SettingsField
              label="Department"
              value={settings.department}
              onChange={(value) => update("department", value)}
            />
            <SettingsRow title="Maintenance mode" description="Take ARIS offline for scheduled work.">
              <SettingSwitch
                label="Maintenance mode"
                on={settings.maintenanceMode}
                onChange={(value) => update("maintenanceMode", value)}
              />
            </SettingsRow>
          </div>
        </SettingsCard>

        <SettingsCard title="Security">
          <SettingsRow title="Two-factor authentication" description="Require 2FA for all administrator accounts.">
            <SettingSwitch
              label="Two-factor authentication"
              on={settings.twoFactorAuthentication}
              onChange={(value) => update("twoFactorAuthentication", value)}
            />
          </SettingsRow>
          <SettingsRow title="Campus SSO" description="Allow sign-in with institutional accounts.">
            <SettingSwitch label="Campus SSO" on={settings.campusSso} onChange={(value) => update("campusSso", value)} />
          </SettingsRow>
          <SettingsRow title="Session timeout" description="Auto sign-out after inactivity.">
            <select
              aria-label="Session timeout"
              value={settings.sessionTimeout}
              onChange={(event) => update("sessionTimeout", event.target.value)}
              className="h-8 rounded-xl border bg-white px-2.5 text-[10px] outline-none focus:border-[#3a7d4e]"
              style={{ borderColor: "#e2e8e4", color: "#111c14" }}
            >
              <option>15 minutes</option>
              <option>30 minutes</option>
              <option>60 minutes</option>
              <option>2 hours</option>
            </select>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="Data & Backups">
          <SettingsRow title="Automatic backups" description="Nightly encrypted snapshots at 2:00 AM.">
            <SettingSwitch label="Automatic backups" on={settings.automaticBackups} onChange={(value) => update("automaticBackups", value)} />
          </SettingsRow>
          <SettingsRow title="Last backup" description="Today at 2:00 AM · 4.2 GB">
            <StatusBadge>Healthy</StatusBadge>
          </SettingsRow>
          <SettingsRow title="Storage used" description="312 GB of 500 GB">
            <div className="h-1 w-16 overflow-hidden rounded-full" role="progressbar" aria-label="Storage used" aria-valuenow={62} aria-valuemin={0} aria-valuemax={100} style={{ background: "#eaf4ee" }}>
              <div className="h-full w-[62%] rounded-full" style={{ background: "#3a7d4e" }} />
            </div>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="Notifications & Integrations">
          <SettingsRow title="AI grading" description="Enable machine-assisted assessment scoring.">
            <SettingSwitch label="AI grading" on={settings.aiGrading} onChange={(value) => update("aiGrading", value)} />
          </SettingsRow>
          <SettingsRow title="Email alerts" description="Send critical system alerts to administrators.">
            <SettingSwitch label="Email alerts" on={settings.emailAlerts} onChange={(value) => update("emailAlerts", value)} />
          </SettingsRow>
          <SettingsRow title="Google gateway" description="Connected via Google">
            <StatusBadge>Connected</StatusBadge>
          </SettingsRow>
        </SettingsCard>
      </div>
    </div>
  )
}
