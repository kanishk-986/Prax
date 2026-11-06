// Strategy canvas logic (Q108, Q109): node types and what each one changes in Prax, the templates, the automatic
// top-to-bottom layout with if/else lanes, the write-through to the real settings, and the if/else rules engine.
// Pure functions with no imports, so `node scripts/test-strategy.ts` can check them. db/021_strategy_canvas.sql
// holds the tables (strategies, strategy_nodes).
//
// One source of truth: settings nodes (Audience, Pillars, Regions, Daily quota, Content system, Comment rules) are
// views of the settings the app already reads. In the active strategy they show the live settings and saving writes
// to them; a draft strategy keeps its own values in config until it is set active, when they are written through.
// Goal, Condition, Action and Note have no other home, so the active strategy is where Prax reads them.

export type NodeType = "goal" | "audience" | "pillars" | "regions" | "quota" | "content" | "comments" | "condition" | "action" | "note";
export type Branch = "" | "yes" | "no";
export type StrategyStatus = "active" | "draft" | "archived";
export type Strategy = { id: string; workspace_id?: string; name: string; template: string; status: StrategyStatus; sort: number; created_at?: string; updated_at?: string };
export type StrategyNode = {
  id: string; strategy_id: string; workspace_id?: string; type: NodeType; title: string;
  parent_id: string | null; branch: Branch; sort: number; config: Record<string, any>; editor_only: boolean; created_at?: string;
};

// ---------- configs ----------
export const SEG_KEYS = ["A", "B", "C", "D", "E"] as const;
export type SegKey = (typeof SEG_KEYS)[number];
export type Quotas = { comment: number; request: number; dm: number; inmail: number; reply: number };
export type GoalConfig = { text: string; calls_month: number | null; comments_week: number | null; posts_month: number | null };
export type AudienceConfig = { segments: Record<string, { name: string; weight: number }> };
export type ContentPlan = { ppw: number; days: number[]; formats: string[] };
export type CommentRules = { voice: string; length: "short" | "medium" | "long"; tone: "formal" | "balanced" | "warm"; question: "never" | "sometimes" | "always"; dailyCap: number };
export type Fact = "segment" | "region" | "stage" | "heat" | "company" | "warm" | "day" | "overdue";
export type Op = "is" | "not" | "contains" | "atleast";
export type ConditionConfig = { fact: Fact; op: Op; value: string };
export type ActionKind = "comments" | "template" | "next" | "angle" | "priority";
export type ActionConfig = { kind: ActionKind; count?: number; template?: string; text?: string };

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const CONTENT_FORMATS = ["Text post", "Image post", "Carousel", "Video", "Poll", "Article"];
export const HEAT_ORDER = ["Cold", "Warm", "Hot"] as const;

export const FACTS: { key: Fact; label: string; ops: Op[]; lead: boolean }[] = [
  { key: "segment", label: "Segment", ops: ["is", "not"], lead: true },
  { key: "region", label: "Region", ops: ["is", "not", "contains"], lead: true },
  { key: "stage", label: "Stage", ops: ["is", "not"], lead: true },
  { key: "heat", label: "Heat", ops: ["is", "atleast"], lead: true },
  { key: "company", label: "Company", ops: ["is", "contains"], lead: true },
  { key: "warm", label: "Warm path", ops: ["is"], lead: true },
  { key: "day", label: "Day of the week", ops: ["is", "not"], lead: false },
  { key: "overdue", label: "Next action overdue", ops: ["is"], lead: true },
];
export const OP_LABEL: Record<Op, string> = { is: "is", not: "is not", contains: "contains", atleast: "is at least" };
export const ACTIONS: { key: ActionKind; label: string; affects: string[] }[] = [
  { key: "comments", label: "Add comment tasks for these leads", affects: ["Today"] },
  { key: "template", label: "Use a template for the connection note", affects: ["Today", "Pipeline touch plan"] },
  { key: "next", label: "Set the next action", affects: ["Pipeline next step"] },
  { key: "angle", label: "Prefer an angle in Content Studio", affects: ["Content Studio angle"] },
  { key: "priority", label: "Raise Discovery and warm priority", affects: ["Discovery priority", "Today order"] },
];

