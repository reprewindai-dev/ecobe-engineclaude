# CO2 Router Dashboard

This is the public control‑surface UI for CO2 Router. It presents live system
state, recent decisions, trace/replay status, and governance visibility for the
pre‑execution environmental authorization engine.

Public documentation lives in:
`docs/public/` (repository root).

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- TanStack Query

## Environment Variables

```env
NEXT_PUBLIC_ECOBE_API_URL=http://localhost:3000
ECOBE_API_URL=http://localhost:3000
```

## Development

```bash
npm install
npm run dev
```
