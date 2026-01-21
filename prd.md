# VIZKA - Product Requirements Document

## Overview

**Product Name:** VIZKA
**Tagline:** Nýjustu fréttirnar (The Latest News)
**Version:** 1.0 MVP
**Last Updated:** January 2026

VIZKA is an Icelandic news aggregation app with a TikTok-style swipe-through interface. It combines AI-powered summaries, multi-source topic grouping, and inline explanations to make news consumption fast, engaging, and informative.

---

## Target Audience

- **Primary:** Younger audience (Gen Z / Millennials) who prefer mobile-first, snackable content
- **Secondary:** General public interested in staying informed on Icelandic and international news

### User Personas

1. **The Busy Commuter** - Wants quick news updates during short breaks
2. **The Informed Citizen** - Wants to see multiple perspectives on the same story
3. **The Casual Browser** - Scrolls for interesting stories, doesn't want to read full articles

---

## Product Vision & Differentiators

### What Makes VIZKA Different

| Feature | Description |
|---------|-------------|
| **TikTok-style UX** | Full-screen, swipe-through cards for addictive news browsing |
| **Multi-source Topics** | Same story grouped from RÚV, MBL, Vísir, etc. - see all perspectives |
| **AI Summaries** | GPT-generated summaries save reading time, link to source for full article |
| **Inline Explainers** | Difficult words, organizations, people, and topics explained via tooltips |
| **All-in-one** | One app replaces checking multiple news sites |

---

## Features

### Must-Have (MVP Launch)

#### 1. News Feed with Categories
- Full-screen scroll-snap cards
- Category filters: ALLT, INNLENT, ERLENT, FÓLK, ÍÞRÓTTIR
- Infinite scroll with pagination
- Pull-to-refresh

#### 2. AI Summaries
- GPT-4o-mini generated summaries for each article
- Clear "Read at [Source]" button linking to original article
- Respect publishers by driving traffic to their sites

#### 3. Topic Grouping
- Group articles from multiple sources covering the same story
- **Priority: Accuracy** - only group when truly the same story (minimize false positives)
- Show article count badge (e.g., "3 sources")

**Behavior:**
- Articles are grouped when they cover the same news event (e.g., same government announcement, same sports match)
- When in doubt, keep articles separate rather than incorrectly grouping
- Users see grouped articles as a single card with a "3 sources" indicator
- Tapping reveals all source perspectives on that story

**MVP Decision:** Start with conservative grouping. Tune based on user feedback post-launch.

#### 4. Inline Explainers (Tooltips)
- Highlight terms, organizations, people, and topics that may need explanation
- Tap highlighted text to reveal explanation tooltip
- Explanations are concise (1-2 sentences)

**Behavior:**
- Target 2-5 explainers per article (not overwhelming)
- Focus on: Icelandic politicians, organizations, technical terms, foreign names/places
- Tooltip appears inline, dismisses on tap outside

**MVP Decision:** Generate explainers during article ingest. Start with named entities (people, organizations, places). Expand scope based on user engagement data.

**Future:** User-triggered "explain this" for any selected text.

### Nice-to-Have (Post-Launch)

#### 5. Personalization
- Learn user preferences over time
- Personalized feed ranking based on reading history
- Will require more news sources to be effective

#### 6. Push Notifications
- Breaking news alerts
- Add after launch based on user demand

#### 7. Search
- Vector-based semantic search
- Currently implemented but not MVP priority

---

## Technical Architecture

### Platform Strategy

| Platform | Approach |
|----------|----------|
| iOS | PWA wrapper |
| Android | PWA wrapper |
| Web | Next.js App Router (current) |

**MVP Decision:** Use Capacitor for PWA wrapping. Provides native app shell with web content.

**Risk Mitigation:** Apple sometimes rejects thin PWA wrappers. If rejected, will add native navigation or explore alternatives. Have web fallback ready.

### Data Refresh Strategy

**Smart Hybrid Approach:**

| Content Type | Refresh Frequency | Trigger |
|--------------|-------------------|---------|
| Breaking/High-importance | Every 5 minutes | Importance score ≥ 8 |
| Regular news | Every 30 minutes | Standard batch job |
| Low-priority | Every 60 minutes | Importance score ≤ 3 |

