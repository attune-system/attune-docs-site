# Dependency audit policy

`npm run verify` includes `npm run test:audit` and `npm run audit:ci`, so PR
validation and automated OpenAPI verification apply the same audit policy.
The audit command runs a complete `npm audit --json` and blocks
unapproved findings and audit/registry errors. Tests cover the exception's scope,
expiry, transitive findings, and failure handling. Raw `npm audit` continues to
report accepted findings; this policy does not dismiss GitHub alerts.

## Temporary picomatch exception

- Advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
- Affected scope: `picomatch` through 4.0.7 and dependent npm findings caused
  exclusively by that advisory. Other causes remain blocking, including new
  advisories on the same package or an expanded affected range.
- Owner and approval: the Attune maintainer approved this exception on
  2026-11-17, through **2026-12-01 inclusive, UTC**. CI fails on this finding
  starting **2026-12-02 00:00 UTC** unless it is resolved.
- Rationale: no patched npm release is currently available. Picomatch is used
  by documentation build tooling. The site generates static assets and its
  runtime container serves them with Nginx, without Node or these build tools.
  The exception accepts the remaining build-time risk; it does not claim that
  the dependency is fixed or cannot be exploited during a build.
- Mitigation: keep glob patterns maintainer-controlled; do not accept
  externally supplied build glob patterns. Reassess immediately if the site
  moves to server rendering or exposes build tooling to untrusted input.
- Removal: upgrade when a patched release is available, rerun the full audit
  and site verification, then remove this exception and its dedicated handling.
  Review by December 1; do not automatically extend the deadline.

The gate follows npm's `via` dependency graph. A dependent package is accepted
only if every advisory cause resolves to the exact approved picomatch advisory.
It does not ignore packages wholesale or lower the audit severity threshold.
