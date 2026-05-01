# Frontend

The live React dashboard for the IMS.

A reference implementation is deployed via Lovable Cloud (Postgres + realtime)
at the project's preview URL — same UI, same workflow, same database schema as
the local Docker Compose stack.

## Run locally against the dockerized backend

```bash
npm install
VITE_API_URL=http://localhost:8080 npm run dev
```

Then open http://localhost:5173.

## Files of interest

- `src/App.tsx` — main dashboard (live feed, detail, RCA form)
- `src/api.ts` — typed client for `/work-items`, `/signals`, `/rcas`
- `src/components/SeverityBadge.tsx`, `StatusBadge.tsx`

This minimal frontend stub is intentionally small — the canonical implementation
is the Lovable Cloud version which mirrors the same screens, state machine,
and validation rules. The dashboard is decoupled from the backend by HTTP only,
so swapping in this stub against the dockerized backend is a one-line change.
