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
- Only after npm exposes the expected name, version, gitHead and integrity does the publishing job create lightweight tag `vX.Y.Z` at the source commit through the GitHub API. The sole exception to requiring gitHead is the explicitly authorized, byte-verified external bootstrap described below. Tag conflicts fail; existing matching tags are idempotent. `main` is never a publishing trigger. All release changes follow `main` → reviewed PR → `prod`.

## Version resolution and runtime boundary

The baseline is the greatest stable version actually present in the npm registry, not package.json, the last commit, the last workflow run or the newest git tag. Moving the npm `latest` dist-tag backwards cannot accidentally reuse a version. Prerelease-only package histories require manual review. Registry errors other than HTTP 404 fail closed rather than being treated as a first release.

For an existing release, its published gitHead must be an ancestor of the checked-out prod commit. A matching verified release tag can supply a legacy baseline when metadata has no gitHead. When both are missing, planning fails unless the one-time bootstrap proof below succeeds or the narrowly authorized new-version rebaseline is selected. Every established baseline must belong to the checked-out prod history; divergent history or conflicting evidence blocks recovery. The workflow never guesses the source of a legacy package from HEAD, prod, a successful workflow, or a matching version number. All commits since the baseline are inspected, including merged commits.

Runtime files are bin/, packages/, renderer/, examples/, package.json, package-lock.json, tsconfig.json and scripts/ excluding the known CI/release/smoke helpers. New unclassified script helpers conservatively count as runtime. Tests, .github/, Skills and Docs do not count on their own. Changes in a package manifest/lock are conservatively runtime changes, including development-only dependency changes.

