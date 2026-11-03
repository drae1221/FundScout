// Step 1: keep only Apply matches that have a real deadline, and make one calendar item
// per deadline (the deadline itself + a reminder two weeks before).
// FundScout sends a per-scan log token; n8n sends it back so only n8n can write log lines.
const LOG_URL = 'https://fundscout-cu.netlify.app/api/automation-log';
const body = $input.first().json.body;
const log = (message) => this.helpers.httpRequest({ method: 'POST', url: LOG_URL, headers: { 'X-FundScout-Log-Token': body.log_token }, json: true, body: { scan_id: body.scan_id, message } });
const isWebLink = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ''));
// Calendar text is plain text: no line breaks or angle brackets from search results.
const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').slice(0, 200);

const matches = body.apply_opportunities || [];
await log(`n8n received ${matches.length} Apply ${matches.length === 1 ? 'match' : 'matches'} for ${oneLine(body.org_name)}`);

const items = [];
for (const m of matches) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.deadline || '')) continue;
  const due = new Date(m.deadline + 'T09:00:00');
  const remind = new Date(due.getTime() - 14 * 24 * 3600 * 1000);
  const end = (d) => new Date(d.getTime() + 30 * 60 * 1000).toISOString();
  const verify = m.deadline_verified ? '' : ' (verify on source)';
  const description = [
    oneLine(m.provider),
    `Amount: ${oneLine(m.amount) || 'see source'}`,
    isWebLink(m.url) ? `Source: ${m.url}` : 'Source: see FundScout',
    isWebLink(m.app_link) ? `Open in FundScout: ${m.app_link}` : '',
    '',
    m.deadline_verified ? 'Deadline confirmed by a club member on the source.' : 'Deadline found by FundScout: verify it on the source before relying on it.',
  ].join('\n');
  items.push({ json: { summary: `DUE${verify}: ${oneLine(m.title)}`, start: due.toISOString(), end: end(due), description } });
  if (remind > new Date()) items.push({ json: { summary: `Start application (due ${m.deadline}${verify}): ${oneLine(m.title)}`, start: remind.toISOString(), end: end(remind), description } });
}
// No deadlines: pass one marker item so the "Any deadlines?" check sends the flow straight to the email.
return items.length ? items : [{ json: { noDeadlines: true } }];
