# FundScout

**Finds the funding your club didn't know existed.**

Student clubs mostly use one funding source. FundScout checks CU Boulder's student funds, federal grants and the web for a club, decides which opportunities are worth pursuing, drafts the request, and sends the treasurer a weekly digest with deadlines on their calendar.

- **Live app:** https://fundscout-cu.netlify.app
- **Cached demo run** (replays a saved scan, no live AI calls): https://fundscout-cu.netlify.app/?demo

CU Boulder Applied AI Development capstone, November 2026. Full spec: [CLAUDE.md](CLAUDE.md).

## How it works

```
Find funding ──► Scout agent ──► Fit & Eligibility agent (one per candidate) ──► Apply / Maybe / Skip
                                                                                     │
Open an Apply card ──► Drafter agent ──► draft with highlighted assumptions ◄────────┘

Run weekly scan now ──► scan ──► n8n automation ──► calendar events ──► digest email ──► steps logged back
```

**Three AI agents** (Claude, `claude-sonnet-5-5`, tool use), each a loop that picks its own next step and logs it to the on-screen activity log:

| Agent | Tools | Decides |
|---|---|---|
| **Scout** | hand-checked CU funding library, Grants.gov search, web search | which searches to run, when results are too thin and it should search again, which candidates are worth passing on |
| **Fit & Eligibility** | reads the source page, or the official Grants.gov listing | hard eligibility (registered student org? 501(c)(3) required? geography?), fit score, and an Apply / Maybe / Skip verdict with plain-language reasons |
| **Drafter** | reads the source page | the draft type (CU funding request / grant application / sponsor pitch), what to reuse from the profile, and what the club must supply |

**Profile and confirmed facts:** each organization has a profile page (add new clubs or nonprofits from the club picker). On a Maybe or Skip card, the treasurer can answer an eligibility flag with **We meet this** and a reason; the answer is saved to the profile as a confirmed fact, and **Re-check this opportunity** runs the Fit agent again with it. Every agent reads confirmed facts on every scan, so one answer helps with future opportunities too.

**Automation (n8n, separate from the agents):** when a weekly scan finishes, FundScout posts the Apply matches to an n8n webhook. n8n checks for deadlines, adds each deadline and a 2-week reminder to Google Calendar, emails the digest from Gmail, and posts each step back to `/api/automation-log`, which shows it in the activity log. The workflow export is in [automation/n8n-workflow.json](automation/n8n-workflow.json).

## Guardrails

- Every opportunity links to its original source, and only links that came from a real search result are kept.
- Deadlines show "verify on source" until a person confirms them.
- Drafts use only facts from the club profile. Guesses are highlighted, and missing facts are listed for the human to supply.
- FundScout never submits anything; a person always does.
- Every scan and digest lists the sources that were checked.

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

**Database (Supabase):** create a project, then in the SQL Editor run `supabase/schema.sql` and then `supabase/seed.sql`. (Existing databases: run the files in `supabase/migrations/` in order.) Put the Project URL and the `service_role` key in `.env` and in Netlify's environment variables.

**Deploy (Netlify):** import this repo in Netlify; `netlify.toml` sets the build. Add `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `N8N_WEBHOOK_URL` as environment variables, then check `/api/health`.

**Automation (n8n):** import `automation/n8n-workflow.json`, connect Google Calendar and Gmail, put the digest recipient in step 3, publish the workflow, and set its production webhook URL as `N8N_WEBHOOK_URL`.
