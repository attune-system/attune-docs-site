import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Maintainer-approved on 2026-11-17. Inclusive UTC date; fail closed afterward.
// See docs/dependency-audit.md for scope, rationale, and removal criteria.
const exception = {
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  name: "picomatch",
  range: "<=4.0.7",
  through: "2026-12-01",
};

export function evaluateAudit(report, now = new Date()) {
  if (
    !report || report.error !== undefined || report.auditReportVersion !== 2 ||
    !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities) ||
    !Number.isInteger(report.metadata?.vulnerabilities?.total)
  ) {
    throw new Error("Invalid or unsuccessful npm audit response");
  }
  const findings = report.vulnerabilities;
  if (Object.keys(findings).length !== report.metadata.vulnerabilities.total) {
    throw new Error("Audit finding count does not match its metadata");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid audit clock");
  const active = now.toISOString().slice(0, 10) <= exception.through;
  const memo = new Map();

  function covered(name, visiting = new Set()) {
    if (memo.has(name)) return memo.get(name);
    if (visiting.has(name)) throw new Error(`Cyclic audit dependency: ${name}`);
    const finding = findings[name];
    if (
      !finding || finding.name !== name ||
      !Array.isArray(finding.via) || finding.via.length === 0
    ) {
      throw new Error(`Missing advisory details for ${name}`);
    }
    const next = new Set([...visiting, name]);
    // Evaluate every cause, even if an earlier one is already blocking.
    const causes = finding.via.map((cause) => {
      if (typeof cause === "string") return covered(cause, next);
      if (!cause || typeof cause.url !== "string") {
        throw new Error(`Invalid advisory details for ${name}`);
      }
      return active && name === exception.name && cause.name === exception.name &&
        cause.dependency === exception.name && cause.url === exception.url &&
        cause.range === exception.range;
    });
    const accepted = causes.every(Boolean);
    memo.set(name, accepted);
    return accepted;
  }

  const accepted = [], blocking = [];
  for (const name of Object.keys(findings).sort()) {
    (covered(name) ? accepted : blocking).push(name);
  }
  return { accepted, blocking };
}

export function runAudit(execute = spawnSync, now = new Date()) {
  const result = execute("npm", ["audit", "--json"], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error("npm audit failed to complete; the security gate remains blocked");
  }
  const report = JSON.parse(result.stdout);
  const verdict = evaluateAudit(report, now);
  if (result.status === 1 && Object.keys(report.vulnerabilities).length === 0) {
    throw new Error("npm audit failed without reporting vulnerabilities");
  }
  return verdict;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { accepted, blocking } = runAudit();
    if (accepted.length) {
      console.warn(`Temporary exception: ${exception.url}, through ${exception.through} UTC (build-time docs dependencies only).`);
    }
    if (blocking.length) {
      console.error(`Blocking audit findings: ${blocking.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("Dependency audit passed under the documented, time-limited policy.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
