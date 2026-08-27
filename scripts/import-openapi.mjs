import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
if (!document.openapi?.startsWith("3.") || !document.info?.title || !document.paths) {
  throw new Error("The source is not a usable OpenAPI 3 document");
}

await writeFile(
  path.resolve("public/openapi.json"),
  `${JSON.stringify(document, null, 2)}\n`,
);

console.log(
  `Imported ${document.info.title} ${document.info.version} with ${Object.keys(document.paths).length} paths`,
);
