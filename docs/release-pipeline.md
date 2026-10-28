# npm release pipeline - operations

Package: `@gasnonthachai/animation-maker`. Repository: `Gas-nontachai/animation-maker-skills`. CLI remains `animation-maker`.

## Verified baseline and safety

`@gasnonthachai/animation-maker@1.1.1` is published and verified, and `v1.1.1` points to its source commit `ebadeb45bb1756f7f62c3c2180f7a279900299b2`. This is the baseline for future automatic versioning until a newer stable release is published. The older `1.1.0` has unverified source provenance; it is not used as the current baseline and no tag is inferred for it.

The one-time bootstrap and rebaseline mechanisms have been removed. There are no special release actions or authorization variables for them. Only `publish`, `recover` and `skip` plans remain. Old workflow artifacts must not be reused; rerun all jobs to generate a current plan. This cleanup does not publish, create or modify tags, push commits, or change repository settings.

Publishing is disabled unless repository variable `NPM_RELEASE_ENABLED` is exactly `true`. The publishing job also requires the `npm-production` environment, which must have required reviewers configured. Retain the existing trusted-publisher and environment protections. The cleanup does not independently verify those settings.

Never add an npm token to GitHub Secrets. The publish job uses GitHub-hosted Ubuntu, Node.js 24, npm >=11.5.1, OIDC authentication and `id-token: write`. It rejects npm token environment variables. Its artifact is prepared and tested on GitHub-hosted macOS, matching the existing checkout-denial smoke harness.

## CI and release flow

- `ci.yml`: all pull requests, read-only permissions, manifest/path checks before installation, `npm ci --ignore-scripts`, unit tests, typecheck, production/full security gate and clean-install package smoke. Audit evidence is uploaded even on failure. PR runs cannot publish.
- `release.yml`: pushes to `prod` only, full Git history and tags, one release workflow at a time without cancelling an active release. Newer pending runs may replace older pending runs; the published-registry baseline preserves all unreleased changes.
- Prepare queries the public npm registry, computes a plan, updates package.json and package-lock.json versions in the runner only, and sets manifest `gitHead` to the source commit. It never commits or pushes these edits back to prod.
- For `publish`, prepare runs tests/typecheck/security and a clean artifact installation/render smoke test, then uploads the tested tarball, its integrity and release plan. For `recover`, it uploads only the plan; no new tarball is needed.
- The protected publish job executes no project dependency lifecycle hooks, installs no project dependencies, and verifies tarball SHA-512 before publishing that exact artifact with OIDC and provenance.
- Only after npm exposes the expected name, version, `gitHead` and integrity does the job create lightweight tag `vX.Y.Z` at the source commit through the GitHub API. Tag conflicts fail; existing matching tags are idempotent. `main` is never a publishing trigger. All release changes follow `main` through reviewed PRs to `prod`.

## Version resolution and runtime boundary

The baseline is the greatest stable version actually present in the npm registry, not package.json, the last commit, the last workflow run or the newest Git tag. Moving the npm `latest` dist-tag backwards cannot accidentally reuse a version. Prerelease-only package histories require manual review. Registry errors other than HTTP 404 fail closed rather than being treated as a first release.

For an existing release, its published `gitHead` must be a full 40-character commit SHA and an ancestor of the checked-out prod commit. Any existing release tag must point to that same commit. Missing/invalid `gitHead` is a hard failure, even if a tag exists. Divergent history and conflicting evidence block release and recovery; neither HEAD nor a matching version number substitutes for provenance. All commits since the baseline are inspected, including merged commits.

Runtime files are bin/, packages/, renderer/, examples/, package.json, package-lock.json, tsconfig.json and scripts/ excluding the known CI/release/smoke helpers. New unclassified script helpers conservatively count as runtime. Tests, .github/, Skills and Docs do not count on their own. Manifest/lock changes conservatively count as runtime, including development-only dependency changes. This pipeline-only cleanup therefore does not trigger a new runtime release.

