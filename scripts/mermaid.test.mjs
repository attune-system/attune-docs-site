import assert from "node:assert/strict";
import test from "node:test";
import { satteri } from "@astrojs/markdown-satteri";
import mermaid, { mermaidCodePlugin } from "../src/integrations/mermaid.mjs";

test("Mermaid fences preserve syntax while escaping HTML", () => {
  const source = 'flowchart TD\n A["<b>A & B</b>"] --> B{Decision}\n %% </pre><script>alert(1)</script>';
  assert.deepEqual(mermaidCodePlugin.code({ lang: "mermaid", value: source }), {
    type: "html",
    value: '<pre class="mermaid">flowchart TD\n A[&quot;&lt;b&gt;A &amp; B&lt;/b&gt;&quot;] --&gt; B{Decision}\n %% &lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;</pre>',
  });
  assert.equal(mermaidCodePlugin.code({ lang: "javascript", value: source }), undefined);
});

test("integration retains existing Sätteri options and loads the browser module", () => {
  const existing = { name: "existing", code() {} };
  const processor = satteri({ mdastPlugins: [existing], features: { smartPunctuation: false } });
  let updated;
  let injected;
  mermaid().hooks["astro:config:setup"]({
    config: { markdown: { processor } },
    updateConfig(value) { updated = value; },
    injectScript(stage, value) { injected = { stage, value }; },
  });
  assert.deepEqual(updated.markdown.processor.options.mdastPlugins, [existing, mermaidCodePlugin]);
  assert.equal(updated.markdown.processor.options.features.smartPunctuation, false);
  assert.deepEqual(updated.vite.optimizeDeps.include, ["mermaid"]);
  assert.equal(injected.stage, "page");
  assert.match(injected.value, /mermaid-client\.js/);
});

test("integration rejects an unsupported Markdown processor", () => {
  assert.throws(() => mermaid().hooks["astro:config:setup"]({
    config: { markdown: { processor: { name: "unified" } } },
  }), /requires Astro's Sätteri/);
});
