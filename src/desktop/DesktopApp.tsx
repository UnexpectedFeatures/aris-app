import { useState, useEffect } from "react";
import { RouterProvider } from "react-router";
import Login from "@/components/Login";
import { AuthContext } from "@/app/authContext";
import { desktopRouter } from "@/desktop/routes";
import type { UserAccount } from "@/data/demoAccounts";
import { signInWithGoogle } from "@/services/authService";

function getStoredUser(): UserAccount | null {
  try {
    const user = JSON.parse(sessionStorage.getItem("aris-desktop-user") ?? "null") as UserAccount | null;
    return user?.id && user?.email && user?.name && (user.role === "administrator" || user.role === "professor" || user.role === "staff") ? user : null;
  } catch {
    sessionStorage.removeItem("aris-desktop-user");
    return null;
  }
}

export default function DesktopApp() {
  const [user, setUser] = useState<UserAccount | null>(getStoredUser);

  useEffect(() => {
    const onUserUpdated = () => {
      setUser(getStoredUser());
    };
    window.addEventListener("aris-user-updated", onUserUpdated);
    return () => window.removeEventListener("aris-user-updated", onUserUpdated);
  }, []);

  const signIn = async (idToken: string) => {
    const session = await signInWithGoogle(idToken);
    sessionStorage.setItem("aris-desktop-user", JSON.stringify(session.user));
    if (session.token) sessionStorage.setItem("aris-desktop-token", session.token);
    sessionStorage.setItem("aris-google-id-token", idToken);
    sessionStorage.setItem("aris-google-email", session.user.email);
    localStorage.setItem("aris-last-oauth-email", session.user.email);
    await desktopRouter.navigate("/prof");
    setUser(session.user);
  };

  const signOut = () => {
    sessionStorage.removeItem("aris-desktop-user");
    sessionStorage.removeItem("aris-desktop-token");
    sessionStorage.removeItem("aris-google-id-token");
    sessionStorage.removeItem("aris-google-email");
    sessionStorage.removeItem("aris-google-access-token");
    localStorage.removeItem("aris-google-access-token");
    localStorage.removeItem("aris-last-oauth-email");
    setUser(null);
  };

  if (!user) return <Login audience="desktop" onGoogleSignIn={signIn} />;

  return (
    <AuthContext.Provider value={{ signOut, user }}>
      <RouterProvider router={desktopRouter} />
    </AuthContext.Provider>
  );
}
