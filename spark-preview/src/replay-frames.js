import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SparkRenderer } from "@sparkjsdev/spark";
import { disposeCharacter, sampleCharacter } from "./character-splats.js";
import { shapeGrid, matchDetails, divisions } from "./morph-grid.js";

function makeWarp() {
  const indices = [];
  for (let y = 0; y < divisions; y++) {
    for (let x = 0; x < divisions; x++) {
      const i = y * (divisions + 1) + x, below = i + divisions + 1;
      indices.push(i, below, i + 1, i + 1, below, below + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
    uniforms: { a: {value: null}, b: {value: null}, progress: {value: 0} },
    vertexShader: `
      attribute vec2 nextPosition, entryVelocity, exitVelocity;
      varying vec2 fromUV, toUV;
      uniform float progress;
      void main() {
        fromUV = position.xy;
        toUV = nextPosition;
        // Cubic Hermite interpolation carries each region's velocity through the artwork.
        float t = progress, t2 = t * t;
        vec2 p = mix(fromUV, toUV, t2 * (3. - 2. * t))
          + t * (1. - t) * ((1. - t) * entryVelocity - t * exitVelocity);
        gl_Position = vec4(p.x * 2. - 1., 1. - p.y * 2., 0., 1.);
      }`,
    fragmentShader: `
      varying vec2 fromUV, toUV;
      uniform sampler2D a, b;
      uniform float progress;
      void main() {
        vec3 ink = texture2D(a, fromUV).rgb, paint = texture2D(b, toUV).rgb;
        // Reveal local colour on the moving surface. Keep a single contour.
        float bias = .12 * (toUV.y - .5) + .08 * (dot(ink, vec3(.299,.587,.114)) - .5);
        // Concentrate colour changes where the warped textures strongly disagree.
        // This keeps two high-contrast marks from lingering at half opacity.
        float difference = max(max(abs(ink.r-paint.r),abs(ink.g-paint.g)),abs(ink.b-paint.b));
        float span = mix(.46, .14, smoothstep(.06, .45, difference));
        float centre = .5 + bias;
        float colour = smoothstep(centre - span, centre + span, progress);
        gl_FragColor = vec4(mix(ink, paint, colour), 1.);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// Project the captured splat colours onto the same mesh that produced them.
// They follow the rotating surface until its lit material takes over.
function projectSplats(mesh, camera, texture) {
  const blend = { value: 1 };
  const projector = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const materials = new Set();
  mesh.traverse(part => {
    if (part.isMesh) for (const material of [].concat(part.material)) materials.add(material);
  });
  for (const material of materials) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
      previous.call(this, shader, renderer);
      shader.uniforms.replayProjector = { value: projector };
      shader.uniforms.replaySurface = { value: texture };
      shader.uniforms.replayBlend = blend;
      shader.vertexShader = "uniform mat4 replayProjector; varying vec4 replayUV;\n" +
        shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
          replayUV = replayProjector * modelMatrix * vec4(transformed, 1.);`);
      shader.fragmentShader = "uniform sampler2D replaySurface; uniform float replayBlend; varying vec4 replayUV;\n" +
        shader.fragmentShader.replace("#include <colorspace_fragment>", `#include <colorspace_fragment>
          vec2 uv = replayUV.xy / replayUV.w * .5 + .5;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, texture2D(replaySurface, vec2(uv.x, 1.-uv.y)).rgb, replayBlend);`);
    };
    material.needsUpdate = true;
  }
  return blend;
}

const artTime = .44, modelTime = .76;

