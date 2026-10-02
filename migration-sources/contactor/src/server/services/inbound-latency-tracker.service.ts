type InboundLatencyStage =
  | "inbound_request_received"
  | "business_lookup"
  | "lead_lookup_or_create"
  | "message_persist"
  | "ai_request"
  | "lead_update_persist"
  | "ai_state_persist"
  | "outbound_send"
  | "notification_work"
  | "total_request_time";

type InboundLatencyContext = {
  traceId: string;
  businessId: string | null;
  leadId: string | null;
  conversationId: string | null;
  inboundMessageId: string | null;
};

import { safeLogger } from "@/lib/safe-logger";

export class InboundLatencyTracker {
  private readonly startedAtMs = Date.now();
  private readonly stages: Partial<Record<InboundLatencyStage, number>> = {};
  private readonly context: InboundLatencyContext;

  constructor(traceId: string) {
    this.context = {
      traceId,
      businessId: null,
      leadId: null,
      conversationId: null,
      inboundMessageId: null,
    };
  }

  attachContext(input: {
    businessId?: string | null;
    leadId?: string | null;
    conversationId?: string | null;
    inboundMessageId?: string | null;
  }): void {
    if (input.businessId !== undefined) this.context.businessId = input.businessId;
    if (input.leadId !== undefined) this.context.leadId = input.leadId;
    if (input.conversationId !== undefined) {
      this.context.conversationId = input.conversationId;
    }
    if (input.inboundMessageId !== undefined) {
      this.context.inboundMessageId = input.inboundMessageId;
    }
  }

  mark(stage: InboundLatencyStage, durationMs: number, meta?: Record<string, unknown>): void {
    const rounded = Math.max(0, Math.round(durationMs));
    this.stages[stage] = rounded;
    safeLogger.info("Inbound latency stage.", {
      traceId: this.context.traceId,
      stage,
      durationMs: rounded,
      businessId: this.context.businessId,
      leadId: this.context.leadId,
      conversationId: this.context.conversationId,
      inboundMessageId: this.context.inboundMessageId,
      ...(meta ?? {}),
    });
  }

  async timeStage<T>(
    stage: InboundLatencyStage,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    const stageStart = Date.now();
    try {
      return await fn();
    } finally {
      this.mark(stage, Date.now() - stageStart, meta);
    }
  }

  markCurrent(stage: InboundLatencyStage, meta?: Record<string, unknown>): void {
    this.mark(stage, Date.now() - this.startedAtMs, meta);
  }

  complete(): void {
    this.mark("total_request_time", Date.now() - this.startedAtMs);
    safeLogger.info("Inbound latency summary.", {
      traceId: this.context.traceId,
      businessId: this.context.businessId,
      leadId: this.context.leadId,
      conversationId: this.context.conversationId,
      inboundMessageId: this.context.inboundMessageId,
      stages: this.stages,
    });
  }
}
