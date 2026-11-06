"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { emailError, requiredError, safeNext, signInMessage } from "@/lib/auth";
import { AuthShell, Field, SubmitButton, Notice, authLink } from "@/components/auth-card";

// Email and password sign-in (Q113 to Q116). Access is by invitation; the magic link stays as a quiet fallback.
export default function Login() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "bad" | "ok"; text: string } | null>(null);
  const [sentTo, setSentTo] = useState("");

  // /auth/callback sends people back here with ?error=link when a link is used up, expired or opened in another browser.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link")
      setNotice({ tone: "bad", text: "That link has expired or was opened in a different browser. Sign in, or request a new link." });
  }, []);

  const errs = { email: emailError(email), password: mode === "password" ? requiredError(password) : null };
  const show = (k: "email" | "password") => (touched[k] ? errs[k] : null);
  const next = () => safeNext(new URLSearchParams(window.location.search).get("next"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errs.email || errs.password) {
      document.getElementById(errs.email ? "email" : "password")?.focus();
      return;
    }
    setBusy(true); setNotice(null);
    if (mode === "password") {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setBusy(false); setNotice({ tone: "bad", text: signInMessage(error)! }); return; }
      await supabase().rpc("claim_invites");
      window.location.assign(next());
      return;
    }
    // shouldCreateUser false: a link never creates an account. The reply is the same whether or not the email has access.
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next())}` },
    });
    setBusy(false);
    if (error?.status === 429) setNotice({ tone: "bad", text: "Too many links requested. Wait a minute, then try again." });
    else setSentTo(email.trim());
  }

  function switchMode(m: "password" | "link") {
    setMode(m); setNotice(null); setTouched({ email: touched.email, password: false });
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" sub={<>If <span className="font-medium text-ink">{sentTo}</span> has access to Prax, a sign-in link is on its way. Open it on this device.</>}
        foot={<button type="button" className={authLink} onClick={() => { setSentTo(""); setMode("password"); }}>Back to sign in</button>}>
        <Notice tone="ok">The link works once. Nothing arrived? Check spam, or ask a Prax owner for an invite.</Notice>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" sub={mode === "password" ? "Use the email your invitation was sent to." : "We will email you a link that signs you in."}
      foot={<>Access is by invitation. Ask a Prax owner to invite you.</>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="name@company.com" autoFocus
          value={email} onChange={setEmail} onBlur={() => email && setTouched((t) => ({ ...t, email: true }))} error={show("email")} />
        {mode === "password" && (
          <Field id="password" label="Password" type="password" autoComplete="current-password"
            value={password} onChange={setPassword} error={show("password")}
            aside={<Link href="/login/forgot" className={`${authLink} text-[12.5px]`}>Forgot password?</Link>} />
        )}
        <div className="mt-1"><SubmitButton busy={busy} busyText={mode === "password" ? "Signing in" : "Sending link"}>{mode === "password" ? "Sign in" : "Email me a link"}</SubmitButton></div>
        <p className="text-center text-[13px] text-muted">
          {mode === "password"
            ? <button type="button" className={`${authLink} font-normal text-muted`} onClick={() => switchMode("link")}>Email me a sign-in link instead</button>
            : <button type="button" className={`${authLink} font-normal text-muted`} onClick={() => switchMode("password")}>Use my password instead</button>}
        </p>
      </form>
    </AuthShell>
  );
}