/** Every node type: its default name, which settings it writes, what it changes, and where it may sit. */
export const NODE_META: Record<NodeType, { label: string; title: string; affects: string[]; settings: boolean; owner: boolean; lane: boolean; single: boolean; describe: string }> = {
  goal: { label: "Goal", title: "Goal for the month", affects: ["Dashboard targets"], settings: false, owner: false, lane: false, single: true, describe: "What this month is for, in a sentence, and the numbers that say it worked. The Dashboard measures the week against them." },
  audience: { label: "Audience", title: "Who we target", affects: ["Pipeline segments", "Discovery buyer fit", "Today order"], settings: true, owner: true, lane: false, single: true, describe: "The five segments and how much each one counts. Names show in Pipeline and Network; weights order Today's suggestions and tell Discovery who the buyers are." },
  pillars: { label: "Pillars", title: "Pillars", affects: ["Content Studio", "Discovery", "AI citations"], settings: true, owner: true, lane: false, single: true, describe: "The themes this profile is known for. Drafts, campaigns, Discovery scoring and AI citations prompts use them." },
  regions: { label: "Regions", title: "Regions", affects: ["Discovery geography", "Content Studio angles"], settings: true, owner: true, lane: false, single: true, describe: "The focus regions. Discovery ranks stories from them highest and the regional angle in Content Studio names them." },
  quota: { label: "Daily quota", title: "Daily quota", affects: ["Today quota", "Dashboard"], settings: true, owner: true, lane: false, single: true, describe: "How many comments, connection requests, messages, InMail and reply rounds Today plans each day." },
  content: { label: "Content system", title: "Content system", affects: ["Content Studio plan", "Campaigns"], settings: true, owner: false, lane: false, single: true, describe: "How often the profile posts, on which days, and in which formats. New campaigns start from it." },
  comments: { label: "Comment rules", title: "Comment rules", affects: ["Comment Studio", "Extension voice"], settings: true, owner: true, lane: false, single: true, describe: "The comment voice and the drafting limits. The extension reads them every time LinkedIn loads." },
  condition: { label: "Condition", title: "Condition", affects: [], settings: false, owner: false, lane: true, single: false, describe: "A test on a lead or on the day. Yes runs the left lane, No runs the right lane, then the flow continues." },
  action: { label: "Action", title: "Action", affects: [], settings: false, owner: false, lane: true, single: false, describe: "Something Prax does when the flow reaches it: a task on Today, a template, a next step, an angle or a priority." },
  note: { label: "Note", title: "Note", affects: [], settings: false, owner: false, lane: true, single: false, describe: "Free text for anything else in the plan. It changes nothing in the app." },
};
export const NODE_TYPES = Object.keys(NODE_META) as NodeType[];

const n0 = (v: unknown, lo = 0, hi = 999) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const list = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter(Boolean))];
const nOrNull = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : n0(v, 0, 9999));

/** A config with every field present and in range, whatever was stored. */
export function cleanConfig(type: NodeType, c: Record<string, any> = {}): Record<string, any> {
  switch (type) {
    case "goal": return { text: String(c.text ?? ""), calls_month: nOrNull(c.calls_month), comments_week: nOrNull(c.comments_week), posts_month: nOrNull(c.posts_month) } satisfies GoalConfig;
    case "audience": return { segments: Object.fromEntries(SEG_KEYS.map((k) => [k, { name: String(c.segments?.[k]?.name ?? "").trim(), weight: n0(c.segments?.[k]?.weight ?? 0, 0, 100) }])) } satisfies AudienceConfig;
    case "pillars": return { pillars: list(c.pillars).slice(0, 8) };
    case "regions": return { regions: list(c.regions).slice(0, 8) };
    case "quota": return { comment: n0(c.comment, 0, 50), request: n0(c.request, 0, 50), dm: n0(c.dm, 0, 50), inmail: n0(c.inmail, 0, 50), reply: n0(c.reply, 0, 50) } satisfies Quotas;
    case "content": {
      const days = [...new Set((Array.isArray(c.days) ? c.days : []).map((d: unknown) => n0(d, 0, 4)))].sort() as number[];
      const formats = list(c.formats).filter((f) => CONTENT_FORMATS.includes(f));
      return { ppw: days.length ? days.length : n0(c.ppw ?? 2, 1, 5), days, formats } satisfies ContentPlan;
    }
    case "comments": return {
      voice: String(c.voice ?? ""), length: (["short", "medium", "long"].includes(c.length) ? c.length : "medium"), tone: (["formal", "balanced", "warm"].includes(c.tone) ? c.tone : "balanced"),
      question: (["never", "sometimes", "always"].includes(c.question) ? c.question : "sometimes"), dailyCap: n0(c.dailyCap ?? 40, 1, 200),
    } satisfies CommentRules;
    case "condition": {
      const fact = FACTS.find((f) => f.key === c.fact) ?? FACTS[0];
      return { fact: fact.key, op: fact.ops.includes(c.op) ? c.op : fact.ops[0], value: String(c.value ?? "").trim() } satisfies ConditionConfig;
    }
    case "action": {
      const kind: ActionKind = ACTIONS.some((a) => a.key === c.kind) ? c.kind : "comments";
      return { kind, ...(kind === "comments" ? { count: n0(c.count ?? 2, 1, 20) } : {}), ...(kind === "template" ? { template: String(c.template ?? "").trim() } : {}), ...(kind === "next" || kind === "angle" ? { text: String(c.text ?? "").trim() } : {}) } satisfies ActionConfig;
    }
    case "note": return { text: String(c.text ?? "") };
  }
}

// ---------- live settings: what the app reads today ----------
export type LiveSettings = {
  quotas: Quotas; pillars: string[]; regions: string[]; segments: Record<string, string>; segment_weights: Record<string, number>;
  voice: string; tuning: { length?: string; tone?: string; question?: string; [k: string]: unknown }; safety: { dailyCap?: number; [k: string]: unknown }; plan: Partial<ContentPlan>;
};

/** A settings node's values as they are in the app now. Other types keep their own config. */
export function readFromSettings(type: NodeType, s: LiveSettings): Record<string, any> | null {
  switch (type) {
    case "audience": return cleanConfig("audience", { segments: Object.fromEntries(SEG_KEYS.map((k) => [k, { name: s.segments?.[k] ?? "", weight: s.segment_weights?.[k] ?? 0 }])) });
    case "pillars": return cleanConfig("pillars", { pillars: s.pillars });
    case "regions": return cleanConfig("regions", { regions: s.regions });
    case "quota": return cleanConfig("quota", s.quotas);
    case "content": return cleanConfig("content", { ppw: s.plan?.ppw ?? 2, days: s.plan?.days ?? [], formats: s.plan?.formats ?? [] });
    case "comments": return cleanConfig("comments", { voice: s.voice, length: s.tuning?.length, tone: s.tuning?.tone, question: s.tuning?.question, dailyCap: s.safety?.dailyCap });
    default: return null;
  }
}

