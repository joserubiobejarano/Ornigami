import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoogleConnectionUrlError,
  getGoogleConnectionUrlErrorKey,
  resolveGoogleConnectionIssue,
} from "../src/modules/review-replies/services/google-connection-error.ts";

test("Google OAuth URL error is visible until a retry or other user action dismisses its exact query", () => {
  const reason = "missing_refresh_token";
  const errorKey = getGoogleConnectionUrlErrorKey("error", reason);
  const dismissedErrorKey = errorKey;
  const error = getGoogleConnectionUrlError("error", reason);
  assert.equal(error, "Google connection failed. Please try again.");
  assert.equal(getGoogleConnectionUrlError(null, reason), null);
  assert.equal(getGoogleConnectionUrlErrorKey(null, reason), null);
  assert.equal(resolveGoogleConnectionIssue({
    localError: null,
    connectionError: null,
    urlError: error,
    urlErrorDismissed: false,
  }), error);
  assert.equal(resolveGoogleConnectionIssue({
    localError: null,
    connectionError: null,
    urlError: error,
    urlErrorDismissed: errorKey === dismissedErrorKey,
  }), null);
  const nextErrorKey = getGoogleConnectionUrlErrorKey("error", "invalid_state");
  assert.notEqual(nextErrorKey, errorKey, "a different callback query is eligible to display again");
  assert.equal(resolveGoogleConnectionIssue({
    localError: null,
    connectionError: null,
    urlError: getGoogleConnectionUrlError("error", "invalid_state"),
    urlErrorDismissed: nextErrorKey === dismissedErrorKey,
  }), error);
  assert.equal(resolveGoogleConnectionIssue({
    localError: "A new request failed.",
    connectionError: null,
    urlError: error,
    urlErrorDismissed: false,
  }), "A new request failed.");
});
