# 🎯 AI-CustomerHunter (ReplyPulse AI) — Autonomous Social Buyer-Intent & Lead Radar

**AI-CustomerHunter (ReplyPulse AI)** is a next-generation global SaaS application that turns public conversations on **Reddit, Hacker News, X (Twitter), and GitHub** into a high-converting customer acquisition pipeline.

Instead of noisy keyword monitoring or spammy auto-bots that get accounts banned, **ReplyPulse AI** uses **Semantic Buyer-Intent Scoring (0–100)** to detect people actively asking for recommendations, complaining about competitors, or expressing ready-to-buy pain points — and crafts **human-first, anti-ban replies** in seconds.

---

## ✨ Core Features

1. **⚡ 1-Click AI URL Onboarding (`/api/analyze-url`)**
   - Enter any product URL (e.g., `https://linear.app`, `https://supabase.com`, or your own SaaS).
   - Automatically crawls metadata and generates:
     - Value Proposition & Target Audience
     - High-Intent Buyer Keywords (`"looking for alternative to"`, `"switching from"`, `"best tool for"`)
     - Competitor Watchlist & Target Subreddits (`r/SaaS`, `r/entrepreneur`, `r/webdev`, etc.)

2. **📡 Live Multi-Channel Buyer-Intent Radar (`/api/scan`)**
   - Real-time live queries across **Reddit Public JSON API**, **Hacker News Algolia API**, **GitHub Issues API**, and **X/Twitter Intent Radar** with curated high-intent fallback intelligence so the radar works immediately out of the box with zero API keys required.
   - **4-Stage Intent Classification**:
     - 🔥 **Competitor Churn** (`"switching from X"`, `"frustrated with Y"`)
     - 💳 **Budget Ready** (`"ready to pay"`, `"pricing under $"`, `"team license"`)
     - 🎯 **Active Buyer** (`"looking for tool"`, `"what do you recommend for"`)
     - 💡 **Pain Point** (`"how do you handle"`, `"wasting hours on"`)

3. **🛡️ Anti-Spam Reply Studio (3 Proven Tones)**
   - **Helpful Peer (95% Value / 5% Soft Mention)** — zero promotional stink, community-safe.
   - **Transparent Founder ("I built this because...")** — authentic indie/SaaS founder disclosure that earns upvotes.
   - **Objective Comparison** — fair breakdown of pros, cons, and trade-offs.
   - Includes **Ban-Risk Meter (Low / Safe)** and 1-Click Copy + Open Original Thread.

4. **📊 Lead CRM, Conversion Funnel & ROI Attribution**
   - Move leads through `New` → `Saved` → `Replied` → `Converted Customer`.
   - Track Estimated Pipeline Value ($), Reply Rate, and Customer Acquisition ROI.

5. **🌍 Global Bilingual Experience & SaaS Monetization Ready**
   - Instant `🇺🇸 EN` / `🇹🇷 TR` language switcher.
   - Built-in Global SaaS Landing Page + Interactive App Workspace + `$19 Starter` / `$49 Growth` / `$99 Scale` pricing tiers.

---

## 🚀 Quick Start

```bash
cd C:\Projects\AI-CustomerHunter
npm start
```

Open **`http://localhost:3090`** in your browser.
