import { useCallback, useEffect, useRef, useState } from "react";
import Detail from "./Detail";
import Profile from "./Profile";
import { DEMO_MODE, loadDemoRun, replay } from "./demo";

interface Org {
  id: string;
  name: string;
  type: string;
}

export interface Opportunity {
  id: string;
  org_id: string;
  audience: "club" | "members";
  title: string;
  provider: string | null;
  url: string;
  amount: string | null;
  deadline: string | null;
  deadline_verified: boolean;
  verdict: "apply" | "maybe" | "skip";
  fit_score: number;
  reasons: string;
  eligibility_flags: string[];
  status: "new" | "in_progress" | "submitted" | "dismissed";
}

export interface LogLine {
  step: string;
  message: string;
  created_at: string;
}

interface ScanData {
  scan: { id: string; status: "running" | "done" | "failed"; sources_checked: string[]; error: string | null } | null;
  log: LogLine[];
  opportunities: Opportunity[];
}

const EMPTY: ScanData = { scan: null, log: [], opportunities: [] };
const VERDICTS = [
  { key: "apply", label: "Apply", hint: "Worth pursuing" },
  { key: "maybe", label: "Maybe", hint: "Check a detail first" },
  { key: "skip", label: "Skip", hint: "Not a fit, and why" },
] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