/** The values a node shows: the live settings in the active strategy, its own config otherwise. */
export const valuesOf = (n: Pick<StrategyNode, "type" | "config">, active: boolean, s: LiveSettings | null) =>
  (active && s && NODE_META[n.type].settings ? readFromSettings(n.type, s) : null) ?? cleanConfig(n.type, n.config);

export type Write = { table: "workspaces" | "studio_settings" | "content_settings"; patch: Record<string, unknown> };
/** Where saving a node writes, merged over the current settings so nothing else in those rows changes. */
export function writesFor(type: NodeType, config: Record<string, any>, s: LiveSettings): Write[] {
  const c = cleanConfig(type, config);
  switch (type) {
    case "quota": return [{ table: "workspaces", patch: { quotas: c } }];
    case "pillars": return [{ table: "workspaces", patch: { pillars: c.pillars } }];
    case "regions": return [{ table: "workspaces", patch: { regions: c.regions } }];
    case "audience": {
      const segs = c.segments as AudienceConfig["segments"];
      return [{ table: "workspaces", patch: {
        segments: Object.fromEntries(SEG_KEYS.filter((k) => segs[k].name).map((k) => [k, segs[k].name])),
        segment_weights: Object.fromEntries(SEG_KEYS.filter((k) => segs[k].weight > 0).map((k) => [k, segs[k].weight])),
      } }];
    }
    case "content": return [{ table: "content_settings", patch: { plan: c } }];
    case "comments": return [
      { table: "workspaces", patch: { voice: c.voice } },
      { table: "studio_settings", patch: { tuning: { ...(s.tuning ?? {}), length: c.length, tone: c.tone, question: c.question }, safety: { ...(s.safety ?? {}), dailyCap: c.dailyCap } } },
    ];
    default: return [];
  }
}
/** Several writes as one patch per table. */
export function mergeWrites(ws: Write[]): Write[] {
  const m = new Map<Write["table"], Record<string, unknown>>();
  for (const w of ws) m.set(w.table, { ...(m.get(w.table) ?? {}), ...w.patch });
  return [...m.entries()].map(([table, patch]) => ({ table, patch }));
}
/** Settings the strategy writes, applied to a copy of the live settings (what the app reads after a save). */
export function applyWrites(s: LiveSettings, ws: Write[]): LiveSettings {
  const out: LiveSettings = { ...s };
  for (const w of ws) {
    const p = w.patch as Record<string, any>;
    if (w.table === "workspaces") Object.assign(out, p);
    if (w.table === "studio_settings") { if (p.tuning) out.tuning = p.tuning; if (p.safety) out.safety = p.safety; }
    if (w.table === "content_settings" && p.plan) out.plan = p.plan;
  }
  return out;
}

// ---------- copy ----------
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const and = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Affects: Today quota · Dashboard". Conditions affect what their actions affect. */
export function affectsOf(n: Pick<StrategyNode, "id" | "type" | "config">, all: Pick<StrategyNode, "id" | "type" | "config" | "parent_id">[] = []): string[] {
  if (n.type === "action") return ACTIONS.find((a) => a.key === cleanConfig("action", n.config).kind)?.affects ?? [];
  if (n.type === "condition") {
    const under = descendants(n.id, all).filter((x) => x.type === "action");
    return [...new Set(under.flatMap((x) => affectsOf(x)))];
  }
  return NODE_META[n.type].affects;
}
export const affectsLine = (xs: string[]) => (xs.length ? `Affects: ${xs.join(" · ")}` : "Affects nothing in the app");

/** The value of a condition as words: segment letters become their names. */
export function valueText(c: ConditionConfig, segNames: Record<string, string> = {}) {
  const parts = c.value.split(",").map((v) => v.trim()).filter(Boolean);
  if (c.fact === "segment") return parts.map((p) => segNames[p] || `segment ${p}`).join(" or ");
  if (c.fact === "warm" || c.fact === "overdue") return /^(no|false)$/i.test(c.value) ? "no" : "yes";
  return parts.join(" or ") || "anything";
}
export function conditionText(cfg: Record<string, any>, segNames: Record<string, string> = {}) {
  const c = cleanConfig("condition", cfg) as ConditionConfig;
  const f = FACTS.find((x) => x.key === c.fact)!;
  if (c.fact === "warm") return `If there ${valueText(c) === "yes" ? "is" : "is no"} warm path`;
  if (c.fact === "overdue") return `If the next action ${valueText(c) === "yes" ? "is" : "is not"} overdue`;
  return `If ${f.label.toLowerCase()} ${OP_LABEL[c.op]} ${valueText(c, segNames)}`;
}
export function actionText(cfg: Record<string, any>) {
  const a = cleanConfig("action", cfg) as ActionConfig;
  if (a.kind === "comments") return `Add ${plural(a.count ?? 1, "comment task")} for these leads`;
  if (a.kind === "template") return a.template ? `Connection note: ${a.template}` : "Connection note: choose a template";
  if (a.kind === "next") return a.text ? `Next action: ${a.text}` : "Next action: not written yet";
  if (a.kind === "angle") return a.text ? `Angle: ${a.text}` : "Angle: not written yet";
  return "Raise Discovery and warm priority";
}

