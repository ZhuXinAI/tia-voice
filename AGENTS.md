## Component implementation

Try not to exceed 300 lines inside of one component unless you have to. Split stuff in to smaller pieces.

## Visual QA

Try always to Visual QA for any frontend change you made. You can spin up electron process with debugging port and use `agent-browser` to connect to it for making further screenshots.

## Releases

When the user asks to create and push a release tag, use a `v` prefix by default, for example `v1.1.1` instead of `1.1.1`, because the release workflow expects the `v`-prefixed tag format.
