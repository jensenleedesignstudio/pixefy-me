/*! Spark and Three.js license notices are in ./inline-dust.LICENSE.txt. */
import * as THREE from "three";
import { SparkRenderer } from "@sparkjsdev/spark";
import { makeDust } from "./dust.js";
import { sampleCharacter } from "./character-splats.js";

export async function playDust(layer, viewer, model, signal) {
  const compact = matchMedia("(pointer: coarse), (max-width: 640px)").matches;
  const object = await sampleCharacter(model, compact ? 12000 : 28000, signal);
  let renderer, spark, fade;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    fade?.cancel();
    renderer?.setAnimationLoop(null);
    spark?.dispose();
    object.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }
  signal.addEventListener("abort", dispose, { once: true });
  try {
    if (signal.aborted || !object.numSplats) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1 : 1.5));
    spark = new SparkRenderer({ renderer, enableLod: false });
    scene.add(spark, object);
    const radius = object.getBoundingBox().getBoundingSphere(new THREE.Sphere()).radius;
    const dust = makeDust(radius);
    dust.assembled.value = 0;
    object.objectModifiers = [dust.modifier];
    object.updateGenerator();

    // Use the GLB's original coordinates and Google's camera, including turntable yaw.
    function matchCamera() {
      const w = Math.max(1, viewer.clientWidth);
      const h = Math.max(1, viewer.clientHeight);
      const { theta, phi, radius: distance } = viewer.getCameraOrbit();
      const target = viewer.getCameraTarget();
      camera.position.setFromSphericalCoords(distance, phi, theta - viewer.turntableRotation);
      camera.position.add(target);
      camera.lookAt(target.x, target.y, target.z);
      camera.aspect = w / h;
      camera.fov = viewer.getFieldOfView();
      camera.near = Math.max(0.0001, distance / 1000);
      camera.far = Math.max(camera.near + 1, distance + 8 * radius);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      if (renderer.domElement.clientWidth !== w || renderer.domElement.clientHeight !== h) {
        renderer.setSize(w, h);
      }
    }
    layer.append(renderer.domElement);
    matchCamera();
    scene.updateMatrixWorld(true);
    await spark.update({ scene, camera });
    if (signal.aborted) return;
    renderer.render(scene, camera);
    layer.querySelector("img")?.remove();

    // Cap long frame gaps so a slow first frame cannot skip the assembly.
    await new Promise((resolve, reject) => {
      let previousTime;
      let elapsed = 0;
      signal.addEventListener("abort", resolve, { once: true });
      renderer.setAnimationLoop(time => {
        try {
          if (renderer.getContext().isContextLost()) throw new Error("WebGL context lost");
          elapsed += Math.min(80, time - (previousTime ?? time));
          previousTime = time;
          const progress = Math.min(1, elapsed / 1100);
          matchCamera();
          dust.assembled.value = progress;
          object.updateVersion();
          renderer.render(scene, camera);
          if (progress === 1) resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    if (signal.aborted) return;
    renderer.setAnimationLoop(null);
    await spark.update({ scene, camera });
    if (signal.aborted) return;
    renderer.render(scene, camera);
    fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200, easing: "ease-out", fill: "forwards",
    });
    await fade.finished;
  } finally {
    signal.removeEventListener("abort", dispose);
    dispose();
  }
}

export { buildReplayFrames } from "./replay-frames.js";
