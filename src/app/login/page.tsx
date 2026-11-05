"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setErr(error.message); setState("error"); } else setState("sent");
  }

  return (
    <main className="min-h-full grid place-items-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2"><Logo /><span className="text-[15px] font-semibold tracking-tight">Prax</span></div>
        <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-muted">We will email you a secure sign-in link. No password needed.</p>
        {state === "sent" ? (
          <div className="card mt-6 p-4">
            <p className="font-medium">Check {email}</p>
            <p className="mt-1 text-muted">Open the link in that email on this device to finish signing in.</p>
          </div>
        ) : (
          <form onSubmit={send} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="label">Work email</span>
              <input id="email" className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </label>
            <button className="btn btn-primary justify-center" disabled={state === "sending"}>{state === "sending" ? "Sending link" : "Email me a sign-in link"}</button>
            {state === "error" && <p className="text-bad text-[13px]">{err}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
