# 🫧 BubbleUp

A friendly, real-time chat app for classrooms: channels per subject, private messages, file & photo sharing, voice notes, polls, reactions — plus **Thinkmas**, the (mostly) helpful class bot.

## Features

| | |
|---|---|
| 🏫 **Classes** | Teachers create a class and get two invite codes: one for students, one for other teachers. Anyone can be in several classes. |
| 💬 **Channels** | `#general`, `#announcements` (teachers-only posting), `#homework`, `#random` are created automatically. Teachers can add more. |
| 💌 **Direct messages** | Private 1-to-1 chats with "Seen" receipts. |
| 📎 **Files** | Drag & drop, paste or attach images, PDFs, documents, videos (25 MB default). Images get a gallery + lightbox. |
| 🎙️ **Voice notes** | Record and send audio straight from the browser. |
| 📊 **Polls** | Single or multiple choice, optionally anonymous. |
| ✨ **Rich chat** | Replies, emoji reactions, edit/delete, pins, @mentions (+ `@everyone` for teachers), `**bold**` `*italic*` `` `code` ``, typing indicators, unread badges, full-text search. |
| 🛡️ **Moderation** | Teachers can delete messages, mute (10 min → 24 h) or remove students. The owner manages roles and can transfer ownership. |
| 🤖 **Thinkmas** | `/help` `/ask` `/calc` `/define` `/image` `/poll` `/roll` `/flip` `/8ball` `/joke` `/shrug` — teachers can teach it answers with `/learn question :: answer`. |
| ♟️ **Chess** | Challenge a classmate; a live game card appears in the chat, everyone can watch, only the players move. The server checks every move (chess.js), including checkmate, stalemate and draws. |
| 🎯 **Random picker** | `/pick` spins a wheel over the online students, or over your own options (`/pick pizza, pasta, rice`). |
| 😺 **Class emoji** | Upload your own `:emoji:` (photos, drawings, inside jokes) and use them in messages and reactions. |
| 🏆 **Weekly awards** | Every Friday afternoon Thinkmas posts fun awards in #general (Chatterbox, Most helpful in #homework, Crowd favourite, Night owl…). `/awards` shows the standings. Configure with `AWARDS_DAY`, `AWARDS_HOUR`, `AWARDS_ENABLED`. |
| 🧭 **Easy to learn** | A role-based "Getting started" checklist (ticks itself as you do things), a "How BubbleUp works" guide behind every Help button, and empty channels that suggest what to do next. |
| 🌗 **Comfort** | Light/dark themes, mobile layout, desktop notifications, optional sounds. |

## Quick start (development)

Requires **Node.js 22.13+** (uses the built-in SQLite — nothing else to install).

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on port 3000 and Vite proxies to it.

## Run it for your class (one computer on the school network)

```bash
npm install
npm run build
npm start
```

The terminal prints a **Network** address such as `http://192.168.1.20:3000` — share it with your class. Everyone must be on the same Wi-Fi, and the computer must stay on. All data lives in `./data` (back up that folder!).

> **Voice notes and desktop notifications need HTTPS** when used from other devices (browsers block the microphone on plain `http://` except for `localhost`). Either deploy to the cloud (below) or create a certificate (e.g. with [mkcert](https://github.com/FiloSottile/mkcert)) and set `HTTPS_KEY_FILE` / `HTTPS_CERT_FILE` in `.env`.

## Deploy to the cloud

The included `Dockerfile` builds everything into one image; data is stored in `/data` (mount a volume).

- **Render:** New → Blueprint → select this repo. `render.yaml` sets up a persistent disk, a generated `JWT_SECRET` and `TRUST_PROXY=1`.
- **Anywhere with Docker:**
  ```bash
  docker build -t bubbleup .
  docker run -p 3000:3000 -v bubbleup-data:/data -e JWT_SECRET=$(openssl rand -hex 32) bubbleup
  ```

Because SQLite is a file, run **one** instance with a persistent disk (that comfortably handles several classes).

## Configuration

Copy `.env.example` to `.env`. Everything is optional in development; in production `JWT_SECRET` is required.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | auto (dev only) | Signs login sessions |
| `DATA_DIR` | `./data` | Database + uploads |
| `MAX_UPLOAD_MB` | `25` | Max file size |
| `PEXELS_API_KEY` | – | Enables `/image` (free key at pexels.com/api) |
| `TRUST_PROXY` | `0` | Set `1` behind Render/Railway/nginx |
| `HTTPS_KEY_FILE` / `HTTPS_CERT_FILE` | – | Serve HTTPS directly (LAN) |

## Project structure

```
server/                 Express 5 + Socket.IO + SQLite (node:sqlite)
  src/
    app.js              builds the server (used by index.js and tests)
    db/                 connection + versioned migrations
    services/           business rules & permission checks (users, classes, channels, messages, uploads)
    routes/             thin REST handlers that call services and emit realtime events
    realtime/           Socket.IO: auth, presence, typing, event fan-out
    bot/                Thinkmas: commands, sandboxed calculator, fuzzy Q&A (knowledge.json)
  test/                 Vitest + Supertest + socket.io-client integration tests
client/                 React 19 + Vite + Zustand
  src/
    store/              single store: state, actions, realtime reducers
    hooks/useRealtime   socket → store wiring, notifications, tab badge
    components/         ui · auth · onboarding · layout · chat · panels · modals
    lib/                api client, safe Markdown renderer, router, formatting
    styles/             design tokens (light/dark) + component styles
  test/                 Vitest + Testing Library
legacy/                 the previous version, kept for reference (safe to delete)
```

**How it fits together:** all writes go through the REST API (easy to test, validate and rate-limit); the server then pushes events over Socket.IO, and the client store applies them. Messages are sent optimistically and reconciled when the server echoes them back.

## Scripts

| | |
|---|---|
| `npm run dev` | API + client with hot reload |
| `npm test` | Server (74) + client (29) test suites |
| `npm run build` | Production build of the client |
| `npm start` | Production server (serves the built client) |
| `npm run lint` | ESLint on the client |

## Security notes

Passwords are hashed with bcrypt; sessions are httpOnly cookies; every API call checks class/channel membership; uploads are served only to people who can see the message, with risky types (HTML/SVG/…) forced to download; executables are blocked; the calculator runs in a sandbox; login attempts and message sending are rate-limited.
