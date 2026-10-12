# Repository boundaries

This is the game code repository `goodleap/wild-reaper`. Keep executable code, tests, and necessary operational/engineering instructions here.

The canonical game design principles are maintained ONLY in the private repository `goodleap/wild-reaper-design`, in its `README.md`:
https://github.com/goodleap/wild-reaper-design

Read or update that private repository only when the user explicitly requests it. Routine code work must not fetch or update the design repository. A previously authorized, private local/session cache may be reused and kept current between explicit synchronization requests; keep it outside this repository and all public or deployed artifacts. Do not reconstruct an alternative design document here or treat old public documentation as the current authority.

Never put game design documents, copied principles, detailed design summaries, or design decision logs in this repository, its public issue/PR discussions, commit messages, release materials, or deployment artifacts. A pointer to the private source is allowed; the design content is not.

When the user explicitly requests design-document synchronization, integrate confirmed principles in the private repository, replacing superseded rules. Until then, any working synthesis remains in the private cache. Do not record concrete values, ability inventories, or implementation details as principles, and do not turn unconfirmed proposals into settled decisions.

Keep the two repositories and their commits separate. Verify the destination and the design repository's private visibility before any design-content write. Do not change repository visibility without explicit user authorization.

Game version numbers count commits in this code repository only; design-only commits in the private repository do not advance the game version. See `README.md` for code checks and deployment instructions.