/** One line under the node's name. */
export function subtitleOf(type: NodeType, cfg: Record<string, any>, segNames: Record<string, string> = {}): string {
  const c = cleanConfig(type, cfg);
  switch (type) {
    case "goal": {
      const g = c as GoalConfig;
      const m = [g.calls_month != null && plural(g.calls_month, "call") + " a month", g.comments_week != null && plural(g.comments_week, "comment") + " a week", g.posts_month != null && plural(g.posts_month, "post") + " a month"].filter(Boolean) as string[];
      return g.text.trim().split("\n")[0] || m.join(" · ") || "Not set yet";
    }
    case "audience": {
      const segs = (c as AudienceConfig).segments;
      const on = SEG_KEYS.filter((k) => segs[k].weight > 0).sort((a, b) => segs[b].weight - segs[a].weight);
      return on.length ? on.map((k) => `${segs[k].name || segNames[k] || k} ${segs[k].weight}`).join(" · ") : "No weights yet";
    }
    case "pillars": return c.pillars.length ? `${plural(c.pillars.length, "pillar")}: ${c.pillars.join(", ")}` : "None yet";
    case "regions": return c.regions.length ? and(c.regions) : "None yet";
    case "quota": { const q = c as Quotas; return `${plural(q.comment, "comment")} · ${plural(q.request, "request")} · ${plural(q.dm, "message")} · ${q.inmail} InMail · ${plural(q.reply, "reply round")}`; }
    case "content": { const p = c as ContentPlan; return `${plural(p.ppw, "post")} a week${p.days.length ? ` on ${p.days.map((d) => WEEKDAYS[d]).join(", ")}` : ""}${p.formats.length ? ` · ${p.formats.join(", ")}` : ""}`; }
    case "comments": { const r = c as CommentRules; return `${r.length === "short" ? "Short" : r.length === "long" ? "Long" : "Medium"}, ${r.tone} · questions ${r.question} · at most ${r.dailyCap} a day`; }
    case "condition": return conditionText(c, segNames);
    case "action": return actionText(c);
    case "note": return c.text.trim().split("\n")[0] || "Empty note";
  }
}

// ---------- tree helpers ----------
const bySort = <T extends { sort: number; id: string }>(a: T, b: T) => a.sort - b.sort || a.id.localeCompare(b.id);
/** The nodes of one lane, in order: the main flow (parent null) or a condition's yes or no lane. */
export function laneOf<T extends Pick<StrategyNode, "id" | "parent_id" | "branch" | "sort">>(nodes: T[], parent: string | null, branch: Branch = ""): T[] {
  return nodes.filter((n) => (n.parent_id ?? null) === parent && (parent ? n.branch === branch : true)).sort(bySort);
}
/** Everything under a condition, at any depth. */
export function descendants<T extends Pick<StrategyNode, "id" | "parent_id">>(id: string, nodes: T[]): T[] {
  const out: T[] = [];
  const walk = (p: string) => { for (const n of nodes) if (n.parent_id === p) { out.push(n); walk(n.id); } };
  walk(id);
  return out;
}
/** A sort value for a node inserted at index i of a lane; renumber when two neighbours have no room between them. */
export function insertSort(sorts: number[], i: number): { sort: number; renumber: number[] | null } {
  const s = [...sorts].sort((a, b) => a - b);
  const prev = s[i - 1], next = s[i];
  if (prev == null && next == null) return { sort: 1024, renumber: null };
  if (prev == null) return { sort: next - 1024, renumber: null };
  if (next == null) return { sort: prev + 1024, renumber: null };
  const mid = Math.floor((prev + next) / 2);
  if (mid > prev && mid < next) return { sort: mid, renumber: null };
  // No room: every node gets 1024 steps, with a gap at i for the new one.
  const renumber = s.map((_, k) => (k < i ? k + 1 : k + 2) * 1024);
  return { sort: (i + 1) * 1024, renumber };
}

// ---------- layout: top to bottom, conditions fork into Yes (left) and No (right) and rejoin ----------
export type Dir = "down" | "right";
export type Card = { w: number; h: number };
export const CARD: Card = { w: 264, h: 104 };
export const GAP = 64; // between two nodes along the flow; the + sits in the middle
export const LANE_GAP = 56; // between the Yes and No lanes
export type Pt = { x: number; y: number };
export type Placed = { id: string; x: number; y: number; depth: number };
export type Plus = { key: string; x: number; y: number; parent: string | null; branch: Branch; index: number; lane: boolean; empty?: boolean };
export type Edge = { key: string; points: Pt[]; label?: "Yes" | "No" };
export type Layout = { nodes: Placed[]; edges: Edge[]; plus: Plus[]; width: number; height: number };

type Block = { cross: number; flow: number; nodes: { id: string; c: number; f: number; depth: number }[]; edges: { key: string; pts: [number, number][]; label?: "Yes" | "No" }[]; plus: (Omit<Plus, "x" | "y"> & { c: number; f: number })[] };

/** Positions for every node, connector and + button. Cross is across the flow (x when going down), flow is along it.
 *  A lane is a column of nodes; a condition is its card, then its Yes lane and No lane side by side, then a rejoin. */