**Behavior:**
- "Breaking news" = articles with high importance score (assigned by AI during ingest)
- Users don't see stale content - feed shows freshest articles first
- Background refresh doesn't interrupt user experience

**MVP Decision:** Start with 15-minute batch refresh for all content. Implement tiered refresh post-launch based on cost analysis.

### News Sources (Current)

| Source | Type |
|--------|------|
| RÚV | Icelandic |
| MBL | Icelandic |
| Vísir | Icelandic |
| DV | Icelandic |
| BBC | International |
| CNN | International |
| The Guardian | International |

*Note: More sources will be added when personalization is implemented.*

### Cost Optimization (Critical)

Budget is a major concern. Optimization strategies:

1. **Batch API calls** - Process multiple articles in single GPT requests where possible
2. **Cache aggressively** - Cache embeddings, summaries, and explainer content
3. **Smart ingest** - Skip duplicate/similar articles early in pipeline
4. **Tiered processing** - Use cheaper models for low-importance articles
5. **Edge caching** - Leverage Vercel edge for static content

**MVP Decision:** Launch with current architecture. Monitor costs weekly. Set spending alerts at $50, $100, $200/month thresholds.

### Offline Strategy

- Cache last session's articles for offline viewing
- Show cached content with "Last updated X minutes ago" indicator
- Sync when connection restored

---

## User Experience

### Design Philosophy

- **TikTok-style:** Addictive, fast, swipe-through experience
- **Dark mode first:** Black backgrounds, white text
- **Mobile-first:** Optimized for thumb navigation
- **Iterative:** Design will evolve based on user feedback

### Image Handling

When articles lack quality images:

| Priority | Approach | When to Use |
|----------|----------|-------------|
| 1st | Source's own image | Always preferred if available and not a logo |
| 2nd | Source-branded gradient | Default fallback for MVP |
| 3rd | Stock images | Future consideration if gradients feel repetitive |
| 4th | AI-generated | Future consideration if cost-effective |

**MVP Decision:** Use source-branded gradient backgrounds as fallback. Evaluate stock/AI images post-launch based on user feedback and budget.

### Error Handling

**Graceful Degradation:**
- Show cached content when network fails
- Indicate content age ("From 30 minutes ago")
- Silent retry in background
- No jarring error screens

### Accessibility Requirements

| Requirement | Priority |
|-------------|----------|
| Font scaling | High - Respect system font size preferences |
| Color contrast | High - Ensure WCAG AA compliance |
| Screen reader | Medium - VoiceOver/TalkBack support (post-launch) |

---

## Privacy & Analytics

### Privacy Stance: Anonymous Only

- **Device ID:** Generated locally, stored in localStorage
- **No personal data:** No accounts, no email, no login required
- **No third-party tracking:** No Google Analytics or similar
- **Minimal data collection:** Only what's needed for basic analytics

### Success Metrics

| Metric | Description |
|--------|-------------|
| Daily Active Users (DAU) | Primary growth metric |
| Return Rate | % of users who come back within 7 days |
| Click-throughs | # of users clicking through to source articles |

### Data Collected

- Article views (anonymous)
- Click-throughs to source (anonymous)
- Category preferences (device-level, not personal)
- Session duration (anonymous)

---

## Legal Considerations

### Open Questions (Need Guidance Before Launch)

1. **RSS Feed Usage:** Are we allowed to scrape and display content from RSS feeds?
2. **AI Summarization:** Does summarizing copyrighted articles constitute fair use?
3. **Image Usage:** Can we use article images, or do we need our own?
4. **Linking:** Is linking back to source sufficient attribution?

### Current Approach

- Always link to original source
- Drive traffic to publishers (Summary + Link model)
- Use RSS feeds which are intended for syndication
- Generate own summaries rather than copying text verbatim

**MVP Decision:** Consult with lawyer before public launch. Proceed with development assuming current approach is acceptable.

---

## Launch Plan

### Timeline: ASAP

**Launch Blocker:** All must-have features working well

### Pre-Launch Checklist

