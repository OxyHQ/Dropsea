# Oxy engineering standards

How we write code at Oxy. Copy this file into a repository root and every AI coding agent that reads `AGENTS.md` picks it up, as does every human who opens it.

## Package manager

Always **bun**, never npm or yarn. Use `bunx` instead of `npx`.

Commit `bun.lock` in the **same commit** as the `package.json` change that caused it. A version bump without its lockfile fails CI with `lockfile had changes, but lockfile is frozen`, and the person who lands next inherits the breakage.

## Code quality

Write straightforward code that another engineer can read at 2am. No clever tricks, no cute solutions. Clarity beats brevity: if the longer version is easier to debug, write the longer version.

- Follow the patterns already in the codebase. Consistency beats personal preference.
- No unnecessary abstractions, and no half finished ones either.
- No helper files, helper functions, or single use `const` aliases for trivial expressions. Use a named constant when it is reused, required for hook dependencies, or when it marks a real domain boundary.
- No re-exports, no barrel file tricks, no compatibility shims. Import from the package that owns the thing.
- No `@deprecated` markers and no backward compatible aliases. A rename is a clean cut: remove the old identifier, update every call site including comments, ship it.
- Never leave `TODO`, `FIXME` or `HACK` comments. Fix it now or do not write the comment.

### Naming

| Kind                       | Convention                          |
| -------------------------- | ----------------------------------- |
| Variables, functions       | `camelCase`                         |
| Types, interfaces, classes | `PascalCase`                        |
| Constants                  | `UPPER_SNAKE_CASE`                  |
| Utility files              | `kebab-case`                        |
| React components           | `PascalCase`                        |
| Booleans                   | `is`, `has`, `should`, `can` prefix |
| Event handlers             | `handle` prefix                     |

No single letter names outside loop indices. No abbreviations unless universally understood.

### TypeScript

- Never `as any`. Never `@ts-ignore` or `@ts-expect-error`. Fix the actual type error, and define the interface if the type is complex.
- Never `any` as a parameter or return type.
- Never `!` non null assertions. Handle the null with optional chaining or a guard.
- Prefer `unknown` over `any` when the type is genuinely unknown, then narrow with a type guard.
- Strict mode, always. No implicit `any`, no unchecked index access.
- Never `var`. `const` by default, `let` only when reassignment is real.

### React

Effects synchronise with external systems. They are not for transforming data or responding to events.

| Instead of                                      | Do this                               |
| ----------------------------------------------- | ------------------------------------- |
| `useEffect` + `setState` for derived state      | Calculate it during render            |
| `useEffect` for expensive computation           | `useMemo`                             |
| `useEffect` to reset state on a prop change     | `key` on the component                |
| `useEffect` watching state to react to an event | Put the logic in the event handler    |
| Chained effects                                 | One calculation, or the event handler |
| `useEffect` + `addEventListener` for a store    | `useSyncExternalStore`                |
| Raw `useEffect` fetching                        | React Query or SWR                    |

If you do fetch in an Effect, use a cleanup function with an `ignore` flag or you will ship a race condition. Guard app initialisation with a module level flag: Effects run twice in StrictMode.

**React Compiler and external mutable state.** With the compiler enabled, never read external mutable state inside a memoised position (`useMemo`, or any value the compiler auto memoises). That includes SQLite reads, module level mutable singletons, a ref's `.current`, and any out of band store read. The compiler assumes purity, freezes the first value it computes, and serves it forever. Fix it with `useSyncExternalStore` whose snapshot returns a stable reference while unchanged, or hold the data in reactive state. `'use no memo'` is a band aid, and disabling the compiler globally to dodge this is not a fix.

### Styling

In React Native, never write inline styles where a NativeWind class exists for the same thing.

### Error handling

- Handle errors at system boundaries: user input, API responses, third party services. Trust internal code and framework guarantees.
- Never swallow an error silently. `catch {}` is not error handling. Log with enough context to know what failed and on what input.
- Typed error responses from APIs. No unstructured error strings.
- Never `console.log` for debugging in committed code.

