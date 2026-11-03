import { recheck } from "../lib/recheck";
import { isInternalRequest } from "../lib/background";
import { isUuid } from "../lib/http";

// Background function: answers 202 right away; the detail page polls /api/opportunity meanwhile.
// Only /api/recheck-start (after checking login and membership) may start it.
export default async (req: Request) => {
  if (!isInternalRequest(req)) {
    console.error("recheck-background: ignored a request without the internal token");
    return;
  }
  const body = await req.json().catch(() => null);
  if (!isUuid(body?.opportunity_id)) {
    console.error("recheck-background: invalid opportunity_id");
    return;
  }
  await recheck(body.opportunity_id);
};
