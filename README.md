# NAMMAN

NAMMAN is a Next.js application that enables guitarists and audio engineers to browse, preview, and sync Neural Amp Modeler (NAM) profiles directly to their local filesystem. It uses the new TONE3000 PKCE OAuth flow for a secure, database-free architecture.

It is a thin, browser-only client over the [TONE3000 API](https://www.tone3000.com/api): there is no backend, no database, and no separate account — you connect your TONE3000 account via OAuth and everything (search, favorites, tone/model data, downloads) is served by the TONE3000 API.

## ✨ Key Features

- **Direct Local Sync (File System Access API)**: NAMMAN requests permission to a local folder and writes `.nam` / `.wav` model files straight to disk, organized into `FullRig`, `Amps`, `Pedals`, `Cabinets_IRs`, and `Outboard` subfolders.
- **Architecture Filtering**: Filter and sync by NAM architecture — A1 (legacy), A2, or custom — so you only pull models your plugin supports.
- **Deduplication**: Identically-named models across architectures within a pack are de-duped, keeping the highest architecture.
- **Favorites synced to TONE3000**: Bookmarking uses the TONE3000 favorite endpoints, so favorites follow your account everywhere.
- **Download history**: A local (in-browser) record of what you've already synced.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, client components only)
- **Integration**: [`src/lib/tone3000`](src/lib/tone3000) — a zero-dependency TONE3000 OAuth + API client (ported from the official [example app](https://github.com/tone-3000/api))
- **Storage**: Tokens in `sessionStorage`; folder handle + download history in IndexedDB (`idb-keyval`)
- **Icons**: Lucide React

## 🔐 How auth works

OAuth 2.0 with PKCE, entirely in the browser:

1. The user clicks **Connect with TONE3000** → `startStandardFlow()` redirects to TONE3000's authorize endpoint.
2. After sign-in, TONE3000 redirects back to the app origin with a `code`.
3. `handleOAuthCallback()` verifies `state`, exchanges the code for tokens (PKCE — no client secret), and stores them in `sessionStorage`.
4. `T3KClient` attaches the Bearer token to every request and refreshes it automatically when it expires.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A TONE3000 **publishable key** (`t3k_pub_…`) from Settings → API Keys
- A Chromium-based browser (Chrome, Edge, Brave) for direct folder sync

### Installation

```bash
npm install
```

Create a `.env` (see `example.env`):

```env
NEXT_PUBLIC_TONE3000_CLIENT_ID=t3k_pub_your_key_here
```

Open `http://localhost:3000` in a Chrome/Edge browser to use NAMMAN. TONE3000 Settings → API Keys (localhost is auto-allowed during development).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> The Direct Local Sync feature requires a Secure Context (`localhost` or `https://`) and a Chromium-based browser. Other browsers fall back to standard per-file downloads.

## 🌍 Deployment

Deploy on [Vercel](https://vercel.com/new): set `NEXT_PUBLIC_TONE3000_CLIENT_ID` in the project's environment variables and add your production origin as a redirect URI in TONE3000 settings. Vercel provides the HTTPS required by the File System Access API.
