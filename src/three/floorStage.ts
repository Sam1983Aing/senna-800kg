import * as THREE from 'three';

export interface FloorStage {
  mesh: THREE.Mesh;
  update: (params: {
    time: number;
    trackOffsetZ: number;
    explodeFactor: number;
    liveryColor: THREE.Color;
    brakeHeat: number;
    tailGlow: number;
    xrayFactor: number;
    speedFactor: number;
  }) => void;
  dispose: () => void;
}

export function createFloorStage(): FloorStage {
  const geo = new THREE.PlaneGeometry(26, 26, 1, 1);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uTrackOffsetZ: { value: 0 },
    uExplode: { value: 0 },
    uLiveryColor: { value: new THREE.Color('#FF6B00') },
    uBrakeHeat: { value: 0 },
    uTailGlow: { value: 0.35 },
    uXray: { value: 0 },
    uSpeedFactor: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vWorldPos;
      void main() {
        vPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uTrackOffsetZ;
      uniform float uExplode;
      uniform vec3 uLiveryColor;
      uniform float uBrakeHeat;
      uniform float uTailGlow;
      uniform float uXray;
      uniform float uSpeedFactor;
      varying vec3 vPos;
      varying vec3 vWorldPos;

      float gridLine(float coord, float spacing, float widthPx) {
        float scaled = coord / spacing;
        float fw = max(fwidth(scaled), 0.0001);
        float dist = abs(fract(scaled - 0.5) - 0.5) / fw;
        return 1.0 - smoothstep(0.0, widthPx, dist);
      }

      void main() {
        vec2 p = vPos.xz;
        float r = length(p);

        // Smooth radial alpha fade so spatial depth typography behind horizon stays crystal clear
        float radialFade = 1.0 - smoothstep(2.8, 9.4, r);
        if (radialFade <= 0.001) discard;

        // Grazing-angle Fresnel boost for authentic glossy wind-tunnel epoxy floor sheen
        vec3 toCam = cameraPosition - vWorldPos;
        float camDist = max(length(toCam), 0.0001);
        vec3 viewDir = toCam / camDist;
        float ndotv = clamp(viewDir.y, 0.0, 1.0);
        float fresnel = pow(max(1.0 - ndotv, 0.0001), 2.6);

        // Scrolling Z coordinate for Act 05 340 KM/H asphalt pursuit
        vec2 gridP = vec2(p.x, p.y - uTrackOffsetZ);

        // 0.5m fine wind-tunnel metric grid + 2.0m major datum grid
        float minorG = max(gridLine(gridP.x, 0.5, 1.15), gridLine(gridP.y, 0.5, 1.15));
        float majorG = max(gridLine(gridP.x, 2.0, 1.5), gridLine(gridP.y, 2.0, 1.5));

        // Turntable wind-tunnel balance rings (R = 2.85m and R = 1.95m)
        float fwR = max(fwidth(r), 0.0001);
        float ringOuter = 1.0 - smoothstep(0.0, 1.6, abs(r - 2.85) / fwR);
        float ringInner = 1.0 - smoothstep(0.0, 1.25, abs(r - 1.95) / fwR);
        float turntableFade = 1.0 - uSpeedFactor * 0.85;

        // Car underbody Ambient Occlusion Contact Shadow (4.64m length x 2.04m width)
        vec2 bodyBox = vec2(p.x / (1.02 + uExplode * 0.42), p.y / (2.28 + uExplode * 0.25));
        float bodyDist = length(max(abs(bodyBox) - vec2(0.55, 0.65), 0.0));
        float bodyAO = 1.0 - smoothstep(0.0, 0.50 + uExplode * 0.28, bodyDist);
        bodyAO *= (1.0 - uExplode * 0.38);

        // 4 Tire Contact-Patch Tight Occlusion Ovals
        float wheelX = 0.86 + uExplode * 0.84;
        vec2 wFL = (p - vec2(-wheelX, -1.34)) / vec2(0.20, 0.34);
        vec2 wFR = (p - vec2( wheelX, -1.34)) / vec2(0.20, 0.34);
        vec2 wRL = (p - vec2(-wheelX,  1.34)) / vec2(0.23, 0.36);
        vec2 wRR = (p - vec2( wheelX,  1.34)) / vec2(0.23, 0.36);
        float tireAO = 0.0;
        tireAO += 1.0 - smoothstep(0.35, 1.15, length(wFL));
        tireAO += 1.0 - smoothstep(0.35, 1.15, length(wFR));
        tireAO += 1.0 - smoothstep(0.35, 1.15, length(wRL));
        tireAO += 1.0 - smoothstep(0.35, 1.15, length(wRR));
        tireAO = clamp(tireAO, 0.0, 1.0);

        // Base dark forged graphite wind-tunnel floor
        vec3 baseCol = vec3(0.042, 0.047, 0.062);

        // Mirrored overhead Woking softbox light-blade reflections on glossy floor!
        float centerLightStrip = exp(-pow(max(abs(p.x), 0.0001), 2.0) * 0.42) * exp(-p.y * p.y * 0.045);
        float sideStripL = exp(-pow(max(abs(p.x + 2.35), 0.0001), 2.0) * 1.4) * exp(-p.y * p.y * 0.06);
        float sideStripR = exp(-pow(max(abs(p.x - 2.35), 0.0001), 2.0) * 1.4) * exp(-p.y * p.y * 0.06);
        baseCol += vec3(0.11, 0.13, 0.175) * (centerLightStrip * 0.55 + (sideStripL + sideStripR) * 0.38) * (0.55 + fresnel * 0.85);

        // Rich MSO Livery specular color bounce pool around sculpted side sills, fenders & front splitter!
        float lateralBand = exp(-pow(max(abs(p.x) - 1.12, 0.0001), 2.0) * 1.35) * exp(-p.y * p.y * 0.14);
        float noseBounce = exp(-dot((p - vec2(0.0, -2.35)) * vec2(0.75, 1.05), (p - vec2(0.0, -2.35)) * vec2(0.75, 1.05)) * 0.85);
        float liveryPool = (lateralBand + noseBounce * 0.65) * (0.65 + fresnel * 0.9);
        baseCol += uLiveryColor * liveryPool * 0.24 * (1.0 - bodyAO * 0.55);

        // Warm Papaya + Aero Crimson ambient studio rim bounce on rear-side floor
        float warmQuarter = exp(-dot((p - vec2(-1.55, 1.45)) * 0.48, (p - vec2(-1.55, 1.45)) * 0.48));
        baseCol += vec3(1.0, 0.36, 0.04) * warmQuarter * 0.085 * (0.5 + fresnel);

        // Molten 900C Brembo brake glow spill onto floor near the 4 wheels
        float brakeSpill = 0.0;
        brakeSpill += exp(-dot(p - vec2(-wheelX, -1.34), p - vec2(-wheelX, -1.34)) * 2.4);
        brakeSpill += exp(-dot(p - vec2( wheelX, -1.34), p - vec2( wheelX, -1.34)) * 2.4);
        brakeSpill += exp(-dot(p - vec2(-wheelX,  1.34), p - vec2(-wheelX,  1.34)) * 2.1) * 0.78;
        brakeSpill += exp(-dot(p - vec2( wheelX,  1.34), p - vec2( wheelX,  1.34)) * 2.1) * 0.78;
        baseCol += vec3(1.0, 0.30, 0.03) * brakeSpill * uBrakeHeat * 0.68;

        // Rear Aero Crimson LED tail-blade & twin-diffuser reflection ribbon behind z > +2.1m
        float tailPool = exp(-dot((p - vec2(0.0, 2.52)) * vec2(0.72, 0.98), (p - vec2(0.0, 2.52)) * vec2(0.72, 0.98)) * 0.95);
        baseCol += vec3(1.0, 0.10, 0.20) * tailPool * (0.45 + uTailGlow * 0.46) * (0.6 + fresnel * 0.7);

        // Front Xenon LED headlight blade floor reflection ahead of splitter (z < -2.35m)
        float headPool = exp(-dot((p - vec2(0.0, -2.82)) * vec2(0.86, 0.82), (p - vec2(0.0, -2.82)) * vec2(0.86, 0.82)) * 0.88);
        baseCol += vec3(0.80, 0.90, 1.0) * headPool * 0.22;

        // Grid & wind-tunnel datum lines
        vec3 gridCol = mix(vec3(0.30, 0.36, 0.46), vec3(1.0, 0.44, 0.02), uXray * 0.68);
        float gridMask = minorG * 0.13 + majorG * 0.28;
        baseCol = mix(baseCol, gridCol, gridMask * (1.0 - bodyAO * 0.75));

        // Datum rings accented in Molten Papaya
        vec3 ringCol = vec3(1.0, 0.44, 0.05);
        baseCol += ringCol * (ringOuter * 0.48 + ringInner * 0.22) * turntableFade * (1.0 - bodyAO * 0.85);

        // Apply physical contact occlusion shadow
        float shadowDarken = clamp(bodyAO * 0.85 + tireAO * 0.96, 0.0, 0.97);
        vec3 finalCol = mix(baseCol, vec3(0.007, 0.008, 0.012), shadowDarken);

        float alpha = clamp(radialFade * 0.90 + shadowDarken * 0.95, 0.0, 0.98) * smoothstep(9.6, 3.3, r);
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.0005;
  mesh.renderOrder = -1;

  return {
    mesh,
    update: (p) => {
      uniforms.uTime.value = p.time;
      uniforms.uTrackOffsetZ.value = p.trackOffsetZ;
      uniforms.uExplode.value = p.explodeFactor;
      uniforms.uLiveryColor.value.copy(p.liveryColor);
      uniforms.uBrakeHeat.value = p.brakeHeat;
      uniforms.uTailGlow.value = p.tailGlow;
      uniforms.uXray.value = p.xrayFactor;
      uniforms.uSpeedFactor.value = p.speedFactor;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
