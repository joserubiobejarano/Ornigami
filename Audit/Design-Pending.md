# Design & Copy — Full Redesign Plan (Ornigami · Agent-LocalLift)

**Owner of this doc:** design/UX audit (Claude). **Implementer:** a separate agent — *this document is the brief; the auditor does not write product code.*
**Date:** 2026-08-12
**App in scope:** `Agent-LocalLift` **only**. Agent-Contactor and Agent-Follow-Up are explicitly out of scope and must not be touched.
**Method:** Fresh read of the current source + live browser pass of the running dev build (home, review-replies, review-booster, pricing, signup, demo, about, header, footer) + design research. Skills applied: `frontend-design`, `design-critique`, `ux-copy`.

## Implementation status — second verification pass

**Verified:** 2026-08-12 against `Agent-LocalLift` after the redesign and follow-up alignment work.

The locked design, copy, and app-alignment requirements in this document are implemented. The second pass confirmed:

- Hanken Grotesk, Inter, and Geist Mono are loaded through `next/font`; the legacy font declarations are gone.
- Navy is the only primary color; gradients, gradient text, colored CTA shadows, and saturated structural status surfaces are gone from the in-scope UI.
- The shared `Button`, `Input`, `Textarea`, marketing primitives, motion provider, and tokenized status treatments are used across public pages and the aligned dashboard surfaces.
- Reduced motion is respected through `MotionConfig reducedMotion="user"` plus CSS fallbacks, and custom controls have visible keyboard focus states.
- The homepage has a real staggered hero, three platform cards, three clearly illustrative day-in-the-life cards, one navy feature band, one final CTA, and the restrained origami fold.
- Public, secondary, auth, legal, demo, and per-agent pages share the same header/footer shell and CTA vocabulary. The footer is consolidated into Product, Company, and Legal groups.
- Dashboard primary actions, Review Booster settings/new-visit/upload controls, and status colors use the shared design system without undertaking a separate dashboard redesign.
- The dead marketing components and legacy CTA helper listed in Appendix A were removed; illustrative content remains labeled as examples.

Final verification evidence:

- `npm run lint` passed.
- `npm run build` passed; the only output was the existing Next.js Edge Runtime deprecation warning.
- `npm test` passed: 11/11.
- `npm run test:security` passed: 5/5.
- Browser QA covered 18 routes: all returned HTTP 200, rendered content, showed no Next error overlay, and produced no console or page errors. Reduced-motion mode and the Products menu interaction were also verified. The home and login layouts were visually inspected from fresh screenshots.

## Owner-directed visual restoration pass - 2026-08-13

After the audit was marked complete, the owner requested two targeted restorations from the prior implementation. These are now implemented and verified:

- The homepage hero was returned to the previous reference treatment: original headline and copy, trust row, CTA labels, background treatment, and review inbox mockup.
- The dark feature-band mockups beside "Every review answered, every time." and "Turn good visits into lasting trust." were returned to their previous versions, including the dark review inbox, purple reply-ready panels, Review Booster stats, and four-customer follow-up list.
- Browser verification confirmed both restored mockups render on the homepage with the reference content and no application error overlay.
- `npm run lint` and `npm run build` continue to pass after the restoration pass.

This document is now complete for the Agent-LocalLift redesign scope. Any future work should be treated as a new product or app-focused pass, not as pending work from this brief.

## Direction decisions (locked by owner)

1. **Personality: "Calm & confident."** Navy + white, generous whitespace, one restrained accent at a time, real product UI as the hero, subtle purposeful motion. Premium but approachable — the product speaks, the chrome stays quiet.
2. **Scope: Public site + shared design system.** Build the token/type/button/motion system once, then redesign every public page against it. The in-app dashboard is **not** redesigned here — it inherits the tokens and buttons via the "App alignment" notes in Part 4.
3. **Hard constraints from owner:**
   - White + **dark navy** as the primary system. Purple / green / yellow are **accents only**, on small elements (icons, badges, stars, single highlighted words) — never as a page's primary button or hero color.
   - **No gradients anywhere** — not in backgrounds, not in text, not in buttons.
   - The site must **feel alive** (tasteful, consistent motion).
   - **Buttons must be one consistent system** — same shape, same primary color, same hover behavior everywhere.
   - **Same look & feel on every page**, including secondary/demo/per-agent pages.

## How the implementing agent should use this doc

- **Part 2 (design system) is the foundation — build it first.** Every page fix references it.
- Parts 3–5 are the page work. Do them after the system exists so you're applying tokens, not inventing per-page styles.
- Anything phrased as "must / remove / replace" is a firm instruction. Anything phrased as "consider / prefer" is guidance you can adapt if you find a cleaner path — but keep the constraints above inviolable.
- When done, work through the **Part 6 acceptance checklist** and the **complaint-resolution map** in Part 1.

