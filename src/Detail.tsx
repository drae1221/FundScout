import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { LogLine, Opportunity } from "./App";

interface Draft {
  id: string;
  draft_type: "cu_funding_request" | "grant_application" | "sponsor_pitch";
  content: string;
  assumptions: string[];
  missing_items: string[];
}

interface DetailData {
  opportunity: Opportunity;
  org: { id: string; name: string } | null;
  draft: Draft | null;
  log: LogLine[];
}

const DRAFT_TYPES = {
  cu_funding_request: "CU funding request",
  grant_application: "Grant application",
  sponsor_pitch: "Sponsor pitch",
};

const STATUS_LABELS = { new: "New", in_progress: "In progress", submitted: "Submitted", dismissed: "Dismissed" };

export default function Detail({ id }: { id: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // While drafting: the draft id and log length from before we started, to spot the new result.
  const [drafting, setDrafting] = useState<{ draftId: string | null; logLength: number } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/opportunity?id=${id}`);
    if (!res.ok) throw new Error(`Couldn't load this opportunity (${res.status})`);
    const d: DetailData = await res.json();
    setData(d);
    return d;
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (!drafting) return;
    const timer = setInterval(async () => {
      const d = await load().catch(() => null);
      if (!d) return;
      const newLines = d.log.slice(drafting.logLength);
      const failed = newLines.find((l) => l.message.startsWith("Couldn't"));
      if ((d.draft && d.draft.id !== drafting.draftId) || failed) {
        setDrafting(null);
        if (failed) setError(failed.message);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [drafting, load]);

  async function writeDraft() {
    if (!data) return;
    setError(null);
    setDrafting({ draftId: data.draft?.id ?? null, logLength: data.log.length });
    const res = await fetch("/.netlify/functions/draft-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity_id: id }),
    });
    if (!res.ok) {
      setDrafting(null);
      setError(`Couldn't start the Drafter (${res.status})`);
    }
  }

  async function update(changes: { status?: string; deadline_verified?: boolean }) {
    setError(null);
    const res = await fetch("/api/opportunity-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    if (!res.ok) return setError(`Couldn't save (${res.status})`);
    const opportunity: Opportunity = await res.json();
    setData((d) => (d ? { ...d, opportunity } : d));
  }

  if (!data) {
    return (
      <div className="app">
        <a href="#/" className="back">← Back to pipeline</a>
        {error ? <p className="error">{error}</p> : <p className="empty">Loading…</p>}
      </div>
    );
  }

  const o = data.opportunity;
  const d = data.draft;
  const sinceStart = drafting ? data.log.slice(drafting.logLength) : [];
  const { draftText, requirements } = splitChecklist(d?.content ?? "");

  return (
    <div className="app detail">
      <a href="#/" className="back">← Back to pipeline</a>

      <header className="detail-head">
        <div>
          <p className="provider">{data.org?.name} · {o.provider}</p>
          <h1 className="detail-title">{o.title}</h1>
          <p className="meta">
            <span className={`badge badge-${o.verdict}`}>{o.verdict}</span>
            <span>Fit score {o.fit_score}</span>
            {o.amount && <span>{o.amount}</span>}
            <span>Status: {STATUS_LABELS[o.status]}</span>
          </p>
        </div>
        <div className="controls">
          <button onClick={() => update({ status: "in_progress" })} disabled={o.status === "in_progress"}>Mark in progress</button>
          <button onClick={() => update({ status: "submitted" })} disabled={o.status === "submitted"}>Mark submitted</button>
          <button onClick={() => update({ status: "dismissed" })} disabled={o.status === "dismissed"}>Dismiss</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="detail-grid">
        <section className="panel">
          <h2>Why FundScout thinks so</h2>
          <p>{o.reasons}</p>
          {o.eligibility_flags.length > 0 && (
            <p className="flags">
              {o.eligibility_flags.map((f) => <span key={f} className="flag">{f}</span>)}
            </p>
          )}
          <h2>Deadline</h2>
          <p>
            {o.deadline ?? "Not stated. Check the source."}
            {o.deadline_verified ? (
              <span className="badge badge-apply">verified</span>
            ) : (
              <span className="badge badge-verify">verify on source</span>
            )}
          </p>
          {!o.deadline_verified && (
            <button onClick={() => update({ deadline_verified: true })}>I checked the deadline on the source</button>
          )}
          <h2>Original source</h2>
          <p><a href={o.url} target="_blank" rel="noreferrer">{o.url} ↗</a></p>
          <p className="hint">FundScout never submits anything. You review the draft and submit it yourself.</p>
        </section>

        <section className="panel draft">
          <div className="draft-head">
            <h2>{d ? `Draft: ${DRAFT_TYPES[d.draft_type]}` : "Draft"}</h2>
            <button className="primary" onClick={writeDraft} disabled={drafting !== null}>
              {drafting ? "Writing…" : d ? "Rewrite draft" : "Write draft"}
            </button>
          </div>

          {drafting && (
            <ol className="mini-log">
              {sinceStart.length === 0 && <li>Starting the Drafter agent…</li>}
              {sinceStart.map((l, i) => <li key={i}><span className="step step-drafter">Drafter</span> {l.message}</li>)}
            </ol>
          )}

          {!d && !drafting && (
            <p className="empty">No draft yet. The Drafter agent reads the source page and writes a first draft using only your club profile.</p>
          )}

          {d && (
            <>
              <p className="legend">
                <mark className="assumed">Highlighted</mark> = the agent's assumption, so check it.{" "}
                <mark className="missing">Red</mark> = you need to fill this in.
              </p>
              <div className="draft-body">{renderMarkdown(draftText)}</div>

              {d.missing_items.length > 0 && <ListBlock title="You need to supply" items={d.missing_items} className="missing-list" />}
              {d.assumptions.length > 0 && <ListBlock title="Assumptions to check" items={d.assumptions} className="assumed-list" />}
              {requirements.length > 0 && <ListBlock title="Requirements checklist" items={requirements} checklist />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ListBlock({ title, items, className, checklist }: { title: string; items: string[]; className?: string; checklist?: boolean }) {
  return (
    <div className={`list-block ${className ?? ""}`}>
      <h3>{title}</h3>
      <ul className={checklist ? "checklist" : undefined}>
        {items.map((item, i) => (
          <li key={i}>{checklist ? <label><input type="checkbox" /> {item}</label> : item}</li>
        ))}
      </ul>
    </div>
  );
}

// The Drafter saves the requirements checklist at the end of the draft; show it separately.
function splitChecklist(content: string) {
  const [draftText, checklist = ""] = content.split(/\n## Requirements checklist\n/);
  const requirements = checklist.split("\n").map((l) => l.replace(/^- \[ \]\s*/, "").trim()).filter(Boolean);
  return { draftText, requirements };
}

// A tiny Markdown renderer: headings, bullet lists, tables, paragraphs, **bold**,
// plus the Drafter's [[ASSUMED: ...]] and [[MISSING: ...]] markers.
function renderMarkdown(md: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    if (table.length) {
      const [head, ...rows] = table;
      blocks.push(
        <table key={blocks.length}>
          <thead><tr>{head.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      );
    }
    para = [];
    list = [];
    table = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (line.startsWith("|")) {
      if (para.length || list.length) flush();
      const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!cells.every((c) => /^:?-+:?$/.test(c))) table.push(cells); // skip the |---| divider row
    } else if (table.length) {
      flush();
    }
    if (line.startsWith("|")) continue;
    if (!line) flush();
    else if (heading) {
      flush();
      const Tag = heading[1].length === 1 ? "h3" : "h4";
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
    } else if (bullet) {
      if (para.length) flush();
      list.push(bullet[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\[\[(?:ASSUMED|MISSING):[^\]]*\]\]|\*\*[^*]+\*\*)/g).map((part, i) => {
    const marker = part.match(/^\[\[(ASSUMED|MISSING):\s*([^\]]*)\]\]$/);
    if (marker) {
      return marker[1] === "MISSING" ? (
        <mark key={i} className="missing" title="You need to fill this in">{marker[2]}</mark>
      ) : (
        <mark key={i} className="assumed" title="Assumption: not in the profile, so check it">{marker[2]}</mark>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
