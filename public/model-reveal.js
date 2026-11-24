const viewer = document.getElementById("model-preview");
const panel = document.getElementById("model-panel");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const autoRotate = viewer.hasAttribute("auto-rotate");
let latestRequest;
let modelUrl;

function restoreRotation() {
  viewer.toggleAttribute("auto-rotate", autoRotate && !reducedMotion.matches);
}

export function cancelModelReveal() {
  latestRequest?.abort();
}

restoreRotation();
viewer.addEventListener("error", () => viewer.showPoster?.());
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) cancelModelReveal();
  restoreRotation();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelModelReveal();
});

function coverWithArtwork(artworkUrl) {
  const layer = document.createElement("div");
  layer.className = "model-dust-layer";
  layer.setAttribute("aria-hidden", "true");
  const poster = new Image();
  poster.alt = "";
  poster.src = artworkUrl;
  layer.append(poster);
  viewer.after(layer);
  return layer;
}

// Canceling the animation still lets an in-flight request install its GLB.
// A newer Generate 3D request owns the viewer as soon as it starts.
export function beginModelRequest(artworkUrl) {
  cancelModelReveal();
  const request = new AbortController();
  const { signal } = request;
  latestRequest = request;
  let layer;
  let timeout;
  if (panel.classList.contains("is-active") && !document.hidden) {
    layer = coverWithArtwork(artworkUrl);
    const controls = viewer.hasAttribute("camera-controls");
    viewer.removeAttribute("camera-controls");
    viewer.removeAttribute("auto-rotate");
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      layer.remove();
      viewer.toggleAttribute("camera-controls", controls);
      restoreRotation();
    }, { once: true });
  }

  return {
    show(model) {
      if (request !== latestRequest) return;
      const url = URL.createObjectURL(model);
      if (layer && !signal.aborted) {
        // Keep the normal model accessible if loading or GPU setup stalls.
        timeout = setTimeout(() => request.abort(), 15000);
        viewer.addEventListener("error", () => request.abort(), { signal });
        async function onLoad(event) {
          if (event.detail.url !== url) return;
          viewer.removeEventListener("load", onLoad);
          try {
            if (!reducedMotion.matches) {
              const { playDust } = await import("./inline-dust.js");
              if (!signal.aborted) await playDust(layer, viewer, model, signal);
            }
          } catch (error) {
            if (!signal.aborted) console.warn("Showing the normal 3D preview.", error);
          } finally {
            request.abort();
          }
        }
        viewer.addEventListener("load", onLoad, { signal });
      }

      viewer.setAttribute("poster", artworkUrl);
      viewer.setAttribute("src", url);
      if (modelUrl) URL.revokeObjectURL(modelUrl);
      modelUrl = url;
    },
    fail() { request.abort(); }
  };
}
