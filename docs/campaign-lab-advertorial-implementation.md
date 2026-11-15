# Campaign Lab advertorial — implementation and review

Status: implemented for local review; not published. Live model generation is
out of scope.

- Branch: `codex/campaign-lab-advertorial-impl-20261115`
- Implementation commit: `bdce062` (`feat: add versioned single-product advertorial template`)
- Base: `ba24285` (Session 1 spec and review briefs on top of `bc58db6`)
- Template: `single-product-advertorial` v1.0.0
- Layouts: `advertorial-full`, `advertorial-one-photo`

## What changed

- Added `src/lib/campaign-lab/advertorial.ts` with the additive manifest,
  deterministic assembler, brief/draft validation, fit assessment, asset
  resolution, and revision hash. The existing `single-product-offer` manifest
  and section IDs are unchanged.
- Added `AdvertorialPage` and its CSS. It reuses the resolved brand tokens,
  container-query responsive pattern, action/offer styling, and reviewed asset
  records rather than forking the token system.
- Added a format selector to Campaign Lab. The offer template remains the
  default for a brief with no approved advertorial material. The advertorial
  layout can be automatic from the approved image set or selected explicitly.
- Added Morrow fixtures with the approved opening copy, two story beats, three
  facts, disclosure, transition, and four image roles. The one-photo fixture
  keeps only the reviewed packshot.
- Added the three supporting Morrow fixture images. Their SHA-256 hashes match
  the review brief. The product hero stays the existing reviewed Morrow webp;
  its asset ID, alt text, and content hash are carried into the revision.
- Added focused unit tests and an editor capture runner. Captures and the
  Momisa pilot remain under ignored `.local/` storage.

## Preview instructions

Campaign Lab is development-only and requires local environment values for the
app middleware. Copy the operator's existing `.env.local` into this worktree;
do not commit it.

```powershell
npm ci
npm run dev
```

Open:

- `http://localhost:3000/campaign-lab?fixture=morrow-advertorial-full`
- `http://localhost:3000/campaign-lab?fixture=morrow-advertorial-one-photo`
- `http://localhost:3000/campaign-lab?fixture=momisa-glow-box` when the ignored
  Momisa pilot is present at `.local/campaign-lab-pilots/momisa/`

Select `Format`, choose a layout, then `Generate preview`, then `Approve
preview`. The preview region exposes the template, layout, revision, section
order, story-beat IDs, fact IDs, disclosure label, and asset ID as `data-*`
attributes for agents and tests.

Capture the exact editor flow:

```powershell
node scripts/campaign-lab-advertorial-capture.mjs -u http://localhost:3000
```

Captures and `summary.json` are written to
`.local/campaign-lab-advertorial/`.

Run the existing offer-page acceptance against approved fixture metadata:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3000 `
  --manifest tests/fixtures/campaign-lab/offer-regression-manifest.json `
  --only sparse,long-copy `
  --out .local/campaign-lab-acceptance/offer-regression-approved `
  --require-approved
