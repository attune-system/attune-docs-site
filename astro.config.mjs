import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

export default defineConfig({
  site: "https://docs.attunedev.org",
  output: "static",
  integrations: [
    mermaid({ autoTheme: true, enableLog: false }),
    starlight({
      title: "Attune Docs",
      description: "Learn how to build, run, and operate automation with Attune.",
      favicon: "/attune-favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/attune-system/attune",
        },
      ],
      customCss: ["./src/styles/docs.css"],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#101827" },
        },
        {
          tag: "script",
          attrs: { src: "/diagram-viewer.js", defer: true },
        },
      ],
      sidebar: [
        { label: "Start here", items: [{ autogenerate: { directory: "introduction" } }] },
        { label: "Administration", items: [{ autogenerate: { directory: "administration" } }] },
        { label: "Pack development", items: [{ autogenerate: { directory: "pack-development" } }] },
        { label: "Operations", items: [{ autogenerate: { directory: "operations" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        { label: "API explorer", link: "/api/", badge: "OpenAPI" },
      ],
    }),
  ],
});
