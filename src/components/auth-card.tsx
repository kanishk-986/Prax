"use client";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";

// The sign-in, forgot and reset pages share this: logo and wordmark, one centred card, a quiet note below.
// The card carries the Corners mark at its own corners: ink top left, red bottom right.
export function AuthShell({ title, sub, children, foot }: { title: string; sub?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center px-4 pb-12 pt-[min(14vh,120px)]">
      <div className="flex items-center gap-2.5"><Logo size={28} /><span className="text-[18px] font-semibold tracking-tight">Prax</span></div>
      <section className="auth-card card anim-rise mt-10 w-full max-w-[400px] p-6 sm:p-8" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-[13.5px] text-muted">{sub}</p>}
        <div className="mt-6">{children}</div>
      </section>
      {foot && <div className="mt-6 w-full max-w-[400px] text-center text-[13px] text-muted">{foot}</div>}
    </main>
  );
}

type FieldProps = {
  id: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  error?: string | null; type?: string; autoComplete?: string; placeholder?: string; autoFocus?: boolean; aside?: React.ReactNode; hint?: string;
};

// A required field: visible asterisk, aria-required, and its error (or hint) tied to the input.
export function Field({ id, label, value, onChange, onBlur, error, type = "text", autoComplete, placeholder, autoFocus, aside, hint }: FieldProps) {
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">{label}<span aria-hidden="true" className="ml-0.5 text-dark-red">*</span></label>
      <div className="relative">
        <input id={id} name={id} type={isPassword && shown ? "text" : type} value={value} autoComplete={autoComplete} placeholder={placeholder} autoFocus={autoFocus}
          aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
          className={`field auth-field h-10 text-[14px] ${isPassword ? "pr-11" : ""} ${error ? "border-bad" : ""}`} />
        {isPassword && (
          <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} aria-controls={id}
            className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink">
            {shown ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
          </button>
        )}
      </div>
      {error ? <p id={`${id}-error`} className="text-[12.5px] text-bad">{error}</p>
        : hint && <p id={`${id}-hint`} className="text-[12.5px] text-muted">{hint}</p>}
      {/* Sits in the label row but comes after the input in the DOM, so Tab goes from the field to it, not the other way round. */}
      {aside && <div className="absolute right-0 top-0 leading-[19.5px]">{aside}</div>}
    </div>
  );
}

export function SubmitButton({ busy, children, busyText }: { busy: boolean; children: React.ReactNode; busyText: string }) {
  return (
    // While busy the button stays readable: dark red at full opacity instead of the faded disabled look.
    <button type="submit" className={`btn btn-primary h-10 w-full text-[14px] ${busy ? "border-dark-red bg-dark-red disabled:opacity-100" : ""}`} disabled={busy} aria-busy={busy || undefined}>
      {busy ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />{busyText}</> : children}
    </button>
  );
}

// Form level message: a wrong password, a sent link. Announced to screen readers.
export function Notice({ tone, children }: { tone: "bad" | "ok"; children: React.ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2.5 text-[13px] ${tone === "bad" ? "bg-bad-soft text-bad" : "bg-surface-2 text-ink-2"}`}>
      {children}
    </div>
  );
}

export const authLink = "rounded-sm font-medium text-ink underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-ink";
