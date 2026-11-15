# Campaign draft comparison index

- Run: `compare-api`
- Mode: `artifacts`
- Pack: `campaign-lab-eval` v1.0.0
- Template: `single-product-offer` v1.0.0
- Seed: `campaign-eval-compare-v1`
- Provider map (separate): `provider-map.json`
- Reviewer sheet: `blind-sheet.md`

This index is automated. It proves identity, claims, and the concrete changes. It does not judge whether a change looks better. Human approval, first change, edit count, and time to approval belong in the reviewer sheet.

Capture folders use neutral labels A/B; the label-to-provider mapping stays in `provider-map.json`.

## Summary

| Case | Identical | Identity | Opening | Section order | Evidence | Captures |
| --- | --- | --- | --- | --- | --- | --- |
| Sparse campaign: one photo, few approved facts | no | pass | same | same | changed | A / B |
| Richer campaign: different brand, clear product angle, extra evidence | yes | pass | identical | identical | identical | B / A |
| Intent change: same brand, product, assets, and offer; different campaign angle | yes | pass | identical | identical | identical | missing |

## Identical drafts

- **Richer campaign: different brand, clear product angle, extra evidence**: identified as identical. No change to opening, section order, evidence, asset IDs, or template.
- **Intent change: same brand, product, assets, and offer; different campaign angle**: identified as identical. No change to opening, section order, evidence, asset IDs, or template.

## Sparse campaign: one photo, few approved facts

**Result:** changed. **Identity:** pass. **Captures:** A / B (neutral labels; provider map separate).

### Identity checks

| Check | State | Detail |
| --- | --- | --- |
| same-template-and-brief | pass | Both drafts use the same template version, campaign fields, and approved opening focus. |
| product-preserved | pass | Both drafts preserve the product name "Harbor Field travel bottle". |
| offer-preserved | pass | Both drafts preserve the exact offer "20% off, 27–30 November 2026". |
| destination-preserved | pass | Both drafts preserve the exact destination "https://example.com/harbor-field". |
| image-identity | pass | Both drafts preserve the approved product image identity (harbor-field-bottle-front). The observed content hashes match between drafts. The observed app hash differs from the evaluation pack pin for harbor-field-bottle-front; check asset provenance separately. |
| approved-facts-preserved | pass | Both drafts use only approved facts and keep every required approved fact. |
| claims-traceable | pass | Both drafts keep their narrative claims traceable to the approved corpus. |

### Opening

- Headline: `20% off the travel bottle.` → `20% off the travel bottle.` (unchanged)
- Lede: `A 500 ml insulated bottle with a screw cap, made for the commute and the trail.` → `A 500 ml insulated bottle with a screw cap, made for the commute and the trail.` (unchanged)
- Headline similarity: 1
- Opening focus: (not supplied); generated angle: offer-led

### Section order

- Fallback: hero → hero-facts → close
- Generated: hero → hero-facts → close
- Unchanged.

### Evidence

- Facts fallback: Capacity: 500 ml; Closure: Screw cap; Material: Stainless steel
- Facts generated: Capacity: 500 ml; Closure: Screw cap
- Facts removed: Material: Stainless steel
- Images fallback: harbor-field-bottle-front
- Images generated: harbor-field-bottle-front

### Concrete changes

- Approved facts: Capacity: 500 ml; Closure: Screw cap; Material: Stainless steel → Capacity: 500 ml; Closure: Screw cap. Removed: Material: Stainless steel.

## Richer campaign: different brand, clear product angle, extra evidence

**Result:** identical. **Identity:** pass. **Captures:** B / A (neutral labels; provider map separate).

### Identity checks

