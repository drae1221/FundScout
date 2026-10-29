# FundScout — Project Spec

> **For Claude Code:** Read this whole file before doing anything. The person building this is a beginner. Explain what you're about to do in plain language before each step, keep changes small, test after each milestone, and commit to git when something works. Ask before adding any library or service not listed here.

---

## 1. What FundScout is

**One line:** FundScout finds the funding your club didn't know existed.

**User:** The exec member responsible for a student club's finances (usually the treasurer, but each club chooses who gets it). Secondary user: small nonprofits (1–10 staff, no grant writer) — same engine, mentioned in the pitch but not in the demo.

**Problem:** Student clubs mostly use one funding source (CU event funding, mostly for food). CU gives $1.4M+ a year to student orgs through several separate funds (CUSG boards, college student governments, departments; events / operational / travel), plus there are outside grants and corporate sponsors. Nobody on an exec board has time to find it, and knowledge is lost every year when officers change.

**What it does:**
1. Club fills in a profile once (or pastes a link and FundScout drafts the profile).
2. Three AI agents find opportunities, decide which are worth pursuing, and draft the request.
3. A separate n8n automation saves matches, adds deadlines to a calendar, and emails a digest.

**Context:** Capstone project for CU Boulder Applied AI Development Program. Presentation Tuesday Nov 3, 2026. **Target: fully working by Sunday Nov 1 night.**

### Course requirements this must meet
- **≥3 AI agents**, each receives a task, independently runs multiple steps, and uses an LLM to make decisions. Not a chatbot.
- **≥1 automation**, separate from the agents, ≥3 distinct steps, runs from a trigger/schedule/event.
- **Usable product** where agents, automation, and UI work together.
- **Deployed to a live URL** (Netlify) + **GitHub repo**.

---

## 2. Stack

| Piece | Tool |
|---|---|
| Frontend + hosting | Netlify (static site, simple React via Vite is fine) |
| Backend / agents | Netlify Functions (Node/TypeScript) |
| LLM | Claude API, model `claude-sonnet-5-5`, using tool use |
| Database | Supabase (Postgres) |
| Automation | n8n Cloud (webhook-triggered workflow) |
| Email | Sent from n8n (Gmail or SMTP node) |
| Calendar | Created from n8n (Google Calendar node) |

Keep it simple. No auth/login for the demo — one hardcoded club is fine (multi-club support is a nice-to-have). No Snowflake.

### Environment variables (never commit these)
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
N8N_WEBHOOK_URL=
```

---

## 3. Data model (Supabase)

**orgs**
- id, name, type (`student_club` | `nonprofit`), university, member_count
- is_registered_student_org (bool), is_501c3 (bool), has_nonprofit_partner (bool)
- mission (text), activities (text)
- funding_goals (text), target_amount (number)
- past_wins (text) — events, attendance, competitions, community impact
- industry_ties (text[]) — e.g. `["accounting"]`, `["finance","trading"]`, `["AI","software"]`
- funding_contacts (text[]) — emails that get the digest

**funding_library** (hand-curated sources, the Scout checks these first)
- id, name, provider, type (`university` | `grant` | `sponsor` | `award` | `competition`)
- funding_category (`events` | `operational` | `travel` | `general`)
- eligibility_notes, typical_amount, deadline_notes, url

**opportunities** (results of a scan)
- id, org_id, source (`library` | `grants_gov` | `web` | `pasted`), library_id (nullable)
- title, provider, url, amount, deadline, deadline_verified (bool, default false)
- verdict (`apply` | `maybe` | `skip`), fit_score (0–100), reasons (text), eligibility_flags (text[])
- status (`new` | `in_progress` | `submitted` | `dismissed`), scan_id, created_at

**drafts**
- id, opportunity_id, draft_type (`cu_funding_request` | `grant_application` | `sponsor_pitch`)
- content (markdown), assumptions (text[]) — anything the agent guessed, shown highlighted
- missing_items (text[]) — things the human must supply

**scans**
- id, org_id, started_at, finished_at, sources_checked (text[]), counts (json)

**activity_log**
- id, scan_id, step, message, created_at — shown on screen during the demo

---

## 4. The three agents

Each agent is a Netlify Function that runs a Claude tool-use loop. Each one must make real decisions, log its steps to `activity_log`, and return structured JSON.

### Agent 1 — Scout
- **Input:** org profile
- **Goal:** find candidate funding opportunities across all source types
- **Tools:** `query_funding_library(filters)`, `search_grants_gov(keyword)`, `web_search(query)`
- **Decides:** which search queries to run, whether results are thin and it should try new keywords, which candidates are plausible enough to pass on
- **Output:** list of candidate opportunities (10–20 max)
- **Limits:** cap at ~8 tool calls so it stays fast

**Grants.gov:** `POST https://api.grants.gov/v1/api/search2` — public, no API key. Mostly relevant for nonprofit profiles.

### Agent 2 — Fit & Eligibility
- **Input:** org profile + one candidate opportunity
- **Goal:** decide whether the club should pursue it
- **Tools:** `fetch_opportunity_details(url)` (read the full page/listing)
- **Decides:**
  - Hard eligibility (registered student org? 501(c)(3) required? geography? cost-share?)
  - Fit score and effort vs. reward
  - Verdict: **apply / maybe / skip**, with plain-language reasons
- **Output:** verdict, fit_score, reasons, eligibility_flags, deadline (with `deadline_verified = false`)
- **Key demo behavior:** a grant requiring 501(c)(3) must get **Skip** for a student club with the reason stated.

