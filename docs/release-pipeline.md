# npm release pipeline — readiness and operations

Package: `@gasnonthachai/animation-maker`. Repository: `Gas-nontachai/animation-maker-skills`. CLI remains `animation-maker`.

## Safety status

The workflows and local test suite are implemented. Publishing is disabled unless the repository variable `NPM_RELEASE_ENABLED` is exactly `true`. The publishing job also requires the `npm-production` environment and must be configured with required reviewers before enabling that variable. No npm publish, remote tag creation, workflow push or repository-settings change was performed while implementing this pipeline. Live OIDC publication remains unverified until separately approved.

Never add an npm token to GitHub Secrets. The publish job uses GitHub-hosted Ubuntu, Node.js 24, npm's OIDC authentication and `id-token: write`. It rejects npm token environment variables and requires npm >=11.5.1. Its artifact was prepared and tested on GitHub-hosted macOS, matching the existing checkout-denial smoke harness. No application runtime, SVG asset or animation semantics changed.

## CI and release flow

- `ci.yml`: all pull requests, read-only permissions, manifest/path checks before installation, `npm ci --ignore-scripts`, unit tests, typecheck, production/full security gate and clean-install package smoke. Audit evidence is uploaded even on failure. PR runs cannot publish.
- `release.yml`: pushes to `prod` only, full git history and tags, one release workflow at a time without cancelling an active release. Newer pending runs may replace older pending runs; the published-registry baseline preserves all unreleased changes.
- Prepare queries the public npm registry, computes a plan, updates package.json and package-lock.json versions in the runner only, and sets manifest `gitHead` to the source commit. It never commits or pushes these edits back to prod.
- For a new publish, prepare runs tests/typecheck/security and a clean artifact installation/render smoke test, then uploads the tested tarball, its integrity and release plan. The publish job executes no dependency lifecycle hooks, installs no project dependencies, and verifies tarball SHA-512 before publishing that exact artifact.
- Only after npm exposes the expected name, version, gitHead and integrity does the publishing job create lightweight tag `vX.Y.Z` at the source commit through the GitHub API. Tag conflicts fail; existing matching tags are idempotent. `main` is never a publishing trigger.

## Version resolution and runtime boundary

The baseline is the greatest stable version actually present in the npm registry, not package.json, the last commit, the last workflow run or the newest git tag. Moving the npm `latest` dist-tag backwards cannot accidentally reuse a version. Prerelease-only package histories require manual review. Registry errors other than HTTP 404 fail closed rather than being treated as a first release.

For an existing release, its published gitHead must be an ancestor of the checked-out prod commit. A matching verified release tag can supply a legacy baseline when metadata has no gitHead. Missing baseline, divergent history or conflicting tag requires manual resolution; the workflow never guesses. All commits since that baseline are inspected, including merged commits.

Runtime files are bin/, packages/, renderer/, examples/, package.json, package-lock.json, tsconfig.json and scripts/ excluding the known CI/release/smoke helpers. New unclassified script helpers conservatively count as runtime. Tests, .github/, Skills and Docs do not count on their own. Changes in a package manifest/lock are conservatively runtime changes, including development-only dependency changes.