### Security

- Never commit secrets, tokens or credentials, and never paste them into config files, docs or issue threads. Environment variables, always.
- Validate and sanitise every external input. Guard against SQL injection, XSS and command injection.
- Parameterised queries for every database operation.
- Least privilege for every API key and service account.
- Never build a mass assignment path: no `new Model(req.body)`, no spreading `req.body` into an update. Resolve the owner server side and whitelist fields explicitly.

### Testing

- Test business logic, API endpoints and complex utilities.
- Test behaviour, not implementation. A refactor should not break the suite.
- Descriptive test names: the scenario and the expected outcome.
- No test only hooks in production code. If something is hard to test, the design is the problem.
- A check that cannot fail is worse than no check. Before trusting a test, break the thing it guards and confirm it goes red.

## Verification

Claiming something works is not the same as knowing it does.

- Trace the real path before fixing: which request the client actually makes, which route serves it, what that handler actually returns. Then fix, then re-check against the original symptom.
- Type checking and unit tests do not catch render races, layout bugs, animation freezes or navigation problems. Verify those in a real, foregrounded browser or a real device build.
- After changing anything, read the logs and the error output. Review your own work before reporting success.
- Never claim a feature is complete without auditing the integration points between the new code and the old. If there are gaps, list them.

## Git and pull requests

- Commit messages in the imperative, focused on why rather than what. `Fix race condition in session refresh`, not `Updated auth.ts`.
- One logical change per commit. Do not mix unrelated work.
- PR titles under 70 characters. PR bodies say what changed, why, and how it was tested.
- Never force push a shared branch. Rebase only your own.
- Delete branches after merge.
- In a shared repository, scope your `git add` to the paths you touched. Never `git add -A` where another session may have uncommitted work.

## When an approach fails

If the first approach does not work, or gets rejected, stop and ask which direction to take. Do not cascade through three progressively hackier workarounds. The second wrong approach costs more than the question.

## Environment configuration

- Every value that varies between environments comes from an environment variable. Nothing hardcoded, no magic numbers, no hardcoded URLs or API keys.
- Commit a `.env.example` documenting the required variables, with no real values.
- Never commit `.env`. Make sure `.gitignore` covers it.

## How this file is used

`AGENTS.md` is the single source of truth, and it is vendor neutral: Claude Code, Codex, Cursor, Copilot and others read it directly.

For Claude Code, add a `CLAUDE.md` next to it whose only meaningful line is:

```
@AGENTS.md
```

Never put real content in `CLAUDE.md`, and never let the two drift apart.

Agents load `AGENTS.md` from the repository root down to the working directory and stack them, so a file deeper in the tree carries **only its own delta**. Never copy a parent's rules into a child: duplication is what makes an agent follow the stale copy.

Keep version numbers, changelogs and "fixed in commit X" stories out of these files. `package.json` is the truth for versions and git is the truth for history.

## Dropsea

Dropsea organises a person's photos and files; it never stores bytes. Every file lives in Oxy Files (`oxy.assets`) and a Dropsea row only points at it.

- **The person's own client uploads and links the file to Dropsea** (`oxy.assets.upload`, then `oxy.assets.link` to this application). That link is the person's consent; without it the backend cannot read the file (`files:linked:read`, oxy ADR 0021), and Dropsea refuses the item.
- **The backend never mints a URL for a client.** It returns asset ids; each client resolves them with its own session (`oxy.assets.urls`), so a private photo is only ever readable by someone Oxy allows.
- **Seed colours are worked out once, here, when an item is added** (`@oxy.so/bloom/color-engine` over a 48×48 thumbnail), and travel with the item. A screen showing the photo themes itself without reading pixels.
- Size and capture time are read from the bytes at the same moment (Oxy Files extracts its own metadata after the upload returns, and keeps no capture time) and copied onto the row, so a page of items needs no call per photo.
