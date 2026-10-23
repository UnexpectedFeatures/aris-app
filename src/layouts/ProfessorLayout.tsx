import { Outlet, useLocation, useNavigate } from "react-router";
import { useState } from "react";
import arisLogo from "@/assets/brand/image.png";
import { BRAND, BRAND_DARK, profMainNav, profMeetNav, profHelpNav, profSettingsNav, staffMainNav, staffSettingsNav, type NavItem } from "@/config/navigation";
import type { UserAccount } from "@/data/demoAccounts";
import DataModeNotice from "@/components/DataModeNotice";
import { GhostButton, Modal, PrimaryButton } from "@/components/ui";

export default function ProfRoot({ onSignOut, user }: { onSignOut: () => void; user: UserAccount }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const isStaff = user.role === "staff";
  const mainNav = isStaff ? staffMainNav : profMainNav;
  const meetNav = isStaff ? [] : profMeetNav;
  const helpNav = isStaff ? [] : profHelpNav;
  const settingsNav = isStaff ? staffSettingsNav : profSettingsNav;
  const homePath = isStaff ? "/staff" : "/prof";

  const confirmSignOut = () => {
    setShowSignOutConfirm(false);
    onSignOut();
  };

  const NavButton = ({ item }: { item: NavItem }) => {
    const active = location.pathname === item.path;
    return (
      <button
        onClick={() => navigate(item.path)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-150 text-[13px] font-medium mb-0.5"
        style={{ background: active ? "#f0f7f2" : "transparent", color: active ? BRAND : "#5a6b5e" }}
      >
        <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {active && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M9 18l6-6-6-6" /></svg>}
      </button>
    );
  };

  return (
    <div className="flex h-svh w-full overflow-hidden px-2 py-2 gap-2 lg:h-screen lg:w-screen lg:px-4 lg:pb-4 lg:pt-6 lg:gap-4" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: "#eef1ef" }}>
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:h-full lg:flex-shrink-0 select-none rounded-3xl bg-white" style={{ boxShadow: "0 1px 2px rgba(16,32,20,0.05)" }}>
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#f0f7f2" }}>
            <img src={arisLogo} alt="ARIS" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px] leading-none tracking-tight" style={{ color: "#111c14" }}>ARIS</p>
            <p className="text-[11px] mt-1" style={{ color: "#8fa394" }}>{isStaff ? user.staffStage ?? "Staff" : "Professor"}</p>
          </div>
        </div>

        <nav className="flex-1 px-3 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest font-semibold px-3 pt-2 pb-1.5" style={{ color: "#b6c3ba" }}>Main</p>
          {mainNav.map((item) => <NavButton key={item.path} item={item} />)}
          <p className="text-[10px] uppercase tracking-widest font-semibold px-3 pt-4 pb-1.5" style={{ color: "#b6c3ba" }}>Meet</p>
          {meetNav.map((item) => <NavButton key={item.path} item={item} />)}
          <p className="text-[10px] uppercase tracking-widest font-semibold px-3 pt-4 pb-1.5" style={{ color: "#b6c3ba" }}>Help</p>
          {helpNav.map((item) => <NavButton key={item.path} item={item} />)}
          <p className="text-[10px] uppercase tracking-widest font-semibold px-3 pt-4 pb-1.5" style={{ color: "#b6c3ba" }}>Settings</p>
          {settingsNav.map((item) => <NavButton key={item.path} item={item} />)}
        </nav>

        <div className="p-3">
          <div
            className="flex items-center gap-3 cursor-pointer p-2 rounded-2xl"
            style={{ background: "#f4f6f5" }}
            onClick={() => navigate("/prof/settings/user")}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
              style={{ background: BRAND }}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-[12.5px] font-semibold truncate"
                style={{ color: "#111c14" }}
              >
                {user.name}
              </p>
              <p className="text-[11px] truncate" style={{ color: "#8fa394" }}>
                {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSignOutConfirm(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] font-medium text-[#5a6b5e] transition-colors hover:bg-[#f4f6f5] hover:text-[#c0392b]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <nav aria-label="Mobile navigation" className="lg:hidden flex flex-shrink-0 gap-1 overflow-x-auto pb-2">
          {[...mainNav, ...meetNav, ...helpNav, ...settingsNav].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={location.pathname === item.path ? "page" : undefined}
              className="flex h-9 flex-shrink-0 items-center gap-2 rounded-lg px-3 text-[12px] font-medium"
              style={{ background: location.pathname === item.path ? "#e6f1e9" : "#fff", color: location.pathname === item.path ? BRAND : "#5a6b5e" }}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="lg:hidden mb-2 flex min-w-0 flex-shrink-0 items-center gap-2 border-b border-[#e2e8e4] px-1 pb-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: BRAND }}>{user.name.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: "#3d4a41" }}>{user.name}</span>
          <button onClick={() => setShowSignOutConfirm(true)} className="flex-shrink-0 px-2 py-1 text-[12px] font-semibold" style={{ color: BRAND }}>Sign out</button>
        </div>
        {location.pathname === homePath && !isStaff && (
          <header className="flex flex-col gap-2 flex-shrink-0 pb-2 pl-1 pr-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-semibold" style={{ background: BRAND_DARK }}>{user.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <p className="text-[16px] font-semibold leading-none tracking-tight" style={{ color: "#111c14" }}>{user.name}</p>
                <p className="text-[12.5px] mt-1" style={{ color: "#8fa394" }}>Welcome back to ARIS 👋</p>
              </div>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto min-h-0 pr-1">
          <DataModeNotice />
          <Outlet />
        </main>
      </div>
      <Modal
        isOpen={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        title="Confirm Sign Out"
        icon={
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#fbecec] text-[#c0392b]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </div>
        }
        actions={
          <>
            <GhostButton onClick={() => setShowSignOutConfirm(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={confirmSignOut}>Sign Out</PrimaryButton>
          </>
        }
      >
        Are you sure you want to sign out of ARIS?
      </Modal>
    </div>
  );
}
