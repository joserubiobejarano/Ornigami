# Campaign Lab response telemetry and diagnostic redaction — 19 November 2026

Status: offline correction and canary preparation only. No live generation
request has been made from this branch.

- Base: `16c790e79a2eeab9b1171d71cf7d5abdfb3c46cd`
- Branch: `codex/campaign-lab-telemetry-redaction-20261119`
- Follow-up maintenance branch: `codex/campaign-lab-test-maintenance-20261119`
- Review input:
  `C:\Users\joser\.local\ornigami-campaign-lab-live-provider-diagnostics\.local\review-16c790e\findings.json`
- Follow-up review:
  `C:\Users\joser\.local\ornigami-campaign-lab-telemetry-redaction\.local\review-f138761\findings.json`

All historical run and canary records remain unchanged in their original
worktree. This branch writes only new private evidence under `.local/`.

## Reproduced gaps

1. **Invalid output discarded response evidence.** The shared transport parsed
   and trimmed response content before constructing its outcome. An empty or
   invalid response threw `InvalidGenerationOutputError` carrying only
   `stack`, `message`, `diagnostics`, and `name`. Usage, finish reason, request
   ID, latency, model, and raw content were lost. The evaluator therefore saw no
   usage. Because conservative accounting already existed at `16c790e`, it
   classified the response as **missing usage**: `usageStatus: "unknown"`,
   `costUsd: null`, and the request's reservation retained as unresolved
   exposure. Provider-reported usage never replaced that reservation.
2. **Quoted credentials survived redaction.** `redactDiagnosticText` handled
   `sk-` keys and bare `api_key=value` forms but not JSON keys and quoted values
   such as `{"api_key":"synthetic-secret-value-123"}`, escaped JSON forms, or
   quoted authorization values.

## Telemetry retention

`src/lib/campaign-lab/generation/openai-transport.ts` now builds private
telemetry immediately after the SDK response arrives, before any empty-content
or JSON-parse decision:

- usage;
- finish reason;
- provider request ID;
- latency and model;
- shared transport identity;
- response content bounded to 8,000 characters.

`InvalidGenerationOutputError` retains that telemetry in a private `WeakMap`
rather than an enumerable error field, so generic error logging cannot serialize
raw response content. Its customer-facing `diagnostics` contains only safe
structured fields and a generic message. The new `generateWithTelemetry` helper,
used by both evaluation execute paths, reports telemetry for parsed and
unparseable responses and then rethrows so the service still produces the
generic fallback.

The evaluation record and canary record now read usage, finish reason, request
ID, raw content, and latency from that captured telemetry. The public
`generation` metadata still exposes none of the raw response.

### Exact before/after — synthetic invalid JSON

Fixture: content `{"angle":`, usage `123` prompt / `8` completion / `131` total,
`finish_reason: "length"`, request ID `req_synthetic_invalid_json`, one transport
call, zero retries. The original offline reproduction is stored at
`.local/campaign-lab-telemetry-redaction/invalid-json-after.json`; its baseline
correction is recorded in `invalid-json-after-correction.json` without altering
the original file.

| Field | Before (`16c790e`) | After (`f138761`) |
| --- | --- | --- |
| Error fields | `stack`, `message`, `diagnostics`, `name` | Same public fields; telemetry held privately outside the enumerable surface |
| Usage preserved | No | Yes — 123 / 8 / 131 |
| Finish reason preserved | No | Yes — `length` |
| Provider request ID preserved | No | Yes — `req_synthetic_invalid_json` |
| Raw content preserved privately | No | Yes — bounded `{"angle":` |
| Public fallback | `invalid` | `invalid`, unchanged generic message |
| Public generation diagnostics | No request ID | `providerRequestId` only; no raw content |
| Evaluator usage | `null` — provider usage discarded | Known 123 / 8 |
| Evaluator usage status | `"unknown"` | `"known"` |
| Evaluator cost | `null` | `$0.00002325` known |
| Reserved exposure | `$0.00222495` retained as unresolved | `$0` — known usage replaces the reservation |

**Correction (19 November 2026).** An earlier version of this table described
the `16c790e` baseline as recording `$0` and releasing the reservation. That was
inaccurate. `16c790e` already used `accountProviderUsage`; the defect was that
invalid JSON discarded provider-reported usage, so a known-usage response was
misclassified as missing usage. The corrected baseline is `usageStatus:
"unknown"`, `costUsd: null`, and `reservedExposureUsd: $0.00222495`. `f138761`
recovers the telemetry before parsing fails, allowing the known usage to replace
the reservation with its actual `$0.00002325` cost.

When usage is genuinely absent, accounting remains:

- `usageStatus: "unknown"`;
- `costUsd: null`;
- unliquidated reservation retained as unresolved exposure.

For example, the current canary reservation of `$0.00222495` stays unresolved
when a request returns no usage. It is never released merely because parsing or
the request failed.

## Diagnostic redaction

`src/lib/campaign-lab/generation/provider-diagnostics.ts` now removes:

