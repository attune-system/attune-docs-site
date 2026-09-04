import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const root = path.resolve(process.argv[2] ?? "dist");
const catalog = JSON.parse(
  await readFile(path.join(root, "openapi", "versions.json"), "utf8"),
);

if (catalog.schema_version !== 1 || !catalog.latest || !Array.isArray(catalog.versions)) {
  throw new Error("OpenAPI version catalog has an unsupported format");
}

const versions = new Set();
const expectedArchiveFiles = new Set();
for (const entry of catalog.versions) {
  const expectedUrl = entry.version === catalog.latest
    ? "/openapi.json"
    : `/openapi/versions/${entry.version}.json`;
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(entry.version) ||
    entry.url !== expectedUrl ||
    !/^[0-9a-f]{64}$/.test(entry.sha256) ||
    versions.has(entry.version)
  ) {
    throw new Error(`Invalid or duplicate OpenAPI catalog entry: ${JSON.stringify(entry)}`);
  }
  versions.add(entry.version);
  if (entry.url !== "/openapi.json") {
    expectedArchiveFiles.add(path.basename(entry.url));
  }

  const content = await readFile(path.join(root, entry.url.replace(/^\//, "")), "utf8");
  if (sha256(content) !== entry.sha256) {
    throw new Error(`${entry.url} does not match its recorded SHA-256`);
  }
  const document = JSON.parse(content);
  if (document.info?.version !== entry.version) {
    throw new Error(
      `${entry.url} declares version ${document.info?.version ?? "<missing>"}, expected ${entry.version}`,
    );
  }
}

const archiveFiles = new Set(
  (await readdir(path.join(root, "openapi", "versions")))
    .filter((file) => file.endsWith(".json")),
);
if (
  archiveFiles.size !== expectedArchiveFiles.size ||
  [...archiveFiles].some((file) => !expectedArchiveFiles.has(file))
) {
  throw new Error("The OpenAPI archive contains files that are missing from the version catalog");
}

const latest = catalog.versions[0];
if (latest?.version !== catalog.latest || latest?.url !== "/openapi.json") {
  throw new Error("The first OpenAPI catalog entry must be the latest /openapi.json document");
}

console.log(`Verified ${catalog.versions.length} OpenAPI versions; latest is ${catalog.latest}`);
