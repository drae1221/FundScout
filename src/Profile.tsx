import { useEffect, useState, type ReactNode } from "react";

export interface ConfirmedFact {
  requirement: string;
  answer: string;
  added_at: string;
  from_opportunity?: string | null;
}

interface OrgProfile {
  id?: string;
  name: string;
  type: "student_club" | "nonprofit";
  university: string;
  member_count: string;
  is_registered_student_org: boolean;
  is_501c3: boolean;
  has_nonprofit_partner: boolean;
  mission: string;
  activities: string;
  funding_goals: string;
  target_amount: string;
  past_wins: string;
  industry_ties: string;
  funding_contacts: string;
  confirmed_facts?: ConfirmedFact[];
}

const BLANK: OrgProfile = {
  name: "",
  type: "student_club",
  university: "CU Boulder",
  member_count: "",
  is_registered_student_org: true,
  is_501c3: false,
  has_nonprofit_partner: false,
  mission: "",
  activities: "",
  funding_goals: "",
  target_amount: "",
  past_wins: "",
  industry_ties: "",
  funding_contacts: "",
};

// Database row -> form fields (lists become comma-separated text).
function toForm(o: Record<string, any>): OrgProfile {
  return {
    ...BLANK,
    ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? ""])),
    member_count: o.member_count?.toString() ?? "",
    target_amount: o.target_amount?.toString() ?? "",
    industry_ties: (o.industry_ties ?? []).join(", "),
    funding_contacts: (o.funding_contacts ?? []).join(", "),
  };
}

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// Profile page: create an organization ("new") or edit one, plus its confirmed facts.
export default function Profile({ id, onSaved }: { id: string | "new"; onSaved: (orgId: string) => void }) {
  const [form, setForm] = useState<OrgProfile | null>(id === "new" ? BLANK : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (id === "new") return;
    fetch(`/api/org?id=${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Couldn't load this profile (${r.status})`))))
      .then((o) => setForm(toForm(o)))
      .catch((e) => setError(e.message));
  }, [id]);

  const set = <K extends keyof OrgProfile>(key: K, value: OrgProfile[K]) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const { confirmed_facts, ...fields } = form;
    const res = await fetch("/api/org-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        id: id === "new" ? undefined : id,
        industry_ties: splitList(form.industry_ties),
        funding_contacts: splitList(form.funding_contacts),
      }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? `Couldn't save (${res.status})`);
    setSaved(true);
    if (id === "new") onSaved(body.id);
  }

  async function changeFacts(change: { requirement: string; answer: string } | { remove: number }) {
    setError(null);
    const res = await fetch("/api/org-fact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: id, ...change }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? `Couldn't save the fact (${res.status})`);
    setForm((f) => (f ? { ...f, confirmed_facts: body } : f));
  }

  if (!form) {
    return (
      <div className="app">
        <a href="#/" className="back">← Back to pipeline</a>
        {error ? <p className="error">{error}</p> : <p className="empty">Loading…</p>}
      </div>
    );
  }

  const isNew = id === "new";
  const text = (key: keyof OrgProfile) => ({
    value: form[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  return (
    <div className="app detail profile">
      <a href="#/" className="back">← Back to pipeline</a>

      <header className="detail-head">
        <div>
          <p className="provider">{isNew ? "New organization" : "Organization profile"}</p>
          <h1 className="detail-title">{form.name || "Untitled organization"}</h1>
          <p className="hint">The agents read this profile on every scan. They only use facts written here, so the more specific it is, the better the matches and drafts.</p>
        </div>
        <div className="controls">
          {saved && <span className="saved-note">Saved ✓</span>}
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create organization" : "Save profile"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="detail-grid profile-grid">
        <section className="panel form">
          <h2>Basics</h2>
          <Field label="Name">
            <input {...text("name")} placeholder="e.g. AI Club" />
          </Field>
          <div className="row">
            <Field label="Type">
              <select value={form.type} onChange={(e) => set("type", e.target.value as OrgProfile["type"])}>
                <option value="student_club">Student club</option>
                <option value="nonprofit">Nonprofit</option>
              </select>
            </Field>
            <Field label="University">
              <input {...text("university")} placeholder="Leave blank for a nonprofit" />
            </Field>
            <Field label="Members">
              <input {...text("member_count")} inputMode="numeric" placeholder="e.g. 100" />
            </Field>
          </div>
          <div className="checks">
            <Check label="Registered student organization" checked={form.is_registered_student_org} onChange={(v) => set("is_registered_student_org", v)} />
            <Check label="501(c)(3) nonprofit" checked={form.is_501c3} onChange={(v) => set("is_501c3", v)} />
            <Check label="Has a nonprofit partner or fiscal sponsor" checked={form.has_nonprofit_partner} onChange={(v) => set("has_nonprofit_partner", v)} />
          </div>

          <h2>What you do</h2>
          <Field label="Mission">
            <textarea {...text("mission")} rows={3} placeholder="What the organization does and for whom" />
          </Field>
          <Field label="Activities">
            <textarea {...text("activities")} rows={3} placeholder="Meetings, events, attendance, projects" />
          </Field>
          <Field label="Past wins">
            <textarea {...text("past_wins")} rows={3} placeholder="Events, attendance numbers, competitions, partners" />
          </Field>
          <Field label="Industry ties" hint="Comma-separated">
            <input {...text("industry_ties")} placeholder="e.g. AI, software, G2" />
          </Field>

          <h2>Funding</h2>
          <Field label="What the money is for">
            <textarea {...text("funding_goals")} rows={3} placeholder="e.g. food at meetings, hardware, travel to a conference" />
          </Field>
          <div className="row">
            <Field label="Target amount ($)">
              <input {...text("target_amount")} inputMode="numeric" placeholder="e.g. 3000" />
            </Field>
            <Field label="Digest emails" hint="Comma-separated">
              <input {...text("funding_contacts")} placeholder="treasurer@example.com" />
            </Field>
          </div>
        </section>

        <section className="panel facts">
          <h2>Confirmed facts</h2>
          <p className="hint">
            Things your club has confirmed, often from a "We meet this" answer on an opportunity. Every agent treats these as true, so they help with
            every future scan.
          </p>
          {isNew ? (
            <p className="empty">Create the organization first, then add facts.</p>
          ) : (
            <>
              {(form.confirmed_facts ?? []).length === 0 && <p className="empty">No confirmed facts yet.</p>}
              <ul className="fact-list">
                {(form.confirmed_facts ?? []).map((f, i) => (
                  <li key={i}>
                    <div>
                      <b>{f.requirement}</b>
                      <p>{f.answer}</p>
                      {f.from_opportunity && <span className="hint">From: {f.from_opportunity}</span>}
                    </div>
                    <button className="link-button" onClick={() => changeFacts({ remove: i })} title="Remove this fact">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <FactForm onAdd={(requirement, answer) => changeFacts({ requirement, answer })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function FactForm({ onAdd, requirement: fixed, submitLabel = "Add fact" }: { onAdd: (requirement: string, answer: string) => Promise<void> | void; requirement?: string; submitLabel?: string }) {
  const [requirement, setRequirement] = useState(fixed ?? "");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!requirement.trim() || !answer.trim()) return;
    setBusy(true);
    await onAdd(requirement.trim(), answer.trim());
    setBusy(false);
    setAnswer("");
    if (!fixed) setRequirement("");
  }
  return (
    <div className="fact-form">
      {!fixed && <input value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="Requirement, e.g. Arts & Sciences affiliation" />}
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Yes, because… (e.g. our faculty advisor is in the Computer Science department)" />
      <button onClick={submit} disabled={busy || !requirement.trim() || !answer.trim()}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label} {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}
