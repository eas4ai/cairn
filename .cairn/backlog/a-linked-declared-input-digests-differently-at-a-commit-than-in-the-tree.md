# A linked declared input digests differently at a commit than in the tree

Surfaced from: LOOP-023
Promoted to: the-two-views-of-an-input-agree (2026-09-04, on the developer's word)
Captured: 2026-09-04T23:08:50.944Z

inputsDigest reads the working tree through readFileSync, which follows a symbolic link to its target's content. inputsDigestAt reads git show <commit>:<path>, which for a link is the link's target path. A declared input that is a symbolic link therefore never has the same digest in the two views, and a review record, which is compared by the commit it examined, is stale forever; evidence records carry the tree digest and are compared with the tree, so they hold until the review. Found while adding CLAUDE.md to this repository, which is a one-line include rather than a link for this reason. The fix is in the kernel: read a link the same way in both views. Promotion is the developer's.
