import { runScan } from "../lib/scan";

// Background function (the "-background" name matters): Netlify answers 202 right away
// and lets this run for up to 15 minutes. The page polls /api/scan-status meanwhile.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  const { org_id, scan_id, weekly } = await req.json();
  if (!UUID.test(org_id ?? "") || !UUID.test(scan_id ?? "")) {
    console.error("scan-background: invalid org_id or scan_id");
    return;
  }
  await runScan(org_id, scan_id, weekly === true);
};
