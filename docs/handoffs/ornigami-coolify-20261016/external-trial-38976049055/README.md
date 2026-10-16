# Trial 38976049055 / attempt 1 — evidence custody

See [the phase-by-phase handoff](../PORTABLE_LINUX_TRIAL.md). This is the single approved diagnostic trial for a069cd4d6232f57c72e1a8d7af2349bb707f0474, requested by 496b57d147bc2a63182e3489583bb3532d28cfc2. Overall failure: base 54 high / final 43 high. Functional passes do not establish security, deployment or framework acceptance.

- `inspection-evidence.zip` is the unchanged 257,006-byte original artifact (12078779166), SHA-256 d0e2c26dea7505c0a8c6050a141f82b1f25ae0859cea0ee33f309764d8e65224. `artifact/` is its exact expansion, including the original 45-file manifest and the empty summary. Every original byte/hash was verified.
- `run-logs.zip` and `run.log` are finished logs downloaded after completion. `finished-summary-ax.txt` is the public rendered job summary recovered through the authenticated browser; AX labels are preserved. No cookies or authentication tokens were collected.
- `recovered-summary/` contains text blocks extracted from that summary after cleanup. They are **not** original artifact files. `SEMANTIC_COMPLETENESS.json` distinguishes original artifact omissions from supplemental recovery. Neither custody nor hash coverage proves semantic completeness.
- `custody/` records the verified durable helper download/read-back and the one owner-authenticated acknowledgment before cleanup. No second acknowledgment was made. The identical independently verified custody ZIP is also retained in the ignored local workspace; the unchanged inspection ZIP is committed here.
- `RESULTS.json`, `ADVISORIES.json` and `ADVISORIES.md` summarize separate phases and all high/critical rows without suppression. Full scans retain all severities and package inventories.
- Preflight/publication/post-trial receipts record identities, deployment holds, watcher inventory, included capacity and absence of deployments. Holds were read, preserved and not restored. Other projects were not changed.
- `SHA256SUMS.json` is a separate local inventory of retained files; it does not replace the runner manifest. `LOCAL_VERIFICATION.json` records 45 original artifact hashes, 109 prior evidence hashes and a limited credential-pattern screen. All historical evidence remains unchanged.

The image archive is deliberately absent: the run produced an ephemeral image, not a retained deployable artifact. No registry publication, retry, resource increase, VPS operation, provider activation or production adoption occurred.
