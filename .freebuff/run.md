# Run Doc — Car Rental Dev Stack

This doc records the procedure to reproduce the uncommitted artifacts a fresh checkout needs to run this project, then start both servers so the SPA is reachable on localhost. It captures **procedures**, never secret values.

## Stack overview

- **Frontend**: Vite 6 + React 18 (port **5173**, dev server with HMR). Proxy in `vite.config.ts` forwards `/api/*` and `/uploads/*` to the API server.
- **Backend**: Express 5 (port **3000**) using `sql.js` for an in-memory / file-backed SQLite DB. Auto-creates schema on boot, seeds itself on first run via `server/seed.js`.
- **Tooling**: Tailwind 3, FullCalendar 6, Chart.js 4. Project uses ESM (`"type": "module"`).

## Reproducing artifacts in a fresh worktree

Run these from the worktree root (`D:\Car Rental\car-rental - prd`):

1. **Install JS dependencies** with the project's package manager (npm). From the worktree:
   ```bash
   npm install
   ```
   This populates `node_modules/`. The repo also has `package-lock.json` so npm uses the recorded versions.

2. **Environment files**: this project currently has no `.env*` files (all configuration lives in source: ports in `vite.config.ts` and `server/index.js`, DB location in `server/db.js`). If a future migration adds env-driven config, copy the file from the main checkout:
   ```bash
   cp <main-checkout>/.env.local .env.local
   ```
   Never symlink — port values may need adapting per worktree.

3. **SQLite database**: `sql.js` either loads `data.sqlite` from the repo root or initializes in memory. On first run the API calls `initDB()` from `server/db.js`, which auto-seeds the database (admin user + sample cars) via `server/seed.js`. No manual step required.

4. **Static uploads**: the `uploads/` directory already exists in the repo for car images. No action needed.

If any of the steps above turn stale (e.g. a new env var is required, or seed data needs re-running), update this section **and** the code that depends on it in the same change.

## Running the dev stack

Both servers must run for the SPA to function (the Vite dev server proxies `/api` calls). The simplest way is the concurrent script:

```bash
# From the worktree root
npm run dev:all
```

This uses `concurrently` to spawn both `npm run dev:server` (Express on 3000) and `npm run dev` (Vite on 5173).

To detach from the conversation:

```bash
# Windows bash (Git Bash):
( nohup npm run dev:all > .freebuff/preview-<id>.log 2>&1 & echo $! )
```

Or, run the two pieces separately if `dev:all` output interleaving becomes hard to read:

```bash
( nohup npm run dev:server > .freebuff/preview-<id>-api.log 2>&1 & echo $! )
( nohup npm run dev       > .freebuff/preview-<id>-web.log 2>&1 & echo $! )
```

### Ports

- Vite dev: **5173** (default per `vite.config.ts`).
- Express API: **3000** (default per `server/index.js`, overridable via `PORT` env).

If either is occupied in the worktree, override. Prefer CLI flags over editing `vite.config.ts` so the worktree source stays untouched:

```bash
PORT=3001 ( nohup npm run dev:server > .freebuff/preview-<id>-api.log 2>&1 & echo $! )
# For Vite, prefer the CLI flag (no source edit):
( nohup npx vite --port 5174 > .freebuff/preview-<id>-web.log 2>&1 & echo $! )
# Equivalent: edit vite.config.ts `server.port` in this worktree only.
```

When picking the port for `register_preview`, use the **actual Node PID that owns the LISTENING socket** (find via `netstat -ano | findstr "LISTENING" | findstr ":5174"`), not the npm/npx wrapper PID — the wrapper exits after spawning Node, so `register_preview` will reject the wrapper.

## Verifying the stack

After start, poll the servers until they answer:

```bash
# API
curl -s http://localhost:3000/api/health

# SPA (Vite serves the React shell)
curl -sI http://localhost:5173/
```

Register the preview pointing at `http://localhost:5173/` (the Vite URL) — it is the user-facing entry point and the one Vite proxies the API through.

## Stopping

```bash
# Find PIDs from the .freebuff/preview-*.log headers (the `echo $!` line)
kill <api-pid> <web-pid>
```
