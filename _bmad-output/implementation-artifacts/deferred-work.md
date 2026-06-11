# Deferred Work

Items surfaced during quick-dev reviews, deferred for later focused attention.

## Production-branch filter (spec-production-branch-filter, 2026-06-11)
- **Deleted/renamed production branch is silently accepted → feed quietly stops.** If a connection's tracked `production_branch` later disappears on GitHub: (1) `setProductionBranchAction`/`connectRepoAction` don't re-validate the branch still exists before persisting, and (2) the reconcile cron's commits-by-branch `404` is swallowed by the inner try/catch (intended for empty repos), so the connection shows `connected`/healthy but produces no push candidates with no signal to the freelancer. Fix options (have tradeoffs — CJ to decide): re-validate the chosen branch against `listBranches` on write (adds a GitHub round-trip + a save-time dependency on GitHub being reachable), and/or have the cron surface a `markConnectionError("Tracked branch '<x>' no longer exists")` when the production branch yields no head (the 404 is ambiguous vs "no commits yet", so this needs care). Severity: medium (real silent-failure UX gap, but requires a post-save branch deletion).
