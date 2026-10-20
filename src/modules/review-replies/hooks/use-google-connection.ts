"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createGoogleConnectionRequest,
  createConnectionRequestGuard,
  type GoogleConnectionData,
} from "@/modules/review-replies/services/google-connection-request";

type ConnectionState = {
  viewScope: object;
  requestView: object;
  data: GoogleConnectionData | null;
  loading: boolean;
  error: string | null;
};

export function useGoogleConnection(input: {
  businessId?: string;
  enabled: boolean;
  isDemo?: boolean;
}) {
  const { businessId, enabled, isDemo = false } = input;
  const scopeKey = businessId ?? "";
  const viewScope = useMemo(() => ({ scopeKey, isDemo }), [scopeKey, isDemo]);
  const requestView = useMemo(() => ({ scopeKey, isDemo, enabled }), [scopeKey, isDemo, enabled]);
  const [requestConnection] = useState(() => createGoogleConnectionRequest((url) => fetch(url)));
  const guard = useMemo(() => ({ scopeKey, value: createConnectionRequestGuard() }), [scopeKey]).value;
  const [state, setState] = useState<ConnectionState>(() => ({
    viewScope,
    requestView,
    data: null,
    loading: enabled && !isDemo && Boolean(businessId),
    error: null,
  }));

  const commitData = useCallback((data: GoogleConnectionData, requestSequence: number, requestedScope: string) => {
    if (guard.isCurrent(requestSequence, requestedScope)) {
      setState({ viewScope, requestView, data, loading: false, error: null });
    }
  }, [guard, requestView, viewScope]);

  const commitError = useCallback((cause: unknown, requestSequence: number, requestedScope: string) => {
    if (guard.isCurrent(requestSequence, requestedScope)) {
      setState({
        viewScope,
        requestView,
        data: null,
        loading: false,
        error: cause instanceof Error ? cause.message : "We couldn't load your Google connection. Try again in a moment.",
      });
    }
  }, [guard, requestView, viewScope]);

  const reload = useCallback(async (options: { force?: boolean } = {}) => {
    if (!enabled || isDemo || !businessId) return;
    setState((current) => {
      const currentScope = current.viewScope === viewScope ? current : null;
      return {
        viewScope,
        requestView,
        data: currentScope?.data ?? null,
        loading: currentScope?.data ? currentScope.loading : true,
        error: null,
      };
    });
    const requestedScope = scopeKey;
    const requestSequence = guard.begin(requestedScope);
    try {
      commitData(await requestConnection(businessId, options), requestSequence, requestedScope);
    } catch (cause: unknown) {
      commitError(cause, requestSequence, requestedScope);
    }
  }, [businessId, commitData, commitError, enabled, guard, isDemo, requestConnection, requestView, scopeKey, viewScope]);

  useEffect(() => {
    if (isDemo || !enabled || !businessId) {
      guard.invalidate();
      return;
    }
    const requestedScope = scopeKey;
    const requestSequence = guard.begin(requestedScope);
    void requestConnection(businessId).then(
      (data) => commitData(data, requestSequence, requestedScope),
      (cause: unknown) => commitError(cause, requestSequence, requestedScope),
    );
    return () => { guard.invalidate(); };
  }, [businessId, commitData, commitError, enabled, guard, isDemo, requestConnection, scopeKey]);

  const current = state.viewScope === viewScope ? state : null;
  return {
    connectionData: isDemo ? null : current?.data ?? null,
    connLoading: isDemo || !enabled || !businessId
      ? false
      : current?.requestView === requestView ? current.loading : current?.data ? false : true,
    error: isDemo ? null : current?.error ?? null,
    reload,
  };
}
