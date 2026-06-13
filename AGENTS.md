# Codex Agent Notes

## App Startup
- This is a Vite app. Start the local dev server with `npm.cmd run dev -- --host 127.0.0.1`.
- The app serves at `http://127.0.0.1:5173/` when the default port is free.
- Before starting, check whether port `5173` is already listening and reuse the running server when possible.
- In the Codex sandbox, Vite may fail with `EPERM` while writing `node_modules/.vite-temp/vite.config.ts.timestamp-*.mjs`. If that happens, rerun the same startup command with `require_escalated` and the safe prefix rule `["npm.cmd", "run", "dev"]`.
- When starting in the background on Windows, write logs under `.codex-logs`, for example `.codex-logs/vite-dev.out.log` and `.codex-logs/vite-dev.err.log`.