Among runtime-touching commits: `fix` means patch, `feat` means minor, and a Conventional Commit `!` or `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer means major. The highest bump wins; any other runtime change defaults to patch. Conventional Commit messages on Docs/Skills-only commits do not affect the runtime version. A first release with no published stable version uses the checked-in version exactly (currently 1.1.0); it is not bumped from a fictional 0.0.0 baseline. Existing version/tag collisions fail closed.

Skills installed from GitHub keep their explicit compatibility pin. Updating that pin is a separate reviewed Skills change and does not itself publish a runtime. The workflow intentionally does not rewrite GitHub source Skills or commit CI versions back to prod.

## Recovery modes and duplicates

### Normal automatic publishing

Merge through `main` → PR → `prod`. Prepare plans the next version and tests the exact tarball; the protected publish job publishes via OIDC, verifies npm, then creates the tag automatically. No bootstrap variable or manual Git tagging is needed.

### Interrupted CI release recovery

If publishing succeeds but the process dies or tag creation fails, rerun **all jobs** of the original prod workflow. Prepare sees the published version and its missing tag and emits a recovery-only plan. After the same explicit environment approval, finish verifies the registry and restores the missing tag without running npm publish again. If newer prod commits exist, the missing published tag is recovered first; rerun again or use the next prod push to process the remaining changes.

A failed npm publish does not create a tag. If npm accepted the upload before a connection failure, the next run still recovers from registry truth. A propagation timeout also fails without a tag; six verification attempts are allowed. An existing identical version is never republished. A version associated with another commit or different integrity is rejected. Matching tags are accepted idempotently, including pre-existing annotated tags. Immediately before publishing, the registry baseline is queried again; an external publisher advancing it while approval was pending invalidates the plan and requires a fresh run.

### External/manual initial release bootstrap (one time)

An externally published initial stable release may lack both gitHead and a Git tag. A version number, registry signature, asserted commit/hash, or unrelated successful CI artifact is **not** source provenance. The old planner required gitHead or a tag before it could plan recovery, and final verification independently required gitHead; manually inventing a baseline would not safely fix either problem.

This implementation supports a deliberately narrow proof: **packing the unchanged committed source reproduces the complete SHA-512 of the published npm tarball**. It supports packages distributed directly from source, not a reconstruction that edits a manifest, injects gitHead, runs a build, installs dependencies, or substitutes another artifact. A mismatch is a hard stop, not permission to use a weaker comparison. The proof establishes artifact-to-source content identity; it does not assert who originally published it.

Required evidence and authorization:

1. Establish the original full 40-character source commit from independent release records. It must already be an ancestor of the prod checkout in this repository. Do not select HEAD, the tip of prod, or the latest passing workflow as a substitute.
2. Obtain the exact package/version and complete `dist.integrity` from the public npm registry. Only one stable version may exist for bootstrap (prereleases do not count). The source package name and version must already match without edits. Retain the original packaging toolchain if necessary: different npm packing behavior may prevent byte-for-byte reproduction.
3. With separate maintainer authorization, set repository variable `NPM_BOOTSTRAP_RECOVERY` to the following JSON, replacing the commit with the independently established source SHA. This is public evidence/authorization, not a credential. Do not add a token or put a guessed SHA in the variable.

```json
{
  "repository": "Gas-nontachai/animation-maker-skills",
  "version": "1.1.0",
  "commit": "<independently-established-full-source-commit>",
  "integrity": "sha512-W7ghcYOUVyKIXr4w1Pg96S522KW5T6esR+9b/1U/GK9csrU5xp0PsU6GyGmxiUy5CZWS4QXdipnGU8/0zwIJ0w=="
}
```

4. Merge the implementation through the normal PR flow, or rerun **all jobs** of a prod workflow that contains it. Planning checks evidence against registry metadata, verifies ancestry, archives only the authorized commit into a temporary directory, packs with hooks disabled and offline mode, and hashes the actual tarball bytes. Uncommitted files are never used. `node scripts/release.mjs plan` with the same variable in the environment can perform this read-only preflight locally; it writes only a local plan and never creates a tag.
5. Keep `NPM_RELEASE_ENABLED=true` and approve the existing `npm-production` protected environment only after reviewing the proof and recovery-only plan. Finalization requires the exact same authorization, rechecks fresh registry metadata, ancestry and byte-for-byte reproduction, then uses `ensureTag()` through the GitHub API to create the missing tag. It never republishes this version or overwrites/moves an existing tag.
6. Remove `NPM_BOOTSTRAP_RECOVERY` after the tag is verified. Recovery-only finalization is idempotent while authorization remains present; changed/revoked authorization invalidates an in-flight bootstrap plan. Once the tag exists, it supplies the baseline without bootstrap evidence. Rerun all jobs or use the next prod merge to process accumulated changes automatically. Subsequent patch/minor/major releases use the normal OIDC pipeline, not bootstrap.

If evidence is incomplete, conflicts with gitHead/a tag, is from another history, or cannot reproduce npm's full integrity, recovery remains blocked and no tag is created. Obtain the original committed source and compatible packing toolchain; do not change the required hash, republish an existing version, or create a manual tag to get past verification. If the original artifact depended on uncommitted/generated content, this recovery mechanism cannot establish its source and must not be used.

### One-time new-version rebaseline: 1.1.0 to 1.1.1

Use this alternative when maintainers intentionally leave the original `1.1.0` source unverified. It does **not** recover or assert provenance for `1.1.0`. It publishes a new, tested `1.1.1` from an explicitly authorized prod checkout using the existing OIDC publish-and-tag implementation. It never republishes, unpublishes, changes or tags `1.1.0`.

Merge this implementation through the reviewed PR flow first. Obtain the full 40-character SHA of the resulting **prod commit containing this implementation**, not the earlier prod SHA or a main-branch commit. In GitHub **Settings → Secrets and variables → Actions → Variables**, configure these repository variables:

| Variable | Value |
| --- | --- |
| `NPM_RELEASE_ENABLED` | `true`, only after reviewing the existing release gates and npm trusted-publisher configuration |
| `NPM_RELEASE_REBASELINE` | The exact JSON below, with `commit` replaced by that prod SHA |
| `NPM_BOOTSTRAP_RECOVERY` | Unset/remove; bootstrap and rebaseline must not be combined |

```json
{
  "repository": "Gas-nontachai/animation-maker-skills",
  "existingVersion": "1.1.0",
  "targetVersion": "1.1.1",
  "commit": "<full-40-character-authorized-prod-commit>"
}
```

No additional fields, alternate repository, versions, abbreviated SHA or branch name are accepted. This is explicit authorization, not a credential; do not create an npm token or change the protected environment. Rerun **all jobs** of the prod workflow for that exact commit after configuring the variables. If prod changes before selecting the run, review and authorize the intended prod commit again rather than authorizing a different checkout accidentally.

Planning requires `1.1.0` to be the only stable registry release, with neither gitHead nor `v1.1.0`, and requires both `1.1.1` and `v1.1.1` to be absent. Prerelease `0.0.0-stage` is allowed. No legacy commit is required or inferred. The `rebaseline` plan has no old source baseline and fixes the new version at `1.1.1`, regardless of historical commit messages.

Prepare uses the existing version-setting step to update only the runner's manifests to `1.1.1` and embed the authorized source `gitHead`. It runs `npm ci --ignore-scripts`, unit tests, typecheck, both security audits, and the standalone package install/render smoke test. Review that plan, artifact and evidence before approving the existing `npm-production` protected environment.

Finish requires unchanged authorization and the exact authorized checkout, rechecks registry state immediately before any publish, and verifies the tested tarball's SHA-512. It publishes only that new tarball via Trusted Publishing/OIDC. The existing verification loop checks npm's name, version, gitHead and complete integrity before creating `v1.1.1` at the authorized commit. Registry advancement, changed/revoked authorization, artifact changes or conflicting metadata fail closed; an existing matching target is never published again.

If publication succeeds but verification or tagging is interrupted, rerun all jobs: the registry's new `1.1.1` gitHead supplies normal recovery, and only its missing tag is restored. The old release remains untouched. Once `1.1.1` is verified and tagged, **delete repository variable `NPM_RELEASE_REBASELINE`**. Keep `NPM_BOOTSTRAP_RECOVERY` unset and retain `NPM_RELEASE_ENABLED=true` only if normal automatic releases should remain enabled. A leftover rebaseline variable cannot repeat the operation after `1.1.1` exists; normal planning takes over. Subsequent releases use the verified `1.1.1` source/tag baseline and ordinary version rules.

### Remaining evidence for v1.1.0

Read-only npm inspection on 2026-10-28 confirms versions `0.0.0-stage` and `1.1.0`, absent gitHead for `1.1.0`, and the complete integrity above. No npm source attestation is advertised in its `dist` metadata; registry signatures alone do not link it to a commit. There is no local `v1.1.0` tag, and a public GitHub API lookup of that ref returns 404. The previously inspected CI artifact has a different integrity and cannot establish this baseline.

**Legacy provenance remains unverified.** Recovering `v1.1.0` through bootstrap would still require the independently established original source commit in prod history and a successful unchanged-source pack matching that exact SHA-512. The new-version rebaseline above intentionally does not require that evidence and does not create `v1.1.0`. Maintainers must authorize the selected mode and approve the existing release gate/environment. Protected-environment and trusted-publisher settings were not independently verified here. No publish, remote tag creation, push, or settings change is part of this implementation.

## Security gate and scoped mitigation

The gate rejects local file/link/workspace dependencies, absolute dependency or package entry paths, linked lock entries and machine-specific manifest paths. Both production and full npm audits must exit successfully and report exactly zero vulnerabilities; registry/audit failures block the release. Nothing is silenced with `|| true`, audit-level exclusions or force-fix commands.

The [documented Zod mitigation](security-phase1.7.md) is preserved. The repo audit uses its root override. The clean artifact consumer applies the scoped override under `@gasnonthachai/animation-maker`, then audits the actual installed dependency tree before rendering. Root-clean audit results do not prove a bare consumer is clean. The bare-package residual upstream advisory and the requirement to use the scoped mitigation must be explicitly accepted at the protected-environment review before public release; no residual-risk acceptance is inferred here.

## Manual npm and GitHub setup — required before enablement

1. Confirm ownership/publish rights for npm scope `@gasnonthachai`, public package visibility and the matching public repository URL in package.json. Review the security mitigation and residual risk above.
2. If the package does not exist yet, npm's package-level trusted-publisher settings need bootstrapping. Arrange a **separately authorized** initial public publish with an authenticated maintainer and 2FA as required. This implementation did not perform it. Ensure that artifact is tested and carries the correct source gitHead; the pipeline can then verify npm and create its tag automatically. If an external initial release omitted gitHead, use the verified bootstrap procedure above, not a manual tag. The planner handles registry 404, but cannot create npm account permissions or trusted-publisher configuration.
3. In npm package Settings → Trusted publishing, configure GitHub Actions with exact owner `Gas-nontachai`, repository `animation-maker-skills`, workflow filename `release.yml`, environment `npm-production`, and Allow npm publish. Enable provenance/public repository requirements. Do not grant dist-tag management, unpublish or install permissions unnecessarily. New publisher configurations currently must complete a successful publish within two days; recreate an expired configuration when ready.
4. Create GitHub environment `npm-production`, restrict deployment branches to `prod`, add required reviewers, prevent self-review and disable bypass where supported. Protect prod and release tags with the repository's review/ruleset policies. Allow the approved workflow's GITHUB_TOKEN to create tags; no PAT or npm secret is needed.
5. Keep `NPM_RELEASE_ENABLED` absent or false until these settings and the release artifact are explicitly authorized. Set it as a **repository variable**, not an environment-only variable, to true only after approval. Every publish/recovery job must still pass the environment reviewer gate. Creating an environment name in YAML alone does not configure protection.
6. Merge workflows into prod only through the reviewed PR process. Review the uploaded plan, version, tests, audit evidence and artifact before approving the publishing environment. Do not enable a live first publish merely to test the pipeline.

Official setup references: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/), [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). npm currently requires Node >=22.14.0 and npm >=11.5.1 for OIDC; Node 24 is selected and the CLI floor is checked at publish time. GitHub Actions are pinned to verified immutable commits.

## Local verification

Run `npm test`, `npm run typecheck`, `npm run security:check`, `npm run test:package` and actionlint on both workflow files. `node scripts/release.mjs plan` is read-only against git/npm and writes only output/release-plan.json; it never publishes or creates tags. `finish` is guarded against local execution.

Release regression tests mock external mutations and cover patch/minor/major, accumulated changes, first release, greatest registry version, Docs/Skills-only skips, duplicate versions, missing baseline/tag conflicts, failed publish, delayed registry visibility, integrity mismatch and publish-success/tag-failure recovery. Rebaseline regressions cover exact authorization, registry/tag eligibility, changed/revoked authorization, wrong checkouts, stale registry state, altered artifacts, verified OIDC publish arguments and tag ordering, interrupted recovery and subsequent normal versioning. Bootstrap tests use local Git histories and actual offline npm packing to check unchanged-source proof, ignored dirty files, disabled hooks, full-integrity mismatch, unrelated history, source version mismatch and absent/changed/conflicting authorization. Mocked finalization covers interrupted/idempotent bootstrap, verification before tagging, no duplicate publication, and conflicting lightweight/annotated tags. The macOS package smoke checks standalone installation, effective scoped overrides, Chromium setup, both character renders, metadata and actual movement with the original checkout inaccessible.

Live GitHub runner execution, environment protection enforcement, OIDC identity exchange, npm publication and GitHub tag creation cannot be claimed from these local tests. They require the manual setup and explicit authorization above.

Evidence is written to output/audit-ci-production.json, output/audit-ci-full.json, output/audit-consumer.json, output/phase1.7-package-evidence.json and output/release-plan.json. Output is gitignored; GitHub runs upload audit/package evidence as workflow artifacts. A real plan against the current registry must fail closed without verified bootstrap evidence, exact rebaseline authorization or an already verified baseline; the earlier pre-publication first-release result no longer describes registry state. Local test results do not prove live OIDC publishing or production environment enforcement.

### Bootstrap implementation validation — 2026-10-28

| Check | Result |
| --- | --- |
| `npm test` | PASS: 59 tests across four files |
| `npm run typecheck` | PASS |
| `npm run security:check` | PASS: production and full audits report zero vulnerabilities |
| `npm run test:package` | PASS: clean install, consumer audit, checkout-denied renders and movement checks |
| `npm run test:release` | PASS: GitHub Skills and npm 1.1.0 installation, checkout-denied renders and movement checks; not source provenance |
| Workflow validation | PASS: both YAML files parse; official actionlint 1.7.7, archive SHA-256 checked against published checksums |
| Real registry plan without bootstrap evidence | EXPECTED BLOCK: actionable missing-baseline diagnostic; no mutation |
| Live OIDC publish / remote tag creation | NOT RUN |

Validation used local Node 22.23.4/npm 10.9.9; live release runners retain Node 24 and the npm >=11.5.1 OIDC requirement. Smoke evidence and copied videos remain under output/; task-created temporary smoke installations and the downloaded linter were removed after validation.

Rebaseline implementation validation (2026-10-28): all 75 unit tests passed, including 60 release tests; typecheck, production/full zero-vulnerability security audits, standalone package smoke and checksum-verified actionlint 1.7.7 on both workflows passed. The local package smoke used the checked-in manifest version; preparation of `1.1.1` remains a gated workflow operation. Rebaseline publication and tag creation were tested with mocks only. No live publish, tag, push or repository-setting change was performed.
