import { useEffect, useState } from "react";

// Placeholder page for the Thursday "Setup" milestone.
// It also pings /api/health so we can see that Netlify Functions are working.
export default function App() {
  const [backend, setBackend] = useState("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => setBackend(data.ok ? "connected ✓" : "not ok"))
      .catch(() => setBackend("not reachable (normal when running plain `npm run dev`)"));
  }, []);

  return (
    <main className="page">
      <h1>FundScout</h1>
      <p className="tagline">Finds the funding your club didn't know existed.</p>
      <p>Coming soon: club profile, Apply / Maybe / Skip pipeline, and drafted funding requests.</p>
      <p className="status">Backend: {backend}</p>
    </main>
  );
}
