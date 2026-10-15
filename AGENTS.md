# Repository boundaries

This is the game code repository `goodleap/wild-reaper`. Keep executable code, tests, and necessary operational/engineering instructions here.

The canonical game design principles are maintained ONLY in the private repository `goodleap/wild-reaper-design`, in its `README.md`:
https://github.com/goodleap/wild-reaper-design

Read or update that private repository only when the user explicitly requests it. Routine code work must not fetch or update the design repository. A previously authorized, private local/session cache may be reused and kept current between explicit synchronization requests; keep it outside this repository and all public or deployed artifacts. Do not reconstruct an alternative design document here or treat old public documentation as the current authority.

Never put game design documents, copied principles, detailed design summaries, or design decision logs in this repository, its public issue/PR discussions, commit messages, release materials, or deployment artifacts. A pointer to the private source is allowed; the design content is not.

When the user explicitly requests design-document synchronization, integrate confirmed principles in the private repository, replacing superseded rules. Until then, any working synthesis remains in the private cache. Do not record concrete values, ability inventories, or implementation details as principles, and do not turn unconfirmed proposals into settled decisions.

Keep the two repositories and their commits separate. Verify the destination and the design repository's private visibility before any design-content write. Do not change repository visibility without explicit user authorization.

Game version numbers count commits in this code repository only; design-only commits in the private repository do not advance the game version. See `README.md` for code checks and deployment instructions.

## Delivery requirements

- Work only in the authorized cloud environment; never read/download project resources or run Git on the user's device.
- GitHub `goodleap/wild-reaper` is the sole canonical source. Before editing, verify cloud command execution and fetch the latest `main`; inspect the checkout and preserve other sessions' work. Reconcile remote updates before pushing, and never force-push to resolve a release conflict.
- Unless the user explicitly limits delivery, a completed change includes the next code-repository version, GitHub source synchronization, and a successful deployment to the existing GitHub Pages website. Validate the version and release assets in the cloud checkout, then verify the Pages run for the exact delivered commit; the latest green run alone is insufficient. Cloud access to the public website is not required and must not be treated as a delivery blocker.
- The former Site is a historical version outside the routine development and release workflow. Do not access, restore, synchronize, redeploy, delete, or change its permissions unless explicitly requested. Do not create a replacement Site.
- Keep private `.cloud/` tools, credentials, and other private materials out of this repository and deployment assets. Follow the GitHub workflow documented in `README.md`.
- Use scoped checks. Investigate and fix failures encountered during the authorized work, including pre-existing failures: fix runtime defects or update obsolete test expectations while retaining meaningful behavior coverage. A failed or unverified required target means partial delivery; report the remaining work explicitly. Retry the existing release instead of creating another version for the same change.