// Simple hash routes: "#/" is the pipeline, "#/opportunity/<id>" is the detail page,
// "#/profile/<id>" (or "#/profile/new") is the profile page.
function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return {
    opportunityId: hash.match(/^#\/opportunity\/([0-9a-f-]+)$/)?.[1] ?? null,
    profileId: hash.match(/^#\/profile\/([0-9a-f-]+|new)$/)?.[1] ?? null,
  };
}

export default function App() {
  const { opportunityId, profileId } = useRoute();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [data, setData] = useState<ScanData>(EMPTY);
  const [activeScanId, setActiveScanId] = useState<string | null>(null); // set while a scan runs
  const [error, setError] = useState<string | null>(null);
  const logPanel = useRef<HTMLElement>(null);
  const [demoSavedAt, setDemoSavedAt] = useState<string | null>(null);
  // After a weekly scan finishes, keep refreshing for a while so n8n's steps show up.
  const [weeklyScanId, setWeeklyScanId] = useState<string | null>(null);
  const [automationUntil, setAutomationUntil] = useState(0);

  useEffect(() => {
    if (DEMO_MODE) {
      loadDemoRun()
        .then((run) => {
          setOrgs([run.org]);
          setOrgId(run.org.id);
          setDemoSavedAt(run.saved_at);
        })
        .catch((e) => setError(e.message));
      return;
    }
    loadOrgs();
  }, []);

  function loadOrgs(select?: string) {
    getJson<Org[]>("/api/orgs")
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => select ?? (current || list[0]?.id || ""));
      })
      .catch(() => setError("Couldn't load clubs. Is the backend running?"));
  }

  // Coming back from the profile page: names may have changed.
  useEffect(() => {
    if (!profileId && !DEMO_MODE && orgs.length) loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  function chooseOrg(value: string) {
    if (value === "__new") window.location.hash = "#/profile/new";
    else setOrgId(value);
  }

  // Show the latest scan whenever the selected club changes.
  useEffect(() => {
    if (!orgId || DEMO_MODE) return; // the demo starts with an empty board
    setActiveScanId(null);
    getJson<ScanData>(`/api/scan-status?org_id=${orgId}`)
      .then((d) => {
        setData(d);
        if (d.scan?.status === "running") setActiveScanId(d.scan.id);
      })
      .catch((e) => setError(e.message));
  }, [orgId]);

  // While a scan runs, poll for new log lines and results.
  const poll = useCallback(async (scanId: string) => {
    const d = await getJson<ScanData>(`/api/scan-status?scan_id=${scanId}`);
    setData(d);
    if (d.scan && d.scan.status !== "running") {
      setActiveScanId(null);
      if (scanId === weeklyScanId) setAutomationUntil(Date.now() + 90_000);
    }
  }, [weeklyScanId]);

  useEffect(() => {
    if (!automationUntil || !weeklyScanId) return;
    const timer = setInterval(() => {
      if (Date.now() > automationUntil) {
        setAutomationUntil(0);
        setWeeklyScanId(null);
        return;
      }
      getJson<ScanData>(`/api/scan-status?scan_id=${weeklyScanId}`).then(setData).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [automationUntil, weeklyScanId]);

  useEffect(() => {
    if (!activeScanId || DEMO_MODE) return; // the demo replays from the saved file instead
    const timer = setInterval(() => poll(activeScanId).catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, [activeScanId, poll]);

  // Keep the newest log line in view (scrolls the panel only, not the page).
  useEffect(() => {
    const panel = logPanel.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [data.log.length]);

  async function replayDemo() {
    const run = await loadDemoRun();
    setData(EMPTY);
    setActiveScanId(run.scan.id);
    // A Fit verdict line ("APPLY (85): title") is when that card appears.
    replay(run.log, (line, i) => {
      const verdict = line.step === "Fit" && line.message.match(/^(?:APPLY|MAYBE|SKIP) \(\d+\): (.*)$/);
      const card = verdict ? run.opportunities.find((o) => o.title === verdict[1]) : undefined;
      setData((d) => ({
        ...d,
        log: [...d.log, line],
        opportunities: card ? [...d.opportunities, card] : d.opportunities,
      }));
      if (i === run.log.length - 1) {
        setData((d) => ({ ...d, scan: run.scan }));
        setActiveScanId(null);
      }
    });
  }

  // weekly = what the scheduled scan does: scan, then hand the results to the n8n automation.
  async function findFunding(weekly = false) {
    setError(null);
    if (DEMO_MODE) return replayDemo();
    const scanId = crypto.randomUUID();
    setData(EMPTY);
    setAutomationUntil(0);
    setWeeklyScanId(weekly ? scanId : null);
    setActiveScanId(scanId);
    const res = await fetch("/.netlify/functions/scan-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, scan_id: scanId, weekly }),
    });
    if (!res.ok) {
      setActiveScanId(null);
      setError(`Couldn't start the scan (${res.status})`);
    }
  }

  const running = activeScanId !== null;
  if (opportunityId) return <Detail id={opportunityId} />;
  if (profileId) {
    return (
      <Profile
        key={profileId}
        id={profileId}
        onSaved={(newId) => {
          loadOrgs(newId);
          window.location.hash = "#/";
        }}
      />
    );
  }
  const club = data.opportunities.filter((o) => o.audience === "club");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">$</span>
          <div>
            <h1>FundScout</h1>
            <p className="tagline">Finds the funding your club didn't know existed.</p>
          </div>
        </div>
        <div className="controls">
          <select value={orgId} onChange={(e) => chooseOrg(e.target.value)} disabled={running} aria-label="Club">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {!DEMO_MODE && <option value="__new">+ Add organization…</option>}
          </select>
          {!DEMO_MODE && orgId && (
            <a className="button-link" href={`#/profile/${orgId}`}>
              Edit profile
            </a>
          )}
          {!DEMO_MODE && (
            <button onClick={() => findFunding(true)} disabled={!orgId || running} title="Scan, then email the digest and add deadlines to the calendar">
              Run weekly scan now
            </button>
          )}
          <button className="primary" onClick={() => findFunding()} disabled={!orgId || running}>
            {running ? "Scanning…" : "Find funding"}
          </button>
        </div>
      </header>

      {DEMO_MODE && (
        <p className="demo-banner">
          Cached demo run{demoSavedAt ? ` saved ${new Date(demoSavedAt).toLocaleString()}` : ""}: replaying a real
          scan without calling the agents. <a href="/">Switch to live</a>
        </p>
      )}
      {(running || data.scan) && (
        <div className="summary">
          <span className={`pill ${running ? "pill-live" : "pill-done"}`}>{running ? "Scanning" : "Last scan"}</span>
          <span>
            <b>{club.length}</b> opportunities checked · <b>{club.filter((o) => o.verdict === "apply").length}</b> worth applying
          </span>
          {data.scan?.sources_checked?.length ? (
            <span className="summary-sources">Sources: {data.scan.sources_checked.join(" · ")}</span>
          ) : null}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {data.scan?.status === "failed" && <p className="error">Scan failed: {data.scan.error}</p>}

      <main className="layout">
        <section>
          <div className="columns">
            {VERDICTS.map(({ key, label, hint }) => {
              const items = club.filter((o) => o.verdict === key);
              return (
                <div key={key} className={`column column-${key}`}>
                  <div className="column-head">
                    <h2>
                      <span className="dot" /> {label} <span className="count">{items.length}</span>
                    </h2>
                    <p>{hint}</p>
                  </div>
                  {items.map((o) => (
                    <OpportunityCard key={o.id} o={o} />
                  ))}
                  {items.length === 0 && <p className="empty">{running ? "Waiting for results…" : "Nothing here yet."}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="log" ref={logPanel}>
          <h2>
            Agent activity {running && <span className="live-dot" title="Live" />}
          </h2>
          {data.log.length === 0 && <p className="empty">{running ? "Starting…" : "Click “Find funding” to start a scan."}</p>}
          <ol>
            {data.log.map((l, i) => (
              <li key={i} className={/^Reading /.test(l.message) ? "quiet" : undefined}>
                <span className={`step step-${l.step.toLowerCase()}`}>{l.step}</span> {l.message}
              </li>
            ))}
          </ol>
          {data.scan?.sources_checked?.length ? (
            <p className="sources">Sources checked: {data.scan.sources_checked.join(", ")}</p>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

const STATUS_BADGES = { in_progress: "in progress", submitted: "submitted", dismissed: "dismissed" };

const MAX_FLAGS = 3;

function OpportunityCard({ o }: { o: Opportunity }) {
  const extraFlags = o.eligibility_flags.length - MAX_FLAGS;
  return (
    <article className={`card card-${o.verdict}${o.status === "dismissed" ? " card-dismissed" : ""}`}>
      <div className="card-head">
        <div>
          <a href={`#/opportunity/${o.id}`} className="card-title">
            {o.title}
          </a>
          {o.provider && <p className="provider">{o.provider}</p>}
        </div>
        <span className={`score score-${o.verdict}`} title="Fit score (0-100)">
          {o.fit_score}
        </span>
      </div>
      <div className="meta">
        {o.status !== "new" && <span className="badge badge-status">{STATUS_BADGES[o.status]}</span>}
        {o.amount && (
          <span className="amount" title={o.amount}>
            {o.amount}
          </span>
        )}
        <span className="deadline">
          Deadline: {o.deadline ?? "see source"}
          {!o.deadline_verified && <span className="badge badge-verify">verify on source</span>}
        </span>
      </div>
      <p className="reason">{o.reasons}</p>
      {o.eligibility_flags.length > 0 && (
        <p className="flags">
          {o.eligibility_flags.slice(0, MAX_FLAGS).map((f) => (
            <span key={f} className="flag">
              {f}
            </span>
          ))}
          {extraFlags > 0 && <span className="flag flag-more">+{extraFlags} more</span>}
        </p>
      )}
      <p className="card-links">
        <a href={`#/opportunity/${o.id}`}>{o.verdict === "apply" ? "Open & draft →" : "Details →"}</a>
        <a href={o.url} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </p>
    </article>
  );
}
