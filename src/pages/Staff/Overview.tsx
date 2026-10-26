import { useNavigate } from "react-router";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BRAND, BRAND_DARK } from "@/config/navigation";
import { Badge, Card, PageTitle, StatCard, StatGrid } from "@/components/ui";

const activity = [
  { month: "May", approved: 18, rejected: 9 },
  { month: "Jun", approved: 24, rejected: 12 },
  { month: "Jul", approved: 21, rejected: 11 },
  { month: "Aug", approved: 31, rejected: 13 },
  { month: "Sep", approved: 28, rejected: 12 },
  { month: "Oct", approved: 34, rejected: 13 },
];

const pendingReviews = [
  { type: "DTR", label: "September Cycle 1 · 18 outputs", time: "2 hours ago" },
  { type: "DTR", label: "September Cycle 1 · 22 days", time: "2 hours ago" },
  { type: "DTR", label: "August Cycle 2 · 16 outputs", time: "2 weeks ago" },
  { type: "DTR", label: "August Cycle 2 · 21 days", time: "2 weeks ago" },
];

export default function StaffOverview() {
  const navigate = useNavigate();

  return (
    <div className="pb-2">
      <PageTitle title="Overview" subtitle="Your AR / DTR submissions at a glance." />

      <StatGrid className="mb-3">
        <StatCard label="Pending Review" value="32" badge={<Badge tone="green">87%</Badge>} />
        <StatCard label="Approved" value="34" badge={<Badge tone="green">87%</Badge>} />
        <StatCard label="Rejected / Revise" value="2" badge={<Badge tone="green">100%</Badge>} />
        <StatCard label="On-time Rate" value="92%" badge={<Badge tone="green">+4.0%</Badge>} />
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "#111c14" }}>Submission activity</p>
              <p className="mt-0.5 text-[12px]" style={{ color: "#8fa394" }}>Records submitted over the last 6 months</p>
            </div>
            <div className="flex flex-col gap-1">
              <Badge tone="green" dot>Approved</Badge>
              <Badge tone="red" dot>Rejected</Badge>
            </div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="staffActivityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#8fa394" }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eef1ef", fontSize: 12 }} />
                <Area type="monotone" dataKey="approved" name="Approved" stroke={BRAND} strokeWidth={2} fill="url(#staffActivityFill)" />
                <Line type="monotone" dataKey="rejected" name="Rejected" stroke="#e3342f" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-3">
          <Card style={{ background: BRAND_DARK }}>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#5f8c6c" }}>Next deadline</p>
            <p className="mt-1.5 text-[22px] font-bold tracking-tight" style={{ color: "#fff" }}>Friday · 5:00 PM</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "#7aaa86" }}>September Cycle 1 — AR &amp; DTR</p>
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold" style={{ color: "#111c14" }}>Pending reviews</p>
              <button type="button" onClick={() => navigate("/staff/approvals")} className="text-[11px] font-semibold" style={{ color: BRAND }}>View all</button>
            </div>
            <div className="space-y-3">
              {pendingReviews.map((review, index) => (
                <button
                  key={`${review.label}-${index}`}
                  type="button"
                  onClick={() => navigate("/staff/approvals")}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span className="w-6 flex-shrink-0 text-[10px] font-semibold" style={{ color: BRAND }}>{review.type}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px]" style={{ color: "#3d4a41" }}>{review.label}</span>
                    <span className="block text-[10px]" style={{ color: "#8fa394" }}>{review.time}</span>
                  </span>
                  <Badge tone="amber" dot>Pending</Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
