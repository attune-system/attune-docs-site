(() => {
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 8;
  const ZOOM_STEP = 1.25;

  let dialog;
  let canvas;
  let stage;
  let title;
  let zoomOutput;
  let fullscreenButton;
  let activeDiagram;
  let placeholder;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let pointer;

  function diagramTitle(diagram) {
    let element = diagram.previousElementSibling;

    while (element) {
      if (element.matches("h2, h3")) return element.textContent.trim();
      const heading = element.querySelector("h2, h3");
      if (heading) return heading.textContent.trim();
      element = element.previousElementSibling;
    }

    return "Diagram";
  }

  function applyTransform() {
    stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    zoomOutput.value = `${Math.round(scale * 100)}%`;
    zoomOutput.textContent = zoomOutput.value;
  }

  function setScale(nextScale, clientX, clientY) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const bounds = canvas.getBoundingClientRect();
    const originX = (clientX ?? bounds.left + bounds.width / 2) - bounds.left;
    const originY = (clientY ?? bounds.top + bounds.height / 2) - bounds.top;
    const ratio = next / scale;

    offsetX = originX - (originX - offsetX) * ratio;
    offsetY = originY - (originY - offsetY) * ratio;
    scale = next;
    applyTransform();
  }

  function resetView() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
  }

  function restoreDiagram() {
    if (activeDiagram && placeholder?.parentNode) placeholder.replaceWith(activeDiagram);
    activeDiagram = undefined;
    placeholder = undefined;
    pointer = undefined;
    resetView();
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await dialog.requestFullscreen();
      }
    } catch {
      fullscreenButton.hidden = true;
    }
  }

  function createViewer() {
    dialog = document.createElement("dialog");
    dialog.className = "diagram-viewer";
    dialog.setAttribute("aria-labelledby", "diagram-viewer-title");
    dialog.innerHTML = `
      <header class="diagram-viewer__header">
        <h2 class="diagram-viewer__title" id="diagram-viewer-title"></h2>
        <span class="diagram-viewer__hint">Scroll to zoom. Drag to pan.</span>
        <div class="diagram-viewer__controls" aria-label="Diagram controls">
          <button class="diagram-control" type="button" data-action="zoom-out" aria-label="Zoom out">-</button>
          <output class="diagram-viewer__zoom" aria-live="polite">100%</output>
          <button class="diagram-control" type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
          <button class="diagram-control" type="button" data-action="reset">Reset</button>
          <button class="diagram-control" type="button" data-action="fullscreen">Fullscreen</button>
          <button class="diagram-control" type="button" data-action="close">Close</button>
        </div>
      </header>
      <div class="diagram-viewer__canvas" tabindex="0" aria-label="Zoomable diagram">
        <div class="diagram-viewer__stage"></div>
      </div>
    `;

    document.body.append(dialog);
    canvas = dialog.querySelector(".diagram-viewer__canvas");
    stage = dialog.querySelector(".diagram-viewer__stage");
    title = dialog.querySelector(".diagram-viewer__title");
    zoomOutput = dialog.querySelector(".diagram-viewer__zoom");
    fullscreenButton = dialog.querySelector('[data-action="fullscreen"]');

    if (!document.fullscreenEnabled) fullscreenButton.hidden = true;

    dialog.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;

      if (action === "zoom-out") setScale(scale / ZOOM_STEP);
      if (action === "zoom-in") setScale(scale * ZOOM_STEP);
      if (action === "reset") resetView();
      if (action === "fullscreen") void toggleFullscreen();
      if (action === "close") dialog.close();
    });

    dialog.addEventListener("close", () => {
      if (document.fullscreenElement === dialog) void document.exitFullscreen();
      restoreDiagram();
    });

    document.addEventListener("fullscreenchange", () => {
      if (!fullscreenButton) return;
      fullscreenButton.textContent = document.fullscreenElement === dialog ? "Exit fullscreen" : "Fullscreen";
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      setScale(scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    }, { passive: false });

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (pointer?.id !== event.pointerId) return;
      offsetX += event.clientX - pointer.x;
      offsetY += event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      applyTransform();
    });

    canvas.addEventListener("pointerup", (event) => {
      if (pointer?.id === event.pointerId) pointer = undefined;
    });

    canvas.addEventListener("pointercancel", () => {
      pointer = undefined;
    });

    canvas.addEventListener("dblclick", (event) => {
      setScale(scale * ZOOM_STEP, event.clientX, event.clientY);
    });

    canvas.addEventListener("keydown", (event) => {
      if (["+", "="].includes(event.key)) setScale(scale * ZOOM_STEP);
      else if (event.key === "-") setScale(scale / ZOOM_STEP);
      else if (event.key === "0") resetView();
      else if (event.key === "ArrowLeft") offsetX += 40;
      else if (event.key === "ArrowRight") offsetX -= 40;
      else if (event.key === "ArrowUp") offsetY += 40;
      else if (event.key === "ArrowDown") offsetY -= 40;
      else return;

      event.preventDefault();
      applyTransform();
    });
  }

  function openViewer(diagram, heading) {
    if (!dialog) createViewer();

    activeDiagram = diagram;
    placeholder = document.createComment("diagram viewer placeholder");
    activeDiagram.replaceWith(placeholder);
    stage.append(activeDiagram);
    title.textContent = heading;
    resetView();
    dialog.showModal();
    requestAnimationFrame(() => canvas.focus());
  }

  function decorateDiagrams() {
    for (const diagram of document.querySelectorAll(".mermaid:not([data-viewer-ready])")) {
      if (!diagram.querySelector("svg")) continue;
      diagram.dataset.viewerReady = "true";
      const heading = diagramTitle(diagram);
      const frame = document.createElement("div");
      const toolbar = document.createElement("div");
      const openButton = document.createElement("button");

      frame.className = "diagram-frame";
      toolbar.className = "diagram-frame__toolbar";
      openButton.className = "diagram-control";
      openButton.type = "button";
      openButton.textContent = "Open diagram";
      openButton.setAttribute("aria-label", `Open ${heading} in diagram viewer`);
      openButton.addEventListener("click", () => openViewer(diagram, heading));

      diagram.before(frame);
      toolbar.append(openButton);
      frame.append(toolbar, diagram);
    }
  }

  function start() {
    decorateDiagrams();
    new MutationObserver(decorateDiagrams).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
