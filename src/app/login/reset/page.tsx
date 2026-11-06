"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { MIN_PASSWORD, newPasswordErrors, readHash, hashTokensAllowed, updatePasswordMessage } from "@/lib/auth";
import { AuthShell, Field, SubmitButton, Notice, authLink } from "@/components/auth-card";

// Set a new password. Two ways in, both leave a session before this page saves anything:
// - Forgot password: the email link goes through /auth/callback, which exchanges the code and sends people here.
// - An invite from Settings (?mode=invite): Supabase redirects here with the tokens after "#", read below.
export default function Reset() {
  const [state, setState] = useState<"checking" | "ready" | "expired">("checking");
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setInvite(new URLSearchParams(window.location.search).get("mode") === "invite");
    (async () => {
      const sb = supabase();
      const { hash, search } = window.location;
      const h = readHash(hash);
      if (h.access_token || h.refresh_token || h.error) window.history.replaceState(null, "", window.location.pathname + search);
      if (h.error) { setState("expired"); return; }
      if (h.access_token || h.refresh_token) {
        if (!hashTokensAllowed(search, hash)) { setState("expired"); return; }
        if (!h.access_token || !h.refresh_token) { setState("expired"); return; }
        const { error } = await sb.auth.setSession({ access_token: h.access_token, refresh_token: h.refresh_token });
        if (error) { setState("expired"); return; }
      }
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setState("expired"); return; }
      setEmail(user.email ?? "");
      setState("ready");
    })();
  }, []);

  const errs = newPasswordErrors(password, confirm);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (errs.password || errs.confirm) { document.getElementById(errs.password ? "password" : "confirm")?.focus(); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase().auth.updateUser({ password });
    if (error) { setBusy(false); setNotice(updatePasswordMessage(error)!); return; }
    // Signed in already; the home page claims any pending invites and lists the profiles.
    window.location.assign("/");
  }

  if (state === "checking") {
    return (
      <AuthShell title={invite ? "Set your password" : "Choose a new password"}>
        <p role="status" className="flex items-center gap-2 text-body text-muted"><Loader2 size={15} className="animate-spin" aria-hidden="true" />Checking your link</p>
      </AuthShell>
    );
  }

  if (state === "expired") {
    return (
      <AuthShell title="This link has expired" sub="Links work once, in the browser that asked for them. Request a new one and open it here."
        foot={<Link href="/login" className={authLink}>Back to sign in</Link>}>
        <Link href="/login/forgot" className="btn btn-primary h-10 w-full text-body">Email me a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={invite ? "Set your password" : "Choose a new password"}
      sub={<>{invite ? "Welcome to Prax. Choose a password" : "Choose a new password"}{email ? <> for <span className="font-medium text-ink">{email}</span></> : null}.</>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        {notice && <Notice tone="bad">{notice}</Notice>}
        <Field id="password" label="New password" type="password" autoComplete="new-password" autoFocus hint={`At least ${MIN_PASSWORD} characters`}
          value={password} onChange={setPassword} error={tried ? errs.password : null} />
        <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password"
          value={confirm} onChange={setConfirm} error={tried ? errs.confirm : null} />
        <div className="mt-1"><SubmitButton busy={busy} busyText="Saving">{invite ? "Set password and continue" : "Save and sign in"}</SubmitButton></div>
      </form>
    </AuthShell>
  );
}
