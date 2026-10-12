# Repository boundaries

This is the game code repository `goodleap/wild-reaper`. Keep executable code, tests, and necessary operational/engineering instructions here.

The canonical game design principles are maintained ONLY in the private repository `goodleap/wild-reaper-design`, in its `README.md`:
https://github.com/goodleap/wild-reaper-design

Before making gameplay or design changes, read that private document through authorized access. If it is unavailable, report the limitation; do not reconstruct an alternative design document here or treat old public documentation as the current authority.

Never put game design documents, copied principles, detailed design summaries, or design decision logs in this repository, its public issue/PR discussions, commit messages, release materials, or deployment artifacts. A pointer to the private source is allowed; the design content is not.

The user has authorized appropriate updates and commits to the private design repository when newly confirmed game design decisions affect its principles. Integrate changes there, replacing superseded rules. Do not record concrete values, ability inventories, or implementation details as principles, and do not turn unconfirmed proposals into settled decisions.

Keep the two repositories and their commits separate. Verify the destination and the design repository's private visibility before any design-content write. Do not change repository visibility without explicit user authorization.

Game version numbers count commits in this code repository only; design-only commits in the private repository do not advance the game version. See `README.md` for code checks and deployment instructions.
