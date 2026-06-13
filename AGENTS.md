# Codex Agent Notes

## Learning Notes
- When a task requires trial and error, add concise notes here for the exact command, workaround, verification step, or project-specific behavior that would make the same task faster next time.
- Prefer durable, actionable notes over narration. Include symptoms and fixes when they are useful, such as the error text that identifies a known workaround.
- Keep notes scoped to this project. Do not record secrets, personal data, or unrelated machine-wide preferences.

## App Startup
- This is a Vite app. Start the local dev server with `npm.cmd run dev -- --host 127.0.0.1`.
- The app serves at `http://127.0.0.1:5173/` when the default port is free.
- Before starting, check whether port `5173` is already listening and reuse the running server when possible.
- In the Codex sandbox, Vite may fail with `EPERM` while writing `node_modules/.vite-temp/vite.config.ts.timestamp-*.mjs`. If that happens, rerun the same startup command with `require_escalated` and the safe prefix rule `["npm.cmd", "run", "dev"]`.
- When starting in the background on Windows, write logs under `.codex-logs`, for example `.codex-logs/vite-dev.out.log` and `.codex-logs/vite-dev.err.log`.
