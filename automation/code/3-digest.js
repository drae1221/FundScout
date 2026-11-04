// Step 3: report the calendar result, then build the digest email.
// Everything from a search result is HTML-escaped, and only http(s) links are used.
const LOG_URL = 'https://fundscout-cu.netlify.app/api/automation-log';
const body = $('Scan finished (webhook)').first().json.body;
const log = (message) => this.helpers.httpRequest({ method: 'POST', url: LOG_URL, headers: { 'X-FundScout-Log-Token': body.log_token }, json: true, body: { scan_id: body.scan_id, message } });
const events = (n) => `${n} ${n === 1 ? 'event' : 'events'}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const link = (u, text) => (/^https?:\/\/[^\s]+$/i.test(String(u || '')) ? `<a href="${esc(u)}">${esc(text)}</a>` : esc(text));
const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);

// The calendar step only runs when there are deadlines; count what it really created.
let created = 0, failed = 0;
try {
  const results = $('2. Add deadlines to calendar').all();
  created = results.filter((i) => i.json && i.json.id && !i.json.error).length;
  failed = results.length - created;
} catch (e) {
  // Calendar step didn't run this time.
}
if (created === 0 && failed === 0) await log('No Apply matches have a stated deadline, so no calendar events were added');
if (created) await log(`Added ${events(created)} to the calendar (deadlines + 2-week reminders)`);
if (failed) await log(`Couldn't add ${events(failed)} to the calendar`);

// Recipients: only the club's saved digest addresses, which FundScout looks up on its server.
const to = (body.funding_contacts || []).filter((e) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i.test(e)).join(',');
if (!to) throw new Error('No digest recipients');

const matches = body.apply_opportunities || [];
const rows = matches
  .map((m) => {
    const deadline = m.deadline ? `${esc(m.deadline)}${m.deadline_verified ? '' : ' <i>(verify on source)</i>'}` : 'see source';
    return `<li><b>${link(m.app_link, m.title)}</b> (${esc(m.provider)})<br>Amount: ${esc(m.amount || 'see source')} · Deadline: ${deadline} · ${link(m.url, 'original source')}${m.reason ? `<br><span style="color:#444">${esc(m.reason)}</span>` : ''}</li>`;
  })
  .join('');
const html = `<h2>FundScout funding digest: ${esc(body.org_name)}</h2><p>Top matches worth applying for:</p><ul>${rows || '<li>No Apply matches in this scan.</li>'}</ul><p style="color:#666">Sources checked in this scan: ${esc((body.sources_checked || []).join(', '))}.</p><p style="color:#666">FundScout never submits anything. Review each draft and submit it yourself.</p>`;
const subject = `FundScout: ${matches.length} funding ${matches.length === 1 ? 'match' : 'matches'} for ${oneLine(body.org_name)}`;
return [{ json: { to, subject, html } }];
