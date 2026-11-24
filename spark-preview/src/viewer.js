import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { makeDust } from "./dust.js";

export async function mountViewer(host, { url, stage, onError, character = false }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", character ? "3D character made of particles" : "3D butterfly particle study");
  canvas.setAttribute("role", "img");
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  const coarse = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1 : 1.5));

  let active = false;
  let disposed = false;
  let frame = 0;
  let spark, object, controls, observer, dust;
  let target = 1;
  let previousTime = 0;

  function requestFrame() {
    if (active && !disposed && !frame) frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    if (disposed || !active) return;
    try {
      if (dust && dust.assembled.value !== target) {
        const delta = Math.min((now - (previousTime || now - 16)) / 1000, 0.08);
        const next = THREE.MathUtils.damp(dust.assembled.value, target, 6, delta);
        dust.assembled.value = Math.abs(next - target) < 0.001 ? target : next;
        object.updateVersion();
        if (dust.assembled.value !== target) requestFrame();
      }
      previousTime = now;
      renderer.render(scene, camera);
    } catch (error) {
      dispose();
      onError(error);
    }
  }
  function resize() {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    camera.aspect = w / h;
    // Keep the wings in frame on narrow screens, too.
    camera.zoom = Math.min(1, camera.aspect / 1.24);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    requestFrame();
  }
  function contextLost(event) {
    event.preventDefault();
    dispose();
    onError(new Error("The graphics context was lost."));
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    canvas.removeEventListener("webglcontextlost", contextLost);
    observer?.disconnect();
    controls?.dispose();
    object?.dispose();
    spark?.dispose();
    renderer.dispose();
    canvas.remove();
  }

  try {
    spark = new SparkRenderer({ renderer, onDirty: requestFrame });
    scene.add(spark);
    if (character) {
      const { sampleCharacter } = await import("./character-splats.js");
      object = await sampleCharacter(url, coarse ? 12000 : 28000);
    } else {
      object = new SplatMesh({ url });
    }
    await object.initialized;
    if (!object.numSplats) throw new Error("The asset contains no splats.");

    const bounds = object.getBoundingBox();
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
      throw new Error("The asset has invalid bounds.");
    }
    const subject = new THREE.Group();
    object.position.copy(sphere.center).multiplyScalar(-1);
    subject.add(object);
    subject.scale.setScalar(1 / sphere.radius);
    if (character) subject.rotation.y = Math.PI; // Face the front of the SF3D penguin.
    else subject.rotation.x = Math.PI; // Orientation of the sample butterfly.
    scene.add(subject);
    camera.position.set(0.3, 0.18, 3.05);
    camera.lookAt(0, 0, 0);

    if (stage === "orbit" || stage === "dust") {
      controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.minDistance = 1.5;
      controls.maxDistance = 6;
      controls.addEventListener("change", requestFrame);
      controls.update();
      canvas.tabIndex = 0;
      canvas.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const angle = event.key === "ArrowLeft" ? -0.12 : 0.12;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        controls.update();
      });
    }
    if (stage === "dust" || stage === "scroll") {
      dust = makeDust(sphere.radius);
      object.objectModifiers = [dust.modifier];
      object.updateGenerator();
    }

    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    canvas.addEventListener("webglcontextlost", contextLost);
    return {
      setActive(value) {
        active = value;
        if (active) requestFrame();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
          previousTime = 0;
        }
      },
      setAssembly(value, immediate = false) {
        if (!dust) return;
        target = THREE.MathUtils.clamp(value, 0, 1);
        if (immediate) {
          dust.assembled.value = target;
          object.updateVersion();
        }
        requestFrame();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
