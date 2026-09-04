import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const importer = path.resolve("scripts/import-openapi.mjs");

function document(version) {
  return `${JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Test API", version },
    paths: {},
  }, null, 2)}\n`;
}

async function importVersion(root, version) {
  const source = path.join(root, `source-${version}.json`);
  await writeFile(source, document(version));
  return execFileAsync(process.execPath, [importer, source], { cwd: root });
}

test("archives each previous version and does not promote stale imports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "attune-openapi-import-"));
  await mkdir(path.join(root, "public"));
  await writeFile(path.join(root, "public", "openapi.json"), document("0.4.0"));

  await importVersion(root, "0.5.0");
  await importVersion(root, "0.6.0");

  assert.equal(
    await readFile(path.join(root, "public", "openapi", "versions", "0.4.0.json"), "utf8"),
    document("0.4.0"),
  );
  assert.equal(
    await readFile(path.join(root, "public", "openapi", "versions", "0.5.0.json"), "utf8"),
    document("0.5.0"),
  );

  const catalog = JSON.parse(
    await readFile(path.join(root, "public", "openapi", "versions.json"), "utf8"),
  );
  assert.deepEqual(
    catalog.versions.map(({ version }) => version),
    ["0.6.0", "0.5.0", "0.4.0"],
  );

  await importVersion(root, "0.5.0");
  assert.equal(
    JSON.parse(await readFile(path.join(root, "public", "openapi.json"), "utf8")).info.version,
    "0.6.0",
  );
});

test("archives out-of-order versions without replacing latest", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "attune-openapi-import-"));
  await mkdir(path.join(root, "public"));
  await writeFile(path.join(root, "public", "openapi.json"), document("0.4.0"));

  await importVersion(root, "0.6.0");
  await importVersion(root, "0.5.0");

  const catalog = JSON.parse(
    await readFile(path.join(root, "public", "openapi", "versions.json"), "utf8"),
  );
  assert.equal(catalog.latest, "0.6.0");
  assert.deepEqual(
    catalog.versions.map(({ version }) => version),
    ["0.6.0", "0.5.0", "0.4.0"],
  );
  assert.equal(
    JSON.parse(await readFile(path.join(root, "public", "openapi.json"), "utf8")).info.version,
    "0.6.0",
  );
});

test("rejects modified historical files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "attune-openapi-import-"));
  await mkdir(path.join(root, "public"));
  await writeFile(path.join(root, "public", "openapi.json"), document("0.4.0"));

  await importVersion(root, "0.5.0");
  await writeFile(
    path.join(root, "public", "openapi", "versions", "0.4.0.json"),
    document("0.4.0").replace("Test API", "Changed API"),
  );

  await assert.rejects(importVersion(root, "0.5.0"), /recorded SHA-256/);
});
