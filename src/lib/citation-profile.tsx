"use client";
// The tracked profile a user is looking at in AI citations (db/017). The Dashboard tile, Content Studio's gap
// topics and the campaign report read the same choice, so every view shows one profile's numbers.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/client";
import { useLive } from "./live";
import { useWorkspace } from "./workspace";
import { currentProfile, profileScope, type Profile } from "./citations";

export function useCitationProfile() {
  const { ws, userId } = useWorkspace();
  const all = useLive<Profile>("citation_profiles", ws.id, { order: "sort" });
  const [pick, setPick] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase().from("citation_profile_picks").select("profile_id").eq("workspace_id", ws.id).eq("user_id", userId).maybeSingle()
      .then(({ data }: { data: { profile_id: string } | null }) => setPick(data?.profile_id ?? null));
  }, [ws.id, userId]);
  // Before db/017 is run the table is missing: one profile, nothing scoped.
  const legacy = !all.loading && all.error;
  const current = useMemo(() => currentProfile(all.rows, pick), [all.rows, pick]);
  const ready = legacy || (!all.loading && pick !== undefined);
  const scope = ready ? profileScope(legacy, current) : null;
  const choose = useCallback(async (id: string) => {
    setPick(id);
    const { error } = await supabase().from("citation_profile_picks").upsert({ workspace_id: ws.id, user_id: userId, profile_id: id, updated_at: new Date().toISOString() });
    return error;
  }, [ws.id, userId]);
  return { profiles: all.rows, current, scope, legacy, ready, choose, reload: all.reload };
}

export type CitationProfile = ReturnType<typeof useCitationProfile>;
const C = createContext<CitationProfile | null>(null);
export function CitationProfileProvider({ value, children }: { value: CitationProfile; children: React.ReactNode }) {
  return <C.Provider value={value}>{children}</C.Provider>;
}
/** Inside AI citations: the profile the page shows. `scope` limits queries, `withProfile(row, scope)` tags inserts. */
export function useCitationScope() {
  const v = useContext(C);
  if (!v) throw new Error("useCitationScope outside CitationProfileProvider");
  return v;
}
