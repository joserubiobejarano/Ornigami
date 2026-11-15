# Campaign Lab handoff — 15 November 2026

## Branch and local run

- Branch: `feat/campaign-lab-local`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/witty-tiger`
- Route: `http://localhost:3000/campaign-lab`
- Fixtures: `?fixture=sparse` and `?fixture=long-copy`
- The route calls `notFound()` outside `NODE_ENV=development`. A focused test covers that gate.

The legacy app still imports Google auth configuration through `src/proxy.ts` during development. Create a git-ignored `.env.local` before running the app if one is not already present:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=local-campaign-lab.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=local-campaign-lab-google-secret
AUTH_SECRET=local-campaign-lab-auth-secret-0123456789abcdef
NEXTAUTH_SECRET=local-campaign-lab-nextauth-secret-0123456789abcdef
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
OPENAI_ENABLED=false
```

`npm run dev` then load either fixture URL. The campaign lab does not request a session; `AuthProvider` skips `SessionProvider` on this route so the local flow does not emit `/api/auth/session` errors when no database is running.

## Template contract

The designer-authored manifest is `SINGLE_PRODUCT_OFFER_TEMPLATE` in `src/lib/campaign-lab/template.ts`. The two compositions follow the benchmark direction: a direct, one-photo offer composition for sparse material and an editorial composition that earns its pacing from a long headline and approved product detail.

| Field | Value |
| --- | --- |
| Template ID | `single-product-offer` |
| Version | `1.0.0` |
| Format | Single-product offer / problem–solution campaign page |
| Required inputs | brand style, product name, offer, destination URL, approved asset ID |
| Allowed asset roles | `product-hero` |
| Layouts | `offer-led-one-photo`, `editorial-long-copy` |
| Copy limits | product name 90, offer 180, headline 180 |

### Layouts

**Offer-led, one photo** (Harbor Field sparse fixture)

1. Brand masthead.
2. Hero: product label, offer-led headline, lede, approved facts, offer terms, primary action, and one framed product image. On mobile the product image leads, then the headline, offer, and action. On desktop the copy is left and the image right.
3. Closing action with offer terms.
4. No detail section. The sparse fixture has no material for a third section, so none is invented.

**Editorial, long headline** (Morrow Ceramic long-copy fixture)

1. Brand masthead.
2. Full-width editorial headline over an arch-cropped product image and a support column with lede, offer terms, and primary action. On mobile the headline, lede, offer, and action come before the image so the action stays in the first screen.
3. Dark detail band containing the approved facts.
4. Closing action with offer terms.

The layout is selected deterministically. An approved angle headline wins. Otherwise the draft uses `"{offer lead} the {product noun}."`; a long offer falls back to the offer sentence. The editorial composition is chosen when the brand prefers it or the resulting headline exceeds 68 characters. This is why the long-copy fixture gets editorial treatment and the sparse fixture gets the one-photo offer layout.

## Structured facts and deterministic assembly

`CampaignBrief` owns the facts: brand ID, product name, product noun, offer, destination URL, approved asset ID, action label, approved product facts, and approved copy.

`TemplateDraft` owns only the template slots: layout, headline, lede, facts, closing copy, template ID, and template version. It has no `offer`, `destinationUrl`, `assetId`, or brand-style field. A later generator can replace `assembleDraft` without taking ownership of campaign facts, destination, or asset identity.

The renderer is `src/components/campaign-lab/campaign-page.tsx`. The editor and the evidence captures use that same component. Its layout responds to the preview container width through CSS container queries, so the responsive preview works inside the lab pane as well as at a full viewport.

Revision identity is a deterministic hash of the template ID/version, layout, resolved brand tokens, campaign facts, approved asset content hash, and draft slots. Approval stores that hash. Any edit clears approval; `Approve preview` is disabled until a fresh valid preview is generated.

## Fixtures and approved assets

| Fixture | Brand | Product | Offer | Action | Asset |
| --- | --- | --- | --- | --- | --- |
| `sparse` | Harbor Field | Harbor Field travel bottle | 20% off, 27–30 November 2026 | Shop on Amazon | `harbor-field-bottle-front` |
| `long-copy` | Morrow Ceramic | Morrow ceramic pour-over dripper | Free shipping through 30 November 2026 | See the dripper | `morrow-ceramic-dripper-front` |

Both assets are original fictional product renders. The SVG sources are in `assets/campaign-lab/` and the served WebP files are in `public/campaign-assets/`. Each asset record includes:

- Asset ID and content hash.
- Reviewed metadata: `Ornigami design review`, `2026-11-12`.
- Source and rights note.
- Reviewed alt text.
- `product-hero` role and `reviewed: true`.

The editor exposes the approved asset record in a disclosure under the Product image field. The rendered image uses the reviewed alt text.

## Validation and approval behavior

Validation is implemented in `validateCampaignForm` and `getDestinationUrlError`.

- Invalid destination: empty → “Enter the destination URL.”; malformed → “Destination URL must be a valid URL…”; non-HTTPS → “Destination URL must start with https://.”; credentials → “Destination URL cannot include a username or password.”; non-public host → “Destination URL must use a public hostname.”
- Missing offer: “Add the offer before generating a preview.”
- Missing image: “Choose an approved product image.”
- Unknown image: “That product image is not in the approved asset library.”
- Product name, offer, headline, and accent-color limits also return field-level messages.

A failed generation leaves the last valid preview rendered and interactive. The preview status names the last valid revision. The error summary receives focus and links back to each field. The approval status is separate from validation and names the exact short revision.

Local approval is in-memory for this slice. It is intentionally not publishing, not persisted, and not tied to an account.

## Accessibility contract

- Field labels: Product name, Offer, Destination URL, Product image. Brand style and Accent color are additional editor controls.
- Buttons: Generate preview, Approve preview.
- Preview region accessible name: Campaign preview.
- Validation status is a live `role="status"`; the error summary is a focused group with linked field messages.
- Approval and preview freshness are announced through a live `role="status"` that names the revision.
- Preview revision, layout, template version, and template ID are present as stable `data-*` attributes on the preview panel for Agent 2.
- The rendered region is named by its own heading and contains a correctly labelled article, heading hierarchy, image alt text, offer terms, and two CTAs with `target="_blank"` and `rel="nofollow noopener noreferrer"`.

## Verification

### Passed

- `npx tsc --noEmit`
- `npx eslint src/app/campaign-lab src/components/campaign-lab src/lib/campaign-lab src/components/providers/auth-provider.tsx src/components/layout-frame.tsx scripts/campaign-lab-capture.mjs`
- `node --experimental-strip-types --test tests/campaign-lab.test.mts` — 12/12 passing
- Lighthouse through the in-app browser on both fixture URLs — Accessibility 100, Best Practices 100, SEO 100, no reported failures
- Browser interaction checks:
  - Approve preview records the current revision and disables the button.
  - Editing the offer clears approval and marks the preview out of date.
  - Generating a valid change produces a new revision and re-enables approval.
  - Invalid destination, missing offer, and missing image return the specific messages above.
  - The last valid preview stays visible and usable after each failed generation.
  - Editing the image clears approval and leaves the last rendered asset in place until a fresh preview.
  - Changing the accent updates the action and automatically selects a readable action text color.
- Responsive measurements at the container widths used by the preview:
  - Sparse at 332px container: no horizontal overflow; first action at 786px, 52px tall, inside a 844px first screen; image 290×330.
  - Long-copy at 332px container: no horizontal overflow; first action at 493px; image begins at 567px and continues below the first screen.
  - Sparse at 926px container: no horizontal overflow; first action at 606px; image 423×529.
  - Long-copy at 926px container: no horizontal overflow; first action at 808px; image 426×532.
- Console: no errors on either fixture after the lab route skips the legacy session provider.

### Full-suite and build notes

- `npm test` ran 941 tests: 928 passed, 13 failed. The failures are pre-existing environment/toolchain checks unrelated to this branch: Windows `bash.exe` has no `/tmp`, Vercel gate shell stdout includes that warning, and three synthetic-fixture parser checks. No campaign-lab test failed.
- `npm run build` is blocked before reaching this route by the existing `next/font` Google loader in `src/app/layout.tsx` (`TypeError: Cannot read properties of null (reading '1')`). The local dev route was verified instead. The production 404 guard is covered by the `isCampaignLabAvailable` test, but a full built-server 404 was not exercised.

## Captures

All captures are also available at `.local/campaign-lab/`. The committed evidence is in `docs/handoffs/campaign-lab-20261115/`.

- [desktop-lab-sparse.png](./campaign-lab-20261115/desktop-lab-sparse.png) — editor and rendered sparse preview at 1440px.
- [desktop-preview-sparse.png](./campaign-lab-20261115/desktop-preview-sparse.png) — full sparse campaign page.
- [desktop-preview-long-copy.png](./campaign-lab-20261115/desktop-preview-long-copy.png) — full long-copy campaign page.
- [mobile-first-screen-sparse.png](./campaign-lab-20261115/mobile-first-screen-sparse.png) — 390×844 first screen, product and action visible.
- [mobile-preview-sparse.png](./campaign-lab-20261115/mobile-preview-sparse.png) — full sparse mobile page.
- [mobile-first-screen-long-copy.png](./campaign-lab-20261115/mobile-first-screen-long-copy.png) — 390×844 first screen, action visible and product image beginning.
- [mobile-preview-long-copy.png](./campaign-lab-20261115/mobile-preview-long-copy.png) — full long-copy mobile page.

To regenerate:

```bash
node scripts/campaign-lab-capture.mjs
```

The script uses headless Chrome/Edge, captures the preview canvas, removes the Next development indicator from the capture, and prints layout measurements. Set `CHROME_PATH` if the browser is not in a standard location.

## UX / DX / AX

- **UX:** A designer can change one campaign fact, regenerate, and see the same template adapt without losing the last valid preview; the mobile first screen keeps the offer and action visible.
- **DX:** The versioned manifest, pure draft/validation/revision functions, shared renderer, fixture data, and focused tests make the slice inspectable and revertible without changing legacy routes.
- **AX:** The route and fixture URLs are stable, field labels and action buttons match the integration contract, validation and approval are live-announced, and the preview panel exposes template/layout/revision/asset metadata.

## Remaining issues and unassessed behavior

- The two product assets are original stylized renders, not real photography. A real campaign should use the brand’s approved packshots.
- Mobile long-copy shows the action and the beginning of the product image in the first screen; the full image is visible on scroll. Reducing the headline size would show more of the image but weakens the long-headline fixture.
- Local approval is intentionally session-only and resets on refresh.
- The production build failure above is outside this slice and should be resolved before any hosted preview.
- The `next dev` generated heading change in `AGENTS.md` is included so the working tree stays clean.
