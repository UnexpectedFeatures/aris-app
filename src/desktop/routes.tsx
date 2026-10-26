import { createHashRouter, Navigate } from "react-router";
import { useAuth } from "@/app/authContext";
import ProfRoot from "@/layouts/ProfessorLayout";
import ProfOverview from "@/pages/Professor/Overview";
import ProfAnnouncements from "@/pages/Professor/Announcements";
import ProfSubmit from "@/pages/Professor/Submit";
import ProfHistory from "@/pages/Professor/History";
import ProfMeet from "@/pages/Professor/Meet";
import ProfSummaries from "@/pages/Professor/Summaries";
import ProfSupport from "@/pages/Professor/Support";
import ProfChat from "@/pages/Professor/Chat";
import UserSettings from "@/pages/Admin/UserSettings";
import SystemSettings from "@/pages/Admin/SystemSettings";
import StaffOverview from "@/pages/Staff/Overview";
import StaffApprovals from "@/pages/Staff/Approvals";
import StaffAnnouncements from "@/pages/Professor/Announcements";
import StaffSupport from "@/pages/Professor/Support";
import StaffChat from "@/pages/Professor/Chat";

function StaffRootWithAuth() {
  const { signOut, user } = useAuth();
  if (user.role !== "staff") {
    const redirect = user.role === "administrator" ? "/admin" : "/prof";
    return <Navigate to={redirect} replace />;
  }
  return <ProfRoot onSignOut={signOut} user={user} />;
}

function AdministratorRootWithAuth() {
  const { signOut, user } = useAuth();
  if (user.role !== "administrator") return <Navigate to="/" replace />;
  return <ProfRoot onSignOut={signOut} user={user} />;
}

function DesktopHome() {
  const { user } = useAuth();
  const home = user.role === "administrator" ? "/admin" : user.role === "staff" ? "/staff" : "/prof";
  return <Navigate to={home} replace />;
}

function ProfessorRootWithAuth() {
  const { signOut, user } = useAuth();
  if (user.role !== "professor") {
    const redirect = user.role === "administrator" ? "/admin" : "/staff";
    return <Navigate to={redirect} replace />;
  }
  return <ProfRoot onSignOut={signOut} user={user} />;
}

export const desktopRouter = createHashRouter([
  {
    path: "/admin",
    Component: AdministratorRootWithAuth,
    children: [
      { index: true, element: <Navigate to="/admin/settings/system" replace /> },
      { path: "settings/system", Component: SystemSettings },
      { path: "settings/user", Component: UserSettings },
      { path: "*", element: <Navigate to="/admin/settings/system" replace /> },
    ],
  },
  {
    path: "/staff",
    Component: StaffRootWithAuth,
    children: [
      { index: true, Component: StaffOverview },
      { path: "approvals", Component: StaffApprovals },
      { path: "announcements", Component: StaffAnnouncements },
      { path: "notifications", Component: StaffAnnouncements },
      { path: "support", Component: StaffSupport },
      { path: "chat", Component: StaffChat },
      { path: "settings", Component: UserSettings },
      { path: "*", Component: StaffOverview },
    ],
  },
  {
    path: "/prof",
    Component: ProfessorRootWithAuth,
    children: [
      { index: true, Component: ProfOverview },
      { path: "announcements", Component: ProfAnnouncements },
      { path: "notifications", Component: ProfAnnouncements },
      { path: "submit", Component: ProfSubmit },
      { path: "history", Component: ProfHistory },
      { path: "meet", Component: ProfMeet },
      { path: "summaries", Component: ProfSummaries },
      { path: "support", Component: ProfSupport },
      { path: "chat", Component: ProfChat },
      { path: "settings/system", element: <Navigate to="/prof/settings/preferences" replace /> },
      { path: "settings/preferences", Component: UserSettings },
      { path: "settings/user", element: <Navigate to="/prof/settings/preferences" replace /> },
      { path: "*", Component: ProfOverview },
    ],
  },
  { path: "/", Component: DesktopHome },
  { path: "*", Component: DesktopHome },
]);