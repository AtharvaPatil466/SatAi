# SatQuery AI frontend

The Next.js frontend expects the local FastAPI service at
`http://localhost:8000`.

```bash
npm ci
npm run dev
```

Override the API origin with `NEXT_PUBLIC_API_URL` when needed. The interface
does not request map tiles, fonts, imagery, or other runtime assets from the
internet; the verified scene image and all scientific data come from the local
API.

The workspace supports real PNG/JPEG upload → plan → analyze, plus the exact
golden demo. The API base URL is compiled into production builds.

Run `npm run build` for production verification. Follow the
[Phase 0 runbook](../backend/README.md) for backend dependencies, status semantics,
offline limitations, API smoke checks and optional browser verification.
