import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateAudit, runAudit } from "./audit-dependencies.mjs";

const approved = {
  name: "picomatch", dependency: "picomatch", range: "<=4.0.7",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
};
const now = new Date("2026-11-17T12:00:00Z");
function report(findings = {}) {
  return {
    auditReportVersion: 2, vulnerabilities: findings,
    metadata: { vulnerabilities: { total: Object.keys(findings).length } },
  };
}
function chain() {
  return report({
    picomatch: { name: "picomatch", via: [{ ...approved }] },
    tooling: { name: "tooling", via: ["picomatch"] },
    astro: { name: "astro", via: ["tooling", "picomatch"] },
  });
}

test("a clean audit passes, including after the exception expires", () => {
  assert.deepEqual(evaluateAudit(report(), new Date("2026-12-02T00:00:00Z")), { accepted: [], blocking: [] });
});

test("only the approved advisory and its dependent findings are accepted", () => {
  assert.deepEqual(evaluateAudit(chain(), now), {
    accepted: ["astro", "picomatch", "tooling"], blocking: [],
  });
});

test("exception lasts through December 1 UTC and blocks on December 2", () => {
  assert.equal(evaluateAudit(chain(), new Date("2026-12-01T23:59:59.999Z")).blocking.length, 0);
  assert.deepEqual(evaluateAudit(chain(), new Date("2026-12-02T00:00:00Z")).blocking, ["astro", "picomatch", "tooling"]);
});

test("other advisories remain blocking even on otherwise accepted dependencies", () => {
  const data = chain();
  data.vulnerabilities.picomatch.via.push({ ...approved, url: "https://github.com/advisories/OTHER" });
  assert.deepEqual(evaluateAudit(data, now).blocking, ["astro", "picomatch", "tooling"]);
});

test("a separate vulnerable dependency is not hidden by the exception", () => {
  const data = chain();
  data.vulnerabilities.other = { name: "other", via: [{ name: "other", url: "https://github.com/advisories/OTHER" }] };
  data.metadata.vulnerabilities.total++;
  assert.deepEqual(evaluateAudit(data, now).blocking, ["other"]);
});

test("expanded affected range or a different package cannot reuse the exception", () => {
  for (const change of [{ range: "<=4.0.8" }, { name: "another-package" }, { dependency: "another-package" }]) {
    const data = chain();
    Object.assign(data.vulnerabilities.picomatch.via[0], change);
    assert.equal(evaluateAudit(data, now).blocking.length, 3);
  }
});

test("malformed reports, missing dependency causes, and cycles fail closed", () => {
  for (const data of [null, {}, { ...report(), error: {} }, { ...report(), auditReportVersion: 1 }]) {
    assert.throws(() => evaluateAudit(data, now));
  }
  for (const mutate of [
    (data) => { data.metadata.vulnerabilities.total = 0; },
    (data) => { data.vulnerabilities.picomatch.via = []; },
    (data) => { data.vulnerabilities.picomatch.via = [null]; },
    (data) => { data.vulnerabilities.picomatch.via = ["missing-package"]; },
    (data) => { data.vulnerabilities.picomatch.via = ["astro"]; },
  ]) {
    const data = chain();
    mutate(data);
    assert.throws(() => evaluateAudit(data, now));
  }
});

test("audit transport errors cannot be converted into a pass", () => {
  for (const result of [
    { status: 2 }, { status: null, signal: "SIGTERM" }, { error: new Error("offline") },
    { status: 1, stdout: "not JSON" }, { status: 1, stdout: JSON.stringify(report()) },
  ]) {
    assert.throws(() => runAudit(() => result, now));
  }
});

test("npm's vulnerability exit code is accepted only with a valid approved report", () => {
  const execute = (command, args) => {
    assert.equal(command, "npm");
    assert.deepEqual(args, ["audit", "--json"]);
    return { status: 1, stdout: JSON.stringify(chain()) };
  };
  assert.equal(runAudit(execute, now).blocking.length, 0);
});

test("the CLI blocks unrelated findings and npm errors without contacting the registry", () => {
  const directory = mkdtempSync(join(tmpdir(), "attune-docs-audit-"));
  try {
    writeFileSync(join(directory, "npm"), '#!/bin/sh\ncat "$AUDIT_FIXTURE"\nexit "$AUDIT_STATUS"\n', { mode: 0o700 });
    const fixture = join(directory, "report.json");
    const unrelated = report({ other: { name: "other", via: [{ name: "other", url: "https://github.com/advisories/OTHER" }] } });
    for (const [data, status, expected] of [[report(), 0, 0], [unrelated, 1, 1], [report(), 2, 1]]) {
      writeFileSync(fixture, JSON.stringify(data));
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("./audit-dependencies.mjs", import.meta.url))], {
        encoding: "utf8", timeout: 10000,
        env: { PATH: directory + delimiter + process.env.PATH, AUDIT_FIXTURE: fixture, AUDIT_STATUS: String(status) },
      });
      assert.equal(result.status, expected, result.stdout + result.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("normal CI and OpenAPI verification share the blocking audit gate", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.ok(pkg.scripts.verify.startsWith("npm run test:audit && npm run audit:ci && "));
  const ci = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");
  assert.match(ci, /- run: npm run verify/);
  assert.doesNotMatch(ci, /continue-on-error/);
});
