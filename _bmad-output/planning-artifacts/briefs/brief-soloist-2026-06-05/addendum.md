# Addendum — Product Brief: Soloist

Depth and supporting material that informs the brief but lives downstream (PRD, architecture, GTM). Preserved here to keep `brief.md` to 1–2 pages.

## Competitive Landscape Digest (research, 2026-06-05)

Source: web-research subagent. Captured to ground differentiation honestly.

### Direct comparables

| Tool | Positioning | Target | Rough price | Key gap vs. Soloist |
|------|-------------|--------|-------------|---------------------|
| **SuperOkay** | Client portal for creative agencies | Solo → small creative agencies | ~$9/mo (3 clients), ~$29 Solo+ | Design/creative-centric; no live ship-tracking |
| **Copilot** (ex-Portal) | White-label portal for service businesses | Accounting/legal/consulting | Pro (bundles ~3 users) + ~$39/seat | Generalist, not dev-aware |
| **Moxie** | All-in-one for solo freelancers | Solo freelancers | ~$12/mo | Jack-of-all-trades; no shipped-progress lens |
| **Bonsai** | Freelancer business OS | Freelancers | ~$24–79/mo | Broad/heavy; contracts/invoicing-first |
| **Dubsado** | Workflow automation business mgmt | Creative/service biz | ~$35–55/mo | Steep setup; automation-first |
| **HoneyBook** | "Clientflow" for creatives | Photographers/events | ~$29–49/mo (raised 2025) | Very creative-niche |
| **SPP / ManyRequests / Agency Handy** | Productized-service agency portals | SEO/content agencies | $29 → $129–1,500/mo | Built for order-flow agencies, not solos |
| **Client Portal (.io)** | Minimal branded status portal | Freelancers (WordPress) | — | Thin/static |

### Positioning gaps (the opening)

- **Dev / product-engineer niche is genuinely underserved.** Every serious portal skews creative-agency / photographer / productized-SEO. None speak "shipped a feature / deployed / merged PR" natively.
- **"Live shipped-progress transparency" is a GAP, not a norm.** Portals offer task lists and "project status"; changelog tools (LaunchNotes, Beamer, Canny) are *product-wide broadcast*, not *per-engagement* client windows. The "track-it-like-a-package, per-engagement ship feed" framing is essentially unclaimed.
- **"Premium onboarding as the wedge" is partly claimed but soft** (HoneyBook/SuperOkay polish; AI-onboarding via Moxo/GUIDEcx). None combine *branded onboarding + live ship-tracking for a solo dev*.

### Pricing norms

- Solo tier: **$9–24/mo flat**, usually with client caps on cheap plans (SuperOkay caps 3 clients @ $9).
- Mid/agency: $29–129/mo, seats included then +$20–39/extra seat.
- Dominant model: flat monthly by feature tier; per-client pricing rare; 14-day trials standard; true free tiers uncommon among polished players.

### Honest moat check (blunt)

Crowded, mature space — a generic Soloist would be DOA. Realistic differentiation for a single builder, most→least defensible:

1. **Dev-native integrations as the moat** — auto-generate the "shipped" feed from GitHub/Vercel/Linear/CI so updates need zero manual logging. Incumbents are creative-tool integrated (Figma/Loom), structurally won't chase this.
2. **Transparency-first narrative** — "your client never asks 'any updates?' again" as the whole pitch.
3. **Niche tightly on solo product engineers serving founders.**
4. Speed/DX and opinionated defaults over Bonsai/Dubsado config-heaviness.

### Recent shifts (2024–2026)

- AI-native onboarding is the hot emerging category (conversational intake replacing static forms).
- HoneyBook & others raised prices in 2025 → tailwind for a lean solo entrant.
- **Unexploited AI angle:** AI-generated client-facing progress summaries — turn raw commits/tickets into a plain-English "what shipped" the client understands. Fits the dev-native wedge directly.

**Strategic takeaway:** Position Soloist not as "another client portal" but as the **dev-native, transparency-first engagement window** — the only one that auto-pulls "what shipped" from a developer's real tools and renders it as a premium, founder-facing experience. Onboarding polish = the entry; live ship-feed = the retention hook; dev-tool integration = the moat.

_Sources: superokay.com, copilot.com, withmoxie.com, hellobonsai.com, spp.co, manyrequests.com, agencyhandy.com, client-portal.io, getperspective.ai, moxo.com._
