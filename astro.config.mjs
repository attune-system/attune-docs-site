import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";
import { resolveSiteLinks } from "./src/config/siteLinks";

const { slackInviteUrl, supportUrl } = resolveSiteLinks(process.env);

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
        {
          icon: "slack",
          label: "Join the Attune Slack workspace",
          href: slackInviteUrl,
        },
        {
          icon: "heart",
          label: "Support Attune",
          href: supportUrl,
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
        {
          label: "Internal implementation",
          collapsed: true,
          items: [
            { label: "Overview", link: "/internal-implementation/" },
            {
              label: "Data structures",
              collapsed: true,
              items: [
                { label: "Data model map", link: "/internal-implementation/data-structures/" },
                {
                  label: "Authored definitions",
                  collapsed: true,
                  items: [
                    { label: "Packs", link: "/internal-implementation/data-structures/packs/" },
                    { label: "Actions", link: "/internal-implementation/data-structures/actions/" },
                    { label: "Workflows", link: "/internal-implementation/data-structures/workflows/" },
                    { label: "Runtimes and workers", link: "/internal-implementation/data-structures/runtimes-and-workers/" },
                    { label: "Triggers", link: "/internal-implementation/data-structures/triggers/" },
                    { label: "Sensors", link: "/internal-implementation/data-structures/sensors/" },
                    { label: "Rules", link: "/internal-implementation/data-structures/rules/" },
                    { label: "Policies", link: "/internal-implementation/data-structures/policies/" },
                    { label: "Dashboards", link: "/internal-implementation/data-structures/dashboards/" },
                  ],
                },
                {
                  label: "Runtime records",
                  collapsed: true,
                  items: [
                    { label: "Events", link: "/internal-implementation/data-structures/events/" },
                    { label: "Enforcements", link: "/internal-implementation/data-structures/enforcements/" },
                    { label: "Executions and inquiries", link: "/internal-implementation/data-structures/executions/" },
                    { label: "Audit events", link: "/internal-implementation/data-structures/audit-events/" },
                  ],
                },
                {
                  label: "Data and access",
                  collapsed: true,
                  items: [
                    { label: "Work queues", link: "/internal-implementation/data-structures/work-queues/" },
                    { label: "Artifacts", link: "/internal-implementation/data-structures/artifacts/" },
                    { label: "Keys and secrets", link: "/internal-implementation/data-structures/keys-and-secrets/" },
                    { label: "Data caches", link: "/internal-implementation/data-structures/data-caches/" },
                    { label: "Access control", link: "/internal-implementation/data-structures/access-control/" },
                  ],
                },
              ],
            },
            {
              label: "Services and processes",
              collapsed: true,
              items: [
                { autogenerate: { directory: "internal-implementation/services" } },
                {
                  label: "Protocol references",
                  collapsed: true,
                  items: [
                    { autogenerate: { directory: "internal-implementation/supporting-systems" } },
                  ],
                },
              ],
            },
          ],
        },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        { label: "API explorer", link: "/api/", badge: "OpenAPI" },
      ],
    }),
  ],
});
