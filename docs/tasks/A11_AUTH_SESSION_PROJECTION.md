# A11 restricted-session projection proposal

Auth.js keeps the canonical `deletionUserId` in its trusted server-side session so the deletion recovery endpoint can resume the frozen operation. The Auth.js client session endpoint (`/api/auth/session`, with an optional trailing slash) returns a separate projection: a deleting session exposes only an empty `user`, the non-identifying `accountLifecycle: "deleting"` marker, and its expiry. It never returns the recovery subject or profile fields. Existing Auth.js response status, cookies, and other headers are retained.

Anonymous (`null`) and active session responses and non-session Auth.js actions pass through untouched. Unexpected deletion markers return a minimal empty restricted projection; malformed or non-object session JSON returns JSON `null`, preserving unauthenticated client semantics without exposing identifiers. Bodyless statuses pass through unchanged. This route-level filter does not alter `auth()` or its trusted server-side callback result.

Validation: `node --experimental-strip-types --test tests/a11-auth-client-session.test.mts` covers GET and POST session responses, anonymous and active session passthrough, malformed/unexpected restricted projections, multiple cookie/header preservation, bodyless statuses, and sign-out passthrough.
