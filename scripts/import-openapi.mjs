import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function compareVersions(left, right) {
  const parse = (version) => {
    const buildIndex = version.indexOf("+");
    const withoutBuild = buildIndex === -1 ? version : version.slice(0, buildIndex);
    const prereleaseIndex = withoutBuild.indexOf("-");
    const core = prereleaseIndex === -1
      ? withoutBuild
      : withoutBuild.slice(0, prereleaseIndex);
    const prerelease = prereleaseIndex === -1
      ? undefined
      : withoutBuild.slice(prereleaseIndex + 1);
    return {
      core: core.split(".").map(Number),
      prerelease: prerelease?.split(".") ?? [],
    };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.core[index] !== rightVersion.core[index]) {
      return leftVersion.core[index] - rightVersion.core[index];
    }
  }
  if (!leftVersion.prerelease.length || !rightVersion.prerelease.length) {
    return Number(!leftVersion.prerelease.length) - Number(!rightVersion.prerelease.length);
  }
  for (let index = 0; index < Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length); index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return Number(leftPart !== undefined) - Number(rightPart !== undefined);
    }
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

const source = process.argv[2];
if (!source) {
  throw new Error("Usage: npm run import:openapi -- <file-or-url>");
}

const content = source.startsWith("http://") || source.startsWith("https://")
  ? await fetch(source).then((response) => {
      if (!response.ok) {
        throw new Error(`OpenAPI download failed with HTTP ${response.status}`);
      }
      return response.text();
    })
  : await readFile(path.resolve(source), "utf8");

const document = JSON.parse(content);
if (
  !document.openapi?.startsWith("3.") ||
  !document.info?.title ||
  !document.info?.version ||
  !document.paths
) {
  throw new Error("The source is not a usable OpenAPI 3 document");
}

const version = document.info.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`OpenAPI info.version is not a safe semantic version: ${version}`);
}

const publicDirectory = path.resolve("public");
const currentPath = path.join(publicDirectory, "openapi.json");
const archiveDirectory = path.join(publicDirectory, "openapi", "versions");
const catalogPath = path.join(publicDirectory, "openapi", "versions.json");
const formatted = content;
const formattedSha256 = sha256(formatted);

let currentContent;
let currentDocument;
try {
  currentContent = await readFile(currentPath, "utf8");
  currentDocument = JSON.parse(currentContent);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let catalog;
try {
  catalog = JSON.parse(await readFile(catalogPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  catalog = {
    schema_version: 1,
    latest: currentDocument?.info?.version ?? version,
    versions: currentDocument
      ? [{
          version: currentDocument.info.version,
          url: "/openapi.json",
          sha256: sha256(currentContent),
        }]
      : [],
  };
}

if (catalog.schema_version !== 1 || !Array.isArray(catalog.versions)) {
  throw new Error("public/openapi/versions.json has an unsupported format");
}

for (const entry of catalog.versions) {
  const expectedUrl = entry.version === catalog.latest
    ? "/openapi.json"
    : `/openapi/versions/${entry.version}.json`;
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(entry.version) ||
    entry.url !== expectedUrl ||
    !/^[0-9a-f]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`Invalid OpenAPI catalog entry: ${JSON.stringify(entry)}`);
  }
  const entryContent = await readFile(path.join(publicDirectory, entry.url.slice(1)), "utf8");
  const entrySha256 = sha256(entryContent);
  const recoveringInterruptedLatestWrite =
    entry.version === catalog.latest &&
    version === catalog.latest &&
    entrySha256 === formattedSha256;
  if (entrySha256 !== entry.sha256 && !recoveringInterruptedLatestWrite) {
    throw new Error(`OpenAPI version ${entry.version} does not match its recorded SHA-256`);
  }
}

const historicalEntry = catalog.versions.find(
  (entry) => entry.version === version && entry.version !== catalog.latest,
);
if (historicalEntry) {
  if (historicalEntry.sha256 !== formattedSha256) {
    throw new Error(`Refusing to replace historical OpenAPI version ${version}`);
  }
  console.log(`OpenAPI ${version} is already archived`);
  process.exit(0);
}

if (currentDocument && version !== currentDocument.info?.version) {
  if (compareVersions(version, currentDocument.info.version) <= 0) {
    const archivePath = path.join(archiveDirectory, `${version}.json`);
    await mkdir(archiveDirectory, { recursive: true });
    await writeFile(archivePath, formatted);
    catalog.versions.push({
      version,
      url: `/openapi/versions/${version}.json`,
      sha256: formattedSha256,
    });
    const [latestEntry, ...historicalEntries] = catalog.versions;
    historicalEntries.sort((left, right) => {
      const precedence = compareVersions(right.version, left.version);
      return precedence || right.version.localeCompare(left.version);
    });
    catalog.versions = [latestEntry, ...historicalEntries];
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`Archived out-of-order OpenAPI version ${version}; latest remains ${catalog.latest}`);
    process.exit(0);
  }
}

if (currentDocument && currentDocument.info?.version !== version) {
  const previousVersion = currentDocument.info?.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(previousVersion)) {
    throw new Error(`Current OpenAPI info.version is not safe to archive: ${previousVersion}`);
  }

  const archivePath = path.join(archiveDirectory, `${previousVersion}.json`);
  try {
    const archivedContent = await readFile(archivePath, "utf8");
    if (archivedContent !== currentContent) {
      throw new Error(`Refusing to replace historical OpenAPI version ${previousVersion}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await mkdir(archiveDirectory, { recursive: true });
    await writeFile(archivePath, currentContent);
  }

  const previousEntry = catalog.versions.find((entry) => entry.version === previousVersion);
  if (previousEntry) {
    previousEntry.url = `/openapi/versions/${previousVersion}.json`;
    previousEntry.sha256 = sha256(currentContent);
  } else {
    catalog.versions.push({
      version: previousVersion,
      url: `/openapi/versions/${previousVersion}.json`,
      sha256: sha256(currentContent),
    });
  }
}

catalog.latest = version;
catalog.versions = [
  { version, url: "/openapi.json", sha256: formattedSha256 },
  ...catalog.versions.filter((entry) => entry.version !== version),
];

await mkdir(path.dirname(catalogPath), { recursive: true });
await writeFile(currentPath, formatted);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(
  `Imported ${document.info.title} ${version} with ${Object.keys(document.paths).length} paths`,
);
