"use client";
import { useId } from "react";

// The one on/off control in Prax. A 36 by 20 track with a 16 px knob that always sits inside it (2 px inset on
// both sides); on is ink, off is the strong hairline grey. role="switch" with aria-checked, the red focus ring,
// Space and Enter toggle (it is a button). Use it for a single setting or a view filter that is on or off.
// Picking items from a list stays a checkbox, and choosing between named options stays a segmented control.
export function Switch({ on, onChange, disabled, id, label, labelledBy, describedBy }: {
  on: boolean; onChange: (next: boolean) => void; disabled?: boolean; id?: string;
  /** Accessible name when there is no visible label tied to it. */ label?: string; labelledBy?: string; describedBy?: string;
}) {
  return (
    <button type="button" role="switch" id={id} aria-checked={on} aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d64545] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none ${on ? "bg-[#141414]" : "bg-[#d4d4d4] hover:bg-[#c4c4c4]"}`}>
      <span aria-hidden="true" className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,20,.25)] transition-transform duration-150 ease-out motion-reduce:transition-none ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

/** A labelled switch. Row (default): the label and an optional one-line hint on the left, the switch on the right,
 *  so a stack of rows lines its switches up in one column; `divider` draws a hairline between rows. Inline: the
 *  label then the switch, for toolbars and card headers. Clicking the label toggles too. */
export function SwitchRow({ on, onChange, label, hint, disabled, inline, divider, className = "" }: {
  on: boolean; onChange: (next: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; disabled?: boolean;
  inline?: boolean; divider?: boolean; className?: string;
}) {
  const id = useId(), hintId = `${id}-hint`;
  if (inline) return (
    <span className={`inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <label htmlFor={id} className={`text-body font-medium ${disabled ? "text-muted" : "cursor-pointer text-ink"}`}>{label}</label>
      <Switch id={id} on={on} onChange={onChange} disabled={disabled} />
    </span>
  );
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 ${divider ? "border-b border-line py-3 last:border-b-0" : ""} ${className}`}>
      <span className="min-w-0">
        <label htmlFor={id} className={`block text-body font-medium ${disabled ? "text-muted" : "cursor-pointer text-ink"}`}>{label}</label>
        {hint && <span id={hintId} className="mt-0.5 block text-meta leading-snug text-muted">{hint}</span>}
      </span>
      <Switch id={id} on={on} onChange={onChange} disabled={disabled} describedBy={hint ? hintId : undefined} />
    </div>
  );
}
