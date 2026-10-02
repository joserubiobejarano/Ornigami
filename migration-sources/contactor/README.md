# Speed-to-Lead Agent (MVP)

Production-focused MVP for instant lead intake and qualification over:
- Hosted form (`/f/[businessSlug]`)
- Embedded form (same submit API)
- Twilio inbound SMS webhook
- Twilio inbound WhatsApp webhook

## Stack
- Next.js (App Router) + TypeScript (strict)
- Neon Postgres
- Drizzle ORM + Drizzle Kit
- Zod
- OpenAI API
- Twilio API

## Short Architecture
The app is split into thin route handlers, service orchestration, and repository-based data access:
- `src/app/api/*`: HTTP entrypoints for form submit and Twilio webhooks
- `src/server/services/*`: business logic (lead intake, AI reply generation, outbound messaging, notifications, dashboard data)
- `src/server/db/repositories/*`: database query layer
- `src/server/services/ai/*`: prompt and structured-output schema for qualification behavior
- `src/app/dashboard/*`: internal MVP operations UI

Main lead flow:
1. Inbound message/form arrives.
2. Lead + conversation + message are persisted.
3. AI generates short qualification response (one useful question at a time).
4. Outbound reply is sent via preferred channel.
5. Events are logged for auditability and follow-up.

## Environment Setup
Copy and configure environment variables:

```bash
cp .env.example .env.local
```

Required variables:
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_WEBHOOK_AUTH_TOKEN`
- `TWILIO_WEBHOOK_BASE_URL`
- `TWILIO_VALIDATE_WEBHOOK_SIGNATURE`

Owner email notification variables (Resend):
- `RESEND_API_KEY` (required in production for real owner email notifications)
- `EMAIL_FROM` (verified sender/domain, e.g. `Lead Alerts <alerts@yourdomain.com>`)
- `APP_BASE_URL` (optional, used to build absolute dashboard links in owner notifications)

## Neon Setup
1. Create a Neon project and Postgres database.
2. Copy the pooled or direct connection URL.
3. Set `DATABASE_URL` in `.env.local`.
4. Ensure SSL is enabled (`sslmode=require` in URL).

## Drizzle Migrations
Generate migration files:

```bash
npm run db:generate
```

Apply migrations:

```bash
npm run db:migrate
```

Seed demo data:

```bash
npm run db:seed
```

Optional DB browser:

```bash
npm run db:studio
```

## OpenAI Setup
1. Create an OpenAI API key.
2. Set `OPENAI_API_KEY` in `.env.local`.
3. Set `OPENAI_MODEL` (default is `gpt-4.1-mini` in this project).

## Twilio Setup
1. Copy `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` from Twilio Console.
2. Set sender values:
   - `TWILIO_SMS_FROM=+1...`
   - `TWILIO_WHATSAPP_FROM=whatsapp:+1...`
3. Set `TWILIO_WEBHOOK_AUTH_TOKEN` to the same Twilio Auth Token.
4. Set `TWILIO_WEBHOOK_BASE_URL` to your public webhook origin.
5. Keep `TWILIO_VALIDATE_WEBHOOK_SIGNATURE=true` for production.

### Twilio SMS Webhook
In Twilio Console (Phone Numbers -> Active Number -> Messaging):
- `A message comes in`:
  - `https://<public-domain>/api/twilio/inbound`
- `Status callback URL`:
  - `https://<public-domain>/api/twilio/status`

### Twilio WhatsApp Webhook
In Twilio Console (WhatsApp sender or Sandbox):
- Inbound webhook:
  - `https://<public-domain>/api/twilio/inbound`
- Status callback:
  - `https://<public-domain>/api/twilio/status`

## Local Development
Install dependencies:

```bash
npm install
```

Run app:

```bash
npm run dev
```

Open:
- Home: `http://localhost:3000`
- Dashboard: `http://localhost:3000/dashboard`
- Hosted form: `http://localhost:3000/f/demo-dental-studio`

### Local Twilio Webhook Testing (ngrok)
Expose local server:

```bash
ngrok http 3000
```

Then:
1. Copy the HTTPS ngrok URL.
2. Set `TWILIO_WEBHOOK_BASE_URL` to that URL.
3. Configure Twilio inbound/status webhooks to use that URL.
4. Send test SMS/WhatsApp to verify:
   - lead creation
   - AI response
   - delivery status callbacks
   - dashboard updates

If using another tunnel (Cloudflare Tunnel, localtunnel), use the same pattern.

## API Routes
- `POST /api/forms/submit`
- `POST /api/twilio/inbound`
- `POST /api/twilio/status`

## MVP Local Testing Checklist
- [ ] `.env.local` created from `.env.example`
- [ ] Neon database reachable from app
- [ ] Drizzle migrations applied successfully
- [ ] Seed script runs and demo business exists
- [ ] Dashboard loads without server errors
- [ ] Hosted form submits valid lead successfully
- [ ] Form validation rejects malformed payloads
- [ ] Twilio inbound webhook validates signature
- [ ] Twilio inbound creates/updates lead and conversation
- [ ] AI reply is generated and sent through Twilio
- [ ] Twilio status callback updates message delivery state
- [ ] Urgent messages trigger escalation event
- [ ] Settings updates persist and reload correctly

## Notes
- Auth is intentionally not implemented in this MVP.
- Dashboard is intentionally demo-business scoped.
- Route handlers validate payloads and return structured error responses.
