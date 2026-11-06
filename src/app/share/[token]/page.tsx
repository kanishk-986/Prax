"use client";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ReportView, type ReportSnapshot } from "@/components/citations-report";

// A view-only AI citations report for someone without a Prax login. The token is checked in the
// database (citation_share), which returns only the snapshot taken when the link was made.
export default function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [r, setR] = useState<(ReportSnapshot & { expires_at: string; profile: string }) | null | undefined>(undefined);
  useEffect(() => {
    supabase().rpc("citation_share", { tok: token }).then(({ data }: { data: unknown }) => setR((data as ReportSnapshot & { expires_at: string; profile: string }) ?? null));
  }, [token]);
  if (r === undefined) return <div className="grid min-h-screen place-items-center bg-white text-body text-[#5f5f5f]">Loading</div>;
  if (!r) return <div className="grid min-h-screen place-items-center bg-white p-6 text-center"><div><p className="text-title font-semibold text-[#141414]">This link has expired or was turned off.</p><p className="mt-1 text-body text-[#5f5f5f]">Ask the person who sent it for a new one.</p></div></div>;
  return <main className="min-h-screen bg-white"><ReportView r={r} expires={r.expires_at} /></main>;
}