Among runtime-touching commits: `fix` means patch, `feat` means minor, and a Conventional Commit `!` or `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer means major. The highest bump wins; any other runtime change defaults to patch. Docs/Skills-only commit messages do not affect the runtime version. Starting from `1.1.1`, the next patch/minor/major is `1.1.2`/`1.2.0`/`2.0.0`. Existing version/tag collisions fail closed.

For a genuinely unpublished package (registry 404), generic first-release planning still uses the checked-in manifest version exactly, and skips if there are no runtime changes. This path does not replace the established `1.1.1` baseline for this package. The checked-in `1.1.0` manifest is intentionally not changed by this cleanup; runner-only versioning uses registry truth.

Skills installed from GitHub keep their explicit compatibility pin. Updating that pin is a separate reviewed Skills change and does not itself publish a runtime. The workflow does not rewrite source Skills or commit CI versions back to prod.

## Registry propagation and interrupted-release recovery

Merge through the normal PR flow. Prepare plans the next version and tests the exact tarball; the protected publish job publishes via OIDC, verifies npm, then creates the tag automatically.

After a successful publish, registry visibility is polled for at most **eight minutes**, using a monotonic deadline. The first verification lookup is immediate; absent versions (HTTP 404) are retried after 5, 10, 20, then at most 30 seconds between lookups. Each request is limited to 20 seconds or the remaining deadline, whichever is smaller, and the final wait is clipped to the remaining time. The publish job has a 15-minute timeout to leave room for setup, publication, verification and tagging.

Only absent metadata is retried. Missing/conflicting `gitHead`, package/version mismatches and mismatched/missing integrity fail immediately without tagging. HTTP errors other than 404 and network/request timeouts also fail closed. No unverified artifact is tagged merely because npm publish exited successfully.

If publication succeeds but verification times out, the process dies, or tag creation fails, rerun **all jobs** of the original prod workflow. Prepare sees the published version with its missing tag and emits a `recover` plan using npm's `gitHead` and integrity. After the same protected-environment approval, finish rechecks ancestry and registry identity, then restores only the missing tag without publishing again. It needs no tarball or special recovery authorization variable. If newer prod commits exist, recovery happens first; rerun again or use the next prod push to process the remaining changes.

A failed npm publish does not create a tag. If npm accepted the upload before a connection failure, the next run still recovers from registry truth. A version already present is verified rather than republished. A version associated with another commit or different integrity is rejected. Matching tags are idempotent, including pre-existing annotated tags; conflicting tags are never moved or overwritten. Immediately before a new publish, the registry baseline is queried again; advancement while approval was pending invalidates the plan and requires a fresh run.

## Security gate and scoped mitigation

The gate rejects local file/link/workspace dependencies, absolute dependency or package entry paths, linked lock entries and machine-specific manifest paths. Both production and full npm audits must exit successfully and report exactly zero vulnerabilities; registry/audit failures block the release. Nothing is silenced with audit-level exclusions or force-fix commands.

The [documented Zod mitigation](security-phase1.7.md) is preserved. The repo audit uses its root override. The clean artifact consumer applies the scoped override under `@gasnonthachai/animation-maker`, then audits the actual installed dependency tree before rendering. Root-clean audit results do not prove a bare consumer is clean. The bare-package residual upstream advisory and requirement to use the scoped mitigation must be explicitly accepted at protected-environment review; no residual-risk acceptance is inferred here.

## Existing npm and GitHub configuration

These are continuing requirements, not settings changes performed by this cleanup:

1. Retain ownership/publish rights for npm scope `@gasnonthachai`, public visibility and the matching repository URL in package.json.
2. Keep npm Trusted Publishing configured for GitHub owner `Gas-nontachai`, repository `animation-maker-skills`, workflow `release.yml`, environment `npm-production`, with publishing/provenance enabled. Do not add a PAT or npm token.
3. Keep GitHub environment `npm-production` restricted to `prod`, with required reviewers, prevention of self-review and disabled bypass where supported. Protect prod and release tags; permit the approved workflow's `GITHUB_TOKEN` to create tags.
4. Use only repository variable `NPM_RELEASE_ENABLED=true` to enable normal release jobs after approval. Every publish/recovery still passes the environment reviewer gate. An environment name in YAML alone does not configure protection.
5. Review the uploaded plan, artifact, tests and audit evidence before approving the publishing environment. Do not publish merely to test pipeline cleanup.

Official references: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). npm requires Node >=22.14.0 and npm >=11.5.1 for OIDC; the workflow selects Node 24 and checks the CLI floor. Actions are pinned to immutable commits.

## Local verification

Run `npm test`, `npm run typecheck`, `npm run security:check`, `npm run test:package` and actionlint on both workflow files. `node scripts/release.mjs plan` reads Git/npm and writes only output/release-plan.json; it never publishes or creates tags. `finish` is guarded against local execution.

Regression tests mock publication and GitHub mutations. They cover normal Conventional Commit bumps from verified `1.1.1` despite the older manifest/legacy registry release, accumulated changes, first release, greatest stable version, pipeline-only skips, duplicates, missing/invalid `gitHead`, missing integrity, divergent history, tag conflicts, stale registry state, altered artifacts, exact OIDC publish arguments, delayed visibility beyond five minutes, bounded timeout/backoff including request time, and interrupted verification/tagging recovery without republishing.

`test:package` verifies a local artifact, not a live OIDC publish or repository-setting enforcement. `test:release` is the separate public one-prompt runtime/Skills smoke and is not required for pipeline cleanup. Local validation must not publish, create/modify tags, push commits or change repository settings.
