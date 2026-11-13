import { useMemo } from "react";
import { useNavigate } from "react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { BRAND, BRAND_DARK } from "@/config/navigation";
import { Card, PageTitle, PrimaryButton, Badge, StatCard, StatGrid } from "@/components/ui";
import { useResource } from "@/hooks/useResource";
import type { AuditLog, AuditApiResponse } from "@/data/demoAuditLogs";

type DashboardData = {
  trend?: { m: string; v: number }[];
  recent?: { type: string; label: string; time: string; status: "Approved" | "Pending" | "Rejected" }[];
};

const statusTone = { Approved: "green", Pending: "amber", Rejected: "red" } as const;

export default function ProfOverview() {
  const navigate = useNavigate();
  // Sourced directly from /audit, identical to how aris-web in audit logs gets it
  const { data: rawAudit, loading: loadingAudit } = useResource<AuditApiResponse | AuditLog[]>("/audit", []);
  const { data: dashboardData, loading: loadingDashboard } = useResource<DashboardData>("/professor/dashboard", { trend: [], recent: [] });

  const logs: AuditLog[] = useMemo(() => {
    if (Array.isArray(rawAudit)) return rawAudit;
    if (rawAudit && Array.isArray((rawAudit as AuditApiResponse).logs)) {
      return (rawAudit as AuditApiResponse).logs;
    }
    return [];
  }, [rawAudit]);

  const recentSubmissions = useMemo(() => {
    if (logs.length > 0) {
      return logs.slice(0, 4).map((l) => ({
        type: l.type,
        label: l.target || l.record?.period || "Current Cycle",
        time: l.time || l.record?.reviewedAt || "Recently",
        status: (l.result === "Missing" ? "Pending" : l.result) as "Approved" | "Pending" | "Rejected",
      }));
    }
    return dashboardData?.recent || [];
  }, [logs, dashboardData]);

  const activityTrend = dashboardData?.trend || [];
  const totalCount = logs.length;
  const approvedCount = logs.filter((l) => l.result === "Approved").length;
  const pendingCount = logs.filter((l) => l.result === "Pending" || l.result === "Submitted").length;

  return (
    <div className="pb-2">
      <PageTitle title="Overview" subtitle="Your AR / DTR submissions at a glance." action={<PrimaryButton onClick={() => navigate("/prof/submit")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>New Submission</PrimaryButton>} />

      <StatGrid className="mb-4">
        {[
          ["My Submissions", loadingAudit ? "—" : String(totalCount), "green", totalCount > 0 ? `${totalCount} records` : ""],
          ["On-time Rate", loadingAudit ? "—" : (totalCount > 0 ? "100%" : "—"), "green", ""],
          ["Approved", loadingAudit ? "—" : String(approvedCount), "green", totalCount ? `${Math.round((approvedCount / totalCount) * 100)}%` : ""],
          ["Pending Review", loadingAudit ? "—" : String(pendingCount), "amber", pendingCount > 0 ? "awaiting review" : ""],
        ].map(([l, v, tone, d]) => (
          <StatCard key={l} label={l} value={v} badge={d ? <Badge tone={tone as "green" | "amber"}>{d}</Badge> : undefined} />
        ))}
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "#111c14" }}>Submission activity</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#8fa394" }}>Records submitted over the last 6 months</p>
            </div>
            {activityTrend.length > 0 && <Badge tone="green" dot>On track</Badge>}
          </div>
          <div className="h-44">
            {activityTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityTrend} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8fa394" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eef1ef", fontSize: 12 }} />
                  <Area type="monotone" dataKey="v" stroke={BRAND} strokeWidth={2.5} fill="url(#pg)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[12px] text-[#8fa394]">
                {loadingAudit || loadingDashboard ? "Loading activity..." : "No submission activity yet."}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card style={{ background: BRAND_DARK }}>
            <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "#5f8c6c" }}>Next deadline</p>
            <p className="text-[22px] font-bold tracking-tight mt-1.5" style={{ color: "#fff" }}>Friday · 5:00 PM</p>
            <p className="text-[12.5px] mt-1" style={{ color: "#7aaa86" }}>September Cycle 1 — AR & DTR</p>
          </Card>
          <Card>
            <p className="text-[13px] font-semibold mb-3" style={{ color: "#111c14" }}>Recent submissions</p>
            {recentSubmissions.length === 0 ? (
              <p className="text-[12px] text-center py-6 text-[#8fa394]">
                {loadingAudit ? "Loading recent submissions..." : "No recent submissions found."}
              </p>
            ) : (
              <div className="space-y-3">
                {recentSubmissions.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold w-8" style={{ color: r.type === "DTR" ? BRAND : "#3f8ecc" }}>{r.type}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] truncate" style={{ color: "#3d4a41" }}>{r.label}</p>
                      <p className="text-[11px]" style={{ color: "#8fa394" }}>{r.time}</p>
                    </div>
                    <Badge tone={statusTone[r.status as keyof typeof statusTone] || "amber"} dot>{r.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
