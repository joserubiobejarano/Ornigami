"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  fetchReplySettings,
  updateReplySettings,
} from "@/modules/review-replies/services/review-replies-api.service";

export const DEFAULT_TONE = "Warm and friendly";

export const TONE_OPTIONS = [
  "Warm and friendly",
  "Professional",
  "Casual",
  "Luxury",
] as const;

type SaveState = "idle" | "saving" | "saved" | "error";

function readDemoCookie(): boolean {
  if (typeof document === "undefined") return false;
  const demoCookie = document.cookie
    .split(";")
    .find((cookie) => cookie.trim().startsWith("ll_demo="));
  return demoCookie?.split("=")[1] === "true";
}

export function useReviewReplySettings() {
  const [isDemo, setIsDemo] = useState(readDemoCookie);
  const [businessName, setBusinessName] = useState("");
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [ownerName, setOwnerName] = useState("");
  const [contactPreference, setContactPreference] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [autoReplyAllReviews, setAutoReplyAllReviews] = useState(false);
  const [autoReplySaving, setAutoReplySaving] = useState(false);

  useEffect(() => {
    const isDemoMode = readDemoCookie();
    setIsDemo(isDemoMode);
    if (isDemoMode) {
      setSettingsLoading(false);
      return;
    }

    let cancelled = false;
    void fetchReplySettings().then((settings) => {
      if (cancelled) return;
      if (!settings) {
        setSettingsError("We couldn't load your reply settings. Try again in a moment.");
        setSettingsLoading(false);
        return;
      }
      setBusinessName(settings.businessName ?? "");
      setTone(
        settings.tone && TONE_OPTIONS.includes(settings.tone as (typeof TONE_OPTIONS)[number])
          ? settings.tone
          : DEFAULT_TONE
      );
      setOwnerName(settings.ownerName ?? "");
      setContactPreference(settings.contactPreference ?? "");
      setAutoReplyAllReviews(Boolean(settings.autoReplyAllReviews));
      setSettingsLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setSettingsError("We couldn't load your reply settings. Try again in a moment.");
        setSettingsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const settingsPayload = {
    businessName,
    tone,
    ownerName,
    contactPreference,
    autoReplyAllReviews,
  };

  async function saveReplySettings() {
    setSaveState("saving");
    setSettingsError(null);
    try {
      await updateReplySettings(settingsPayload);
      setSaveState("saved");
      toast.success("Settings saved.");
      window.setTimeout(() => setSaveState("idle"), 2500);
    } catch (cause: unknown) {
      setSaveState("error");
      setSettingsError(cause instanceof Error ? cause.message : "Something went wrong. Try again in a moment.");
      window.setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  async function persistAutoReply(next: boolean) {
    setAutoReplySaving(true);
    try {
      await updateReplySettings({ ...settingsPayload, autoReplyAllReviews: next });
      setAutoReplyAllReviews(next);
      toast.success(
        next
          ? "Auto-post on — trusted replies can post to Google after sync."
          : "Auto-post off — replies are saved as drafts."
      );
    } catch (cause: unknown) {
      toast.error(cause instanceof Error ? cause.message : "Something went wrong. Try again in a moment.");
    } finally {
      setAutoReplySaving(false);
    }
  }

  return {
    isDemo,
    businessName,
    setBusinessName,
    tone,
    setTone,
    ownerName,
    setOwnerName,
    contactPreference,
    setContactPreference,
    settingsLoading,
    settingsError,
    saveState,
    autoReplyAllReviews,
    autoReplySaving,
    saveReplySettings,
    persistAutoReply,
  };
}
