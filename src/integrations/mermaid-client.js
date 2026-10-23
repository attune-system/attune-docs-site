import "./mermaid.css";

let mermaidPromise;
let renderQueue = Promise.resolve();

async function renderDiagrams() {
  const diagrams = document.querySelectorAll("pre.mermaid");
  if (!diagrams.length) return;

  mermaidPromise ??= import("mermaid").catch((error) => {
    mermaidPromise = undefined;
    throw error;
  });
  const { default: mermaid } = await mermaidPromise;
  const theme = (document.documentElement.dataset.theme || document.body.dataset.theme) === "dark"
    ? "dark"
    : "default";

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
    // Mermaid 12 defaults to ELK/neo. Keep the site's previous diagram style.
    layout: "dagre",
    look: "classic",
    flowchart: { theme, look: "classic" },
    gitGraph: {
      mainBranchName: "main",
      showCommitLabel: true,
      showBranches: true,
      rotateCommitLabel: true,
    },
  });

  for (const diagram of diagrams) {
    if (!diagram.isConnected || diagram.dataset.mermaidTheme === theme) continue;
    diagram.dataset.diagram ??= diagram.textContent;

    try {
      const { svg, bindFunctions } = await mermaid.render(
        `mermaid-${crypto.randomUUID()}`,
        diagram.dataset.diagram,
      );
      if (!diagram.isConnected) continue;
      diagram.innerHTML = svg;
      bindFunctions?.(diagram);
      delete diagram.dataset.mermaidError;
    } catch (error) {
      console.error("Mermaid rendering failed", error);
      diagram.textContent = `Error rendering diagram: ${error.message}`;
      diagram.dataset.mermaidError = "true";
    }

    diagram.dataset.processed = "true";
    diagram.dataset.mermaidTheme = theme;
  }
}

function scheduleRender() {
  // Theme changes and Astro navigation must not race Mermaid's global config.
  renderQueue = renderQueue.then(renderDiagrams).catch((error) => {
    console.error("Mermaid initialization failed", error);
  });
}

const observer = new MutationObserver(scheduleRender);
function observePage() {
  // ClientRouter may replace the body. Release the old observation on navigation.
  observer.disconnect();
  for (const element of [document.documentElement, document.body]) {
    observer.observe(element, { attributes: true, attributeFilter: ["data-theme"] });
  }
  scheduleRender();
}

document.addEventListener("astro:after-swap", observePage);
document.addEventListener("astro:page-load", observePage);
observePage();
