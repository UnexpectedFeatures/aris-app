import { useState, useEffect } from "react";
import { RouterProvider } from "react-router";
import Login from "@/components/Login";
import { AuthContext } from "@/app/authContext";
import { desktopRouter } from "@/desktop/routes";
import type { UserAccount } from "@/data/demoAccounts";
import { signInWithGoogle } from "@/services/authService";
import { apiClient } from "@/services/apiClient";
import { invoke } from "@tauri-apps/api/core";

type MainOTAFile = {
  name: string;
  content: string;
};

type OTAStatus = "idle" | "checking" | "installed" | "failed";

function getOTAErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      error?: unknown;
      response?: { data?: { message?: unknown; error?: unknown } };
    };
    const responseData = value.response?.data;
    const message = responseData?.message ?? responseData?.error ?? value.message ?? value.error;
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown provisioning error";
    }
  }
  return "Unknown provisioning error";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function installFirstLaunchOTA(
  setStatus: (status: OTAStatus) => void,
) {
  if (localStorage.getItem("aris-ota-provisioned") === "true") {
    setStatus("installed");
    return;
  }

  setStatus("checking");
  localStorage.setItem("aris-ota-status", "checking");
  try {
    const response = await apiClient.get<MainOTAFile>("/system/ota/main", { timeout: 30_000 });
    const payload = (response.data as MainOTAFile & { data?: MainOTAFile }).data ?? response.data;
    if (!payload?.content) {
      throw new Error("The main OTA response did not contain a script.");
    }
    await withTimeout(
      invoke("run_ota_script", { scriptBase64: payload.content }),
      5 * 60_000,
      "OTA installer",
    );
    localStorage.setItem("aris-ota-provisioned", "true");
    localStorage.setItem("aris-ota-status", "installed");
    localStorage.removeItem("aris-ota-error");
    setStatus("installed");
  } catch (error) {
    console.error("[ARIS OTA] First-launch provisioning failed:", error);
    const message = getOTAErrorMessage(error);
    localStorage.setItem("aris-ota-status", "failed");
    localStorage.setItem("aris-ota-error", message);
    setStatus("failed");
  }
}

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
  const [otaStatus, setOtaStatus] = useState<OTAStatus>(
    () => localStorage.getItem("aris-ota-provisioned") === "true" ? "installed" : "idle",
  );

  useEffect(() => {
    const onUserUpdated = () => {
      setUser(getStoredUser());
    };
    window.addEventListener("aris-user-updated", onUserUpdated);
    return () => window.removeEventListener("aris-user-updated", onUserUpdated);
  }, []);

  useEffect(() => {
    if (user) void installFirstLaunchOTA(setOtaStatus);
  }, [user]);

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
      {otaStatus === "checking" && (
        <div className="fixed bottom-4 right-4 z-[100] rounded-xl bg-[#18251c] px-4 py-3 text-[12px] text-white shadow-lg">
          Installing ARIS updates...
        </div>
      )}
      {otaStatus === "failed" && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl bg-[#c0392b] px-4 py-3 text-[12px] text-white shadow-lg">
          ARIS update installation failed. Check DevTools and retry after fixing the OTA file.
        </div>
      )}
      <RouterProvider router={desktopRouter} />
    </AuthContext.Provider>
  );
}
