# CasingPro

React + TypeScript + Tailwind client-only academic casing-design prototype based on Drilling Engineering II, Lecture 6.

## Run

```bash
npm install
npm run dev
npm run build
```

## Deploy to Vercel

Import this folder as a Vite project via GitHub on https://vercel.com/new . Build command `npm run build`; output directory `dist`. Share the resulting production URL.

## Critical engineering limitations

- Lecture 6 slides 36 and 46 supply four N-80 ratings and axial-collapse tables. Slide 55 supplies 47 lb/ft body strength (1,086,000 lbf) and joint strength (905,000 lbf). **The lecture does not supply equivalent body/joint strengths for every other weight**; these are intentionally blank and require verified data before a full safe configuration can be certified.
- The lecture's 6,369 ft transition is a collapse-iteration illustration, **not hardcoded**. A separate validation example should reproduce the lecture's iteration once the required strength data are supplied.
- Collapse tables must cover the evaluated axial stress; no extrapolation.
- Search uses user-adjustable depth grid and a capped beam of 300 states per level; this is an approximate optimization and cannot guarantee a global minimum. The method is displayed to users.
- Simplified lecture worst-case conditions: no buoyancy, empty casing for collapse, no backup pressure for burst. Actual field casing design requires additional load cases and professional review.
- The iteration tolerance is editable for future continuous-transition solver development; this grid-search engine uses the grid step instead. Do not interpret the tolerance as an active solver stopping criterion.
- Browser localStorage saves edits locally only. No server, database, or user accounts.
