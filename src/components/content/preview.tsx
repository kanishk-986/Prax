"use client";
import { useState } from "react";
import { foldCut, FOLD, hookFits } from "@/lib/content";

/** The post as it reads in the LinkedIn feed, with the real "see more" cut for mobile or desktop. */
export function LinkedInPreview({ text, image, video, company, device, setDevice, footer }: {
  text: string; image?: string | null; video?: React.ReactNode; company?: boolean; device: "mobile" | "desktop"; setDevice: (d: "mobile" | "desktop") => void; footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const f = foldCut(text || "", device);
  const firstLine = (text || "").split("\n")[0];
  const fits = hookFits(firstLine, device);
  return (
    <div className="flex flex-col gap-3" data-tour="preview">
      <div className="flex items-center justify-between">
        <span className="label">Live preview</span>
        <div className="flex rounded-lg border border-line bg-white p-0.5">
          {(["mobile", "desktop"] as const).map((d) => <button key={d} className={`h-7 rounded-md px-3 text-[12px] font-semibold ${device === d ? "bg-[#d64545] text-white" : "text-muted"}`} onClick={() => { setDevice(d); setOpen(false); }}>{d === "mobile" ? "Mobile" : "Desktop"}</button>)}
        </div>
      </div>
      <div className="mx-auto w-full overflow-hidden rounded-[14px] border border-[#e3e3e3] bg-white shadow-[0_8px_24px_rgba(20,20,20,.06)]" style={{ maxWidth: device === "mobile" ? 360 : "100%", fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
        <div className="flex gap-2.5 px-4 pb-2 pt-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#141414] text-[14px] font-semibold text-white">{company ? "A" : "SP"}</span>
          <span className="flex min-w-0 flex-col"><span className="text-[14px] font-semibold">{company ? "Antier" : "Shashi Pal"}</span><span className="truncate text-[12px] text-[#5f5f5f]">{company ? "Company page" : "Co-Founder and COO, Antier"}</span></span>
        </div>
        <div className="whitespace-pre-wrap px-4 pb-3.5 text-[14px] leading-normal">
          {text ? (open || !f.folded ? text : f.shown) : <span className="text-faint">The post appears here as you write.</span>}
          {text && f.folded && !open && <button className="ml-1 font-semibold text-[#5f5f5f]" onClick={() => setOpen(true)}>…see more</button>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not a static asset */}
        {image && <img src={image} alt="Post visual" className="block w-full border-t border-[#ececec]" />}
        {video}
        <div className="flex justify-around border-t border-[#ececec] px-1.5 py-2 text-[12.5px] font-semibold text-[#5f5f5f]"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
      </div>
      <p className="m-0 text-center text-[12.5px] text-muted">
        <span className="font-semibold" style={{ color: fits ? "#141414" : "#d64545" }}>Opening line {Array.from(firstLine).length}/{FOLD[device]}, {fits ? "fits the fold" : "cut by the fold"}</span>
        {footer}
      </p>
    </div>
  );
}
