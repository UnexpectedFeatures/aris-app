import { useState } from "react"
import { BarChart3, CheckCircle2, Leaf } from "lucide-react"
import { cancel, onUrl, start } from "@fabianlars/tauri-plugin-oauth"
import { openUrl } from "@tauri-apps/plugin-opener"
import { invoke } from "@tauri-apps/api/core"
import arisLogo from "@/assets/brand/image.png"
import { GhostButton, Modal, PrimaryButton } from "@/components/ui"

const BRAND = "#3a7d4e"
const SUPPORT_EMAIL = "admin@ucc.edu.ph"
const supportMailto = (subject: string, body: string) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

const oauthCallbackPage = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ARIS sign-in complete</title>
    <style>
      :root { color-scheme: light; font-family: Inter, Segoe UI, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f0f4f8; color: #111c14; }
      main { width: min( calc(100% - 40px), 420px ); box-sizing: border-box; padding: 36px 32px; text-align: center; background: white; border-radius: 20px; box-shadow: 0 16px 40px rgba(16, 32, 20, .12); }
      .mark { width: 56px; height: 56px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 16px; background: #eaf4ee; color: #3a7d4e; font-size: 28px; font-weight: 800; }
      h1 { margin: 0; color: #064b3b; font-size: 22px; }
      p { margin: 10px 0 0; color: #68798a; font-size: 14px; line-height: 1.5; }
      .hint { margin-top: 22px; color: #8fa394; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">&#10003;</div>
      <h1>Sign-in complete</h1>
      <p>You are signed in to ARIS. You can return to the desktop app now.</p>
      <p class="hint">This tab will close automatically.</p>
    </main>
    <script>
      window.setTimeout(function () {
        window.close();
        document.querySelector(".hint").textContent = "You can close this tab and return to ARIS.";
      }, 900);
    </script>
  </body>
</html>
`

export default function Login({
  onGoogleSignIn,
}: {
  onGoogleSignIn: (idToken: string) => Promise<void>;
  audience?: string;
}) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)

  const contactSupport = () => {
    const body = `Hello IT Administration,\n\nI need help with my ARIS Professor account.`
    window.location.href = supportMailto("ARIS support request", body)
    setIsContactOpen(false)
  }

  const signInWithGoogle = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError("Google sign-in is not configured.")
      return
    }
    setSubmitting(true)
    setError(null)
    const state = crypto.randomUUID()
    let port: number | undefined
    let unlisten: (() => void) | undefined
    try {
      port = await start({
        ports: [8765, 8766, 8767],
        response: oauthCallbackPage,
      })
      const callback = new Promise<void>((resolve) => {
        void onUrl((redirectUrl) => {
          const callbackUrl = new URL(redirectUrl)
          const params = new URLSearchParams(callbackUrl.hash.slice(1) || callbackUrl.search.slice(1))
          if (params.get("state") !== state) {
            setError("Google sign-in returned an invalid state.")
            resolve()
            return
          }
          const idToken = params.get("id_token")
          if (!idToken) {
            setError("Google sign-in did not return an identity token.")
            resolve()
            return
          }
          const accessToken = params.get("access_token")
          if (accessToken) {
            sessionStorage.setItem("aris-google-access-token", accessToken)
            localStorage.setItem("aris-google-access-token", accessToken)
          }
          void onGoogleSignIn(idToken)
            .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to sign in with Google."))
            .finally(resolve)
        }).then((removeListener) => {
          unlisten = removeListener
        })
      })
      const redirectUri = `http://127.0.0.1:${port}`
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "token id_token",
        scope: "openid email profile https://www.googleapis.com/auth/meetings.space.created",
        nonce: crypto.randomUUID(),
        state,
        prompt: "select_account",
        include_granted_scopes: "true",
      }).toString()
      try {
        await invoke("open_oauth_window", { url: authUrl.toString() });
      } catch {
        await openUrl(authUrl.toString());
      }
      await callback
    } catch (reason) {
      setError(reason instanceof Error ? `Unable to start Google sign-in: ${reason.message}` : `Unable to start Google sign-in: ${String(reason)}`)
      setSubmitting(false)
    } finally {
      if (unlisten) unlisten()
      if (port) await cancel(port).catch(() => undefined)
      try {
        await invoke("close_oauth_window");
      } catch {
        // ignore
      }
    }
  }

  return (
    <div
      className="flex min-h-svh w-full items-center justify-center overflow-y-auto p-4 lg:h-screen lg:p-0"
      style={{
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        background: "#f0f4f8",
      }}
    >
      <div className="flex min-h-[498px] w-full max-w-[768px] overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_rgba(16,32,20,0.12)]">
        {/* Brand panel */}
        <div
          className="relative hidden w-[46%] flex-shrink-0 flex-col overflow-hidden p-7 lg:flex"
          style={{
            backgroundColor: "#064b3b",
            backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        >
          <div className="items-center gap-3 relative ">
            <div
              className="flex items-center gap-3"
            >
              <img src={arisLogo} alt="ARIS" className="w-12 h-12 object-contain" />
              <p className="text-white font-black text-[24px] leading-none tracking-[0.4em]">
                A.R.I.S
              </p>
            </div>
            
            <p className="text-base leading-none font-medium mt-2 leading-snug" style={{ color: "#e0f1e8" }}>
              Accomplishment Report<br />Information System
            </p>
          </div>

          <div className="relative mt-4">
            <div className="h-[0.5px] w-10" style={{ background: "#25bd91" }} />
            <div className="mt-3 space-y-1.5 text-[12px]" style={{ color: "#d1e8dd" }}>
              <p>Streamlined reporting.</p>
              <p>Transparent approvals.</p>
              <p>Stronger performance.</p>
            </div>
          </div>

          <div className="relative mt-auto flex h-32 items-end gap-2.5 pl-2">
            <div className="mb-1 flex items-end gap-1 text-[#04d49a]">
              <Leaf className="h-7 w-7 -rotate-12 fill-current" />
              <Leaf className="h-6 w-6 rotate-12 fill-current" />
            </div>
            <div className="relative flex h-[108px] w-[82px] flex-shrink-0 flex-col rounded-t-md border-[3px] border-[#12a87b] bg-white p-2 shadow-md">
              <span className="absolute -top-2 left-1/2 h-3 w-6 -translate-x-1/2 rounded-b bg-[#079d70]" />
              {[0, 1, 2].map((item) => (
                <div key={item} className="mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-[#19b889]" />
                  <span className="h-1 w-full rounded-full bg-slate-200" />
                </div>
              ))}
              <BarChart3 className="mt-auto h-7 w-full text-[#13b885]" />
            </div>
            <div className="mb-1 flex h-8 w-12 items-center justify-end rounded-sm border-2 border-[#86d7bb] bg-[#d3f3e6] pr-1.5">
              <span className="h-2 w-2 rounded-full bg-[#86d7bb]" />
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-1 items-center justify-center bg-white p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-sm">
            <div className="lg:hidden flex items-center gap-3 mb-10">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "#f0f7f2" }}
              >
                <img
                  src={arisLogo}
                  alt="ARIS"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <p
                className="font-semibold text-[15px] tracking-tight"
                style={{ color: "#111c14" }}
              >
                ARIS
              </p>
            </div>

            <h2
              className="text-[26px] leading-none font-bold tracking-tight"
              style={{ color: "#00815d" }}
            >
              Welcome back
            </h2>
            <p className="text-[14px] mt-2" style={{ color: "#8fa394" }}>
              Sign in to your Professor account.
            </p>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border bg-white text-[13px] font-semibold transition-colors hover:bg-[#f7f9f8] disabled:opacity-60 cursor-pointer"
                style={{ borderColor: "#dce3df", color: "#26352b" }}
              >
                <span aria-hidden="true" className="text-[17px] font-bold" style={{ color: BRAND }}>G</span>
                {submitting ? "Signing in..." : "Continue with Google"}
              </button>
              <p className="mt-3 text-center text-[12px]" style={{ color: "#68798a" }}>
                Use your registered institutional Google account to continue.
              </p>
              {submitting && <p className="mt-2 text-center text-[12px]" style={{ color: "#68798a" }}>Signing in...</p>}
              {error && <p role="alert" className="mt-3 text-center text-[12px] text-red-700">{error}</p>}
            </div>

            <p
              className="text-[12.5px] text-center mt-8"
              style={{ color: "#8fa394" }}
            >
              Need access?{" "}
              <button
                type="button"
                onClick={() => setIsContactOpen(true)}
                className="font-medium transition-opacity hover:opacity-70 cursor-pointer"
                style={{ color: BRAND }}
              >
                Contact IT administration
              </button>
            </p>
          </div>
        </div>
        <Modal
          isOpen={isContactOpen}
          onClose={() => setIsContactOpen(false)}
          title="Contact IT administration"
          align="left"
          icon={
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-[#2f7043]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>
          }
          actions={
            <>
              <GhostButton onClick={() => setIsContactOpen(false)}>Close</GhostButton>
              <PrimaryButton onClick={contactSupport}>Email IT</PrimaryButton>
            </>
          }
        >
          <div className="space-y-3">
            <p>
              For account access or technical support, contact IT administration.
            </p>
            <a
              href={supportMailto("ARIS support request", "Hello IT Administration,\n\nI need help with my ARIS professor account.")}
              className="font-semibold underline underline-offset-2"
              style={{ color: BRAND }}
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
        </Modal>
      </div>
    </div>
  )
}
