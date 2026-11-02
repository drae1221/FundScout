import { recheck } from "../lib/recheck";

// Background function: answers 202 right away; the detail page polls /api/opportunity meanwhile.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req: Request) => {
  const { opportunity_id } = await req.json();
  if (!UUID.test(opportunity_id ?? "")) {
    console.error("recheck-background: invalid opportunity_id");
    return;
  }
  await recheck(opportunity_id);
};