- PEM private-key blocks and known key prefixes;
- bearer tokens, including quoted and escaped forms;
- URL userinfo credentials;
- quoted, single-quoted, escaped, and bare values for authorization, API keys,
  `apikey`, OpenAI keys, access/refresh/ID/auth tokens, client secrets, private
  keys, passwords, credentials, secrets, session keys, and tokens;
- common phrases such as `API key provided: ...`.

Sanitization happens on the complete text before truncation. If a
credential-looking assignment remains after replacement, the free-form text is
withheld and replaced with `[redacted diagnostic]`; safe structured fields are
kept. Provider codes, types, parameter names, request IDs, and messages all pass
through the same sanitizer.

Regressions use synthetic values such as `synthetic-secret-value-123` without an
`sk-` prefix, so they cannot pass solely because of the key-prefix rule.

## Offline verification

- Repaired OpenAI opt-in test: **9 passed, 0 failed** in
  `tests/a00-openai-feature.test.mts`.
- Campaign Lab tests: **184 passed, 0 failed**.
- Transport tests: **18 passed, 0 failed**.
- Full `npm test` (concurrent run): **1,143 passed, 13 failed**. Ten were
  transient Git-Bash `/tmp` failures in the Coolify runtime and Vercel gate
  suites; those two files pass **28/28** when rerun in isolation. The remaining
  three are the pre-existing staging synthetic-fixture assertions, which
  reproduce unchanged at base `f138761` and are outside this change.
- TypeScript: passed.
- Focused ESLint: passed.
- Production build: passed.
- Evaluation script syntax checks: passed.

### OpenAI opt-in test maintenance

The shared-config refactor moved client construction into
`src/lib/openai-config.ts`. The test now loads the real module with only the
OpenAI SDK mocked, then injects it at the existing dependency boundary. It
continues to assert:

- disabled AI creates no client and makes no SDK call;
- explicit enablement creates exactly one cached client and makes one SDK call;
- the client is constructed with the shared API key, timeout, and retry settings;
- disabling AI again prevents any further client creation or SDK call.

New regressions cover:

- invalid JSON with known usage, request ID, and `finish_reason: "length"`;
- empty content with known usage;
- successful valid output with complete telemetry;
- invalid output without usage retaining the unresolved reservation;
- quoted, escaped, assigned, and phrased credential removal;
- sanitization before truncation;
- private telemetry excluded from public fallback metadata and from the error's
  enumerable fields;
- one transport call with `maxRetries: 0`.

Existing shared transport, quota classification, stop rules, success parsing, and
generic customer fallback behavior are unchanged.

## Corrected one-request canary preflight

Prepared at `.local/campaign-lab-live-canary/corrected-preflight/`.

| Setting | Value |
| --- | --- |
| Shared adapter | `openai-chat-completions` |
| Brief | `sparse-social` |
| Model | `gpt-4o-mini` |
| Requests | 1 |
| Retries | 0 |
| Timeout | 5000 ms |
| Output bound | 300 tokens |
| Temperature | 0.2 |
| Response format | `json_object` |
| Prompt chars | 13,437 |
| Prompt UTF-8 bytes | 13,441 |
| Framing allowance | 192 tokens |
| Conservative input tokens | 13,633 |
| Maximum cost | `$0.00222495` |
| Recommended cap | `$0.01` |

Exact command (not executed):

```powershell
$env:OPENAI_ENABLED='true'; $env:CAMPAIGN_LAB_GENERATION_LIVE='true'; node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs canary --execute --cap-usd 0.010 --env-file "<authorized-env-file>" --model gpt-4o-mini --out "C:\Users\joser\.local\ornigami-campaign-lab-telemetry-redaction\.local\campaign-lab-live-canary\corrected-preflight\canary"
```

The previous one-request allowance is exhausted. No live request was made.
Further execution requires available account credits and fresh explicit
authorization with a spend cap. The full A/B experiment must not be rerun
automatically.

## Evidence integrity

The original historical records and derived baseline were not rewritten. Their
SHA-256 values were identical before and after this maintenance work:

| Record | SHA-256 |
| --- | --- |
| Historical canary `canary.json` | `4F0AD43C944CADF827AA903C5895BF228F839BC5D79C162B8176DECF9B7109DE` |
| Historical derived canary `canary-derived.json` | `BF6953944F57C0E4331761BB3A6F3B1504ED1ECF50F00E7A01B96B02742114FD` |
| Historical 12-request `run.json` | `96D7B83E30EE3BE7CB471A48682342797EF4D88A3A64308D2A0B3FCBC34BF7A7` |
| Original derived `invalid-json-after.json` | `B8F3941481F85F4B4E70342D8597842C81474A9FA2B3B2FFF0AACDAD880F9B3E` |

The accounting baseline correction is appended at
`.local/campaign-lab-telemetry-redaction/invalid-json-after-correction.json`;
the original derived file remains byte-for-byte unchanged.

## Historical cause

The 12 historical failures remain unexplained. Neither the prior canary quota
failure nor the new offline fixtures prove their cause, and no guidance decision
is based on them.
