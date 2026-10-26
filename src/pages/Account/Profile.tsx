import { Badge, Card, PageTitle } from "@/components/ui";
import { useAuth } from "@/app/authContext";
import { BRAND } from "@/config/navigation";

export default function Profile() {
  const { user } = useAuth();
  const roleName = user.role === "staff"
    ? user.staffStage ?? "Staff"
    : user.role === "administrator" ? "Administrator" : "Professor";
  const details = [
    ["Full name", user.name],
    ["Email address", user.email],
    ["Account role", roleName],
    ...(user.staffStage ? [["Staff stage", user.staffStage]] : []),
  ];

  return (
    <div className="pb-4">
      <PageTitle title="Profile" subtitle="View your ARIS account and role information." />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <Card className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full text-[24px] font-semibold text-white" style={{ background: BRAND }}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="mt-3 text-[16px] font-semibold text-[#111c14]">{user.name}</h2>
          <p className="text-[13px] text-[#8fa394]">{user.email}</p>
          <div className="mt-2"><Badge tone="green" dot>{roleName}</Badge></div>
        </Card>
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-[#111c14]">Profile information</h2>
          <dl className="divide-y" style={{ borderColor: "#eef1ef" }}>
            {details.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-2 py-3 first:pt-0">
                <dt className="text-[12.5px] text-[#8fa394]">{label}</dt>
                <dd className="text-right text-[13px] font-medium text-[#111c14]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-[#f4f6f5] p-3 text-[12px] leading-relaxed text-[#5a6b5e]">
            Account identity details are managed by your ARIS administrator. Use Preferences to change appearance, notifications, and accessibility options.
          </p>
        </Card>
      </div>
    </div>
  );
}
