# Synthetic palette-review fixtures

Generated deterministically by `node --experimental-strip-types tests/support/palette-review-fixtures.mts`.

`large.json` models 120 literal UI observations from three synthetic CSS sources, including exact cross-source duplicates, near colors, conditional/dark-theme uncertainty and alpha. Eight existing app-owned Rose raster observations are retained separately, including an RGBA value also present in the UI set. Synthetic CSS body hashes/IDs/offsets are deterministic; no raw live operational data is used or reconstructed. This is not IANA evidence or a replay.

`small.json` retains three clean UI colors and their original identities from the accepted fictional Rose draft. `empty.json` has no color candidates. All retain false approval flags. No request, extraction-engine change or native raster decoding occurs during fixture generation.
