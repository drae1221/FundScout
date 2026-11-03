/// <reference types="vite/client" />
import { useEffect, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

// Login with Supabase email links. The browser only gets the public "anon" key, which
// can't read any table (Row Level Security); all data goes through /api/ functions,
// which check the login token and club membership.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// PKCE: the email link comes back as ?code=..., which doesn't clash with the #/ page routes.
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { flowType: "pkce", detectSessionInUrl: true } }) : null;

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!supabase) return setReady(true);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
      // Remove the one-time ?code=... from the address bar after logging in.
      if (s && new URLSearchParams(window.location.search).has("code")) {
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

export async function sendLoginLink(email: string) {
  if (!supabase) throw new Error("Login isn't set up on this site yet.");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
  if (error) throw new Error(error.message);
}

export const logOut = () => supabase?.auth.signOut();

// fetch() for FundScout's API, with the login token attached. A 401 means the login
// expired, so log out and show the login page again.
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) void logOut();
  return res;
}

export const postJson = (path: string, body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) });

// The server's error message, or a fallback.
export async function errorText(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : `${fallback} (${res.status})`;
}
