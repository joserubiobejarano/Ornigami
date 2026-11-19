"use client";

import { useEffect, useRef, useState } from "react";
import { createPreviewImageGate } from "@/lib/campaign-lab/editor";
import { buildCampaignExportBundle, CampaignExportCancelledError, sameExportGuard } from "@/lib/campaign-lab/export";
import type { CampaignExportSnapshot, LocalPreviewApprovalInput } from "@/lib/campaign-lab/export";

/** Shared by the ordinary editor and internal story experiment. Neither route
 * owns a separate approval/readiness/export policy. No approval is persisted. */
export function usePreviewReview(initialRevision: string | null) {
  const [approval, updateApproval] = useState<{ revision: string; approvedAt: string } | null>(null);
  const [imageGate, setImageGate] = useState(() => createPreviewImageGate(initialRevision));
  const [exporting, setExporting] = useState(false);
  const approvalGuardRef = useRef<LocalPreviewApprovalInput>({ revision: initialRevision, approvalRevision: null, dirty: false, generating: false, imagesReady: false });
  const activeExport = useRef<AbortController | null>(null);
  useEffect(() => () => activeExport.current?.abort(), []);
  function setApproval(value: typeof approval) {
    if (!value) activeExport.current?.abort();
    approvalGuardRef.current = { ...approvalGuardRef.current, approvalRevision: value?.revision ?? null };
    updateApproval(value);
  }
  function approve() {
    const guard = approvalGuardRef.current;
    if (!guard.revision || guard.dirty || guard.generating || !guard.imagesReady) return;
    setApproval({ revision: guard.revision, approvedAt: new Date().toISOString() });
  }
  async function prepareExport(snapshot: CampaignExportSnapshot, signal?: AbortSignal) {
    activeExport.current?.abort();
    const controller = new AbortController();
    activeExport.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    setExporting(true);
    try {
      const bundle = await buildCampaignExportBundle(snapshot, {
        signal: controller.signal,
        isStillApproved: expected => sameExportGuard(expected, approvalGuardRef.current),
      });
      if (controller.signal.aborted || !sameExportGuard(snapshot.guard, approvalGuardRef.current)) throw new CampaignExportCancelledError();
      return bundle;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (activeExport.current === controller) { activeExport.current = null; setExporting(false); }
    }
  }
  return { approval, setApproval, approve, imageGate, setImageGate, exporting, approvalGuardRef, prepareExport };
}
