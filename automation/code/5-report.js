// Step 5: report back so the step shows on FundScout's activity log.
const LOG_URL = 'https://fundscout-cu.netlify.app/api/automation-log';
const body = $('Scan finished (webhook)').first().json.body;
const to = $('3. Build digest email').first().json.to;
await this.helpers.httpRequest({ method: 'POST', url: LOG_URL, headers: { 'X-FundScout-Log-Token': body.log_token }, json: true, body: { scan_id: body.scan_id, message: `Emailed the weekly digest to ${to}` } });
return $input.all();
