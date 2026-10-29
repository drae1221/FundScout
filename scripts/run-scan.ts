// Run a full scan from the terminal, without Netlify:  npm run scan -- "AI Club"
import { randomUUID } from "node:crypto";
import { db } from "../netlify/lib/db";
import { runScan } from "../netlify/lib/scan";

const name = process.argv[2] ?? "AI Club";
const { data: org, error } = await db.from("orgs").select("id,name").eq("name", name).single();
if (error) throw new Error(`No org named "${name}": ${error.message}`);

const scanId = randomUUID();
console.log(`Scan ${scanId} for ${org.name}\n`);
const started = Date.now();
await runScan(org.id, scanId);

const { data: scan } = await db.from("scans").select("status,counts,sources_checked,error").eq("id", scanId).single();
console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s:`, scan);
