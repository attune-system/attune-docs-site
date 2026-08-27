import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const failures = [];

async function listHtml(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listHtml(entryPath)
        : entry.name.endsWith(".html")
          ? [entryPath]
          : [];
    }),
  );
  return nested.flat();
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function targetFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  return path.extname(decoded)
    ? path.join(root, decoded)
    : path.join(root, decoded, "index.html");
}

for (const htmlFile of await listHtml(root)) {
  const html = await readFile(htmlFile, "utf8");
  for (const [, reference] of html.matchAll(/(?:href|src)="(\/[^"<>]*)"/g)) {
    const url = new URL(reference, "https://docs.attunedev.org");
    const file = targetFile(url.pathname);
    if (!(await exists(file))) {
      failures.push(`${path.relative(root, htmlFile)} -> ${reference}`);
      continue;
    }

    if (url.hash && file.endsWith(".html") && url.hash !== "#_top") {
      const targetHtml = await readFile(file, "utf8");
      const id = decodeURIComponent(url.hash.slice(1));
      if (!targetHtml.includes(`id="${id}"`)) {
        failures.push(`${path.relative(root, htmlFile)} -> missing anchor ${reference}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`Found ${failures.length} broken internal references:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("No broken internal references");
}
