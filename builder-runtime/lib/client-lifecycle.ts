"use client";

import type { CampaignDraftLifecycle } from "@/lib/campaign-lab/draft-lifecycle";

const BUILDER_STORAGE_PREFIX = "ornigami.builder.offer-intake.brief.v1";
const SESSION_CHANNEL = "ornigami-builder-session";

type EndOptions = {
  broadcast?: boolean;
};

/**
 * One browser lifecycle shared by the workspace, intake persistence and the
 * sign-out control. Persistence is stopped before storage is cleared so queued
 * effects cannot write the old brief back after the clear.
 */
class BuilderClientLifecycle implements CampaignDraftLifecycle {
  private persistenceEnabled = true;
  private readonly pending = new Set<AbortController>();

  canPersist(): boolean {
    return this.persistenceEnabled;
  }

  registerPendingWork(controller: AbortController): void {
    if (!this.persistenceEnabled) {
      controller.abort();
      return;
    }
    this.pending.add(controller);
  }

  releasePendingWork(controller: AbortController): void {
    this.pending.delete(controller);
  }

  beginSignOut(): void {
    this.persistenceEnabled = false;
    this.cancelPendingWork();
    this.clearAllDrafts();
  }

  signOutUnconfirmed(): void {
    // The server session may still be valid. Let the operator continue editing
    // while the retryable sign-out state is shown.
    this.persistenceEnabled = true;
  }

  confirmSignOut(): void {
    this.persistenceEnabled = false;
    this.cancelPendingWork();
    this.clearAllDrafts();
    this.broadcast();
  }

  endWorkspace(_subjectId: string, options: EndOptions = {}): void {
    this.persistenceEnabled = false;
    this.cancelPendingWork();
    this.clearAllDrafts();
    if (options.broadcast !== false) this.broadcast();
  }

  private cancelPendingWork(): void {
    for (const controller of this.pending) {
      controller.abort();
    }
    this.pending.clear();
  }

  private clearAllDrafts(): void {
    try {
      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(BUILDER_STORAGE_PREFIX)) {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // A blocked storage area must not prevent sign-out.
    }
  }

  private broadcast(): void {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: "workspace-ended" });
    channel.close();
  }
}

export const builderClientLifecycle = new BuilderClientLifecycle();
