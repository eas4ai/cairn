# The kernel ceiling is reached, and record reading is what fills it

Changes: PKG-004
Outside because: the ceiling is an Agreed requirement's own number, so only the developer can change it; this commitment stays under it, paying for each fix by trimming comment, and reports the cost rather than raising the limit itself
Captured: 2026-09-18T04:59:56.977Z

PKG-004 caps every file under bin/ at 1900 lines, and the kernel sits at exactly 1900. Rounds 31, 32, 33 and 34 of reviews-carry-an-independent-report each paid for their fixes by trimming comment, which is the wrong currency: the comments are what explain a reader whose rules are subtle. The record-reading code is what filled the ceiling, and the canonical records proposed in reviews-and-reports-are-written-in-a-form-the-loop-reads would remove more of it than they add, so the two decisions belong together. The choice is the developer's: raise the ceiling, adopt canonical records and let the reader shrink, or accept that further work on this class trades comment for code.
