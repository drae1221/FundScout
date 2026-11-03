import { runScan } from "../lib/scan";
import { isInternalRequest } from "../lib/background";
import { isUuid, readJson } from "../lib/http";

// Background function (the "-background" name matters): Netlify answers 202 right away
// and lets this run for up to 15 minutes. Only /api/scan-start (after checking login and
// membership) or the scheduled weekly run may start it; anything else is ignored.
export default async (req: Request) => {
  if (!isInternalRequest(req)) {
    console.error("scan-background: ignored a request without the internal token");
    return;
  }
  const body = await readJson(req);
  if (body instanceof Response) {
    console.error(`${new URL(req.url).pathname}: rejected body (${body.status})`);
    return;
  }
  if (!isUuid(body?.org_id) || !isUuid(body?.scan_id)) {
    console.error("scan-background: invalid org_id or scan_id");
    return;
  }
  await runScan(body.org_id, body.scan_id, body.weekly === true);
};
