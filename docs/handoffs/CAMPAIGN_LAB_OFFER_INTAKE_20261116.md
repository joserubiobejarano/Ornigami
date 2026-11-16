# Browser offer intake — 16 November 2026

Status: local, development-only offer intake. No production publishing, loader
command, live provider, or manifest editing is required.

- Branch: `codex/campaign-lab-offer-studio-session1`
- Base: `f49451d`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/green-kiln`
- Entry point: `/campaign-lab/offer`
- Existing preview: `/campaign-lab?fixture=momisa-glow-box`

## What the entry point does

The operator enters:

- product name
- offer
- destination URL
- two or three approved facts (label and value)
- one local PNG/JPEG/WebP packshot
- packshot alt text
- packshot usage rights

Submitting builds a browser-only `CampaignFixture` and `CampaignCatalog` and
mounts the existing `CampaignLab` editor. It reuses the current brief validation,
single-product offer renderer, required fact groups, image gate, revision hash,
and approval behavior. No manifest is written and no loader command runs.

All entered facts become one required fact group, so the offer page cannot
silently drop one. The intake caps the form at the current three-fact
presentation; the group stays whole.

Validation is inline at each field. Missing product, offer, destination, facts,
packshot, alt text, or rights stay on the intake. Provisional rights text is
called out in place.

The browser-only fixture uses `localOnly` in `CampaignLab`; Generate preview builds
the deterministic local preview instead of calling the server API with an
unknown fixture ID. This avoids a false request failure and keeps the run
deterministic.

## Momisa

The existing Momisa pilot still loads from ignored local storage. Its offer and
Amazon-search destination remain marked as preview inputs pending confirmation;
the preview footer also retains **offer and destination unconfirmed**. Neither is
treated as confirmed commercial copy.

## Local run

```powershell
npm ci

$env:CAMPAIGN_LAB_PILOT_ID='momisa'
$env:GOOGLE_CLIENT_ID='local-review-client'
$env:GOOGLE_CLIENT_SECRET='local-review-secret'
$env:AUTH_SECRET='local-review-secret-local-review-secret'
$env:NEXTAUTH_SECRET='local-review-secret-local-review-secret'

npx next dev --webpack --port 3100
```

Open `http://localhost:3100/campaign-lab/offer`.

Suggested complete synthetic brief:

- Product name: `Harbor Field travel bottle`
- Offer: `20% off, 27–30 November 2026`
- Destination: `https://example.com/harbor-field`
- Facts: `Capacity / 500 ml`, `Closure / Screw cap`, `Material / Stainless steel`
- Packshot: `public/campaign-assets/harbor-field-bottle.webp`
- Alt: `Harbor Field 500 ml insulated travel bottle in graphite with a brushed steel screw cap.`
- Rights: `Client-approved for web and paid social.`

Then edit Offer in Campaign Lab, generate the fresh revision, and approve it.

Momisa preview:

```powershell
# same server with CAMPAIGN_LAB_PILOT_ID=momisa
http://localhost:3100/campaign-lab?fixture=momisa-glow-box
```

## Verification

Normal intake path at 375 px and 1440 px:

- blank submit stays on intake and shows product, offer, and destination errors;
- complete synthetic brief reaches the existing preview;
- packshot loads at `1200 × 1500` with the entered alt text;
- offer, `Shop now`, and destination are exact;
- facts render as `capacity, closure, material`;
- initial approval succeeds;
- changing Offer produces a new revision;
- the updated revision generates, remains approvable, and approves;
- document width equals the viewport at 375 and 1440;
- no browser console errors.

Observed revisions:

```text
initial:          4e724ed02052c269
edited offer:     445196410d782e64
```

Failed image: existing `images.404` browser case passed — the image has no
rendered pixels, approval stays blocked, and the editor names the failure.

Offer-page regressions: **144 passed, 0 failed, 0 pending** after the dev server
warmed. The first cold-server run hit the known generation-settle race once.

Campaign Lab unit tests: **85 passed, 0 failed**. TypeScript and focused ESLint
passed.

## Captures

Ignored local evidence:

```text
.local/campaign-lab-offer-intake/captures/
  mobile-375-intake-form.png
  mobile-375-intake-filled.png
  mobile-375-intake-preview-full.png
  mobile-375-product.png
  mobile-375-edited-approved.png
  desktop-1440-intake-form.png
  desktop-1440-intake-filled.png
  desktop-1440-intake-preview-full.png
  desktop-1440-product.png
  desktop-1440-edited-approved.png
  momisa-375-pending.png
```

At 375 px the product packshot, offer terms, and shopping action are visible in
sequence without horizontal overflow. At 1440 px the product split keeps the
packshot, offer, and action in the same view.

## UX / DX / AX check

- **UX:** The operator can enter one approved brief and reach the existing
  preview without a manifest, with field-level errors and approval tied to the
  exact revision; checked the existing offer edit/approval behavior and Momisa's
  pending labels.
- **DX:** The intake builds the same fixture/catalog shapes and calls the existing
  `CampaignLab`/`buildCampaignPreview` path; checked the existing offer-page
  fixtures and current validation.
- **AX:** Stable labels, inline error links, a deterministic local-only route, and
  explicit missing/provisional states make the path discoverable and recoverable;
  checked the existing generation and required-fact behavior.
