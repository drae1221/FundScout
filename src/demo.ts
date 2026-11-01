// Cached demo run: open the site with ?demo to replay a saved scan from public/demo-run.json
// instead of calling the live agents (backup for slow Wi-Fi). Saved with `npm run save-demo`.
import type { LogLine, Opportunity } from "./App";
import type { Draft } from "./Detail";

export interface DemoRun {
  saved_at: string;
  org: { id: string; name: string; type: string };
  scan: { id: string; status: "done"; sources_checked: string[]; error: null };
  log: LogLine[];
  opportunities: Opportunity[];
  drafts: Record<string, Draft>;
  draftLogs: Record<string, LogLine[]>;
}

export const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");

let run: Promise<DemoRun> | null = null;
export function loadDemoRun(): Promise<DemoRun> {
  run ??= fetch("/demo-run.json").then((r) => {
    if (!r.ok) throw new Error(`Couldn't load the cached demo run (${r.status})`);
    return r.json();
  });
  return run;
}

// Drafts "written" during this demo, and status changes, kept in memory only.
export const demoDrafted = new Set<string>();
export const demoChanges: Record<string, Partial<Opportunity>> = {};

// Replays lines at the pace they really happened, sped up (each gap 0.3s to 2.5s).
export function replay<T extends LogLine>(lines: T[], onLine: (line: T, index: number) => void, speed = 3): () => void {
  const timers: number[] = [];
  let at = 0;
  lines.forEach((line, i) => {
    const gap = i === 0 ? 300 : (Date.parse(line.created_at) - Date.parse(lines[i - 1].created_at)) / speed;
    at += Math.min(2500, Math.max(300, gap));
    timers.push(window.setTimeout(() => onLine(line, i), at));
  });
  return () => timers.forEach(clearTimeout);
}
