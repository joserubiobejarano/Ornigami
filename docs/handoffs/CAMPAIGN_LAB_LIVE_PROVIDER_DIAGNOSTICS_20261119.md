# Live-provider diagnostics and canary readiness — 19 November 2026

Status: offline verification and canary preparation only. No live generation
request has been made from this branch.

- Base: `30710fe45c07583deb77a0018864a6cb48da361b`
- Branch: `codex/campaign-lab-live-provider-diagnostics-20261119`
- Prior failed-run evidence remains unchanged at
  `C:\Users\joser\.local\ornigami-campaign-lab-guidance-eval\.local\campaign-lab-guidance-eval\authorized`
- A derived historical report under the corrected accounting semantics is at
  `.local/campaign-lab-guidance-eval/historical-report/`.
- New private evidence: `.local/` in this worktree, including corrected
  preflight and canary preflight files.

## Shared transport

`src/lib/campaign-lab/generation/openai-transport.ts` now owns the actual OpenAI
chat-completions request:

- credentials are supplied by the shared client factory;
- model and request parameters stay in one place;
- timeout, abort signal, and `maxRetries: 0` are passed there;
- response JSON parsing and invalid-output errors are shared;
- provider request ID, usage, finish reason, raw content, and latency are returned
  to callers that need them.

The production `OpenAIGenerationProvider` calls this transport. The evaluation
runner now also calls it instead of implementing its own OpenAI request. No
product request parameters changed.

## Diagnostics

`src/lib/campaign-lab/generation/provider-diagnostics.ts` reduces provider
errors to bounded safe fields:

- failure category;
- HTTP status;
- provider code and type;
- parameter name;
- provider request ID;
- redacted diagnostic message.

The service attaches these diagnostics to fallback metadata while keeping the
customer-facing fallback text generic. Raw headers, credentials, environment
values, request bodies, and unrestricted error objects are discarded. Tests cover
authentication, quota, rate-limit, invalid-parameter, connection, timeout,
invalid-output, and abort cases.

Stop rule: evaluation runs stop immediately after an authentication,
configuration, or quota failure instead of consuming the remaining request
allowance.

## Accounting semantics

`src/lib/campaign-lab/generation/provider-accounting.ts` distinguishes:

- **known usage/cost** when the provider returned prompt and completion tokens;
- **unknown usage** when usage is absent;
- **conservative reserved exposure** for every attempt without usage.

A failed request without usage does not release its reservation. Reports show
known spend, unresolved reserved exposure, unresolved usage request count, and
the conservative exposure total separately. The original historical run is not
rewritten. Re-running its report under the new semantics shows 12 unresolved
usage requests and unknown reserved exposure; its old `$0` field is no longer
treated as proof of zero cost.

The conservative prompt bound now uses UTF-8 bytes plus per-message framing and a
fixed request allowance, instead of character count alone.

## Offline verification

- Campaign Lab tests: **176 passed, 0 failed**.
- New transport tests: **9 passed**, covering:
  - successful SDK response with known usage and no retry;
  - invalid model output;
  - authentication failure with secret redaction;
  - quota and rate-limit distinctions;
  - invalid parameters and parameter capture;
  - connection failure and timeout;
  - abort signal;
  - missing usage remaining unknown;
  - reservation retention for unknown usage.
- TypeScript, focused ESLint, and production build: passed.
- Corrected evaluation preflight: 12 requests, estimated **$0.008197**,
  conservative ceiling **$0.026659**, recommended cap **$0.03**.
- Non-paid deterministic references still reproduce 16/30/30 valid plans.

## One-request canary

The canary uses the frozen `sparse-social` brief and the current advisory pack.

| Setting | Value |
| --- | --- |
| Shared adapter | `openai-chat-completions` |
| Model | `gpt-4o-mini` |
| Requests | 1 |
| Retries | 0 |
| Timeout | 5000 ms |
| Output bound | 300 tokens |
| Temperature | 0.2 |
| Response format | `json_object` |
| Prompt UTF-8 bytes | 13,441 |
| Framing allowance | 192 tokens |
| Conservative input tokens | 13,633 |
| Maximum cost | $0.002225 |
| Recommended cap | $0.01 |

Exact command:

```powershell
$env:OPENAI_ENABLED='true'; $env:CAMPAIGN_LAB_GENERATION_LIVE='true'; node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs canary --execute --cap-usd 0.010 --env-file "C:\Users\joser\Desktop\Projects\Ornigami\.env.local" --model gpt-4o-mini --out "C:\Users\joser\.local\ornigami-campaign-lab-live-provider-diagnostics\.local\campaign-lab-live-canary\preflight\canary"
```

The previous 12-attempt allowance is exhausted. Existing environment flags are
not fresh authorization. The canary must not run until a new explicit
authorization and spend cap are supplied. It will make at most one generation
request, record sanitized diagnostics or the validated proposal, and stop. It
will not launch the A/B experiment.

## Historical cause

The cause of the previous 12 failures remains unproven and no guidance decision
is based on them. The new diagnostics are intended to identify the next live
failure accurately without guessing.
