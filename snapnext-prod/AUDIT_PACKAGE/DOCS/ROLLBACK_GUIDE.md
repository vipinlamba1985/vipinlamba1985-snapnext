# ROLLBACK_GUIDE.md — Reverting the Launch Safety Fixes

Use this only if the changes cause an unforeseen regression in production. In practice, rolling back re-opens the launch blockers and should be a last resort.

---

## Option A — Revert the commit (recommended)

Assuming you followed `MANUAL_APPLY_GUIDE.md` and pushed a single commit with all seven files:

```bash
cd path/to/vipinlamba1985-snapnext
git checkout main
git pull --ff-only
git log --oneline -n 5    # find the commit hash
git revert <commit-hash>
git push origin main
```

This creates a new commit that undoes the seven-file change. Preserves history.

---

## Option B — Restore individual files from git

If only one file is misbehaving (unlikely), restore just that one to the previous version:

```bash
cd path/to/vipinlamba1985-snapnext
git log --oneline -- middleware.js | head
git checkout <previous-commit-hash> -- middleware.js
git commit -m "revert: middleware.js to <hash> pending investigation"
git push
```

Do NOT roll back only `middleware.js` without also rolling back `lib/auth.js` and `app/demo-login/page.js`. The preview-token gate is enforced at all three layers; removing one weakens the others.

---

## Option C — Emergency preview access (safe)

If the reason for wanting a rollback is "reviewers can't get in via preview token in production", the correct fix is **not** to remove the gate. Instead:

1. Create a real Supabase user for the reviewer.
2. Grant them `super_user` via `POST /api/admin/grant-super`.
3. Have them log in normally.

The preview token is a dev-only mechanism by design. Do not weaken production for review convenience.

---

## Option D — File-by-file restore from this package's backup

Every file we touched still exists in your local `/app/snapnext-prod/repo` clone in a working state that matches the ZIP. If your repo drifted (for example, you cherry-picked only some hunks), you can re-copy the exact file from the audit package to reset that file to the audited version. This is equivalent to re-running §2 of `MANUAL_APPLY_GUIDE.md`.

---

## Files that would be affected by any rollback

1. `middleware.js`
2. `lib/auth.js`
3. `lib/gemini.js`
4. `app/api/[[...path]]/route.js`
5. `app/(app)/journal/page.js`
6. `app/(app)/memories/page.js`
7. `app/demo-login/page.js`

No other files were changed, so no other files need rollback.

---

## What rolling back re-opens (in order of severity)

| Blocker re-opened | Severity |
|---|---|
| Preview-token grants super-user access in production | **CRITICAL** |
| Owner PII (`Vipin Lamba`, `vipin.lamba1985@gmail.com`) surfaces to every reviewer | **CRITICAL** |
| Hardcoded `'sarika'` classifier biases relationship timelines for every user | **HIGH** |
| Fabricated monthly / annual recaps appear as AI output | **HIGH** |
| Fabricated `relationshipHighlights` narrative appears in Favorites | **HIGH** |
| Fabricated audio transcript placeholder appears when Gemini is down | **HIGH** |
| Fabricated Gemini prompt biases (`Sarika`, `Vipin`, `Goa`) affect every user's AI analysis | **HIGH** |
| Journal renders hardcoded fake user names, spouses, children, trips | **HIGH** |

---

## Post-rollback checklist

1. Confirm which specific behaviour caused the rollback — file a ticket referencing the exact endpoint, request, and expected vs actual output.
2. Re-apply the audit fixes with the specific bug isolated and patched in the same commit.
3. Add a regression test that would have caught the original issue.
4. Reapply and redeploy.

---

## When rollback is NOT appropriate

- If the reason is "the empty states look sparse" — that is intentional. Reference `REFERENCE_VISUAL_POLICY.md`. Never revert to fabricated data to fill space.
- If the reason is "the AI seems less magical without the fake tags" — same. The AI now returns real analysis when it succeeds and honest empty states when it fails.
- If the reason is "the preview token doesn't work in production" — that is by design. See Option C.
