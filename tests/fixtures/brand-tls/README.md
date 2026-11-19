# Public synthetic TLS fixtures

Every private key here is intentionally public test data. Never use these keys
or certificates in a real service. No real credentials or domains are present.

See [qualification and inventory](../../../docs/campaign-lab-brand-tls-qualification.md)
and `scripts/generate-brand-tls-fixtures.mjs` for generation, dates and limits.
Only the trusted CA certificate is injected into the isolated test TLS client.
CA signing keys are discarded during regeneration and are not committed.
