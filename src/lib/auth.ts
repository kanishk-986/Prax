// Sign-in, reset and invite helpers. Pure functions so scripts/test-auth.ts can run them in Node.

export const MIN_PASSWORD = 8;
export const ROLES = ["owner", "editor", "commenter", "viewer"] as const;

// Deliberately loose: one @, something on both sides, a dot in the domain, no spaces.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s) return "Required";
  if (!EMAIL.test(s)) return "Enter an email address like name@company.com";
  return null;
}

export function requiredError(v: string): string | null {
  return v ? null : "Required";
}

export function newPasswordErrors(password: string, confirm: string): { password: string | null; confirm: string | null } {
  return {
    password: !password ? "Required" : password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters` : null,
    confirm: !confirm ? "Required" : password && confirm !== password ? "The passwords do not match" : null,
  };
}

// What a failed password sign-in says. Never hints at which of the two was wrong.
export function signInMessage(err: { status?: number; code?: string } | null): string | null {
  if (!err) return null;
  if (err.status === 429 || err.code === "over_request_rate_limit") return "Too many attempts. Wait a minute, then try again.";
  if (err.code === "invalid_credentials" || err.status === 400) return "That email and password do not match. Try again, or reset your password.";
  return "We could not sign you in just now. Try again in a moment.";
}

// What a failed password update says (reset and invite pages).
export function updatePasswordMessage(err: { status?: number; code?: string; message?: string } | null): string | null {
  if (!err) return null;
  if (err.code === "same_password") return "Choose a password you have not used here before.";
  if (err.code === "weak_password") return `Use at least ${MIN_PASSWORD} characters.`;
  if (err.status === 429) return "Too many attempts. Wait a minute, then try again.";
  return "We could not save your password. Request a new link and try again.";
}

// Only same-site paths: "/w/x" is fine, "//evil.com" and "https://evil.com" fall back to "/".
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

// Tokens Supabase puts after "#" when it redirects from an invite email: access_token, refresh_token, or an error.
export function readHash(hash: string): { access_token?: string; refresh_token?: string; error?: string } {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    access_token: p.get("access_token") ?? undefined,
    refresh_token: p.get("refresh_token") ?? undefined,
    error: p.get("error_code") ?? p.get("error") ?? undefined,
  };
}