export function layout<T extends Pick<StrategyNode, "id" | "type" | "parent_id" | "branch" | "sort">>(nodes: T[], dir: Dir = "down", card: Card = CARD): Layout {
  const along = dir === "down" ? card.h : card.w, across = dir === "down" ? card.w : card.h;
  const half = GAP / 2;
  const lane = (parent: string | null, branch: Branch, depth: number): Block => {
    const items = laneOf(nodes, parent, branch);
    const blocks = items.map((n) => (n.type === "condition" ? cond(n, depth) : single(n, depth)));
    const cross = Math.max(across, ...blocks.map((b) => b.cross));
    const out: Block = { cross, flow: 0, nodes: [], edges: [], plus: [] };
    const mid = cross / 2;
    const isLane = parent != null;
    if (!items.length) {
      // An empty lane is one + button, so a branch can be filled.
      out.plus.push({ key: `p:${parent}:${branch}:0`, c: mid, f: half, parent, branch, index: 0, lane: isLane, empty: true });
      out.flow = GAP;
      return out;
    }
    let f = 0;
    blocks.forEach((b, i) => {
      const off = mid - b.cross / 2;
      for (const n of b.nodes) out.nodes.push({ ...n, c: n.c + off, f: n.f + f });
      for (const e of b.edges) out.edges.push({ ...e, pts: e.pts.map(([c, ff]) => [c + off, ff + f]) });
      for (const p of b.plus) out.plus.push({ ...p, c: p.c + off, f: p.f + f });
      f += b.flow;
      // The connector and + after each block; the last one adds at the end of the lane.
      out.edges.push({ key: `e:${items[i].id}:next`, pts: [[mid, f], [mid, f + GAP]] });
      out.plus.push({ key: `p:${parent}:${branch}:${i + 1}`, c: mid, f: f + half, parent, branch, index: i + 1, lane: isLane });
      f += GAP;
    });
    // The very first + (before the first node) sits above it on the main flow only; lanes start from the fork.
    if (!isLane) out.plus.unshift({ key: `p:null::0`, c: mid, f: -half, parent: null, branch: "", index: 0, lane: false });
    out.flow = f;
    return out;
  };
  const single = (n: T, depth: number): Block => ({ cross: across, flow: along, nodes: [{ id: n.id, c: across / 2, f: 0, depth }], edges: [], plus: [] });
  const cond = (n: T, depth: number): Block => {
    const yes = lane(n.id, "yes", depth + 1), no = lane(n.id, "no", depth + 1);
    const cross = Math.max(across, yes.cross + LANE_GAP + no.cross);
    const mid = cross / 2;
    const yOff = mid - (yes.cross + LANE_GAP + no.cross) / 2, nOff = yOff + yes.cross + LANE_GAP;
    const yc = yOff + yes.cross / 2, nc = nOff + no.cross / 2;
    const fork = along + half, top = along + GAP;
    const lanes = Math.max(yes.flow, no.flow);
    const out: Block = { cross, flow: top + lanes - GAP + half, nodes: [{ id: n.id, c: mid - across / 2 + across / 2, f: 0, depth }], edges: [], plus: [] };
    // Fork: down from the card, across to each lane, down into its first node.
    out.edges.push({ key: `e:${n.id}:yes`, pts: [[mid, along], [mid, fork], [yc, fork], [yc, top]], label: "Yes" });
    out.edges.push({ key: `e:${n.id}:no`, pts: [[mid, along], [mid, fork], [nc, fork], [nc, top]], label: "No" });
    for (const [b, off] of [[yes, yOff], [no, nOff]] as const) {
      for (const x of b.nodes) out.nodes.push({ ...x, c: x.c + off, f: x.f + top });
      for (const e of b.edges) out.edges.push({ ...e, pts: e.pts.map(([c, ff]) => [c + off, ff + top]) });
      for (const p of b.plus) out.plus.push({ ...p, c: p.c + off, f: p.f + top });
    }
    // Rejoin: each lane ends where its last + is; the shorter lane runs down to meet the longer one.
    const join = top + lanes - GAP + half;
    const yEnd = top + yes.flow - (yes.nodes.length ? GAP : GAP / 2), nEnd = top + no.flow - (no.nodes.length ? GAP : GAP / 2);
    out.edges.push({ key: `e:${n.id}:join`, pts: [[yc, yEnd], [yc, join], [nc, join], [nc, nEnd]] });
    return out;
  };
  const root = lane(null, "", 0);
  // Map abstract (cross, flow) to x and y. Pad so the first + above the first node has room.
  const pad = GAP;
  const map = (c: number, f: number): Pt => (dir === "down" ? { x: c, y: f + pad } : { x: f + pad, y: c });
  const nodesOut: Placed[] = root.nodes.map((n) => { const p = map(n.c, n.f); return dir === "down" ? { id: n.id, x: p.x - card.w / 2, y: p.y, depth: n.depth } : { id: n.id, x: p.x, y: p.y - card.h / 2, depth: n.depth }; });
  const edgesOut: Edge[] = root.edges.map((e) => ({ key: e.key, points: e.pts.map(([c, f]) => map(c, f)), ...(e.label ? { label: e.label } : {}) }));
  const plusOut: Plus[] = root.plus.map(({ c, f, ...p }) => ({ ...p, ...map(c, f) }));
  const flowLen = root.flow + pad;
  return { nodes: nodesOut, edges: edgesOut, plus: plusOut, width: dir === "down" ? root.cross : flowLen, height: dir === "down" ? flowLen : root.cross };
}

