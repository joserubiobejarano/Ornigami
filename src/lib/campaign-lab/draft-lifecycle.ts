/**
 * Client-side lifecycle shared by the builder workspace, intake persistence and
 * pending generation/export work. Sign-out, expiry and account changes disable
 * persistence before clearing storage and abort work that belongs to the old
 * subject.
 */
export type CampaignDraftLifecycle = {
  canPersist(): boolean;
  registerPendingWork(controller: AbortController): void;
  releasePendingWork(controller: AbortController): void;
};
