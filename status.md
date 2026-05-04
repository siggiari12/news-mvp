# VIZKA - Project Status

**Last Updated:** 2026-03-01

---

## Overview

VIZKA is an Icelandic TikTok-style news aggregator. MVP is technically complete. Remaining blockers are non-technical (legal, App Store, marketing).

---

## Feature Status

### Done - Core MVP

| Feature | Notes |
|---------|-------|
| TikTok-style feed | Scroll-snap cards, virtualization (±3 cards), throttled scroll handler |
| Category filters | ALLT, INNLENT, ERLENT, FÓLK, ÍÞRÓTTIR |
| AI summaries | GPT-4o-mini, 3-4 paragraphs per article |
| Topic grouping | Vector similarity (0.76 threshold), conservative/accurate |
| 7 news sources | RÚV, MBL, Vísir, DV, BBC, CNN, The Guardian |
| Stock image library | 54 images, semantic embedding match (replaced DALL-E) |
| AI context (Q&A) | 2-3 term explanations per topic in "Tengt efni" tab |
| Click tracking | Anonymous device ID, source attribution |
| Offline support | Service worker caching |
| Auto-refresh | Every 5 minutes + on foreground |
| iOS/Android wrapper | Capacitor configured, Xcode project generated |
| Automated ingest | GitHub Actions cron every 5 minutes |
| Daily cleanup | Deletes articles older than 3 days |

### Implemented but Hidden/Disabled

| Feature | Reason |
|---------|--------|
| Vector search | API works, UI hidden - not MVP priority |
| Explainers | Feature flag off (`ENABLE_EXPLAINERS=false`), removed from frontend |

### Not Built (Post-Launch Backlog)

- Personalized feed ranking
- Push notifications
- Social sharing / bookmarking / reading history
- User accounts

---

## Pre-Launch Checklist

- [ ] Legal review of RSS/summarization usage
- [ ] Performance testing on real devices (iOS + Android)
- [ ] App Store submission (risk: Apple may reject thin PWA)
- [ ] Marketing / launch strategy defined
- [ ] Load testing at scale

---

## Known Issues / Technical Debt

- Virtualization shows ±3 cards (PRD says ±2 — may over-render slightly)
- No "Last updated X minutes ago" UI indicator for offline content
- `get_ranked_feed` RPC exists but device_id not yet used for personalization
- Image blur placeholders not implemented

---

## Recent Changes

| Date | Change |
|------|--------|
| 2026-03-01 | Initial status.md created; full codebase audit completed |
| ~Feb 2026 | Replaced DALL-E with stock image library (54 images, semantic matching) |
| ~Feb 2026 | Added backfill endpoint for reprocessing stale/bad images |
| ~Feb 2026 | Capacitor setup for native iOS/Android |
| ~Jan 2026 | Performance fixes: scroll lag, initial load speed |
| ~Jan 2026 | Removed explainers from MVP frontend (feature rollback) |
| ~Jan 2026 | Secured ingest endpoint with X-INGEST-SECRET header |
| ~Jan 2026 | Added AI context Q&A in "Tengt efni" tab |

---

## Architecture Quick Reference

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, ISR 60s) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | GPT-4o-mini + text-embedding-3-small |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |
| Native | Capacitor 8 (iOS/Android) |
| Cron | GitHub Actions (ingest every 5min, cleanup daily 5am) |

### Key File Paths

| What | Path |
|------|------|
| Main feed | `src/app/page.tsx` |
| Feed component | `src/components/NewsFeed.tsx` |
| Article card | `src/components/NewsCard.tsx` |
| Ingest pipeline | `src/app/api/ingest/route.ts` |
| Database client | `src/lib/supabase.ts` |
| Stock images | `public/stock/manifest.json` |
| Ingest cron | `.github/workflows/cron.yml` |
| Cleanup cron | `.github/workflows/cleanup.yml` |
| Native config | `capacitor.config.ts` |

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/ingest` | RSS scraping & AI processing (cron every 5min) |
| `/api/summarize` | On-demand AI summarization (full / eli10 mode) |
| `/api/related` | Related articles + AI context Q&A |
| `/api/search` | Vector semantic search (hidden in UI) |
| `/api/track-click` | Anonymous click analytics |
| `/api/backfill-images` | One-time stock image backfill tool |
| `/api/cron/cleanup` | Delete articles older than 3 days |

---

## Post-Launch Goals (30 Days)

- 1,000+ DAU
- 40%+ 7-day return rate
- 20%+ click-through rate to sources
- App Store rating 4.0+
