# Proposed private routing overlay

`compose.private-staging.proposed.json` is an unapproved preparation artifact. Do not activate it, change DNS or deploy from this document. It is JSON (a YAML subset) for combination with `compose.coolify.yaml` alone; do not also include the public Traefik overlay.

It proposes `https://staging.ornigami.com` using the installed proxy's existing HTTPS entrypoint/resolver and app-specific BasicAuth before normal application authentication. No extra image, process, host port or runtime budget is added. The bcrypt access record must come from an approved app-scoped protected reference. Preserve dollar signs correctly during eventual Compose interpolation; verify the actual rendered labels without emitting values. No access credential is included here.

Origin/access/DNS, protected secret references, isolated fictional data, maintenance, conditional retention and exact-image deployment remain separate owner gates. Both build-time and runtime origins must match the accepted profile. The current rehearsal.invalid image is not deployable through this proposal. No unprotected parallel router may exist, including Coolify-generated routing.

Actual acceptance must prove HTTPS/private-access denial and success, header/Host defenses, normal app login and tenant isolation, resources, persistence and recovery. The local JSON syntax check is not a Compose render, proxy test or actual-host pass. See the private VPS planning packet `projects/ORNIGAMI_PRIVATE_PROFILE_PROPOSAL.md` for the pending concrete decisions. No VPS/Neon target or secret value is committed in this file.
