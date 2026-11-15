# Campaign lab contract fixture

This directory is a synthetic test double for the campaign-lab acceptance
runner. It is **not** the `/campaign-lab` route, the campaign template renderer,
or the approved Ornigami fixture metadata.

- `server.mjs` serves `/campaign-lab?fixture=sparse` and
  `/campaign-lab?fixture=long-copy` over loopback.
- `contract-manifest.json` is approved metadata **for this double only**. It
  exists so the runner's clean path can be verified before integration.
- `benchmark-proposal.json` is a proposed acceptance contract derived from
  `docs/design/BENCHMARK.md`. Its asset, label, alt-text, offer, and exact
  destination checks are pending until the template owner supplies real
  approved metadata.
- `manifest.schema.json` describes the manifest shape.
- `assets/` contains synthetic SVG packshots. They are not brand packaging.

Start the double:

```powershell
$env:CAMPAIGN_LAB_CONTRACT_PORT = "4317"
node tests/fixtures/campaign-lab/server.mjs
```

Add `&fault=href,alt,image,overflow,approval,errors,focus,legibility` to a
fixture URL to prove the runner reports the corresponding failures. The
self-test starts its own server and does this automatically:

```powershell
node tests/support/campaign-lab-contract-self-test.mjs
```

Captures and reports stay under `.local/campaign-lab-acceptance/` and are
Git-ignored.
