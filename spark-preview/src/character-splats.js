import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { SplatMesh } from "@sparkjsdev/spark";

// Optional adapter for Pixefy's static, textured Stable Fast 3D meshes.
export async function sampleCharacter(source, count, signal) {
  signal?.throwIfAborted();
  const loader = new GLTFLoader();
  let scene = source;
  if (!source.isObject3D) {
    const gltf = source instanceof Blob
      ? await loader.parseAsync(await source.arrayBuffer(), "")
      : await loader.loadAsync(source);
    scene = gltf.scene;
  }
  scene.updateMatrixWorld(true);
  const parts = [];
  let result;
  try {
    signal?.throwIfAborted();
    scene.traverseVisible(part => {
      if (!part.isMesh || part.isSkinnedMesh || Array.isArray(part.material)) return;
      const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry, part.material)).build();
      const area = sampler.distribution.at(-1); // Cumulative triangle areas in Three r180.
      if (!area) { geometry.dispose(); return; }
      const map = part.material.map;
      let pixels;
      if (map && geometry.hasAttribute("uv")) {
        map.updateMatrix();
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1024 / Math.max(map.image.width, map.image.height));
        canvas.width = Math.max(1, Math.round(map.image.width * scale));
        canvas.height = Math.max(1, Math.round(map.image.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(map.image, 0, 0, canvas.width, canvas.height);
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      parts.push({ geometry, sampler, area, material: part.material, pixels });
    });
    if (!parts.length) throw new Error("This preview needs a static triangle mesh.");

    const area = parts.reduce((sum, part) => sum + part.area, 0);
    const radius = Math.sqrt(area / count) * 0.85;
    const size = new THREE.Vector3(radius, radius, radius * 0.5);
    const pos = new THREE.Vector3(), normal = new THREE.Vector3(), uv = new THREE.Vector2();
    const z = new THREE.Vector3(0, 0, 1), rotation = new THREE.Quaternion();
    const vertex = new THREE.Color(), rgb = new THREE.Color(), texel = new THREE.Color();

    result = new SplatMesh({
      maxSplats: count,
      constructSplats: async packed => {
        for (const { sampler, area: partArea, material, pixels } of parts) {
          const quota = Math.round(count * partArea / area);
          for (let i = 0; i < quota; i++) {
            vertex.setRGB(1, 1, 1);
            sampler.sample(pos, normal, vertex, uv);
            rgb.copy(material.color).multiply(vertex);
            let alpha = material.opacity;
            if (pixels) {
              material.map.transformUv(uv);
              const x = THREE.MathUtils.clamp(Math.floor(uv.x * pixels.width), 0, pixels.width - 1);
              const y = THREE.MathUtils.clamp(Math.floor(uv.y * pixels.height), 0, pixels.height - 1);
              const k = 4 * (y * pixels.width + x), bytes = pixels.data;
              texel.setRGB(bytes[k] / 255, bytes[k + 1] / 255, bytes[k + 2] / 255, THREE.SRGBColorSpace);
              rgb.multiply(texel);
              alpha *= bytes[k + 3] / 255;
            }
            if (alpha > 0.04) {
              rotation.setFromUnitVectors(z, normal.normalize());
              packed.pushSplat(pos, size, rotation, alpha, rgb.convertLinearToSRGB());
            }
            if (i % 4096 === 4095) {
              await new Promise(resolve => setTimeout(resolve, 0));
              signal?.throwIfAborted();
            }
          }
        }
      },
    });
    await result.initialized;
    return result;
  } catch (error) {
    result?.dispose();
    throw error;
  } finally {
    for (const { geometry } of parts) geometry.dispose();
    if (!source.isObject3D) disposeCharacter(scene);
  }
}

export function disposeCharacter(scene) {
  const textures = new Set();
  scene.traverse(part => {
    if (!part.isMesh) return;
    part.geometry.dispose();
    for (const material of [].concat(part.material)) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
}