```

## Captures

All captures are ignored, real-brand/local-review storage:

- `morrow-full-375-first.png` / `morrow-full-375-full.png`
- `morrow-full-1440-first.png` / `morrow-full-1440-full.png`
- `morrow-one-photo-375-first.png` / `morrow-one-photo-375-full.png`
- `morrow-one-photo-1440-first.png` / `morrow-one-photo-1440-full.png`
- `momisa-offer-only-1440-fit.png` — default offer template plus the advertorial
  gap panel
- `momisa-offer-only-1440-gap.png` — advertorial selected, the specific missing
  inputs named, the last usable offer preview preserved, and the one-click
  `Use single-product offer` control
- `morrow-invalid-keeps-preview-1440-editor.png` — an invalid offer edit keeps
  the last usable revision and leaves approval cleared

The capture runner completed 53 checks with 0 failures. It checks disclosure
before the headline, no action before `product`, two actions with the exact
destination, no horizontal overflow, loaded images, hero asset identity, and
the approval states. Screenshots use reduced motion.

## Visual review

### First attention and reading sequence

At 375 px the first attention is the dark `ADVERTISEMENT · MORROW CERAMIC`
strip, then the Morrow wordmark, then the large headline. The campaign question
is visible before the first image. The first screen ends inside the use image;
it contains no buying action. At 1440 px the disclosure and wordmark share the
top row, the headline occupies roughly seven columns, and the standfirst sits
to the right on the headline baseline. The opening image is a deliberate
cinematic band rather than a gallery.

Each section gives a reason to continue:

- `opening` continues the source email's question and introduces a design
  change, not a generic slogan.
- `story` resolves the tension with two short approved beats. On desktop the
  rib detail sits offset from the story measure so the eye moves from text to
  evidence without a card grid.
- `evidence` makes the three approved facts the largest type in the band. The
  `PROTOTYPE 01` image is captioned by its visible label.
- `product` names the product once, states the approved transition, shows the
  packshot, and pairs the offer with the first action.
- `close` repeats only the offer, the same action, and the required
  disclosure. It does not repeat the product name.

The transition feels earned on the full brief because the story names the
prototype problem, the evidence names the ribs/outlet/body, and the product
block then says what the object is. It does not claim what the ribs do to
flavour or extraction. The transition is weakest at the start of the product
block, where the long approved product name repeats the headline's noun; the
spec requires that name once at the transition, so the redundancy is
intentional rather than a copy defect.

### One-photo case

`advertorial-one-photo` keeps the same disclosure, opening, two story beats,
two facts, product name, offer, and both actions. It drops the evidence band and
the opening/detail/use images. The packshot appears only in the product block,
at its natural aspect ratio with `object-fit: contain`; the `MORROW` wordmark
and printed label remain visible at 375 px. There is no empty image frame and no
fake lifestyle crop. The page still makes the rib story legible, but it has less
proof than the full brief; if the story beats were absent, this material should
use the offer template instead.

### Repository and standard checks

- `npx tsc --noEmit`: passed.
- Focused ESLint on the changed files: passed.
- 56 focused campaign-lab tests: passed.
- Offer-page regressions with the approved regression manifest: 144 checks
  passed, 0 failed, 0 pending at 375 px and 1440 px.
- The older `benchmark-proposal.json` manifest still reports the same five
  sparse-fixture findings at `bc58db6` and on this branch: the proposed
  manifest's product name/offer differ from the fixture and the long edited
  offer switches the deterministic layout. Those are pre-existing manifest and
  runner conditions, not a regression from this template.

## Offer-only brief — what the editor shows

Momisa starts on `single-product-offer`. The advertorial is marked
`inputs missing`, and the panel names:

- an approved advertorial opening (headline and standfirst);
- two or three approved story beats with a source quote;
- a commercial disclosure (label, sponsor, explanation);
- a product transition sentence;
- approved image roles beyond the product packshot.

Selecting the advertorial anyway produces a section-labelled error and leaves
the previous offer preview at the same revision. `Use single-product offer`
restores the offer template in one click. Editing any field clears approval.
The existing offer offer, exact destination, required fact group, and packshot
identity remain unchanged.

## Recommendation: which brief belongs in which format

Use `advertorial-full` for the Morrow brief. It has a named design change, two
approved story beats with sources, three approved facts, four approved image
roles, and one simple offer. The story has enough material to earn a product
transition without inventing a result.

Use `advertorial-one-photo` for Morrow only when the packshot is the only usable
image. The two beats and two facts still carry the rib story, but the page has
less evidence. If the story beats are not approved, use `single-product-offer`.

Use `single-product-offer` for Momisa. Its supplied material is a packshot,
three printed variant names, a count, and “for all skin types,” with an
unconfirmed `Glow Box` name, benchmark offer, Amazon search destination, pending
media rights, and pouch benefit claims that are printed but not approved for
this campaign. An advertorial would repeat unverified commercial terms and
amplify unapproved claims across more screens. A future product-selection page
could answer “which mask is which?” after Momisa confirms the name, claims,
rights, offer, and direct listing; that is still not a story-led advertorial.

## Boundaries and unassessed

- No live model calls: advertorial drafts are assembled deterministically from
  the validated brief. The route returns explicit deterministic provenance.
- No publishing, hosted preview, or live revision consumption was added.
- The review does not prove conversion, physical-device behaviour, screen-reader
  output, zoom, or slow-network behaviour beyond the browser checks.
- The Morrow runtime hero is the existing reviewed webp. The review brief's
  source SVG hash is recorded as fixture provenance, not as the rendered file's
  content hash.
