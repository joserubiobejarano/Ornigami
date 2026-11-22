# Low-assistance synthetic usability exercise — 22 November 2026

Status: **prepared, not executed with an owner or customer.** No external
participant was recruited or messaged. The 32-check qualification run is
agent-operated mechanics evidence, not independent customer usability.

## Purpose

Observe whether one owner-operated synthetic session can complete the
invite-only, export-only journey with little or no assistance, and record where
the interface or instructions create friction.

## Preconditions

- Use a synthetic subject and synthetic offer only; no customer data or real
  brand.
- Start from a private synthetic edge or local production server with the live
  provider disabled. Do not use a public deployment.
- The operator issues one invite token for the synthetic subject and hands it to
  the owner through an agreed private channel.
- Packshot: `public/campaign-assets/harbor-field-bottle.webp` (synthetic local
  asset; rights text: "Synthetic local review asset.").
- Record the browser, viewport, start/end time, and whether the owner had seen
  the UI before.

## Exercise

### 1. Invite entry

1. Open the builder landing page.
2. Enter the synthetic invite token in the token field.
3. Select **Enter builder**.

Observe: the subject label is visible, the brief form is ready, and no operator
action is needed.

### 2. Brief preparation

Use these synthetic values:

- Brand name: `Harbor Field`
- Product name: `Harbor Field travel bottle`
- Offer: `Browser offer 111111 for the travel bottle`
- Reviewed offer emphasis: `111111`
- Destination URL: `https://example.com/travel-bottle`
- Facts: `Capacity = 500 ml`, `Closure = Screw cap`
- Visual direction: `Clear`
- Composition: `direction-default`
- Alt text: `Harbor Field travel bottle on a neutral background.`
- Usage rights: `Synthetic local review asset.`

Upload the packshot, wait for the ready indicator, and confirm the three
required checkboxes.

Observe: every field is understandable from the visible labels; no operator
prompting or hidden knowledge is required.

### 3. Generate and inspect

1. Open the offer preview.
2. Select **Generate preview**.
3. Wait for the generated or fallback article.
4. Inspect the article at the current viewport; scroll and read the offer,
   product, facts and destination.

Observe: generation completes without an error; the owner can find the preview,
the generation status and the article content.

### 4. Edit and regenerate

1. Change the offer to
   `Edited browser offer 222222 for the travel bottle` and emphasis to `222222`.
2. Reselect the packshot and confirm again (current recovery contract).
3. Generate again.
4. Observe that any previous approval is invalidated and a fresh approval is
   required.

### 5. Approve and export

1. Select **Approve preview locally**.
2. Confirm the approval revision is visible.
3. Select the ZIP export control and save the file.
4. Open the ZIP and confirm it contains the HTML, CSS, packshot, fonts/licenses
   and receipt.

Observe: export is enabled only after current approval; the file downloads,
opens, and its receipt matches the visible revision.

### 6. Recovery and sign-out

1. Refresh the builder tab.
2. Confirm whether the brief text is restored.
3. Reselect the packshot, reconfirm, regenerate and reapprove if required.
4. Sign out.
5. Confirm the workspace is cleared and the token entry returns.
6. If re-entry is tested, issue a fresh single-use invite through the operator;
   do not reuse a consumed token.

Observe: the recovery limits are discoverable (text may remain; packshot,
confirmation and approval must be redone), and sign-out does not leave visible
workspace content.

## Observable success criteria

| Step | Pass condition |
| --- | --- |
| Invite entry | Reaches `/builder` with the correct subject label without assistance |
| Brief | Completes all required fields, packshot and confirmations without operator prompting |
| Generation | Generated/fallback article appears; no unexplained error |
| Edit | Edited offer/emphasis survives regeneration; stale approval is visibly invalidated |
| Approval/export | Export is enabled only after fresh approval; ZIP downloads and opens |
| Recovery | Text recovery and the required packshot/reapproval steps are understandable |
| Sign-out | Workspace clears; token entry returns |

## Friction log

Record one row per observation:

| Field | Value |
| --- | --- |
| Step | Invite / Brief / Generate / Edit / Approve / Export / Recovery / Sign-out |
| Start time | |
| End time | |
| Assistance count | Number of operator interventions (target 0) |
| Retries | Number of repeated attempts |
| Blocked? | Yes/No |
| Observed problem | What happened, without speculation |
| Error text | Exact visible text, if any |
| Screenshot / path | Optional synthetic evidence path |
| Owner confidence | 1–5 after the step |
| Owner comment | Optional verbatim note |

## Result template

- Owner-operated? yes/no
- Independent of agent assistance? number of interventions: __
- Completed all success criteria? yes/no
- Time to first export: __
- Blocking friction: __
- Non-blocking friction: __
- Recommendation: repeat / fix / stop

Do not mark this exercise as independent customer usability if an agent
operated the browser, supplied field values step by step, or resolved errors
for the owner.
