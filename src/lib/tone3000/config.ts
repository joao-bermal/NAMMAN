// config.ts — TONE3000 API configuration (Next.js client-side)
//
// Mirrors the example app's config but reads from Next's NEXT_PUBLIC_* env vars
// (inlined at build time) instead of Vite's import.meta.env.
//
// T3K_API points to production. NEXT_PUBLIC_T3K_API_DOMAIN can override for local dev.
// Trailing slashes are stripped so `${T3K_API}/api/...` never produces a double slash.
export const T3K_API = (
  process.env.NEXT_PUBLIC_T3K_API_DOMAIN ?? 'https://www.tone3000.com'
).replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU';

// Your publishable key (t3k_pub_…) — used as client_id in OAuth flows.
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_TONE3000_CLIENT_ID ?? '';

// The redirect_uri TONE3000 returns to after an OAuth flow. We handle the
// callback on the app root, so this is just the current origin. Localhost
// origins are auto-allowed during development; register your production origin
// in TONE3000 Settings → API Keys.
//
// Computed lazily because `window` is undefined during server rendering.
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
