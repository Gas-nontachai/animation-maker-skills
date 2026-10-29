# Phase 1.7 security review — release decision pending

Review date: 2026-10-27. Candidate: `@gasnonthachai/animation-maker@1.1.0`. No npm publication occurred. No automatic `npm audit fix --force`, install hook, system Chrome permission change or sandbox relaxation was used.

## Findings and changes

| Dependency / finding                            | Before                                                                            | Treatment                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| remotion, @remotion/renderer, @remotion/bundler | Direct 4.0.373, critical advisory propagation                                     | Upgrade all three to exactly 4.0.539; keep package versions aligned. Render and pixel checks exercise both existing and generated characters.                                    |
| Remotion RCE / file-write advisories            | GHSA-2jqp-f4gr-44fr and GHSA-g6pc-6676-c23j affect versions before 4.0.410        | New pinned version is beyond the patched threshold.                                                                                                                              |
| extract-zip                                     | Transitive high: GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3                        | New renderer no longer depends on extract-zip; its own extractor checks extracted parent-directory containment. Browser bootstrap still uses the public ensureBrowser API.       |
| ws / webpack                                    | Transitive high / low                                                             | Updated Remotion dependency tree eliminates the reported vulnerable versions.                                                                                                    |
| Zod                                             | Direct application 4.6.7 already patched; upstream Remotion pins transitive 4.5.4 | Root development override patches all copies. Skills additionally apply a scoped target-project override before approved installation; package overrides alone do not propagate. |
| Runtime self-dependency                         | Direct dev dependency pointed to an external /tmp tarball                         | Removed. No developer checkout or machine path remains in the installable dependency manifest.                                                                                   |

Primary advisory references: [Remotion RCE](https://github.com/advisories/GHSA-2jqp-f4gr-44fr), [Remotion file write](https://github.com/advisories/GHSA-g6pc-6676-c23j), [Zod resource exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). These are package-level advisory findings; propagation counts are not counts of distinct exploits.

## Audit evidence

- Original production audit: 13 flagged packages (nine critical, three high, one low).
- Original full audit: 14 flagged packages (ten critical, three high, one low), including the local self-dependency.
- Updated repo production and full audits: zero vulnerabilities with the development override.
- Bare tarball consumer: nine high flagged packages, all propagated from one remaining transitive Zod advisory. No critical findings. A root-clean audit must not be presented as proof that a consumer is clean.
- Workflow consumer: zero vulnerabilities in the separate full audit after the scoped override below; `npm run test:package` enforces this before downloading a browser or rendering. Raw reports are in gitignored `output/audit-*.json`.

The attempted published shrinkwrap did not force the conflicting pinned upstream manifests in a clean npm consumer. That approach was removed rather than shipping a misleading guarantee. The existing package-lock.json remains the development lock.

## Proposed mitigation and residual risk

Skills merge this into the target project's existing package.json before the authorized runtime installation, preserving unrelated configuration:

```json
{
  "overrides": {
    "@gasnonthachai/animation-maker": {
      "zod": "4.6.7"
    }
  }
}
```

This targets only this runtime's dependency subtree, not other Zod dependencies in the user's project. A conflict in that exact override must be reviewed instead of overwritten. The requested runtime remains exactly 1.1.0, saved with --save-exact. Tests audit the actual consumer tree and render with that tree. A version selector in the override key conflicts with tarball specs under npm 10, so the key is the package name while installation is pinned separately.

**Public release is gated on explicit maintainer acceptance of this mitigation and residual risk.** Installing the bare npm package without the documented project override still receives the upstream Zod advisory. No blanket acceptance has been inferred. Do not claim zero vulnerabilities for that unsupported installation path. A future upstream Remotion release with patched Zod pins should remove the bootstrap override after audit and integration verification.

The workflow is a local CLI, not a public upload service. Existing SVG element/attribute validation, symlink confinement, schema checks, exclusive source creation and output refusal remain enabled. Browser archives come from the URLs selected by pinned Remotion over HTTPS; downloaded native binaries and upstream vendored extraction code remain trust dependencies not completely covered by npm audit. Large local inputs can consume resources; do not expose this CLI as an unbounded network service. Remotion's separate licensing terms still apply.

## Release gates

Before publication: inspect the pack file list for secrets/local paths, pass tests/typecheck and clean consumer audit, review remaining risks above, obtain explicit publication authorization, authenticate npm with the package scope, and publish the reviewed artifact. Do not use zero root advisories or a successful tarball render as proof of npm/GitHub release readiness. Run `npm run test:release` after registry publication and updated GitHub Skills are available.
