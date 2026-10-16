# Local evidence scope

All receipts here are Windows/local tests, including fake Docker/cgroup/API workflow fixtures. No Linux container or external runner was used. The original failed Linux artifact is preserved separately and is not replaced by this evidence. Build H is superseded; I/J are the frozen-recipe reproduction pair. Full application security receipt identifies the exact clean candidate. Resource receipts contain Windows committed process-tree memory, not Linux RSS/OOM counters. PROPOSED_REQUEST.json is documentation only; the active request marker was not changed.

The local snapshot assembler initially required a YAML parser from the wrong worktree and the browser supervisor initially received incorrect relative paths; those setup commands stopped before a browser/build ran. Corrected local paths were used for the passing receipts. No assertion or threshold was weakened.