### Agent 3 — Drafter
- **Input:** org profile + one "apply" opportunity + its details
- **Goal:** produce the right first draft
- **Decides:** which draft type fits (CU funding request / grant application / sponsor pitch), what to reuse from the profile, what to write new, what to ask the human for
- **Output:** draft content, `assumptions[]`, `missing_items[]`, requirements checklist
- **Hard rule:** only use facts from the profile. Anything not in the profile goes in `assumptions` and is visibly highlighted in the UI. Never invent numbers.

### Profile auto-fill (nice-to-have, cut first if behind)
Paste a club website/Instagram/org page link → LLM drafts the profile fields → user confirms/edits before saving.

---

## 5. The automation (n8n) — separate from the agents

**Trigger:** FundScout POSTs to `N8N_WEBHOOK_URL` when a scan finishes. (Also add a weekly Schedule trigger in n8n for real use.) The UI has a **"Run weekly scan now"** button for the demo.

**Webhook payload:**
```json
{
  "scan_id": "...",
  "org_name": "...",
  "funding_contacts": ["..."],
  "apply_opportunities": [
    { "title": "...", "provider": "...", "amount": "...", "deadline": "YYYY-MM-DD", "url": "...", "app_link": "..." }
  ],
  "sources_checked": ["CU funding library", "Grants.gov", "Web search"]
}
```

**Steps:**
1. Filter to new "apply" opportunities
2. Create a calendar event for each deadline (+ reminder 2 weeks before)
3. Send the digest email to funding contacts (top matches, links back to FundScout, a "sources checked this week" line)
4. POST back to FundScout to write each step to `activity_log` so it shows on screen

Build the workflow in n8n's editor; export the workflow JSON into the repo at `/automation/n8n-workflow.json`.

> n8n trial ends ~Nov 10. After the demo, port this workflow to a Netlify Scheduled Function so it keeps running for free.

---

## 6. Pages

1. **Profile** — form for all org fields (+ optional "paste a link to auto-fill")
2. **Pipeline / Dashboard** — "Find funding" and "Run weekly scan now" buttons; three columns **Apply / Maybe / Skip** with cards (title, provider, amount, deadline, fit score, short reason); live activity log panel
3. **Opportunity detail** — full reasons, eligibility flags, link to original source, "deadline: verify on source" badge until confirmed, the draft with assumptions highlighted and missing items listed, buttons: Mark in progress / Mark submitted / Dismiss

Clean, simple, readable. Works on a laptop projector.

---

## 7. Guardrails (these are on the presentation's trust slide — they must exist in the product)

- Every opportunity links to its **original source**
- Deadlines show **"verify on source"** until a human confirms
- Drafts **highlight assumptions** and list missing items; no invented facts
- **FundScout never submits anything.** A human always submits.
- Digest shows **which sources were checked**

---

## 8. Seed data

### Demo orgs
- **AI Club** (primary demo org) — CU Boulder RSO, not 501(c)(3), industry ties: AI, software
- **Leeds Investment & Trading Group** — finance, trading
- **Beta Alpha Psi** — accounting
- One sample **small Boulder nonprofit** (for testing the Skip-vs-Apply difference)

Fill in real details from the club officers; use clear placeholders until then.

### Funding library — starter entries (verify each on its official page before the demo)
- CU Center for Student Involvement / CUSG funding — **Events** (one-off events for the campus community)
- CU CSI / CUSG funding — **Operational** (day-to-day activities, meetings, recruitment)
- CU CSI / CUSG funding — **Travel** (travel that furthers the org's mission)
- Arts & Sciences Student Government — up to $1,000/semester for eligible A&S-affiliated RSOs via a funding hearing
- Leeds School of Business student government / school funding — TODO: confirm if it exists
- Department funds relevant to each club — TODO
- Beta Alpha Psi national chapter awards/funding — TODO: confirm
- Colorado community foundation grants — TODO
- Corporate sponsors: companies on the CU career fair employer list, matched by industry — TODO: build list
- Student competitions / conference travel scholarships — TODO

All CU funding requests are submitted through **BuffConnect**.

---

## 9. Build order (milestones)

| When | Milestone | Done when |
|---|---|---|
| Thu | Setup | Repo on GitHub, Netlify deploy of a placeholder page, Supabase tables created, seed data loaded |
| Fri | Scout + Fit agents | Clicking "Find funding" for the AI Club fills Apply/Maybe/Skip with reasons; activity log updates |
| Sat | Drafter + pages | Opportunity detail page shows a draft with highlighted assumptions |
| Sun | Automation + polish | "Run weekly scan now" → n8n → calendar event + email arrive; full flow works on the live URL for all 3 clubs |
| Mon | Buffer | Slides, rehearsal, save a cached demo run as backup |

### Must-have vs. nice-to-have
- **Must:** profile, 3 agents, pipeline, detail/draft page, n8n automation with visible log, live URL, guardrails above
- **Nice (cut in this order):** profile auto-fill from link → sponsor discovery from career-fair list → multiple clubs / login

---

## 10. Demo (90 seconds)

| Time | Beat |
|---|---|
| 0:00–0:15 | Show the AI Club profile (or paste link → auto-fill) |
| 0:15–0:50 | "Find funding" → agents run, activity log streams, pipeline fills with Apply/Maybe/Skip |
| 0:50–1:15 | Open an "Apply" card (e.g. CU travel funding) → show draft with highlighted assumptions |
| 1:15–1:30 | "Run weekly scan now" → n8n log steps → calendar event + digest email arrive in another tab |

**Must support:** a "load cached demo run" option so the demo works even if the live agents are slow or the Wi-Fi fails.
