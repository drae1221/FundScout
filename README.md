# FundScout

Finds the funding your club didn't know existed. CU Boulder Applied AI capstone. Full spec: [CLAUDE.md](CLAUDE.md).

## Project layout

| Path | What it is |
|---|---|
| `src/` | The website (React + Vite) |
| `netlify/functions/` | Backend functions; the three agents go here |
| `supabase/schema.sql` | Creates the database tables |
| `supabase/seed.sql` | Loads demo clubs and the CU funding library |
| `automation/` | Exported n8n workflow (Sunday milestone) |

## Run locally

Needs Node.js 22+.

```bash
npm install
npm run dev
```

## Database setup (Supabase)

1. Create a project at supabase.com.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. New query → paste `supabase/seed.sql` → Run.
4. Project Settings → API: copy the Project URL and the `service_role` key into `.env` (and into Netlify's environment variables). Keep the service key secret.

## Deploy (Netlify)

Connect this GitHub repo in Netlify ("Add new site → Import an existing project"). `netlify.toml` already sets the build command, output folder, and functions folder. Check `https://<your-site>.netlify.app/api/health` after deploy.
