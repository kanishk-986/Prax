"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { emailError } from "@/lib/auth";
import { AuthShell, Field, SubmitButton, Notice, authLink } from "@/components/auth-card";

// Forgot password (Q114 also uses this to set a first password). The email link goes through /auth/callback,
// which exchanges the code for a session and lands on /login/reset.
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sentTo, setSentTo] = useState("");
  const err = emailError(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (err) { document.getElementById("email")?.focus(); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/login/reset")}`,
    });
    setBusy(false);
    // Same reply whether or not the email has an account; only a rate limit is worth saying.
    if (error?.status === 429) setNotice("Too many reset emails requested. Wait a minute, then try again.");
    else setSentTo(email.trim());
  }

  const back = <Link href="/login" className={authLink}>Back to sign in</Link>;

  if (sentTo) {
    return (
      <AuthShell title="Check your email" sub={<>If <span className="font-medium text-ink">{sentTo}</span> has a Prax account, a link to set a new password is on its way.</>} foot={back}>
        <Notice tone="ok">Open the link in this browser. It works once.</Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" sub="Enter your email and we will send you a link to set a new password." foot={back}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {notice && <Notice tone="bad">{notice}</Notice>}
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="name@company.com" autoFocus
          value={email} onChange={setEmail} onBlur={() => email && setTouched(true)} error={touched ? err : null} />
        <div className="mt-1"><SubmitButton busy={busy} busyText="Sending link">Email me a reset link</SubmitButton></div>
      </form>
    </AuthShell>
  );
}
