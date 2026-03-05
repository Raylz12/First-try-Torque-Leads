# TorqueLeads Site Audit
**Date:** 2026-03-05  
**Auditor:** Queefus (AI Growth Manager)

## Deployment
- ✅ Vercel hosting — live at torqueleads.net (HTTP/2 200)
- ✅ HTTPS/SSL active — strict-transport-security confirmed
- ✅ Auto-deploy from GitHub main branch
- ✅ Custom domain resolving correctly

## Pages
| Page | URL | Status |
|------|-----|--------|
| Home | torqueleads.net/ | ✅ Live |
| VSL | torqueleads.net/vsl/ | ✅ Live |
| Pitch Deck | torqueleads.net/deck/ | ✅ Live |
| Get Started (Google LP) | torqueleads.net/get-started.html | ✅ Live |

## Meta Pixel (ID: 25305585269115353)
- ✅ Pixel base code in `<head>` on all pages
- ✅ PageView fires on all pages
- ✅ Lead event on all Book a Call / Get Started CTAs (fixed 2026-03-05 — was missing on 8 of 9 buttons)
- ✅ ScrollDepth50 + ScrollDepth100 custom events on VSL page
- ✅ ViewContent fires on VSL video play
- ❌ Conversions API (CAPI) not yet implemented — server-side deduplication pending

## Microsoft Clarity (Tag: vq86d7h2sk)
- ✅ Snippet in `<head>` on all pages (main, VSL, deck)
- ✅ Async loading confirmed
- ⚠️ Session recording data — verify in dashboard once traffic flows

## SEO
- ✅ sitemap.xml live at torqueleads.net/sitemap.xml
- ✅ robots.txt live at torqueleads.net/robots.txt
- ✅ Canonical tags on all pages
- ✅ Open Graph + Twitter Card meta tags (main + VSL)
- ✅ Schema.org structured data (Organization + Service + WebSite)
- ✅ Favicon (SVG, amber TL mark)
- ❌ Google Analytics GA4 — not yet configured (needs Measurement ID)
- ❌ Google Search Console — not yet verified

## Performance / Mobile
- ❌ Lighthouse audit not yet run — TODO
- ✅ Responsive nav (hamburger menu on mobile)
- ✅ Viewport meta tag on all pages
- ⚠️ Video file (7.6MB) in repo — consider moving to CDN if load times suffer

## Tracking Gaps (Action Required)
1. **CAPI (Conversions API)** — implement server-side Lead events for deduplication
2. **GA4** — needs Measurement ID from Rhett's Google account
3. **Google Search Console** — submit sitemap after GA4/GSC setup

## Funnel Status
| Step | Status |
|------|--------|
| Ad → Landing page | ✅ Pages exist, Pixel fires |
| CTA → Book a Call | ✅ Lead event fires on ALL CTAs |
| Booking → CRM (GHL) | ❌ Not connected yet |
| Booking → SMS sequence | ❌ Not built yet |
| VSL page | ✅ Built with placeholder video |
| Stripe payment | ❌ Not set up |

## Next Priority Items
1. GHL pipeline + SMS automation (Phase 2)
2. Google Sheet Ad Performance Tracker (Phase 5)
3. GA4 setup (needs credentials)
4. CRON jobs for weekly ad review
5. Meta Ads campaign build (Phase 4)