---

# Part 0 — Status of the previous audit (`02-Design-and-UI-UX.md`)

The previous audit's fixes were implemented by the other agent. I verified the high-impact structural items against current source and the running build:

**Confirmed genuinely fixed (no further action):**
- `<Toaster>` is now mounted in `src/app/layout.tsx` (toast feedback works); there are now **0** stray `toast()` call sites. *(was G-3)*
- `--muted-foreground` is now distinct from `--foreground` in `globals.css` — secondary-text hierarchy restored. *(was G-4)*
- `/pricing` is linked from both header and footer. *(was W-1)*
- No mojibake remains on the marketing/per-agent pages. *(was W-2)*
- `/settings` route exists and the user-menu / banner / sidebar links resolve to it. *(was A-1/A-4)*
- A persisted light/dark theme toggle exists. *(was G-5)*

**Superseded by this redesign (do not action the old doc's versions — this doc replaces them):**
All the previous doc's granular styling items (D-1 off-token navy button, W-3 "four button styles", W-6 pricing design language, D-2 templated font/branding, W-5 dead agent color data, W-4 placeholder testimonial). These are re-diagnosed and given a single coherent fix in Parts 2–3 below.

**Still-true and carried forward into this plan (verified against current code):**
- **Multiple competing "primary" colors** persist — navy (`bg-slate-900`) on home/header, token **purple** (`bg-primary`) on auth/pricing/error pages, and **gradient** CTAs on the per-agent pages. → Fixed by Part 2 (one navy primary) + Part 3.
- **No real typography** — the app loads **no web fonts**; it declares `Avenir Next` (body) and `Trebuchet MS` (headings) in CSS and falls back to whatever the OS ships. → Fixed by Part 2 (Typography).
- **Dead marketing components** — `HeroSection`, `FeaturesSection`, `FeatureShowcase`, `FeatureSplit`, `HowItWorksSection`, `TestimonialsSection`, `TestimonialCard`, `WhoItsForSection`, `CTASection`, `FAQSection`, `FAQAccordion`, `FeatureCard` are imported by **0 files** (the homepage inlines everything). → See Appendix A.
- **The shadcn `Button` primitive is bypassed** on every marketing page (pages hand-roll `<Link className="...">` buttons). → Fixed by Part 2 (Buttons).

**Action:** `02-Design-and-UI-UX.md` is to be **deleted** (this doc replaces it — done as part of this handoff).

---

# Part 1 — Critical design audit (what's wrong today)

### First impression (design-critique: the 2-second read)

The homepage hero is genuinely good — calm, confident, real product mockup, clear headline, good whitespace. That's the north star. **The problem is that nothing else on the site matches it.** As you scroll and move between pages, the identity falls apart: the palette multiplies, the buttons change color and shape, whole sections adopt a different visual language, and the type has no personality because no real font is loaded. It reads as several different products stitched together — which is exactly the impression a "calm & confident" brand cannot afford.

### Findings

| # | Severity | Location | Problem | Fix (see) |
|---|----------|----------|---------|-----------|
| **F-1** | 🔴 Critical | Whole site | **Three competing primaries:** navy `bg-slate-900` (home/header), purple `bg-primary` (auth, pricing, error, not-found), and **gradient** pills (review-replies purple→blue; review-booster orange→pink). No single primary. | 2.2, 2.4 |
| **F-2** | 🔴 Critical | `globals.css` | **No web font is loaded.** `Avenir Next`/`Trebuchet MS` are declared but never shipped, so headings render in whatever the OS has (often Trebuchet — soft/dated). Type carries zero brand personality. | 2.3 |
| **F-3** | 🔴 Critical | `review-replies`, `review-booster`, `local-seo` | **Gradients in text and buttons** (`bg-clip-text` purple heading; `from-purple` / `from-orange-400 to-pink-500` CTAs). Directly violates the no-gradient rule and clashes with the hero. | 2.2, 3.3 |
| **F-4** | 🟠 High | `page.tsx` "The platform" section | **3-column grid with only 2 cards** → empty right third, layout reads broken. | 3.2-B |
| **F-5** | 🟠 High | `page.tsx` testimonials | **1 testimonial in a 3-col grid** ("Illustrative workflow") → same broken-grid effect; weak social proof. | 3.2-F |
| **F-6** | 🟠 High | Whole site | **Too many colors at once.** Home alone uses navy, emerald, purple, orange/amber, sky as structural color (step badges 01/02/03 are navy/green/orange; dark band alternates purple & orange sections). No restraint. | 2.2 |
| **F-7** | 🟠 High | `page.tsx` hero motion | **Hero "animations" are inert** — `initial={{ opacity: 1 }}` means the fade never happens. Combined with no hover/ambient motion, the page "doesn't feel alive." | 2.5, 3.2-A |
| **F-8** | 🟠 High | Buttons everywhere | **Inconsistent hover + shadow.** Some buttons `hover:brightness-105`, some `hover:bg-slate-800`, some `hover:bg-purple-500/20`; navy CTAs carry an **orange** glow (`shadow-orange-200`) that belongs to no system. | 2.4 |
| **F-9** | 🟠 High | Dark feature band (`bg-slate-950`) | The "Every review answered" / "Turn customers into 5-star reviewers" band uses a **different visual language** than the hero (heavy purple/orange accents, outline pills), so it "feels weird / off-brand." | 3.2-D |
| **F-10** | 🟡 Medium | `page.tsx` "Up and running in minutes" | Owner dislikes this section; the numbered 01/02/03 device is generic and the copy is thin. | 3.2-C (remove/replace) |
| **F-11** | 🟡 Medium | `Footer.tsx` | Footer is heavy and has **redundant pages** (Legal column lists Privacy + Terms + a third "Legal"; Company splits Contact/Feedback/About/Live demo). | 3.1-B |
| **F-12** | 🟡 Medium | `about`, `demo`, `contact`, `local-seo` | Secondary pages are **thin and off-system** — sparse content floating in dead space, off-center columns, purple eyebrows/links, mismatched card tints. | 3.4–3.6 |
| **F-13** | 🟡 Medium | Home mockups & `BrandMark` | Purple is used as a **primary** surface (draft-ready blocks, logo) rather than a small accent; needs to be demoted to accent per the new rules. | 2.2, 3.2 |
| **F-14** | 🟡 Medium | `ui/button.tsx` unused | A real `Button` primitive exists but marketing bypasses it — guarantees drift. | 2.4 |
| **F-15** | 🔵 Low | Home | Duplicated trust badges & CTAs ("Cancel anytime" appears in hero and elsewhere; two near-identical final CTAs). | 3.2 |

### Complaint-resolution map (every owner complaint → where it's fixed)

| Owner's complaint | Addressed in |
|---|---|
| No animations, doesn't feel alive | 2.5 Motion system + 3.2-A hero sequence |
| Too many colors; should be white + navy, others only complementary/small | 2.2 Color + F-6/F-13 |
| Buttons not aligned — different colors, some hover, some not | 2.4 Buttons (one system) + F-1/F-8 |
| "A calmer way…" should have 3 cards, only 2 | 3.2-B |
| Dislike "Up and running in minutes" | 3.2-C (remove/replace) |
| No gradients (bg or text) | 2.2 rule + F-3 removals across pages |
| "Every review answered" / "Turn customers into 5-star reviewers" feel weird / too many colors | 3.2-D (re-style dark band to system) |
| "See how Ornigami fits into a busy day" has 1 testimonial, want ≥3 | 3.2-F |
| Footer too big / too many pages | 3.1-B (consolidate IA) |
| Same look & feel on every page incl. secondary/demo/agent pages | 2.x system + 3.3–3.7 + Part 4 |
| Likes: hero, some modals, button shadow | Preserved & systematized in 2.4 (neutral shadow) and 3.2-A |

---

# Part 2 — The new design system (build this first)

## 2.1 Design principles

1. **One primary, one accent at a time.** Navy is the only primary. On any given section, at most **one** accent color appears, and only on small elements.
2. **Let the product be the hero.** Real UI mockups (which are already strong) carry the visual interest; the surrounding chrome stays quiet.
3. **Whitespace over decoration.** Calm confidence comes from spacing and type discipline, not from color or effects.
4. **Motion is meaning.** Every animation earns its place (entrance, reveal, feedback). Nothing loops or distracts. `prefers-reduced-motion` is always respected.
5. **Signature, used sparingly:** the **origami fold** (see 2.7).

## 2.2 Color

Replace the current palette. Define these as CSS variables in `globals.css` (`:root` and `.dark`) and expose them through the Tailwind v4 `@theme`. **Retire structural use of emerald/orange/sky/amber as section colors** — they survive only as the small accents below.

**Light theme (default):**

| Role | Token | Value | Use |
|---|---|---|---|
| Page background | `--background` | `#FFFFFF` | Default page bg |
| Subtle surface | `--surface` | `#F6F8FB` | Alternating section tint, cards on white |
| Card | `--card` | `#FFFFFF` | Card bg |
| Border | `--border` | `#E6EAF1` | Hairline dividers, card borders |
| **Primary / ink** | `--primary` | `#111C36` (deep navy) | Text headings, primary buttons, dark bands |
| Primary hover | `--primary-hover` | `#1E2C4F` | Button hover |
| Primary text on light | `--foreground` | `#111C36` | Body-dark text |
| Muted text | `--muted-foreground` | `#5B6B86` | Secondary text, captions, eyebrows |
| Focus ring | `--ring` | `#3B5BDB` (navy-blue) | Visible keyboard focus |

**Dark band / dark theme surface:** `--navy-900: #0C1428`, `--navy-800: #111C36`, with text `#E7ECF5` and muted `#93A0BC`. The dark feature band uses these — **no purple/orange fills.**

**Accents (small elements only — icons, badges, single highlighted word, stars, status dots). Never a primary button, never a background wash, never a gradient:**

| Accent | Token | Value | Reserved meaning |
|---|---|---|---|
| Brand purple | `--accent-purple` | `#6C5CE7` | Ornigami logo mark + **Review Replies** agent identity (icon/badge only) |
| Green | `--accent-green` | `#1E9E6A` | Success, "sent/replied", **Review Booster** agent identity (icon/badge only), trust checks |
| Yellow | `--accent-yellow` | `#F4B740` | Star ratings, small highlight/emphasis only |

**Rules the implementer must enforce:**
- Delete every `bg-gradient-*`, `from-*`, `to-*`, `via-*`, and `bg-clip-text` used for gradient text across all in-scope pages (F-1, F-3). Grep targets: `page.tsx`, `review-replies`, `review-booster`, `local-seo`, `pricing`.
- Change the shadcn `--primary` from the current purple `oklch(0.46 0.19 288)` to navy (above). This alone re-colors auth/pricing/error buttons to navy.
- The hero mockup "draft ready" blocks (currently purple fills) → use `--surface`/`--border` neutral blocks with a **small** purple icon/label only (demote purple, F-13).
- Keep the `BrandMark` purple — that's the one sanctioned brand-accent use of purple.

## 2.3 Typography

**Load real fonts** via `next/font` (self-hosted, no layout shift). Pairing for "calm & confident":

- **Display (headings):** **Hanken Grotesk** (Google) — confident, lightly humanist, trustworthy without being cold. Weights 600/700. Tight tracking on large sizes (`-0.02em`).
  - *Acceptable alternatives if preferred:* "General Sans" or "Satoshi" (Fontshare, self-host). Do **not** ship a high-contrast serif (that's the current AI-default look) — this brand is a precise, modern sans.
- **Body / UI:** **Inter** (Google), weights 400/500/600. `-0.01em` tracking on UI text.
- **Mono (data in mockups, numbers, code-ish chips):** **Geist Mono** (already available via the `geist` package) — used for review counts, dates, metrics inside product mockups to make the "product" read as real.

Remove the `Avenir Next` / `Trebuchet MS` declarations. Wire the fonts as CSS vars (`--font-display`, `--font-sans`, `--font-mono`) and map `h1–h6 { font-family: var(--font-display) }`.

**Type scale (desktop → clamp for mobile):**

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| Display XL | `clamp(2.75rem, 5vw, 4.25rem)` / 1.05 | 700 | Hero H1 |
| Display L | `clamp(2rem, 3.5vw, 3rem)` / 1.1 | 700 | Section H2 |
| Heading M | `1.25rem` / 1.3 | 600 | Card titles |
| Body L | `1.125rem` / 1.6 | 400 | Hero sub, section intros |
| Body | `1rem` / 1.6 | 400 | Default |
| Small | `0.875rem` / 1.5 | 400/500 | Captions, list items |
| Eyebrow | `0.75rem` / 1 · `+0.14em` tracking · uppercase | 700 | Section labels — set in **muted navy**, not purple |

## 2.4 Buttons (one system, replaces all hand-rolled buttons)

Adopt **one** button primitive (extend `src/components/ui/button.tsx`) and use it on **every** page, marketing included. No more inline `<Link className="rounded-full bg-...">`.

**Shape & feel (shared):** pill (`rounded-full`) to keep the hero's friendly shape; `font-semibold`; `text-sm` (md: `text-base` for hero); height 44px (`h-11`) default, 52px (`h-13`) hero; horizontal padding 20–28px; `transition: all 150ms`; **visible focus ring** (`--ring`, 2px offset).

**Variants (only these):**

| Variant | Fill | Text | Hover | Shadow |
|---|---|---|---|---|
| **Primary** | `--primary` navy | white | `--primary-hover` (darken) + lift `translateY(-1px)` | Soft **neutral** navy shadow: `0 8px 20px -6px rgba(17,28,54,.28)` — keep the shadow the owner likes, but **remove the orange glow** |
| **Secondary** | white | `--primary` | `--surface` bg + `--border` darkens | none / `shadow-xs` |
| **Ghost** (nav, footer, tertiary) | transparent | `--muted-foreground` | `--surface` bg, text→`--primary` | none |
| **Link** (inline "Learn more →") | none | `--primary` | underline / arrow nudges `translateX(2px)` | none |

- Every primary CTA on the site (`Try it free`, `Start free trial`, `Sign up`, `See how it works`, demo buttons) becomes **Primary** (navy). The only differentiation between CTAs is **primary vs secondary**, never color.
- "See how it works" on the per-agent dark band → **Primary on dark** (white fill, navy text) or a bordered white-on-navy — pick one and use it consistently on all dark bands.

## 2.5 Motion system

Small, consistent, purposeful. Centralize as reusable variants (a `lib/motion.ts` with shared `motion` variants) so every page uses the same timing.

- **Reduced motion:** wrap all of the below in a `prefers-reduced-motion` guard — reduced users get instant, no-transform reveals.
- **Hero entrance (fix F-7):** a real staggered sequence on load — eyebrow → H1 → subhead → CTAs → mockup, each `opacity 0→1`, `y 12px→0`, 0.5s ease-out, 70ms stagger. (Current code sets `initial opacity:1`, which disables the fade — change to `0`.)
- **Scroll reveals:** sections fade-up (`opacity 0→1`, `y 16→0`, 0.45s, `viewport once`, 60ms stagger between items). Keep — but verify content isn't left invisible if JS/motion fails (use `whileInView` with a sensible `initial` and `viewport={{ once: true, amount: 0.2 }}`).
- **Hover micro-interactions (adds "aliveness"):** cards lift `translateY(-3px)` + shadow step; primary buttons lift 1px; nav/links get a quick color/underline transition; product-mockup rows can highlight on hover.
- **Header:** gains a subtle bottom shadow / stronger border once the page is scrolled (`scroll > 8px`).
- **Ambient (optional, subtle):** one slow, low-opacity accent (e.g., the origami-fold mark or a single soft navy shape) — **not** the current multi-color blurred blobs. If kept, one shape, one color, very low opacity.
- **Remove** the three colored blurred "blobs" in the hero (purple/orange/sky) — they're the biggest source of "too many colors" up top. Replace with a single very subtle `--surface` radial or nothing.

## 2.6 Spacing, radius, elevation, borders

- **Spacing scale:** 4/8/12/16/24/32/48/64/96px. Section vertical padding: `py-24` desktop / `py-16` mobile (consistent everywhere).
- **Container:** `max-w-7xl`, `px-4 md:px-6 lg:px-8` (already used — keep consistent on the thin pages that currently drift).
- **Radius:** cards/buttons keep the current rounded feel — `--radius: 14px` for cards (`rounded-2xl`), pills for buttons. One radius language sitewide.
- **Elevation:** exactly three shadows — `xs` (border-like), `sm` (cards at rest), `md` (card hover / popovers). All **neutral navy-tinted**, no colored shadows.
- **Borders:** hairline `1px --border`. This is a load-bearing device in a calm design — use borders, not heavy shadows, to separate.

## 2.7 Signature element — the origami fold

Ornigami = folded paper. Give the brand one memorable, restrained device derived from that (frontend-design: the signature is the thing the page is remembered by):

- A **folded-corner** treatment on the primary hero card / featured pricing card / featured cards — a subtle diagonal "fold" at one corner (a small triangle with a 1px crease shadow), navy or `--surface`.
- Or a **single diagonal crease** hairline that section dividers echo.
- Use it in **one or two** places only (hero mockup corner + featured pricing plan). Do not repeat on every card. This is the "spend your boldness in one place" rule.

## 2.8 Components to standardize (build once, reuse)

Create/refactor these shared primitives so pages compose them instead of re-styling:
`Button` (2.4), `Eyebrow`, `SectionHeading` (eyebrow + H2 + intro), `Card`, `FeatureCard`, `Stat`, `Badge`/`StatusPill`, `Testimonial`, `FAQItem`, `CTASection`, `PageHero` (for secondary pages), `Footer`, `Header`. Delete the dead `marketing/*` components (Appendix A) or repurpose their names for these standardized versions — but there must be exactly **one** of each.

---

# Part 3 — Page-by-page redesign specs

## 3.1 Global chrome

### 3.1-A Header (`components/marketing/Header.tsx`)
- Keep the structure (logo, Products dropdown, Pricing, Log in, Try it free) — it's clean.
- Logo mark stays purple (sanctioned accent). "Try it free" → **Primary** button (navy) via the shared `Button`. "Log in" → **Ghost/Link**.
- Add the scroll-shadow behavior (2.5).
- In the Products dropdown, the agent icons currently use `bg-slate-700` / `bg-emerald-600` tiles — recode as: neutral `--surface` tile with the agent's **accent-colored icon** (purple for Replies, green for Booster). Consistent 1 style, accent only on the glyph.

### 3.1-B Footer (`components/Footer.tsx`) — consolidate (fixes F-11)
Owner wants it smaller with fewer pages. Target IA:

- **Merge Legal into one link.** Keep `/privacy` and `/terms` as the real legal pages; **fold the standalone `/legal` page's content into a short section on those** (or make `/legal` a simple index) and remove the third redundant "Legal" link. Result: Legal column = *Privacy* · *Terms* only (or a single "Legal" link to a combined page).
- **Merge `/feedback` into `/contact`** as a tab/section ("General / Feedback"), and drop the separate Feedback footer link. One "Contact" destination.
- Resulting footer: **3 tight groups** — *Product* (Review Replies, Review Booster, Pricing, Live demo) · *Company* (About, Contact) · *Legal* (Privacy, Terms) — plus the brand blurb. Reduce vertical padding (`py-12`→ compact), keep the single bottom "Try it free" (Primary).
- Keep the slim demo-page footer variant.
- *(Route cleanup — coordinate with the features/IA owner before deleting routes; this doc only prescribes the nav/visual consolidation. If `/legal` or `/feedback` must remain as routes, just remove them from the footer and redirect.)*

### 3.1-C Page shell
Every public page uses the same shell: shared Header, `max-w-7xl` container, consistent `py-24/py-16` sections, shared Footer. The thin pages (about/contact/demo) currently break this — bring them in.

## 3.2 Homepage (`src/app/page.tsx`) — section by section

**A. Hero — keep, fix, polish.** This is the model for the whole site.
- Fix the inert animations (2.5 hero sequence: set `initial opacity:0`).
- Remove the 3 colored blur blobs (F-6). Optional: one very subtle neutral shape or the origami fold behind the mockup.
- CTAs → shared `Button` (Primary navy "Try it free", Secondary "See a live demo"). Remove `shadow-orange-200`; use the neutral navy shadow (2.4).
- Trust badges: keep the three checks; green check glyph is fine (accent). De-duplicate "Cancel anytime" elsewhere (F-15).
- Mockup: demote purple "draft ready" fills to neutral with a small purple label (F-13). Add the folded-corner signature (2.7).

**B. "The platform / A calmer way to manage local reviews" — fix the 2-vs-3 grid (F-4).**
Owner wants 3 cards. Options, pick one:
- **Preferred:** add a genuine third capability card so the grid is full and truthful. Candidate third card = **"Local SEO / visibility"** (the `/local-seo` page already exists) — e.g. *"Local visibility — keep your Google profile complete and found."* This matches the hero's "reviews, reputation, and local visibility" promise (which currently only delivers two).
- If a third product isn't real yet: change the grid to **2 columns centered** (`md:grid-cols-2 max-w-4xl mx-auto`) so two cards look intentional, not broken.
- Recode cards to one style: neutral `--surface`/white card, `--border`, **accent-colored icon only** (purple/green), navy title, muted body, one green check list, "Learn more →" link-button. Add hover lift.

**C. "Up and running in minutes" — remove (F-10).**
Owner dislikes it. Remove the section. If a light "how it works" is still wanted, fold a **one-line, 3-step inline strip** (no big numbered badges, no separate section) into the hero or the platform section — but default is **delete**.

**D. Dark feature band — re-style to system (F-9).**
Keep the two feature splits (Review Replies, Review Booster) but bring them into the calm system:
- Background: single `--navy-900` band (no per-section color identity).
- Eyebrows: muted light (`--navy` muted), not saturated purple/orange. Agent identity shows only via the **small icon** (purple / green).
- Bullet icon chips: neutral translucent white circle with an accent glyph — one treatment for both agents.
- CTA: one "Primary on dark" button style for both (2.4). Remove the purple-outline vs orange-outline split.
- Mockups: keep (they're strong); ensure their internal accents are the *small* purple/green only, no gradient.
- Headlines "Every review answered, every time" / "Turn customers into 5-star reviewers" can stay as copy, but they should now sit in the same visual frame as the hero so they stop "feeling weird."

**E. FAQ (dark band) — keep,** restyle to `--navy-900`, navy hairline borders, accent-free. Good as a pattern.

**F. Testimonials "See how Ornigami fits into a busy day" — 3 cards (F-5).**
Owner wants ≥3 even without real customers. Approach that stays honest (per prior "no fake testimonials" constraint):
- Reframe the section from *testimonials* to **"A day with Ornigami"** — 3 **scenario cards** (morning/afternoon/evening, or Café/Salon/Clinic) each showing a realistic *workflow moment* ("A 4-star review lands at 2pm → draft ready → approved in one tap"), clearly illustrative, not attributed to fake people.
- 3 equal cards, one card style, small accent icon each, navy titles. This fills the grid truthfully and reads as product storytelling.
- If/when real testimonials exist, the same 3-card grid holds them. Keep any illustrative content clearly labeled.

**G. Final CTA — keep one,** navy Primary + Secondary, neutral shadow. Remove the duplicate/near-identical CTA (F-15). Remove the flat `bg-slate-100` overlay hack; use a clean `--surface` band or the navy band once.

## 3.3 Per-agent pages (`/review-replies`, `/review-booster`)
These are the worst offenders for the "every page should match" complaint.
- **Remove all gradients:** the purple `bg-clip-text` heading word on `/review-replies`; the `from-purple` CTA; the `from-orange-400 to-pink-500` CTA on `/review-booster` (F-3).
- Rebuild both on the **homepage's system**: same Header, same hero layout (headline + subhead + Primary/Secondary buttons + trust row + product mockup with folded corner), same section rhythm, same dark band treatment.
- The agent's identity appears **only** as its small accent (Replies = purple glyph/badge; Booster = green glyph/badge) — never as the page's button color or a gradient.
- Reuse the shared `SectionHeading`, `FeatureCard`, `FAQItem`, `CTASection`. The two agent pages should feel like siblings of the homepage, differing only in content and one accent glyph.

## 3.4 Pricing (`/pricing`)
- Already close structurally. Recolor to system: eyebrow → muted navy (not purple); toggle, "Most popular" badge, and all "Start free trial" buttons → **navy Primary** (they're purple today).
- Featured plan ("Complete") gets the **origami folded-corner** signature + navy ring, instead of a purple outline.
- Keep the 3-plan grid, monthly/annual toggle, and the per-location note. Ensure card borders/shadows match 2.6.

## 3.5 Demo pages (`/demo`, `/demo-review-replies`, `/demo-review-booster`)
- `/demo` is currently sparse with mismatched card tints (one green, one white) and purple buttons, floating in dead space (F-12).
- Recode: shared `PageHero` ("Try Ornigami with sample data"), then **2 equal cards, one style** (neutral card, accent glyph per agent), **navy Primary** demo buttons, and a secondary "Create free account". Constrain to `max-w-4xl` centered so it doesn't float.
- The interactive demo sub-pages must use the shared Header/Footer and the same button system.

## 3.6 About / Contact / Feedback / Local-SEO
- **About:** currently a thin left-floating column in a huge empty page. Rebuild with `PageHero` (centered or a proper 2-col with a supporting visual), consistent container, navy eyebrow (not purple), Primary/Secondary CTAs, and enough structure (mission + how-we-work + CTA) to not read as empty.
- **Contact:** shared shell, one form styled with system inputs (see below), Primary submit. Absorb **Feedback** as a section/tab here (3.1-B).
- **Local-SEO:** remove its gradients (`from-*`), bring to system; if it becomes the third platform card (3.2-B), make sure the page delivers on that promise with the shared hero/section components.
- **Form inputs (site-wide):** define one input style — `--surface`/white bg, `1px --border`, `--radius`, clear label above, visible focus ring (`--ring`), inline validation/error text in `--destructive`. Auth, contact, and settings all use it.

## 3.7 Auth (`/login`, `/signup`)
- Primary buttons ("Sign up", "Log in") are **purple today** (bg-primary) → become **navy** automatically once `--primary` changes, but verify.
- Apply the shared input style (3.6). Keep "Continue with Google" as a Secondary button with the Google glyph.
- Ensure inline error text is visible (not toast-only) — the toast host now exists, but auth errors should also render inline near the form.
- Card gets consistent radius/shadow/border; add the subtle folded-corner if desired (once).

## 3.8 Error / Not-found / Legal / Privacy / Terms
- `error.tsx` and `not-found.tsx` use `bg-primary` → now navy automatically; confirm they use the shared `Button` and shell.
- Legal/Privacy/Terms: shared `PageHero` + a readable long-form content style (max-w prose, navy headings, muted body, hairline dividers). One template for all three.

---

# Part 4 — App (dashboard) alignment notes

The in-app dashboard is **not** redesigned here, but it must stop looking like a different product. Minimum alignment so it inherits "calm & confident":

1. **Tokens:** it already consumes `--primary` etc. — changing them (2.2) re-colors it to navy for free. Verify the dashboard's primary actions now read navy, not purple.
2. **Buttons:** route dashboard primary/secondary actions through the same shared `Button` (2.4). No bespoke button colors.
3. **Fonts:** the new `next/font` wiring is global, so the app picks up Hanken Grotesk/Inter automatically. Verify headings changed.
4. **Status colors:** map any ad-hoc status colors to the three accents (green success, yellow warning/attention, `--destructive` error) — no new hues.
5. **Do not** undertake a full dashboard visual redesign in this pass — just tokens + buttons + fonts + status colors. A separate app-focused pass can follow if wanted.

---

# Part 5 — Copy pass (ux-copy)

Small, high-value copy tightening to do alongside the visual work:

- **One CTA vocabulary.** Pick and use everywhere: primary = **"Start free trial"** (or "Try it free" — choose one and use it in header, hero, footer, pricing, final CTA — currently mixed: "Try it free", "Try it free — 14 days on us", "Start free trial", "Start free today"). Secondary = **"See a live demo"** consistently.
- **Trial facts must agree.** Hero says "14-day free trial" + "No card required"; FAQ says "no card required"; pricing says "14-day free trial". Keep one canonical statement of trial length + card policy and use identical wording everywhere.
- **Eyebrows:** short, sentence-informative, muted-navy. Avoid vague ones; e.g. "The platform" → "What Ornigami does".
- **Section heads:** keep the good ones (hero, "Every review answered"). For the reframed day-in-the-life section use a plain, concrete head (e.g. "A normal day, handled").
- **Empty/again honesty:** any illustrative content (scenario cards, sample data) stays clearly labeled as an example — never implied to be a real customer.
- **Buttons say what happens:** "Start free trial" → the resulting screen/toast uses the same verb; "See a live demo" leads to the demo, etc.

---

# Part 6 — Acceptance checklist (QA before calling it done)

**System**
- [x] Real web fonts load via `next/font` (Hanken Grotesk + Inter + Geist Mono); no `Avenir Next`/`Trebuchet MS` references remain.
- [x] `--primary` is navy; a global grep finds **no** `bg-gradient`, `from-`, `to-`, `via-`, or `bg-clip-text` in in-scope pages.
- [x] Exactly one `Button` primitive; no inline `rounded-full bg-...` CTAs remain on marketing pages.
- [x] No colored button shadows (`shadow-orange-*` etc.) anywhere; primary shadow is neutral navy.
- [x] Accents (purple/green/yellow) appear only on small elements; no accent used as a page's primary button or background.
- [x] `prefers-reduced-motion` respected; keyboard focus visible on every interactive element.

**Home**
- [x] Hero animations actually play (fade+rise) on load.
- [x] "The platform" grid is full (3 real cards) or intentional 2-col centered.
- [x] "Up and running in minutes" removed (or replaced by the inline strip).
- [x] Dark band re-styled to one navy language; no purple/orange section fills.
- [x] Day-in-the-life section has 3 equal cards.
- [x] No colored blur blobs; one final CTA.

**Every page**
- [x] Home, review-replies, review-booster, pricing, demo, about, contact, login, signup, legal/privacy/terms, error, not-found all share Header/Footer, container, section rhythm, navy buttons, and type.
- [x] Footer consolidated (3 groups; no redundant Legal/Feedback links).
- [x] Secondary pages no longer float in dead space; content is structured and centered/contained.

**App alignment**
- [x] Dashboard primary actions read navy; fonts updated; status colors mapped to the three accents.

**Copy**
- [x] One CTA vocabulary sitewide; trial facts identical everywhere; illustrative content clearly labeled.

---

# Appendix A — Dead code to remove/repurpose

Imported by 0 files today (homepage inlines everything). Either delete, or repurpose the names as the standardized shared components in 2.8 — but there must be exactly one of each concept:

`marketing/HeroSection.tsx`, `FeaturesSection.tsx`, `FeatureShowcase.tsx`, `FeatureSplit.tsx`, `HowItWorksSection.tsx`, `TestimonialsSection.tsx`, `TestimonialCard.tsx`, `WhoItsForSection.tsx`, `CTASection.tsx`, `FAQSection.tsx`, `FAQAccordion.tsx`, `FeatureCard.tsx`. (`FloatingDots.tsx` is used in 8 files — if the ambient/blob motion is being removed, review whether it's still wanted.)

# Appendix B — Reference direction (research)

Aesthetic targets for "calm & confident, navy + white, product-forward, restrained motion": Mercury, Linear (light surfaces), Ramp, Vercel — clean navy/ink + white, product UI as hero, hairline structure, one accent, subtle scroll/hover motion, no multi-color washes. 2026 trend research confirms: minimal motion that adds meaning, product previews embedded in the hero, and conservative navy/white palettes signaling trust for local/finance-adjacent audiences.

Sources: [50 Best SaaS Landing Pages 2026 — Arounda](https://arounda.agency/blog/landing-page-examples) · [Fintech SaaS landing pages 2026 — DesignRevision](https://designrevision.com/blog/fintech-saas-landing-pages) · [10 SaaS design trends 2026 — SaaSFrame](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
