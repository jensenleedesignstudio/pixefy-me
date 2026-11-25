import * as THREE from "three";
import { SparkRenderer } from "@sparkjsdev/spark";
import { sampleCharacter } from "./character-splats.js";
import { makeDust } from "./dust.js";

// Bake the short GPU pass once. Dragging backward then costs only a 2D draw.
export async function buildReplayFrames(blob, size, signal) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  let spark, splats;
  try {
    renderer.setSize(size, size, false);
    renderer.setClearColor(0xfdf5ec, 1);
    const camera = new THREE.PerspectiveCamera(32, 1);
    const sphere = new THREE.Sphere();
    const particles = [], turn = [];
    // Stable Fast 3D places the reference-facing side toward negative Z.
    const facing = Math.PI;
    function aim(angle) {
      const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(14));
      camera.position.setFromSphericalCoords(distance, Math.PI * 0.46, angle).add(sphere.center);
      camera.near = distance / 100;
      camera.far = distance * 4;
      camera.lookAt(sphere.center);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }
    function snapshot(scene) {
      renderer.render(scene, camera);
      const frame = document.createElement("canvas");
      frame.width = frame.height = size;
      frame.getContext("2d").drawImage(renderer.domElement, 0, 0);
      return frame;
    }
    splats = await sampleCharacter(blob, size <= 360 ? 9000 : 17500, signal, mesh => {
      new THREE.Box3().setFromObject(mesh).getBoundingSphere(sphere);
      if (!(sphere.radius > 0)) throw new Error("Empty model");
      const solid = new THREE.Scene();
      const key = new THREE.DirectionalLight(0xfff1df, 2.2);
      key.position.set(3, 5, 4);
      solid.add(mesh, key, new THREE.HemisphereLight(0xfffaf4, 0xb2a59c, 2));
      for (let i = 0; i <= 12; i++) {
        aim(facing + 0.38 * i / 12);
        turn.push(snapshot(solid));
      }
      solid.remove(mesh);
    });
    signal.throwIfAborted();
    aim(facing);
    const cloud = new THREE.Scene();
    spark = new SparkRenderer({ renderer, enableLod: false, autoUpdate: false });
    const dust = makeDust(sphere.radius);
    splats.objectModifiers = [dust.modifier];
    splats.updateGenerator();
    cloud.add(spark, splats);
    cloud.updateMatrixWorld(true);
    for (let i = 0; i <= 32; i++) {
      signal.throwIfAborted();
      dust.assembled.value = 0.32 + 0.68 * i / 32;
      splats.updateVersion();
      await spark.update({ scene: cloud, camera });
      signal.throwIfAborted();
      particles.push(snapshot(cloud));
      // Yield between batches so the dialog can be closed during preparation.
      if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { particles, turn };
  } finally {
    spark?.dispose();
    splats?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
