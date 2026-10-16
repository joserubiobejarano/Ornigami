# Decision evidence, not build acceptance

Read-only observations collected 16 October 2026, approximately 18:49–18:55 UTC. `OBSERVATIONS.json` summarizes live browser state without account/session data; the raw local browser receipts are hashed and remain ignored. `vercel-live-filtered.json` records the important uncertainty: deployment creation is enabled and no branch hold is verified. No settings changed.

Registry metadata, public signing keys and source identity are official HTTPS responses reduced to task-relevant fields. `npm-package-inspection.json` records downloaded package checksums and selected file hashes, without installing/executing the package. `upstream-source-review.json` hashes exact-commit source responses; no full third-party source or package archive is committed. Source-file hashes concern the original response bytes, not Windows text conversions.

`FOCUSED_CHECKS.json` records package digest checks, successful registry-signature verification and rejection of altered signed payloads. These are provenance checks, not browser corruption-rejection or framework/runtime tests. Reproduce against a separately obtained official tarball:

```powershell
node docs/handoffs/ornigami-coolify-20261016/framework-decision-evidence/verify-official-package.mjs <path-to-next-16.4.2.tgz>
```

The official tarball URL is in `npm-metadata.json`; SHA-256 is `44ad2c420d30f7d1a8e4c511759c57eb40ccbbc36213a1bf32b1698bcebd3a1d`. No download/install occurs in the checker. Retained npm key trust is HTTPS registry trust, not independent SLSA verification. GitHub's commit verification field is its report, not a local GPG verification. Two clean framework builds, our own package provenance, browser corruption rejection and Linux image acceptance remain untested.

`SHA256SUMS.json` covers all files in this directory except itself. Historical evidence directories and their checksums were not modified. No build-request marker, workflow, application dependency, runtime acceptance assertion or host file was changed.
