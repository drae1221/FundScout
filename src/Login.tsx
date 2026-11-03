import { useState } from "react";
import { sendLoginLink } from "./auth";

// Login page: enter your email, get a one-time login link. No passwords.
export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendLoginLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

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
      </header>
      <section className="panel login">
        <h2>Log in</h2>
        {sent ? (
          <p>
            Check <b>{email}</b> for a login link from Supabase and open it in this browser. You can close this tab.
          </p>
        ) : (
          <form onSubmit={submit} className="fact-form">
            <p className="hint">Club officers log in with their email. We'll send a one-time link, so there's no password.</p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@colorado.edu" autoComplete="email" />
            <button className="primary" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Email me a login link"}
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        <p className="hint">
          Just looking? <a href="/?demo">Watch the cached demo run</a> (no login needed).
        </p>
      </section>
    </div>
  );
}
