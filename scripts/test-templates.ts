// Checks the Templates section logic: the one word, variables, highlighting pieces, sample fill, filter and search,
// chip counts, the next order and the starter set. Run: node scripts/test-templates.ts
import { purposeOf, variablesOf, piecesOf, sampleFor, visibleTemplates, purposeCounts, nextSort, STARTERS, PURPOSES, type Template } from "../src/lib/templates.ts";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// The real names from Shashi's set and the demo profile.
eq("a connection note is Connect", purposeOf({ kind: "note", name: "Connection note: value then question" }), "Connect");
eq("first message after they accept is Follow-up", purposeOf({ kind: "message", name: "First message after they accept" }), "Follow-up");
eq("follow-up on settlement is Follow-up", purposeOf({ kind: "message", name: "Follow-up on settlement timing" }), "Follow-up");
eq("a resource reply saved as a message is Resource", purposeOf({ kind: "message", name: "Resource reply (Thursday post)" }), "Resource");
eq("a call offer saved as a message is Call", purposeOf({ kind: "message", name: "Call offer (conversation running)" }), "Call");
eq("the resource type is Resource", purposeOf({ kind: "resource", name: "Settlement checklist" }), "Resource");
eq("InMail by type", purposeOf({ kind: "inmail", name: "Top tier" }), "InMail");
eq("InMail by name", purposeOf({ kind: "message", name: "InMail (top-tier, after two comments)" }), "InMail");
eq("a reply is Reply", purposeOf({ kind: "reply", name: "Reply to a comment on Shashi's post" }), "Reply");
eq("a thank you message is Thank you", purposeOf({ kind: "message", name: "Thank you after the call" }), "Thank you");
eq("a reshare note is Reshare", purposeOf({ kind: "post", name: "Reshare note for colleagues" }), "Reshare");
eq("a comment prompt is Prompt", purposeOf({ kind: "post", name: "Thursday comment prompt: variant A" }), "Prompt");
eq("another post is Post", purposeOf({ kind: "post", name: "Weekly recap" }), "Post");
eq("a plain message is Message", purposeOf({ kind: "message", name: "Checking in" }), "Message");
eq("every purpose is one word or Thank you", PURPOSES.every((p) => !p.includes(" ") || p === "Thank you"), true);

const body = "Hi {first}, on [topic]: thanks, [First name]. [topic] again, {first}.";
eq("variables are found once each, in order, both styles", variablesOf(body), ["{first}", "[topic]", "[First name]"]);
eq("no variables in plain text", variablesOf("Thanks for connecting."), []);
eq("pieces keep the whole text", piecesOf(body).map((p) => p.text).join(""), body);
eq("pieces name the variable without brackets", piecesOf("A [First name] B").map((p) => p.variable ?? null), [null, "First name", null]);
eq("pieces of plain text", piecesOf("plain"), [{ text: "plain" }]);
eq("sample for First name", sampleFor("First name"), "Rania");
eq("sample for {first}", sampleFor("first"), "Rania");
eq("no sample for a description", sampleFor("one verified fact they probably have not seen"), null);

const rows: Template[] = [
  { id: "1", name: "Call offer", kind: "call", body: "Twenty minutes next week?", sort: 5 },
  { id: "2", name: "Connection note B", kind: "note", body: "Hi [First name]", sort: 2 },
  { id: "3", name: "Connection note A", kind: "note", body: "Hello settlement", sort: 1 },
  { id: "4", name: "First message after accepting", kind: "message", body: "Thanks for connecting", sort: 0 },
];
eq("All shows every template, purpose first, then order", visibleTemplates(rows, "All", "").map((r) => r.id), ["3", "2", "4", "1"]);
eq("filter by purpose", visibleTemplates(rows, "Connect", "").map((r) => r.id), ["3", "2"]);
eq("search the text, any case", visibleTemplates(rows, "All", "SETTLEMENT").map((r) => r.id), ["3"]);
eq("search the word", visibleTemplates(rows, "All", "follow").map((r) => r.id), ["4"]);
eq("search inside a filter", visibleTemplates(rows, "Call", "hello").map((r) => r.id), []);
eq("chips: All then present purposes with counts", purposeCounts(rows), [{ id: "All", count: 4 }, { id: "Connect", count: 2 }, { id: "Follow-up", count: 1 }, { id: "Call", count: 1 }]);
eq("chips with no rows", purposeCounts([]), [{ id: "All", count: 0 }]);
eq("next order goes after the last", nextSort(rows), 6);
eq("next order on an empty list", nextSort([]), 0);

eq("six starters", STARTERS.length, 6);
eq("starters cover the sequence", STARTERS.map(purposeOf), ["Connect", "Follow-up", "Resource", "Call", "Reply", "InMail"]);
eq("starter copy has no em dashes or contractions", STARTERS.some((s) => /—|\b\w+'(t|s|re|ll|ve|d)\b/i.test(s.body + s.name)), false);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
