# Palette recovery evidence

19 November 2026. Actual normal `/campaign-lab/offer` intake/editor, development
webpack server at `http://127.0.0.1:3219`, local-test success provider, live false.
No destination link was followed. This is agent-operated qualification.

- [Before](before-stale-apply.jpg): unmodified merged intake after white Apply
  failed, external override corrected to `#123456`, then Editorial selected.
  Apply remains disabled. [DOM readback](before.json) retains the contrast error.
  This capture used the ambient viewport; encoded image is 1265×712.
- [External correction](external-recovery.json): final-source editor rejects
  white and enables Apply immediately after only the override changes.
- [Direction correction](direction-recovery.json): selected accent correction
  `#646464` fails Editorial and passes Clear without an unrelated edit/reload.
- [Invalid file](invalid-file.json): failed import remains authoritative after
  both external accent and direction changes. A valid same-file retry recovers.
  Controlled late-valid-read-after-new-invalid-read is a separate unit test,
  not an injected browser file-read claim.
- [Default evidence](mobile-evidence-default.jpg): source and correction visible;
  color caveats/hash/quote and global source warnings remain collapsed and reachable.
- [Correction](mobile-correction.jpg), [Apply](mobile-apply.jpg),
  [keyboard Apply focus](mobile-keyboard-apply.jpg), [focus geometry](keyboard-apply.json).
- [Mobile approved preview](mobile-approved-preview.jpg),
  [desktop approved preview](desktop-approved.jpg), [fresh approval](fresh-approval.json).

Requested viewport overrides were 375×812 and 1440×900. Read back `innerWidth /
innerHeight` exactly matched. Client widths and scroll widths were 360/360 and
1425/1425: no horizontal overflow. [DOM geometry](geometry.json) and
[mobile preview geometry](mobile-preview-geometry.json) retain exact measurements.
The browser returns scaled JPEGs: mobile captures encode 360×780 and desktop
1425×891, rather than the requested viewport dimensions. No image was resized
or represented as a larger viewport. These are normal-height scrolled app views.

Visual judgment: role, value and source now lead the review; essential authority
language stays visible and caveats remain accessible. The mobile action has a
visible keyboard ring and the complete product/offer/facts fit without horizontal
overflow. The desktop heading still takes four heavy lines; typography/composition
was not changed and no commercial wording was shortened.

Fresh export: [receipt](receipt.json), revision `d36c263b05efa470`, effective accent
`#123456` over reviewed `#163f64`. Original initial revision was
`8f2fb01c3836dae3`; pending invalid/corrected edits and Apply retained it while
approval/export were locked. Generation and fresh approval unlocked the new one.
Explicit override removal exposed `#163f64` and locked export; restoring override
and regenerating required a new local approval even for the same rendered hash.

[Package audit](package-audit.json) covers all four retained packages and this
fresh export. [Command evidence](verification.json) records exact commands, exits,
counts and raw-log hashes. ZIP and extracted package remain local at the paths in
the [integration report](../../campaign-lab-brand-recovery.md). Archive audit is
not native offline playback. No blocked browser surface was retried.