Among runtime-touching commits: `fix` means patch, `feat` means minor, and a Conventional Commit `!` or `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer means major. The highest bump wins; any other runtime change defaults to patch. Conventional Commit messages on Docs/Skills-only commits do not affect the runtime version. A first release with no published stable version uses the checked-in version exactly (currently 1.1.0); it is not bumped from a fictional 0.0.0 baseline. Existing version/tag collisions fail closed.

Skills installed from GitHub keep their explicit compatibility pin. Updating that pin is a separate reviewed Skills change and does not itself publish a runtime. The workflow intentionally does not rewrite GitHub source Skills or commit CI versions back to prod.

## Recovery and duplicates

If publishing succeeds but the process dies or tag creation fails, rerun **all jobs** of the original prod workflow. Prepare sees the published version and its missing tag and emits a recovery-only plan. After the same explicit environment approval, finish verifies the registry and restores the missing tag without running npm publish again. If newer prod commits exist, the missing published tag is recovered first; rerun again or use the next prod push to process the remaining changes.

A failed npm publish does not create a tag. If npm accepted the upload before a connection failure, the next run still recovers from registry truth. A propagation timeout also fails without a tag; six verification attempts are allowed. An existing identical version is never republished. A version associated with another commit or different integrity is rejected. Matching tags are accepted idempotently, including pre-existing annotated tags. Immediately before publishing, the registry baseline is queried again; an external publisher advancing it while approval was pending invalidates the plan and requires a fresh run.

## Security gate and scoped mitigation

The gate rejects local file/link/workspace dependencies, absolute dependency or package entry paths, linked lock entries and machine-specific manifest paths. Both production and full npm audits must exit successfully and report exactly zero vulnerabilities; registry/audit failures block the release. Nothing is silenced with `|| true`, audit-level exclusions or force-fix commands.

The [documented Zod mitigation](security-phase1.7.md) is preserved. The repo audit uses its root override. The clean artifact consumer applies the scoped override under `@gasnonthachai/animation-maker`, then audits the actual installed dependency tree before rendering. Root-clean audit results do not prove a bare consumer is clean. The bare-package residual upstream advisory and the requirement to use the scoped mitigation must be explicitly accepted at the protected-environment review before public release; no residual-risk acceptance is inferred here.

## Manual npm and GitHub setup — required before enablement

1. Confirm ownership/publish rights for npm scope `@gasnonthachai`, public package visibility and the matching public repository URL in package.json. Review the security mitigation and residual risk above.
2. If the package does not exist yet, npm's package-level trusted-publisher settings need bootstrapping. Arrange a **separately authorized** initial public publish with an authenticated maintainer and 2FA as required. This implementation did not perform it. Ensure that artifact is tested and carries the correct source gitHead; establish a legacy release tag/baseline only with separate approval if necessary. The planner handles registry 404, but cannot create npm account permissions or trusted-publisher configuration.
3. In npm package Settings → Trusted publishing, configure GitHub Actions with exact owner `Gas-nontachai`, repository `animation-maker-skills`, workflow filename `release.yml`, environment `npm-production`, and Allow npm publish. Enable provenance/public repository requirements. Do not grant dist-tag management, unpublish or install permissions unnecessarily. New publisher configurations currently must complete a successful publish within two days; recreate an expired configuration when ready.
4. Create GitHub environment `npm-production`, restrict deployment branches to `prod`, add required reviewers, prevent self-review and disable bypass where supported. Protect prod and release tags with the repository's review/ruleset policies. Allow the approved workflow's GITHUB_TOKEN to create tags; no PAT or npm secret is needed.
5. Keep `NPM_RELEASE_ENABLED` absent or false until these settings and the release artifact are explicitly authorized. Set it as a **repository variable**, not an environment-only variable, to true only after approval. Every publish/recovery job must still pass the environment reviewer gate. Creating an environment name in YAML alone does not configure protection.
6. Merge workflows into prod only through the reviewed PR process. Review the uploaded plan, version, tests, audit evidence and artifact before approving the publishing environment. Do not enable a live first publish merely to test the pipeline.

Official setup references: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). npm currently requires Node >=22.14.0 and npm >=11.5.1 for OIDC; Node 24 is selected and the CLI floor is checked at publish time. GitHub Actions are pinned to verified immutable commits.

## Local verification

Run `npm test`, `npm run typecheck`, `npm run security:check`, `npm run test:package` and actionlint on both workflow files. `node scripts/release.mjs plan` is read-only against git/npm and writes only output/release-plan.json; it never publishes or creates tags. `finish` is guarded against local execution.

Release regression tests mock external mutations and cover patch/minor/major, accumulated changes, first release, greatest registry version, Docs/Skills-only skips, duplicate versions, missing baseline/tag conflicts, failed publish, delayed registry visibility, integrity mismatch and publish-success/tag-failure recovery. Existing 15 unit tests remain in the suite. The macOS package smoke checks standalone installation, effective scoped overrides, Chromium setup, both character renders, metadata and actual movement with the original checkout inaccessible.

Live GitHub runner execution, environment protection enforcement, OIDC identity exchange, npm publication and GitHub tag creation cannot be claimed from these local tests. They require the manual setup and explicit authorization above.

## Verification results — 2026-10-28

| Check | Result |
| --- | --- |
| Unit/regression tests | PASS: 42 tests across four files, preserving the existing 15 tests |
| Typecheck | PASS |
| Workflow YAML syntax | PASS: Ruby YAML parser, both files |
| GitHub workflow lint | PASS: official actionlint 1.7.7 with verified archive checksum |
| Manifest/local-path gate | PASS |
| Production and full npm audits | PASS: zero vulnerabilities in both |
| Clean-install package smoke | PASS: scoped consumer override effective, consumer audit zero, Chromium installation, both renders and pixel checks with checkout reads denied |
| Real read-only registry plan | PASS: registry has no published baseline; planner chose the checked-in first version 1.1.0 without publishing |
| Live GitHub / npm OIDC / tag push | NOT RUN: blocked on manual setup and explicit authorization |

Evidence is retained in output/audit-ci-production.json, output/audit-ci-full.json, output/audit-consumer.json, output/phase1.7-package-evidence.json and output/release-plan.json. Output is gitignored; GitHub runs upload audit/package evidence as workflow artifacts. Implementation is ready for review; production enablement is intentionally not completed.
