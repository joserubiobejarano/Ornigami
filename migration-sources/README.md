# Preserved migration inputs

This is source reference for completing the unified Ornigami application. The only runnable application, dependency lockfile, Git repository, and deployment configuration are at the repository root. These copies are deliberately excluded from TypeScript, ESLint, and CLI Vercel uploads. They are not installed, mounted as routes, or enabled agents.

- `follow-up/`: the former Follow-Up working tree, including its uncommitted source and untracked UI components. Its main missing capabilities are generic booking intake and optional rebooking/sender settings.
- `contactor/`: the former Contactor application source, assets, tests, and schema. Its lead forms, qualification, SMS/WhatsApp, onboarding, and admin flows still need to become the shared `speed-to-lead` module.
- `workspace/`: the former loose security SQL script. Treat this as historical input; do not run it instead of reviewed numbered migrations.

Original package manifests, lockfiles, TypeScript settings, and Vercel settings have `.reference.json` names. Original agent instructions have `.original.md` names. Workflow copies are under `workflow-reference`, so they cannot execute as repository actions. These files describe the old applications and do not define the new project's dependencies, migration order, or deployment.

Keep these references unchanged while implementing retained capabilities under `src/modules`, `src/lib`, and `src/app`. Do not copy old authentication or replay old initial schema migrations into the live database. Follow the scope, dependencies, acceptance criteria, and schema coordination rules in [the roadmap](../docs/ROADMAP.md#work-coordination).

Current recovery and consolidation receipts are held in the owner-restricted, Git-ignored `.local/recovery` under the canonical repository. The former external backup directory contained review receipts and credential snapshots at cleanup time; complete original Follow-Up/Contactor Git repositories were not found there and must not be claimed as preserved by that directory. The source references in this tree remain available for A15. The verified current-repository bundle preserves committed refs/review heads, while the separate source recovery archive preserves unfinished work. Private records and credentials must not be committed, uploaded as build artifacts or shared as ordinary source archives.

Production verification on 2026-10-02 identified `ornigami.com` as Vercel project `locallift`, connected to `joserubiobejarano/Ornigami`, root directory `.`, deployment `dpl_F7PdxKDfg9ZQSVYKsUxURqHAeX8a`, commit `2c0ef7b86a7cefa97321022131d1812950e03c36`. That commit implements Review Replies and Review Booster; Speed to Lead is explicitly coming soon. Local source consolidation does not imply its missing workflows have been deployed.
