import { useState } from "react";
import { RouterProvider } from "react-router";
import Login from "@/components/Login";
import { AuthContext } from "@/app/authContext";
import { desktopRouter } from "@/desktop/routes";
import type { UserAccount } from "@/data/demoAccounts";
import { signIn as authenticate } from "@/services/authService";
import { isDemoMode } from "@/services/dataSource";

function getStoredUser(): UserAccount | null {
  try {
    const user = JSON.parse(sessionStorage.getItem("aris-desktop-user") ?? "null") as UserAccount | null;
    return user?.id && user?.email && (user.role === "administrator" || user.role === "professor" || user.role === "staff") ? user : null;
  } catch {
    sessionStorage.removeItem("aris-desktop-user");
    return null;
  }
}

export default function DesktopApp() {
  const [user, setUser] = useState<UserAccount | null>(getStoredUser);

  const signIn = async (email: string, password: string, expectedRole: UserAccount["role"]) => {
    const session = await authenticate(email, password);
    const isDemoProfessor = isDemoMode && session.user.role === "professor";
    if (session.user.role !== "administrator" && session.user.role !== "staff" && !isDemoProfessor) {
      throw new Error("Use the account sign-in method assigned to your role.");
    }
    if (session.user.role !== expectedRole) {
      throw new Error(`Sign in using the ${session.user.role} account type.`);
    }
    sessionStorage.setItem("aris-desktop-user", JSON.stringify(session.user));
    if (session.token) sessionStorage.setItem("aris-desktop-token", session.token);
    const homePath = session.user.role === "administrator" ? "/admin" : session.user.role === "professor" ? "/prof" : "/staff";
    await desktopRouter.navigate(homePath);
    setUser(session.user);
  };

  const signOut = () => {
    sessionStorage.removeItem("aris-desktop-user");
    sessionStorage.removeItem("aris-desktop-token");
    setUser(null);
  };

  if (!user) return <Login audience="desktop" onSignIn={signIn} />;

  return (
    <AuthContext.Provider value={{ signOut, user }}>
      <RouterProvider router={desktopRouter} />
    </AuthContext.Provider>
  );
}