- [ ] Performance: Fix initial load speed
- [ ] Performance: Fix scrolling lag/jank
- [ ] Feature: Topic grouping working accurately
- [ ] Feature: AI summaries generating correctly
- [ ] Feature: Inline explainers implemented
- [ ] PWA: App wrapped and tested on iOS/Android
- [ ] App Store: Submitted to App Store and Play Store
- [ ] Legal: Get guidance on content usage

### Known Performance Issues

1. **Initial Load:** First page takes too long to appear
2. **Scrolling:** Feed stutters or lags when swiping between cards

---

## Technical Debt & Future Considerations

### Current Technical Debt

- Virtualization can be improved (currently shows ±2 cards)
- Image loading could use blur placeholders
- No service worker for true offline support yet

### Future Features (Backlog)

1. Personalized feed ranking
2. Push notifications for breaking news
3. More news sources
4. Social sharing
5. Bookmarking/save for later
6. Reading history

---

## Success Criteria

### MVP Launch Success

1. App available on iOS and Android stores
2. Feed loads in under 2 seconds
3. Smooth 60fps scrolling
4. All must-have features functional
5. No critical bugs

### 30-Day Post-Launch Goals

1. 1,000+ DAU
2. 40%+ 7-day return rate
3. 20%+ click-through rate to sources
4. App Store rating 4.0+

---

## Risks & Open Questions

### High Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Apple App Store Rejection** | Medium | High - Blocks iOS launch | Have web PWA as fallback. Research Apple guidelines. Be prepared to add native features if required. |
| **Legal/Copyright Issues** | Unknown | High - Could require shutdown | Consult lawyer before public launch. Document that we drive traffic to sources. |
| **OpenAI Cost Overruns** | Medium | High - Could become unsustainable | Set budget alerts. Monitor cost per article. Have fallback to cheaper models or reduced features. |

### Medium Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Performance Issues Not Resolved** | Medium | Medium - Poor reviews, user churn | Dedicated performance investigation before launch. Profile and fix specific bottlenecks. |
| **Topic Grouping Inaccuracy** | Medium | Medium - Confuses users | Start conservative. Add user feedback mechanism. Tune thresholds based on data. |
| **Inline Explainers Delay Launch** | Medium | Medium - Extends timeline | Could launch without explainers as V1.1 feature if needed. Core feed is more critical. |

### Low Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **RSS Feed Format Changes** | Low | Low - Temporary content gaps | Monitor feed health. Alert on parsing failures. Quick fix turnaround. |
| **OpenAI Model Deprecation** | Low | Low - Temporary quality issues | Pin model versions. Test new models before switching. |

### Open Questions Requiring Decisions

| Question | Owner | Deadline | Notes |
|----------|-------|----------|-------|
| Legal review of RSS/summarization | Founder | Before launch | Blocker for public release |
| Capacitor vs. alternative PWA wrapper | Dev | Before App Store submission | Research Apple acceptance rates |
| Cost budget ceiling | Founder | Before launch | At what monthly cost do we pause/pivot? |
| Marketing/launch strategy | Founder | Before launch | How will users discover VIZKA? |

### Items Not Yet Defined (Future PRD Updates)

- **User Acquisition Plan:** How will users discover VIZKA? (Word of mouth? Social? PR?)
- **Cost Projections:** Detailed estimate of monthly costs at various user levels
- **Monitoring & Alerting:** How do we know if something breaks in production?
- **Content Moderation:** What if AI summarizes harmful or false content?
- **Competitor Analysis:** Detailed comparison with existing Icelandic news apps
- **Rollback Plan:** What if launch goes badly? How do we recover?

---

## Appendix

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL + pgvector) |
| AI | OpenAI (GPT-4o-mini, text-embedding-ada-002) |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |
| Native Wrapper | Capacitor (planned) |

### Database Schema (Simplified)

```
articles: id, title, excerpt, full_text, url, image_url, published_at, category, importance, topic_id, source_id
topics: id, title, image_url, article_count, updated_at, category
sources: id, name, rss_url
article_embeddings: article_id, embedding (vector)
clicks: article_id, source_name, device_id, user_agent, created_at
```

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/ingest` | RSS scraping & AI processing (cron) |
| `/api/search` | Vector search |
| `/api/related` | Find related articles + AI context |
| `/api/summarize` | AI summarization |
| `/api/track-click` | Analytics tracking |
