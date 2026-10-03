import { applyBoosterDeliveryEvent } from "@/modules/review-booster/services/delivery-events-db.service";
import { createResendWebhookPost } from "@/modules/review-booster/services/resend-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createResendWebhookPost({ applyDeliveryEvent: applyBoosterDeliveryEvent });