export async function buildReplay(sketch, art, blob, size, signal) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const camera = new THREE.PerspectiveCamera(32, 1);
  const sphere = new THREE.Sphere();
  const solid = new THREE.Scene();
  const warp = makeWarp();
  const textures = [];
  let mesh, cloud, splats;
  function dispose() {
    cloud?.dispose();
    splats?.dispose();
    if (mesh) disposeCharacter(mesh);
    textures.forEach(texture => texture.dispose());
    warp.geometry.dispose();
    warp.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  function aim(angle) {
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(14));
    camera.position.setFromSphericalCoords(distance, Math.PI * .46, angle).add(sphere.center);
    camera.near = distance / 100;
    camera.far = distance * 4;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function capture(scene) {
    renderer.render(scene, camera);
    const frame = document.createElement("canvas");
    frame.width = frame.height = size;
    frame.getContext("2d").drawImage(renderer.domElement, 0, 0);
    return frame;
  }
  try {
    renderer.setSize(size, size, false);
    renderer.setClearColor(0xfdf5ec, 1);
    mesh = (await new GLTFLoader().parseAsync(await blob.arrayBuffer(), "")).scene;
    signal.throwIfAborted();
    new THREE.Box3().setFromObject(mesh).getBoundingSphere(sphere);
    if (!(sphere.radius > 0)) throw new Error("Empty model");
    aim(Math.PI);
    const key = new THREE.DirectionalLight(0xfff1df, 2.2);
    key.position.set(3, 5, 4);
    solid.add(mesh, key, new THREE.HemisphereLight(0xfffaf4, 0xb2a59c, 2));
    const front = capture(solid);

    // Capture the splat surface and solid through exactly the same lens.
    splats = await sampleCharacter(mesh, size <= 360 ? 10000 : 20000, signal);
    signal.throwIfAborted();
    const surface = new THREE.Scene();
    cloud = new SparkRenderer({ renderer, enableLod: false, autoUpdate: false });
    surface.add(cloud, splats);
    surface.updateMatrixWorld(true);
    await cloud.update({scene: surface, camera});
    signal.throwIfAborted();
    const splatFrame = capture(surface);
    surface.remove(cloud, splats);
    cloud.dispose(); cloud = null;
    splats.dispose(); splats = null;

    function textureOf(image) {
      const texture = new THREE.CanvasTexture(image);
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
      return texture;
    }

    const surfaceBlend = projectSplats(mesh, camera, textureOf(splatFrame));
    const handoff = capture(solid);
    const images = [sketch.canvas, art.canvas, handoff];
    const layers = images.map(textureOf);
    const regular = new Float32Array((divisions + 1) ** 2 * 2);
    for (let i = 0; i < regular.length / 2; i++) {
      regular[i * 2] = (i % (divisions + 1)) / divisions;
      regular[i * 2 + 1] = Math.floor(i / (divisions + 1)) / divisions;
    }
    const modelGrid = shapeGrid(front) || regular;
    const artGrid = shapeGrid(art.canvas, art.bounds) || modelGrid;
    const start = shapeGrid(sketch.canvas, sketch.bounds) || artGrid;
    const middle = matchDetails(images[0], images[1], start, artGrid);
    const end = matchDetails(images[1], images[2], middle, modelGrid);
    const positions = [start, middle, end].map(grid => new THREE.BufferAttribute(grid, 2));
    // A bounded harmonic tangent keeps a pixel from overshooting when it changes direction.
    const velocity = middle.map((value, i) => {
      const before = (value - start[i]) / artTime;
      const after = (end[i] - value) / (modelTime - artTime);
      return before * after > 0 ? 2 * before * after / (before + after) : 0;
    });
    const zero = new THREE.BufferAttribute(new Float32Array(velocity.length), 2);
    const arrival = new THREE.BufferAttribute(velocity.map(v => v * artTime), 2);
    const departure = new THREE.BufferAttribute(velocity.map(v => v * (modelTime - artTime)), 2);
    const plane = new THREE.Scene();
    plane.add(warp);
    const uniforms = warp.material.uniforms;
    let lastPair = -1;
    function morph(pair, progress) {
      if (lastPair !== pair) {
        warp.geometry.setAttribute("position", positions[pair]);
        warp.geometry.setAttribute("nextPosition", positions[pair + 1]);
        warp.geometry.setAttribute("entryVelocity", pair === 0 ? zero : departure);
        warp.geometry.setAttribute("exitVelocity", pair === 0 ? arrival : zero);
        uniforms.a.value = layers[pair];
        uniforms.b.value = layers[pair + 1];
        lastPair = pair;
      }
      uniforms.progress.value = progress;
      renderer.render(plane, camera);
    }
    return {
      dispose,
      canvas: renderer.domElement,
      draw(t) {
        if (t < artTime) morph(0, t / artTime);
        else if (t < modelTime) morph(1, (t - artTime) / (modelTime - artTime));
        else {
          surfaceBlend.value = 1 - THREE.MathUtils.smootherstep(t, modelTime, .89);
          aim(Math.PI + .38 * THREE.MathUtils.smoothstep(t, modelTime, 1));
          renderer.render(solid, camera);
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