/** Keyboard moves between nodes: the nearest card in that direction, preferring ones in line with this one. */
export function nearest(placed: Placed[], from: string | null, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight", card: Card = CARD): string | null {
  if (!placed.length) return null;
  const cur = placed.find((p) => p.id === from);
  if (!cur) return [...placed].sort((a, b) => a.y - b.y || a.x - b.x)[0].id;
  const cx = cur.x + card.w / 2, cy = cur.y + card.h / 2;
  let best: { id: string; s: number } | null = null;
  for (const p of placed) {
    if (p.id === cur.id) continue;
    const dx = p.x + card.w / 2 - cx, dy = p.y + card.h / 2 - cy;
    const main = key === "ArrowDown" ? dy : key === "ArrowUp" ? -dy : key === "ArrowRight" ? dx : -dx;
    const side = key === "ArrowDown" || key === "ArrowUp" ? Math.abs(dx) : Math.abs(dy);
    if (main <= 1) continue;
    const s = main + side * 0.75;
    if (!best || s < best.s) best = { id: p.id, s };
  }
  return best?.id ?? null;
}

/** Zoom and offset so the whole flow fits the viewport, never above 100%. */
export function fitView(content: { width: number; height: number }, view: { width: number; height: number }, margin = 48, min = 0.25, max = 1) {
  const z = Math.max(min, Math.min(max, (view.width - margin * 2) / Math.max(1, content.width), (view.height - margin * 2) / Math.max(1, content.height)));
  return { z, x: (view.width - content.width * z) / 2, y: Math.max(margin / 2, (view.height - content.height * z) / 2) };
}
/** Zoom by a factor around a point on screen, keeping that point still. */
export function zoomAt(v: { x: number; y: number; z: number }, factor: number, at: Pt, min = 0.25, max = 1.6) {
  const z = Math.max(min, Math.min(max, Math.round(v.z * factor * 100) / 100));
  const k = z / v.z;
  return { z, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
}

// ---------- the rules engine ----------
export type LeadFacts = { id: string; name: string; company: string; segment: string; region: string; stage: string; heat?: "Hot" | "Warm" | "Cold"; warm?: boolean; overdue?: boolean; linkedin?: string };
export type RuleCtx = { day: string; lead?: LeadFacts | null };
export type Fired = { node: string; rule: string; action: ActionConfig };

const weekday = (ymd: string) => DAYS[(new Date(ymd + "T12:00:00").getDay() + 6) % 7];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const yes = (v: string) => !/^(no|false|0)$/i.test(v.trim());

/** True or false; null when the fact is not known here (a lead fact with no lead), so neither lane runs. */
export function testCondition(cfg: Record<string, any>, ctx: RuleCtx): boolean | null {
  const c = cleanConfig("condition", cfg) as ConditionConfig;
  const vals = c.value.split(",").map(norm).filter(Boolean);
  const meta = FACTS.find((f) => f.key === c.fact)!;
  if (meta.lead && !ctx.lead) return null;
  const l = ctx.lead!;
  const anyIs = (got: string) => vals.some((v) => v === norm(got));
  switch (c.fact) {
    case "day": { const d = norm(weekday(ctx.day)); const hit = vals.some((v) => v.slice(0, 3) === d); return c.op === "not" ? !hit : hit; }
    case "segment": case "stage": { const hit = anyIs(c.fact === "segment" ? l.segment : l.stage); return c.op === "not" ? !hit : hit; }
    case "region": case "company": {
      const got = c.fact === "region" ? l.region : l.company;
      if (c.op === "contains") return vals.some((v) => norm(got).includes(v));
      const hit = anyIs(got);
      return c.op === "not" ? !hit : hit;
    }
    case "heat": {
      if (!l.heat) return null;
      if (c.op === "atleast") { const need = Math.min(...vals.map((v) => HEAT_ORDER.findIndex((h) => norm(h) === v)).filter((i) => i >= 0)); return Number.isFinite(need) ? HEAT_ORDER.indexOf(l.heat) >= need : false; }
      return anyIs(l.heat);
    }
    case "warm": return l.warm == null ? null : l.warm === yes(c.value || "yes");
    case "overdue": return l.overdue == null ? null : l.overdue === yes(c.value || "yes");
  }
}

/** Walk the flow for one lead (or none) on one day: actions on the main flow always fire; a condition sends the
 *  walk down its Yes or No lane; one whose fact is unknown here is skipped. The rule name is the condition's name,
 *  or the action's own name on the main flow. */
export function evaluate(nodes: Pick<StrategyNode, "id" | "type" | "title" | "parent_id" | "branch" | "sort" | "config">[], ctx: RuleCtx): Fired[] {
  const out: Fired[] = [];
  const walk = (parent: string | null, branch: Branch, rule: string | null) => {
    for (const n of laneOf(nodes, parent, branch)) {
      if (n.type === "action") out.push({ node: n.id, rule: rule ?? (n.title || actionText(n.config)), action: cleanConfig("action", n.config) as ActionConfig });
      if (n.type === "condition") {
        const r = testCondition(n.config, ctx);
        if (r == null) continue;
        walk(n.id, r ? "yes" : "no", n.title && n.title !== NODE_META.condition.title ? n.title : conditionText(n.config));
      }
    }
  };
  walk(null, "", null);
  return out;
}

export type Advice = { template?: { name: string; rule: string }; next?: { text: string; rule: string }; comments?: { count: number; rule: string; node: string }[]; priority?: { rule: string } };
/** What the rules say for one lead today: the first template, next action and priority, and every comment action. */
export function adviceFor(nodes: Parameters<typeof evaluate>[0], ctx: RuleCtx): Advice {
  const a: Advice = {};
  for (const f of evaluate(nodes, ctx)) {
    if (f.action.kind === "template" && f.action.template && !a.template) a.template = { name: f.action.template, rule: f.rule };
    if (f.action.kind === "next" && f.action.text && !a.next) a.next = { text: f.action.text, rule: f.rule };
    if (f.action.kind === "priority" && !a.priority) a.priority = { rule: f.rule };
    if (f.action.kind === "comments") (a.comments ??= []).push({ count: f.action.count ?? 1, rule: f.rule, node: f.node });
  }
  return a;
}

/** Extra touch plan steps from the rules, after the stage's own steps (so their Today keys keep their numbers). */
export function strategySteps(a: Advice): { text: string; rule: string }[] {
  const out: { text: string; rule: string }[] = [];
  if (a.template) out.push({ text: `Send the connection request with the "${a.template.name}" template`, rule: a.template.rule });
  if (a.comments?.length) out.push({ text: "Comment on a recent post before the next step", rule: a.comments[0].rule });
  return out;
}

/** The strategy's comment tasks for today: each comment action adds its count, spread over the leads it fired for,
 *  in the order the leads are given (Pipeline's Do next order). Each lead once a day; leads already on Today skipped. */
export function commentTasks(nodes: Parameters<typeof evaluate>[0], leads: LeadFacts[], day: string, taken: Set<string> = new Set()) {
  const per = new Map<string, { rule: string; count: number; leads: LeadFacts[] }>();
  for (const l of leads) for (const c of adviceFor(nodes, { day, lead: l }).comments ?? []) {
    const e = per.get(c.node) ?? { rule: c.rule, count: c.count, leads: [] };
    e.leads.push(l); per.set(c.node, e);
  }
  const used = new Set(taken);
  const out: { node: string; rule: string; lead: LeadFacts }[] = [];
  for (const [node, e] of [...per.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let n = 0;
    for (const l of e.leads) { if (n >= e.count) break; if (used.has(l.id)) continue; used.add(l.id); out.push({ node, rule: e.rule, lead: l }); n++; }
  }
  return out;
}

/** The Today row for a comment task from a rule. idx 200 and up, so it never meets the quota rows (1 to 50). */
export const STRATEGY_IDX = 200;
export const strategyNote = (node: string, rule: string) => `strategy:${node}:${rule.replace(/\s+/g, " ").slice(0, 120)}`;
/** The rule name from a Today note ("strategy:<node>:<rule>", also when skipped); empty when it is not from a rule. */
export function ruleFromNote(note: string | null | undefined): string {
  const t = (note ?? "").replace(/^skip:/, "");
  const m = t.match(/^strategy:[^:]+:(.*)$/);
  return m ? m[1] : "";
}
export const isStrategyNote = (note: string | null | undefined) => (note ?? "").replace(/^skip:/, "").startsWith("strategy:");

/** The angle Content Studio prefers today: the first angle action whose flow runs without a lead. */
export function preferredAngle(nodes: Parameters<typeof evaluate>[0], day: string): { text: string; rule: string } | null {
  const f = evaluate(nodes, { day }).find((x) => x.action.kind === "angle" && x.action.text);
  return f ? { text: f.action.text!, rule: f.rule } : null;
}
/** Companies whose leads a rule raised (lower case), with the rule, for Discovery's priority and Today's order. */
export function raisedCompanies(nodes: Parameters<typeof evaluate>[0], leads: LeadFacts[], day: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of leads) { const a = adviceFor(nodes, { day, lead: l }); if (a.priority && l.company.trim()) m.set(norm(l.company), a.priority.rule); }
  return m;
}
/** Points a raised company adds to a Digest topic's priority (0 to 100 scale). */
export const RAISE_POINTS = 10;

/** Weekly comment target for the Dashboard: the goal's comments a week when set, else the daily quota for five days. */
export function commentTarget(goal: Partial<GoalConfig> | null | undefined, dailyQuota: number) {
  return goal?.comments_week != null && goal.comments_week > 0 ? goal.comments_week : Math.max(0, dailyQuota || 0) * 5;
}
/** Order leads for Today: rule-raised first, then the heavier segment, keeping the given order otherwise. */
export function orderLeads<T extends { id: string; segment?: string; company?: string }>(leads: T[], weights: Record<string, number> = {}, raised: Map<string, string> = new Map()): T[] {
  return leads.map((l, i) => ({ l, i, r: raised.has(norm(l.company ?? "")) ? 1 : 0, w: weights[l.segment ?? ""] ?? 0 }))
    .sort((a, b) => b.r - a.r || b.w - a.w || a.i - b.i).map((x) => x.l);
}

// ---------- templates ----------
export type Draft = { type: NodeType; title?: string; config: Record<string, any>; branch?: Branch; children?: { yes?: Draft[]; no?: Draft[] }; editor_only?: boolean };
export const TEMPLATES: { key: string; name: string; sub: string }[] = [
  { key: "authority", name: "Authority builder", sub: "Post three times a week on the pillars, comment daily, a light outreach pace." },
  { key: "outreach", name: "Outreach sprint", sub: "More requests and messages, and rules that warm hot leads and book calls." },
  { key: "event", name: "Event push", sub: "Four posts a week around one event, with an event angle early in the week." },
  { key: "current", name: "From current settings", sub: "Today's settings as nodes, plus the strategy notes, to build on." },
  { key: "blank", name: "Blank", sub: "A goal to start from. Add the rest with the plus buttons." },
];

/** The nodes a template starts with. Pillars, regions, segment names and the voice always come from the profile. */
export function templateNodes(key: string, s: LiveSettings, notes: { title: string; body: string }[] = []): Draft[] {
  const live = (t: NodeType) => readFromSettings(t, s)!;
  const aud = live("audience");
  const withWeights = (w: Record<string, number>) => ({ segments: Object.fromEntries(SEG_KEYS.map((k) => [k, { name: aud.segments[k].name, weight: w[k] ?? 0 }])) });
  const pillars: Draft = { type: "pillars", config: live("pillars") }, regions: Draft = { type: "regions", config: live("regions") };
  const comments = (over: Partial<CommentRules> = {}): Draft => ({ type: "comments", config: { ...live("comments"), ...over } });
  const noteDrafts = notes.map((n) => ({ type: "note" as const, title: n.title.trim() || "Note", config: { text: n.body }, editor_only: /^who does what/i.test(n.title.trim()) }));
  switch (key) {
    case "authority": return [
      { type: "goal", config: { text: "Be the name buyers link with our pillars this month.", calls_month: 2, comments_week: 40, posts_month: 12 } },
      { type: "audience", config: withWeights({ A: 40, B: 30, C: 15, D: 10, E: 5 }) }, pillars, regions,
      { type: "content", config: { ppw: 3, days: [0, 2, 4], formats: ["Article", "Carousel", "Text post"] } },
      comments(), { type: "quota", config: { comment: 8, request: 3, dm: 2, inmail: 0, reply: 1 } },
    ];
    case "outreach": return [
      { type: "goal", config: { text: "Book calls with the hottest leads in the target segments.", calls_month: 6, comments_week: 30, posts_month: 4 } },
      { type: "audience", config: withWeights({ A: 50, B: 30, C: 10, D: 10, E: 0 }) },
      { type: "quota", config: { comment: 6, request: 15, dm: 8, inmail: 1, reply: 1 } },
      { type: "condition", title: "Hot leads", config: { fact: "heat", op: "atleast", value: "Warm" }, children: {
        yes: [{ type: "action", title: "Offer a call", config: { kind: "next", text: "Offer a 20-minute call this week" } }],
        no: [{ type: "action", title: "Warm them first", config: { kind: "comments", count: 3 } }],
      } },
      { type: "content", config: { ppw: 1, days: [1], formats: ["Text post"] } }, comments({ length: "short" }),
    ];
    case "event": return [
      { type: "goal", config: { text: "Meet the right people at the event and keep talking after it.", calls_month: 4, comments_week: 30, posts_month: 12 } },
      { type: "content", config: { ppw: 4, days: [0, 1, 2, 3], formats: ["Text post", "Image post", "Video"] } },
      { type: "condition", title: "Event days", config: { fact: "day", op: "is", value: "Mon, Tue" }, children: {
        yes: [{ type: "action", title: "Event angle", config: { kind: "angle", text: "What I expect to hear at the event, and the one question I will ask" } }],
        no: [{ type: "note", title: "After the event", config: { text: "Share one lesson from the event in each post." } }],
      } },
      { type: "quota", config: { comment: 8, request: 10, dm: 5, inmail: 1, reply: 1 } }, comments(),
    ];
    case "current": return [
      { type: "goal", config: { text: "", calls_month: null, comments_week: null, posts_month: null } },
      { type: "audience", config: aud }, pillars, regions, { type: "quota", config: live("quota") }, { type: "content", config: live("content") }, comments(), ...noteDrafts,
    ];
    default: return [{ type: "goal", config: { text: "", calls_month: null, comments_week: null, posts_month: null } }, ...noteDrafts];
  }
}

/** Templates as rows to insert: ids from makeId, sorts in steps of 1024, lanes under their condition. */
export function flatten(drafts: Draft[], strategyId: string, makeId: () => string, parent: string | null = null, branch: Branch = ""): StrategyNode[] {
  const out: StrategyNode[] = [];
  drafts.forEach((d, i) => {
    const id = makeId();
    out.push({ id, strategy_id: strategyId, type: d.type, title: d.title ?? NODE_META[d.type].title, parent_id: parent, branch, sort: (i + 1) * 1024, config: cleanConfig(d.type, d.config), editor_only: !!d.editor_only });
    if (d.children?.yes) out.push(...flatten(d.children.yes, strategyId, makeId, id, "yes"));
    if (d.children?.no) out.push(...flatten(d.children.no, strategyId, makeId, id, "no"));
  });
  return out;
}

/** A copy of a strategy's nodes with new ids, parents remapped. */
export function copyNodes(nodes: StrategyNode[], strategyId: string, makeId: () => string): StrategyNode[] {
  const ids = new Map(nodes.map((n) => [n.id, makeId()]));
  return nodes.map((n) => ({ ...n, id: ids.get(n.id)!, strategy_id: strategyId, parent_id: n.parent_id ? ids.get(n.parent_id) ?? null : null, created_at: undefined }));
}

/** "Authority builder", then "Authority builder 2". */
export function strategyName(base: string, existing: string[]) {
  if (!existing.includes(base)) return base;
  let i = 2; while (existing.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Which node types may be added at a + : lanes take conditions, actions and notes; the main flow takes everything,
 *  but settings types and the goal only once per strategy (they each write one setting). */
export function addable(nodes: Pick<StrategyNode, "type">[], lane: boolean): NodeType[] {
  return NODE_TYPES.filter((t) => (lane ? NODE_META[t].lane : true) && !(NODE_META[t].single && nodes.some((n) => n.type === t)));
}
/** Hidden from viewers and commenters, like the team operations notes ("Who does what"). */
export const hiddenFor = (n: Pick<StrategyNode, "editor_only" | "title">, editor: boolean) => !editor && (n.editor_only || /^who does what/i.test(n.title.trim()));
