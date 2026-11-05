# Prax

LinkedIn outreach and authority, one workspace per profile. Daily execution, a live pipeline, Profile Studio, and a Chrome extension that drafts comments in the profile's voice while the person posts everything themselves.

- Live: https://prax-gamma.vercel.app
- Status and next steps: `docs/HANDOFF.md`
- How to work on it: `CLAUDE.md`

## Run locally

```bash
npm install
npx vercel env pull .env.local --environment=production
npm run dev
```

## Layout

- `src/app` pages and the `/api/ext` endpoint the extension calls
- `src/lib` Supabase clients, live tables, profile parser and audit, extension bridge
- `db/` SQL, applied in order in the Supabase SQL editor
- `extension/` Chrome extension (MV3); `npm run ext:zip` packs it into `public/`
- `seed/` reference data used to set up workspaces
