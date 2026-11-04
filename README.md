# FundScout

**Finds the funding your club didn't know existed.**

Student clubs mostly use one funding source. FundScout checks CU Boulder's student funds, federal grants and the web for a club, decides which opportunities are worth pursuing, drafts the request, and, when an officer asks, emails the treasurer a digest and puts deadlines on their calendar.

- **Live app:** https://fundscout-cu.netlify.app (club officers log in with an email link)
- **Cached demo run** (replays a saved scan, no live AI calls): https://fundscout-cu.netlify.app/?demo

CU Boulder Applied AI Development capstone, November 2026. Full spec: [CLAUDE.md](CLAUDE.md).

## How it works

```
Find funding ──► Scout agent ──► Fit & Eligibility agent (one per candidate) ──► Apply / Maybe / Skip
                                                                                     │
Open an Apply card ──► Drafter agent ──► draft with highlighted assumptions ◄────────┘

Scan and email the digest ──► scan ──► n8n automation ──► calendar events ──► digest email ──► steps logged back
```

**Three AI agents** (Claude, `claude-sonnet-5-5`, tool use), each a loop that picks its own next step and logs it to the on-screen activity log:

| Agent | Tools | Decides |
|---|---|---|
| **Scout** | hand-checked CU funding library, Grants.gov search, web search | which searches to run, when results are too thin and it should search again, which candidates are worth passing on |
| **Fit & Eligibility** | reads the source page, or the official Grants.gov listing | hard eligibility (registered student org? 501(c)(3) required? geography?), fit score, and an Apply / Maybe / Skip verdict with plain-language reasons |
| **Drafter** | reads the source page | the draft type (CU funding request / grant application / sponsor pitch), what to reuse from the profile, and what the club must supply |

**Profile and confirmed facts:** each organization has a profile page (add new clubs or nonprofits from the club picker). On a Maybe or Skip card, the treasurer can answer an eligibility flag with **We meet this** and a reason; the answer is saved to the profile as a confirmed fact, and **Re-check this opportunity** runs the Fit agent again with it. Every agent reads confirmed facts on every scan, so one answer helps with future opportunities too.

**Automation (n8n, separate from the agents):** when a member clicks **Scan and email the digest** and the scan finishes, FundScout posts the Apply matches to an n8n webhook. n8n checks for deadlines, adds each deadline and a 2-week reminder to Google Calendar, emails the digest from Gmail, and posts each step back to `/api/automation-log`, which shows it in the activity log. The workflow export is in [automation/n8n-workflow.json](automation/n8n-workflow.json).

## Guardrails

- Every opportunity links to its original source, and only links that came from a real search result are kept.
- Deadlines show "verify on source" on the cards, the detail page, the digest email and the calendar until a logged-in club member clicks "I checked the deadline on the source". The server only accepts that from a member and records who confirmed it and when.
- Drafts use only facts from the club profile. Guesses are highlighted, and missing facts are listed for the human to supply.
- FundScout never submits anything; a person always does.
- Every scan and digest lists the sources that were checked.

## Security

- **Login:** club officers log in with a one-time email link (Supabase Auth). The cached demo at `/?demo` needs no login because it replays a saved file and never touches the database.
- **Membership checks:** every API function that reads or changes club data uses `netlify/lib/auth.ts`. It verifies the login token (**401** if missing or invalid) and checks the `org_members` table (**403** if you aren't in the club). The club is always looked up from the database (from the opportunity or scan), never trusted from the browser. Owners add officers by email on the Profile page.
- **Database lock:** every table has Row Level Security with no policies, and the public roles have no table rights. The browser's public key can't read or write anything; only the server, using the service key, can. The service key never reaches the browser.
- **Background jobs:** scans, drafts and re-checks start through `/api/*-start`, which checks login and membership. The background functions ignore any request without an internal token.
- **n8n secrets:** FundScout calls the n8n webhook with an `X-FundScout-Secret` header (n8n Header Auth), at an unguessable path. n8n writes to the activity log only with a per-scan token signed with `AUTOMATION_LOG_SECRET`. The digest goes only to the club's saved addresses, looked up on the server, and every title, provider and reason is HTML-escaped, with only `http(s)` links.
- **Spending limits** (`netlify/lib/limits.ts`): per club, 5 scans, 20 drafts and 20 re-checks a day, and only one scan running at a time (enforced by the database). Digest re-sends are limited to once an hour per club. Request bodies are capped at 10 KB and checked for type.
- **Prompt-injection protection:** agents read pages through FundScout's own reader, which strips HTML, cuts pages to 15,000 characters and wraps them in `<untrusted_page>` markers. The prompts say that text is data, not instructions, and the reading tools can only open that opportunity's own link. Code checks every verdict (allowed values, score 0–100, HTML stripped, length caps) and applies hard rules the AI can't override: a 501(c)(3)-only opportunity can't be "Apply" for a club without that status or a partner, and a passed deadline can't be "Apply". Confirmed facts come only from members and are labeled with who confirmed them and when. This reduces the risk but can't remove it entirely, which is why a person always reviews and submits.
- **Other:** links are clickable only if they are `http(s)`, errors shown in the browser are generic (details stay in the server log), `/api/health` reveals nothing, and `.gitignore` blocks key files.

## Stack

React + Vite on Netlify · Netlify Functions (TypeScript; scans and drafts run as background functions) · Supabase Postgres · Claude API · n8n Cloud with Google Calendar and Gmail.

## Project layout

| Path | What it is |
|---|---|
| `src/` | The website: pipeline dashboard, opportunity detail page, cached demo replay |
| `netlify/lib/` | The agents (`scout.ts`, `fit.ts`, `drafter.ts`), the shared agent loop (`claude.ts`), the scan pipeline and the n8n hand-off |
| `netlify/functions/` | API endpoints and the background functions that run scans and drafts |
| `supabase/` | Database schema, seed data (demo clubs and the CU funding library) and migrations |
| `automation/` | Exported n8n workflow |
| `scripts/` | Local tools: run a scan, write a draft, save the cached demo run |
| `docs/` | Benchmark of funding the Scout should find for AI Club |

## Run it yourself

Needs Node.js 22+. Copy `.env.example` to `.env` and fill in the keys (never commit `.env`).

```bash
npm install
npm run dev                                # website on http://localhost:5173 (API calls go to the live site)
npm run scan -- "AI Club"                  # run a full scan from the terminal
npm run draft -- <opportunity id>          # write a draft for one opportunity
npm run save-demo -- <scan id>             # save a finished scan as the cached demo run
```

**Database (Supabase):** create a project, then in the SQL Editor run `supabase/schema.sql` and then `supabase/seed.sql`. (Existing databases: run the files in `supabase/migrations/` in order.) Then add yourself as an owner: `insert into org_members (org_id, email, role) select id, 'you@example.com', 'owner' from orgs;` Put the Project URL and the `service_role` key in `.env` and in Netlify's environment variables.

**Deploy (Netlify):** import this repo in Netlify; `netlify.toml` sets the build. Add these environment variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `AUTOMATION_LOG_SECRET`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the last two are public by design). In Supabase → Authentication → URL Configuration, set the Site URL to the live site and add it to the Redirect URLs. Then check that `/api/health` says `{"ok":true}`.

**Automation (n8n):** import `automation/n8n-workflow.json` and connect Google Calendar and Gmail. On the webhook node, set Header Auth (header `X-FundScout-Secret`, value = `N8N_WEBHOOK_SECRET`) and a random path. The Code steps are also in `automation/code/`. Publish the workflow, then set its production webhook URL as `N8N_WEBHOOK_URL`. Digest recipients come from each club's profile.
