"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { Check } from "lucide-react";

type Toast = { id: number; text: string; undo?: () => void };
const C = createContext<(text: string, undo?: () => void) => void>(() => {});

/** Bottom-centre confirmations with an optional Undo, like Linear and Gmail. */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, undo }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), undo ? 5000 : 2400);
  }, []);
  return (
    <C.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-[max(20px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-2 md:right-6" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className="anim-rise pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pl-3 pr-2 text-[13px] text-canvas shadow-[var(--shadow-lg)]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-good text-white"><Check size={12} strokeWidth={3} /></span>
            <span>{t.text}</span>
            {t.undo ? (
              <button className="rounded-full px-2.5 py-1 font-semibold text-accent-soft hover:bg-white/10" onClick={() => { t.undo!(); setList((l) => l.filter((x) => x.id !== t.id)); }}>Undo</button>
            ) : <span className="w-1" />}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
export const useToast = () => useContext(C);

/** A short vibration where the device supports it (Android browsers). */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
