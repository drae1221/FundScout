// Saves a finished scan (log, cards and drafts) as public/demo-run.json, the backup
// the site replays at /?demo when the live agents are slow or the Wi-Fi fails.
//   npm run save-demo -- <scan id>
import { writeFileSync } from "node:fs";
import { db } from "../netlify/lib/db";

const scanId = process.argv[2];
if (!scanId) throw new Error("Usage: npm run save-demo -- <scan id>");

const { data: scan, error } = await db.from("scans").select("*").eq("id", scanId).single();
if (error) throw new Error(error.message);
const [{ data: org }, { data: log }, { data: opportunities }] = await Promise.all([
  db.from("orgs").select("id,name,type").eq("id", scan.org_id).single(),
  db.from("activity_log").select("step,message,created_at").eq("scan_id", scanId).order("created_at"),
  db.from("opportunities").select("*").eq("scan_id", scanId).eq("audience", "club").order("fit_score", { ascending: false }),
]);
if (!org || !log || !opportunities) throw new Error("Scan data missing");

const drafts: Record<string, unknown> = {};
const draftLogs: Record<string, unknown[]> = {};
for (const o of opportunities) {
  const { data } = await db.from("drafts").select("*").eq("opportunity_id", o.id).order("created_at", { ascending: false }).limit(1);
  if (!data?.[0]) continue;
  drafts[o.id] = data[0];
  // The Drafter's lines for this opportunity, from its last successful run.
  const lines = log.filter((l) => l.step === "Drafter" && l.message.includes(`"${o.title}"`));
  const start = lines.map((l) => l.message.startsWith("Writing")).lastIndexOf(true);
  draftLogs[o.id] = lines.slice(Math.max(0, start)).filter((l) => !l.message.startsWith("Couldn't"));
}

const run = {
  saved_at: new Date().toISOString(),
  org,
  scan: { ...scan, status: "done" },
  log: log.filter((l) => l.step !== "Drafter" && l.step !== "Automation"), // the demo replays "Find funding"
  opportunities: opportunities.map((o) => ({ ...o, status: "new" })),
  drafts,
  draftLogs,
};
writeFileSync("public/demo-run.json", JSON.stringify(run, null, 2) + "\n");
console.log(`Saved ${org.name}: ${run.log.length} log lines, ${opportunities.length} cards, ${Object.keys(drafts).length} drafts`);
