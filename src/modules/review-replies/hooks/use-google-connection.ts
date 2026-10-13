"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGoogleConnectionRequest,
  createConnectionRequestGuard,
  type GoogleConnectionData,
} from "@/modules/review-replies/services/google-connection-request";

const createGuard = createConnectionRequestGuard;

export function useGoogleConnection(input: {
  businessId?: string;
  enabled: boolean;
  isDemo?: boolean;
}) {
  const { businessId, enabled, isDemo = false } = input;
  const [connectionData, setConnectionData] = useState<GoogleConnectionData | null>(null);
  const [connectionDataScope, setConnectionDataScope] = useState<string | null>(null);
  const [connLoading, setConnLoading] = useState(enabled && !isDemo);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);
  const previousScope = useRef<string | null>(null);
  const requestConnection = useRef<ReturnType<typeof createGoogleConnectionRequest> | null>(null);
  if (!requestConnection.current) requestConnection.current = createGoogleConnectionRequest((url) => fetch(url));
  const guard = useRef<ReturnType<typeof createGuard> | null>(null);
  if (!guard.current) guard.current = createGuard();
  const scopeKey = businessId ?? "";
  guard.current.setScope(scopeKey);

  const reload = useCallback(async (options: { force?: boolean } = {}) => {
    if (!enabled || isDemo || !businessId) return;
    const requestedScope = businessId ?? "";
    const requestSequence = guard.current!.begin(requestedScope);
    if (!hasData.current) setConnLoading(true);
    setError(null);
    try {
      const data = await requestConnection.current!(businessId, options);
      if (guard.current!.isCurrent(requestSequence, requestedScope)) {
        setConnectionData(data);
        setConnectionDataScope(requestedScope);
        hasData.current = true;
      }
    } catch (cause: unknown) {
      if (guard.current!.isCurrent(requestSequence, requestedScope)) {
        setError(cause instanceof Error ? cause.message : "We couldn't load your Google connection. Try again in a moment.");
        setConnectionData(null);
        setConnectionDataScope(null);
        hasData.current = false;
      }
    } finally {
      if (guard.current!.isCurrent(requestSequence, requestedScope)) setConnLoading(false);
    }
  }, [businessId, enabled, isDemo]);

  useEffect(() => {
    if (previousScope.current !== scopeKey) {
      previousScope.current = scopeKey;
      hasData.current = false;
      setConnectionData(null);
      setConnectionDataScope(null);
      setError(null);
    }
    if (isDemo || !enabled) {
      guard.current!.invalidate();
      setConnLoading(false);
      if (isDemo) {
        setConnectionData(null);
        setConnectionDataScope(null);
        hasData.current = false;
      }
      return;
    }
    if (!businessId) {
      guard.current!.invalidate();
      setConnLoading(false);
      return;
    }
    void reload();
    return () => { guard.current!.invalidate(); };
  }, [businessId, enabled, isDemo, reload, scopeKey]);

  return {
    connectionData: connectionDataScope === scopeKey ? connectionData : null,
    connLoading,
    error,
    reload,
  };
}
