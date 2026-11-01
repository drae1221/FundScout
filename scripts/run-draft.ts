// Local test: npm run draft -- <opportunity id>   (writes a draft with the Drafter agent)
import { db } from "../netlify/lib/db";
import { writeDraft } from "../netlify/lib/drafter";

const id = process.argv[2];
if (!id) throw new Error("Usage: npm run draft -- <opportunity id>");
const started = Date.now();
await writeDraft(id);
const { data } = await db.from("drafts").select("*").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(1);
console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s\n`);
console.log(JSON.stringify(data?.[0], null, 2));
