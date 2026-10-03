# A17 integrated delivery acceptance

## Scope

`tests/a17-integrated-delivery.test.mts` joins the member-intake/owner-entitlement path to the exported Resend webhook route and PostgreSQL delivery-event adapter in one disposable local database. It inserts an owner and member fixture, applies the repository migrations, admits four member visits, and runs the production follow-up runner with a synthetic Resend transport. The transport records the exact production-built payload and idempotency key; one recipient returns an ambiguous timeout while the others return provider IDs.

The test signs event fixtures with a synthetic Svix-compatible key and calls the actual exported `POST /api/webhooks/resend` handler. The handler's signing secret is injected into the test instance; no environment file or external provider is used. It applies a delivered event, replays that exact signed event ID/body, then applies bounce and complaint events. Later visits for those addresses are denied at the database send-admission boundary before another provider transport call. The assertions also check the correlation tags, stable keys, one legacy `followup_messages` sent row, delivery status, quota reservations, and the unrelated unknown delivery's frozen payload/key/attempt fence.

The fixture uses a synthetic member session and mocks the account-lifecycle admission service. It does not prove Auth.js session handling or lifecycle coordination. Production services and the exported route are loaded from source; their SQL template calls are translated by a test-only adapter into `psql` statements against the temporary real PostgreSQL server. This exercises actual migrations and database functions without claiming that the Neon HTTP client or a deployed runtime was tested.

Bounce and complaint are exercised against the same workspace in this integrated journey. The existing `tests/a10-controlled-webhook-acceptance.test.mts` separately verifies that provider bounce suppression blocks a prepared send in a second business owned by another user. This test does not claim a second-owner UI journey.

## Evidence boundaries

The integrated local test proves only the asserted handlers, services, SQL functions, and migrations against its disposable PostgreSQL instance with synthetic provider results and webhook signatures. It does not prove authenticated browser behavior, delivery to a real inbox, Resend endpoint registration or account configuration, production environment secrets, deployed database migrations, or a live production send. The mocked transport only establishes what the application records after each controlled return or timeout.

An `unknown` provider outcome stays `unknown`, keeps its reservation, frozen payload, stable idempotency key, and one attempt. This test does not resolve it or retry it. Signed event replay is checked for the identical event ID and body. The test does not exercise provider concurrency races or CSV/scheduled intake.

## Verification receipt

| Evidence label | Status | Receipt |
| --- | --- | --- |
| isolated tests | Passed | Focused Node 22.23.3 / PostgreSQL 17 run passed 1/1 (13.4 s); focused ESLint and `npx tsc --noEmit` passed. The final full suite passed 465/465 with 0 skips (63.67 s) at test SHA256 `8BDD24C198FF9B424D4634DDA90FD62EFE9965F6AECE02BFB89DF1637FD173E0`. See [integrated release evidence](./A17_INTEGRATED_RELEASE_EVIDENCE.md). The test database was disposable and removed. |
| authenticated browser | Not run | No browser or deployed app used. |
| provider test mode | Not run | No Resend API request or email was sent. |
| production smoke | Not run | No candidate deployment or production configuration was inspected. |
| external approval | Not run | This local acceptance does not request or establish provider, Google, or deployment approval. |

The test creates and removes its PostgreSQL data directory under `.next/a17-integrated-delivery-pg-*`; if PostgreSQL cannot stop, it preserves that directory and reports its path. It uses no shared database, provider account, or environment file.