| Check | State | Detail |
| --- | --- | --- |
| same-template-and-brief | pass | Both drafts use the same template version, campaign fields, and approved opening focus. |
| product-preserved | pass | Both drafts preserve the product name "Morrow ceramic pour-over dripper". |
| offer-preserved | pass | Both drafts preserve the exact offer "Free shipping through 30 November 2026". |
| destination-preserved | pass | Both drafts preserve the exact destination "https://example.com/morrow". |
| image-identity | pass | Both drafts preserve the approved product image identity (morrow-ceramic-dripper-front). The observed content hashes match between drafts. The observed app hash differs from the evaluation pack pin for morrow-ceramic-dripper-front; check asset provenance separately. |
| approved-facts-preserved | pass | Both drafts use only approved facts and keep every required approved fact. |
| claims-traceable | pass | Both drafts keep their narrative claims traceable to the approved corpus. |

### Opening

- Headline: `Why Morrow revised the rib spacing inside its ceramic pour-over dripper` → `Why Morrow revised the rib spacing inside its ceramic pour-over dripper` (unchanged)
- Lede: `In the first prototype, the filter sat against the wall. Morrow revised the spacing between the three interior ribs.` → `In the first prototype, the filter sat against the wall. Morrow revised the spacing between the three interior ribs.` (unchanged)
- Headline similarity: 1
- Opening focus: flow-control; generated angle: story-led

### Section order

- Fallback: hero → detail → close
- Generated: hero → detail → close
- Unchanged.

### Evidence

- Facts fallback: Interior: Three ribs; Outlet: Single outlet; Body: Ceramic
- Facts generated: Interior: Three ribs; Outlet: Single outlet; Body: Ceramic
- Images fallback: morrow-ceramic-dripper-front
- Images generated: morrow-ceramic-dripper-front

### Concrete changes

- Identical drafts: no change to headline, lede, facts, section order, asset IDs, or template.

## Intent change: same brand, product, assets, and offer; different campaign angle

**Result:** identical. **Identity:** pass. **Captures:** missing (neutral labels; provider map separate).

**Captures missing.** Visual review for this case is unassessed. The automated comparison is still valid for identity and draft changes.

### Identity checks

| Check | State | Detail |
| --- | --- | --- |
| same-template-and-brief | pass | Both drafts use the same template version, campaign fields, and approved opening focus. |
| product-preserved | pass | Both drafts preserve the product name "Morrow ceramic pour-over dripper". |
| offer-preserved | pass | Both drafts preserve the exact offer "Free shipping through 30 November 2026". |
| destination-preserved | pass | Both drafts preserve the exact destination "https://example.com/morrow". |
| image-identity | pass | Both drafts preserve the approved product image identity (morrow-ceramic-dripper-front). The observed content hashes match between drafts. The observed app hash differs from the evaluation pack pin for morrow-ceramic-dripper-front; check asset provenance separately. |
| approved-facts-preserved | pass | Both drafts use only approved facts and keep every required approved fact. |
| claims-traceable | pass | Both drafts keep their narrative claims traceable to the approved corpus. |

### Opening

- Headline: `Start with a slower first pour` → `Start with a slower first pour` (unchanged)
- Lede: `Take your time with that first pour. The ceramic dripper has three interior ribs and a single outlet.` → `Take your time with that first pour. The ceramic dripper has three interior ribs and a single outlet.` (unchanged)
- Headline similarity: 1
- Opening focus: first-pour; generated angle: story-led

### Section order

- Fallback: hero → detail → close
- Generated: hero → detail → close
- Unchanged.

### Evidence

- Facts fallback: Interior: Three ribs; Outlet: Single outlet; Body: Ceramic
- Facts generated: Interior: Three ribs; Outlet: Single outlet; Body: Ceramic
- Images fallback: morrow-ceramic-dripper-front
- Images generated: morrow-ceramic-dripper-front

### Concrete changes

- Identical drafts: no change to headline, lede, facts, section order, asset IDs, or template.

## Boundary

- This index and `comparison.json` are automated evidence. Visual judgment stays in `blind-sheet.md`.
- The reviewer records the page they would approve, the first change, the number of edits to approval, and the time to approval. Those values are not automated scores.
- Offline providers verify the workflow only. Live model quality remains unassessed until a separately authorized run uses approved inputs.
- Packaging truth remains human-only; see the evaluation pack trap.
