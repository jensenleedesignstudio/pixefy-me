import { dyno } from "@sparkjsdev/spark";

// 0 = loose dust, 1 = the captured object. Each splat always takes the same path.
export function makeDust(radius) {
  const assembled = dyno.dynoFloat(1);
  const spread = dyno.dynoFloat(radius);
  const scatter = new dyno.Dyno({
    inTypes: { original: dyno.Gsplat, assembled: "float", spread: "float" },
    outTypes: { gsplat: dyno.Gsplat },
    statements: ({ inputs, outputs }) => dyno.unindentLines(`
      ${outputs.gsplat} = ${inputs.original};
      vec3 p = ${inputs.original}.center;
      vec3 seed = vec3(dot(p, vec3(19.2, 71.7, 3.1)),
                       dot(p, vec3(47.5, 13.2, 87.1)),
                       dot(p, vec3(12.7, 96.3, 31.9)));
      vec3 noise = fract(sin(seed) * 4375.83);
      float loose = 1.0 - smoothstep(noise.y * 0.27, 0.7 + noise.y * 0.3, ${inputs.assembled});
      vec3 drift = (noise - 0.5) * vec3(1.8, 1.15, 0.9);
      drift.x += sin(noise.z * 6.283 + loose * 2.2) * 0.3;
      ${outputs.gsplat}.center += loose * drift * ${inputs.spread};
      ${outputs.gsplat}.scales = mix(${inputs.original}.scales,
                                     vec3(0.0024 * ${inputs.spread}), loose);
      ${outputs.gsplat}.rgba.a *= 1.0 - 0.75 * loose;
    `),
  });
  const modifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat },
    ({ gsplat }) => scatter.apply({ original: gsplat, assembled, spread }),
  );
  return { assembled, modifier };
}
