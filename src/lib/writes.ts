// Lists refresh after this browser's own writes. Realtime alone did not bring them back (deletes never arrive on a
// filtered channel, and on the live site inserts did not either), so Add, Save and Delete looked as if nothing happened.

/** The window event the Supabase client fires after a write; its detail is the table name. */
export const WROTE = "prax:wrote";

/** The table a PostgREST write changed, from its request; "" for reads, RPC calls and anything that is not PostgREST. */
export function writtenTable(url: string, method = "GET"): string {
  if (!/^(POST|PATCH|PUT|DELETE)$/i.test(method)) return "";
  const m = url.match(/\/rest\/v1\/([^/?#]+)/);
  return m && m[1] !== "rpc" ? decodeURIComponent(m[1]) : "";
}
