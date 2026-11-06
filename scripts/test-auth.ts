// Checks the sign-in helpers: email and required checks, new password rules, error copy, safe redirects, invite hash. Run: node scripts/test-auth.ts
import { emailError, requiredError, newPasswordErrors, signInMessage, updatePasswordMessage, safeNext, readHash } from "../src/lib/auth.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

eq("empty email is required", emailError(""), "Required");
eq("spaces only is required", emailError("   "), "Required");
eq("no @ is a format error", emailError("alok.antier.com"), "Enter an email address like name@company.com");
eq("no domain dot is a format error", emailError("alok@antier"), "Enter an email address like name@company.com");
eq("space inside is a format error", emailError("al ok@antier.com"), "Enter an email address like name@company.com");
eq("good email passes", emailError("alok@antiersolutions.com"), null);
eq("surrounding spaces are fine", emailError("  alok@antiersolutions.com "), null);

eq("empty password is required", requiredError(""), "Required");
eq("any password passes the sign-in check", requiredError("x"), null);

eq("both empty", newPasswordErrors("", ""), { password: "Required", confirm: "Required" });
eq("too short", newPasswordErrors("1234567", "1234567"), { password: "Use at least 8 characters", confirm: null });
eq("eight is enough", newPasswordErrors("12345678", "12345678"), { password: null, confirm: null });
eq("mismatch", newPasswordErrors("12345678", "12345679"), { password: null, confirm: "The passwords do not match" });
eq("confirm empty", newPasswordErrors("12345678", ""), { password: null, confirm: "Required" });

const wrong = "That email and password do not match. Try again, or reset your password.";
eq("no error, no message", signInMessage(null), null);
eq("wrong credentials", signInMessage({ status: 400, code: "invalid_credentials" }), wrong);
eq("unknown email reads the same as a wrong password", signInMessage({ status: 400 }), wrong);
eq("rate limited", signInMessage({ status: 429 }), "Too many attempts. Wait a minute, then try again.");
eq("server trouble", signInMessage({ status: 500 }), "We could not sign you in just now. Try again in a moment.");
eq("reused password", updatePasswordMessage({ status: 422, code: "same_password" }), "Choose a password you have not used here before.");
eq("expired session on update", updatePasswordMessage({ status: 401 }), "We could not save your password. Request a new link and try again.");

eq("relative next kept", safeNext("/w/shashi/today"), "/w/shashi/today");
eq("query kept", safeNext("/login/reset?mode=invite"), "/login/reset?mode=invite");
eq("protocol relative refused", safeNext("//evil.com"), "/");
eq("backslash trick refused", safeNext("/\\evil.com"), "/");
eq("absolute url refused", safeNext("https://evil.com"), "/");
eq("missing falls back", safeNext(null), "/");

eq("invite hash read", readHash("#access_token=a&expires_in=3600&refresh_token=r&type=invite"), { access_token: "a", refresh_token: "r" });
eq("expired link hash read", readHash("#error=access_denied&error_code=otp_expired&error_description=x"), { error: "otp_expired" });
eq("empty hash", readHash(""), {});

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
