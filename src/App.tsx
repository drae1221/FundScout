import { useCallback, useEffect, useRef, useState } from "react";

interface Org {
  id: string;
  name: string;
  type: string;
}

interface Opportunity {
  id: string;
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
}

interface LogLine {
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
  { key: "apply", label: "Apply" },
  { key: "maybe", label: "Maybe" },
  { key: "skip", label: "Skip" },
] as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [data, setData] = useState<ScanData>(EMPTY);
  const [activeScanId, setActiveScanId] = useState<string | null>(null); // set while a scan runs
  const [error, setError] = useState<string | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getJson<Org[]>("/api/orgs")
      .then((list) => {
        setOrgs(list);
        setOrgId(list[0]?.id ?? "");
      })
      .catch(() => setError("Couldn't load clubs. Is the backend running?"));
  }, []);

  // Show the latest scan whenever the selected club changes.
  useEffect(() => {
    if (!orgId) return;
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
    if (d.scan && d.scan.status !== "running") setActiveScanId(null);
  }, []);

  useEffect(() => {
    if (!activeScanId) return;
    const timer = setInterval(() => poll(activeScanId).catch(() => {}), 1500);
    return () => clearInterval(timer);
  }, [activeScanId, poll]);

  useEffect(() => logEnd.current?.scrollIntoView({ block: "nearest" }), [data.log.length]);

  async function findFunding() {
    setError(null);
    const scanId = crypto.randomUUID();
    setData(EMPTY);
    setActiveScanId(scanId);
    const res = await fetch("/.netlify/functions/scan-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, scan_id: scanId }),
    });
    if (!res.ok) {
      setActiveScanId(null);
      setError(`Couldn't start the scan (${res.status})`);
    }
  }

  const running = activeScanId !== null;
  const club = data.opportunities.filter((o) => o.audience === "club");
  const members = data.opportunities.filter((o) => o.audience === "members" && o.verdict !== "skip");

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>FundScout</h1>
          <p className="tagline">Finds the funding your club didn't know existed.</p>
        </div>
        <div className="controls">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={running} aria-label="Club">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className="primary" onClick={findFunding} disabled={!orgId || running}>
            {running ? "Scanning…" : "Find funding"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {data.scan?.status === "failed" && <p className="error">Scan failed: {data.scan.error}</p>}

      <main className="layout">
        <section>
          <div className="columns">
            {VERDICTS.map(({ key, label }) => {
              const items = club.filter((o) => o.verdict === key);
              return (
                <div key={key} className={`column column-${key}`}>
                  <h2>
                    {label} <span className="count">{items.length}</span>
                  </h2>
                  {items.map((o) => (
                    <OpportunityCard key={o.id} o={o} />
                  ))}
                  {items.length === 0 && <p className="empty">{running ? "Waiting for results…" : "Nothing here yet."}</p>}
                </div>
              );
            })}
          </div>

          <div className="members">
            <h2>
              For members <span className="count">{members.length}</span>
            </h2>
            <p className="hint">Scholarships, travel awards and competitions your members can apply for. Share these with the club.</p>
            <div className="member-grid">
              {members.map((o) => (
                <OpportunityCard key={o.id} o={o} showVerdict />
              ))}
            </div>
            {members.length === 0 && <p className="empty">{running ? "Waiting for results…" : "Nothing here yet."}</p>}
          </div>
        </section>

        <aside className="log">
          <h2>Activity</h2>
          {data.log.length === 0 && <p className="empty">{running ? "Starting…" : "Click “Find funding” to start a scan."}</p>}
          <ol>
            {data.log.map((l, i) => (
              <li key={i}>
                <span className={`step step-${l.step.toLowerCase()}`}>{l.step}</span> {l.message}
              </li>
            ))}
          </ol>
          <div ref={logEnd} />
          {data.scan?.sources_checked?.length ? (
            <p className="sources">Sources checked: {data.scan.sources_checked.join(", ")}</p>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

function OpportunityCard({ o, showVerdict = false }: { o: Opportunity; showVerdict?: boolean }) {
  return (
    <article className="card">
      <div className="card-head">
        <a href={o.url} target="_blank" rel="noreferrer" className="card-title">
          {o.title} ↗
        </a>
        <span className="score" title="Fit score">
          {o.fit_score}
        </span>
      </div>
      {o.provider && <p className="provider">{o.provider}</p>}
      <p className="meta">
        {showVerdict && <span className={`badge badge-${o.verdict}`}>{o.verdict}</span>}
        {o.amount && <span>{o.amount}</span>}
        <span>
          Deadline: {o.deadline ?? "see source"}
          {!o.deadline_verified && <span className="badge badge-verify">verify on source</span>}
        </span>
      </p>
      <p className="reason">{o.reasons}</p>
      {o.eligibility_flags.length > 0 && (
        <p className="flags">
          {o.eligibility_flags.map((f) => (
            <span key={f} className="flag">
              {f}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
