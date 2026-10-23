// Adapted from astro-mermaid's Sätteri plugin. See mermaid.LICENSE.
import { fileURLToPath } from "node:url";
import { isSatteriProcessor, satteri } from "@astrojs/markdown-satteri";

export const mermaidCodePlugin = {
  name: "attune-mermaid",
  code(node) {
    if (node.lang !== "mermaid") return;

    const escaped = node.value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);

    // An HTML node preserves Mermaid's braces without MDX brace escaping.
    return { type: "html", value: `<pre class="mermaid">${escaped}</pre>` };
  },
};

export default function mermaid() {
  return {
    name: "attune-mermaid",
    hooks: {
      "astro:config:setup"({ config, updateConfig, injectScript }) {
        const processor = config.markdown.processor;
        if (!isSatteriProcessor(processor)) {
          throw new Error("Attune Mermaid requires Astro's Sätteri Markdown processor.");
        }

        updateConfig({
          markdown: {
            processor: satteri({
              ...processor.options,
              mdastPlugins: [...processor.options.mdastPlugins, mermaidCodePlugin],
            }),
          },
          vite: { optimizeDeps: { include: ["mermaid"] } },
        });
        const client = fileURLToPath(new URL("./mermaid-client.js", import.meta.url));
        injectScript("page", `import ${JSON.stringify(client)};`);
      },
    },
  };
}
