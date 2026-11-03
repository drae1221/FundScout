import { writeDraft } from "../lib/drafter";
import { isInternalRequest } from "../lib/background";
import { isUuid, readJson } from "../lib/http";

// Background function: answers 202 right away; the detail page polls /api/opportunity meanwhile.
// Only /api/draft-start (after checking login and membership) may start it.
export default async (req: Request) => {
  if (!isInternalRequest(req)) {
    console.error("draft-background: ignored a request without the internal token");
    return;
  }
  const body = await readJson(req);
  if (body instanceof Response) {
    console.error(`${new URL(req.url).pathname}: rejected body (${body.status})`);
    return;
  }
  if (!isUuid(body?.opportunity_id)) {
    console.error("draft-background: invalid opportunity_id");
    return;
  }
  await writeDraft(body.opportunity_id);
};
