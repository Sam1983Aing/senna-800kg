import * as THREE from 'three';

export interface CfdAeroSystem {
  group: THREE.Group;
  update: (params: {
    time: number;
    cfdOpacity: number;
    drsFactor: number; // 0 = High Downforce 800kg, 1 = DRS Low Drag
    windSpeedKmh: number;
    pursuitOpacity: number; // Act 05 340 km/h speed streaks
  }) => void;
  dispose: () => void;
}

export function createCfdAeroSystem(raycastMeshes: THREE.Mesh[]): CfdAeroSystem {
  const group = new THREE.Group();
  group.name = 'CfdAeroSystem';

  // 1. Sample actual McLaren Senna 3D silhouette on a 19 x 33 grid via downward raycasting
  const NX = 19;
  const NZ = 33;
  const xMin = -1.04;
  const xMax = 1.04;
  const zMin = -2.42;
  const zMax = 2.38;

  const rawHeights = new Float32Array(NX * NZ);
  const raycaster = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();

  for (let iz = 0; iz < NZ; iz++) {
    const z = THREE.MathUtils.lerp(zMin, zMax, iz / (NZ - 1));
    for (let ix = 0; ix < NX; ix++) {
      const x = THREE.MathUtils.lerp(xMin, xMax, ix / (NX - 1));
      origin.set(x, 2.4, z);
      raycaster.set(origin, downDir);
      const hits = raycaster.intersectObjects(raycastMeshes, false);
      let maxH = 0.0;
      for (const h of hits) {
        if (h.point.y > maxH && h.point.y < 1.65) {
          maxH = h.point.y;
        }
      }
      rawHeights[iz * NX + ix] = maxH;
    }
  }

  // Smooth the heightfield (2 passes of separable box/Gaussian kernel) for laminar boundary-layer envelope
  const smoothHeights = new Float32Array(NX * NZ);
  for (let iz = 0; iz < NZ; iz++) {
    for (let ix = 0; ix < NX; ix++) {
      let sum = 0;
      let wSum = 0;
      for (let dz = -2; dz <= 2; dz++) {
        const jz = Math.min(NZ - 1, Math.max(0, iz + dz));
        for (let dx = -1; dx <= 1; dx++) {
          const jx = Math.min(NX - 1, Math.max(0, ix + dx));
          const w = (3 - Math.abs(dz)) * (2 - Math.abs(dx));
          sum += rawHeights[jz * NX + jx] * w;
          wSum += w;
        }
      }
      // Keep max between smoothed envelope and 96% of raw peak so ribbons never clip roof/wing
      smoothHeights[iz * NX + ix] = Math.max(sum / wSum, rawHeights[iz * NX + ix] * 0.97);
    }
  }

  const sampleCarHeight = (x: number, z: number): number => {
    if (z < zMin - 0.35 || z > zMax + 0.35 || Math.abs(x) > 1.12) return 0;
    const fx = THREE.MathUtils.clamp((x - xMin) / (xMax - xMin), 0, 1) * (NX - 1);
    const fz = THREE.MathUtils.clamp((z - zMin) / (zMax - zMin), 0, 1) * (NZ - 1);
    const ix0 = Math.floor(fx);
    const iz0 = Math.floor(fz);
    const ix1 = Math.min(NX - 1, ix0 + 1);
    const iz1 = Math.min(NZ - 1, iz0 + 1);
    const tx = fx - ix0;
    const tz = fz - iz0;

    const h00 = smoothHeights[iz0 * NX + ix0];
    const h10 = smoothHeights[iz0 * NX + ix1];
    const h01 = smoothHeights[iz1 * NX + ix0];
    const h11 = smoothHeights[iz1 * NX + ix1];
    const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
    const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
    let h = THREE.MathUtils.lerp(hx0, hx1, tz);

    // Taper smoothly outside nose/tail bounds
    if (z < zMin) {
      h *= THREE.MathUtils.smoothstep(z, zMin - 0.35, zMin);
    } else if (z > zMax) {
      h *= 1.0 - THREE.MathUtils.smoothstep(z, zMax, zMax + 0.35);
    }
    if (Math.abs(x) > xMax) {
      h *= 1.0 - THREE.MathUtils.smoothstep(Math.abs(x), xMax, 1.12);
    }
    return h;
  };

  // 2. Generate 56 3D Streamline Paths over the Senna's real geometry
  interface StreamSpec {
    points: THREE.Vector3[];
    pressures: number[]; // +1 Papaya stagnation -> 0 White laminar -> -1 Crimson vortex wake
    wakeWeights: number[];
    width: number;
    seed: number;
  }

  const streamSpecs: StreamSpec[] = [];
  const SEGMENTS = 54;
  const Z_START = -3.15;
  const Z_END = 3.65;

  // Regime A: 30 Upper Canopy, Hood, Snorkel & Swan-Neck Wing Ribbons (15 X lanes x 2 boundary layers)
  const upperLanes = 15;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < upperLanes; i++) {
      const laneT = i / (upperLanes - 1); // 0..1
      const baseX = THREE.MathUtils.lerp(-0.78, 0.78, laneT);
      const clearance = layer === 0 ? 0.048 : 0.165;
      const pts: THREE.Vector3[] = [];
      const pressures: number[] = [];
      const wakes: number[] = [];

      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS;
        const z = THREE.MathUtils.lerp(Z_START, Z_END, u);

        // Subtle aerodynamic contraction over teardrop greenhouse & expansion over rear fenders
        const greenhousePinch = 1.0 - 0.12 * Math.exp(-Math.pow((z - 0.15) / 0.95, 2));
        const x = baseX * greenhousePinch;

        const surfaceY = sampleCarHeight(x, z);
        const freestreamY = 0.17 + layer * 0.13 + Math.abs(baseX) * 0.05;

        // Smoothly climb from freestream over the Senna silhouette and launch into rear wing upwash wake
        let y = Math.max(freestreamY, surfaceY + clearance);

        let wakeWeight = 0;
        if (z > 1.85) {
          const dz = z - 1.85;
          wakeWeight = THREE.MathUtils.clamp(dz / 1.6, 0, 1);
          // High-downforce swan-neck wing kicks wake steeply upward (+0.32m) with subtle wingtip vortex curl
          const wingSpanMask = 1.0 - THREE.MathUtils.smoothstep(Math.abs(baseX), 0.55, 0.92) * 0.45;
          y = Math.max(y, (0.98 + layer * 0.12) * wingSpanMask + dz * 0.22 * wingSpanMask);
        }

        // Bernoulli Cp color mapping:
        // Front splitter stagnation (-2.5..-1.6) => +1.0 (Molten Papaya)
        // Canopy / snorkel acceleration (-1.1..+1.3) => 0.0 (Titanium White)
        // Swan-neck wing suction & wake (+1.4..+3.6) => -1.0 (Vortex Crimson)
        let cp = 0;
        if (z < -1.1) {
          cp = THREE.MathUtils.smoothstep(z, -3.1, -2.1) * (1.0 - THREE.MathUtils.smoothstep(z, -1.9, -1.0));
        } else if (z > 1.25) {
          cp = -THREE.MathUtils.smoothstep(z, 1.25, 2.25);
        }

        pts.push(new THREE.Vector3(x, y, z));
        pressures.push(cp);
        wakes.push(wakeWeight);
      }

      // Smooth curve via CatmullRomCurve3 so ribbons have zero polygonal kinks
      const curve = new THREE.CatmullRomCurve3(pts);
      const smoothPts = curve.getPoints(SEGMENTS);

      streamSpecs.push({
        points: smoothPts,
        pressures,
        wakeWeights: wakes,
        width: layer === 0 ? 0.024 : 0.017,
        seed: ((layer * upperLanes + i) * 0.6180339) % 1,
      });
    }
  }

  // Regime B: 16 Lateral Dihedral Side-Channel & Wheel-Arch Outwash Vortex Ribbons (8 per side)
  for (const signX of [-1, 1]) {
    for (let row = 0; row < 8; row++) {
      const rowT = row / 7;
      const baseH = THREE.MathUtils.lerp(0.18, 0.72, rowT);
      const pts: THREE.Vector3[] = [];
      const pressures: number[] = [];
      const wakes: number[] = [];

      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS;
        const z = THREE.MathUtils.lerp(Z_START, Z_END, u);

        // Flare around front/rear fenders (z = -1.35 and z = +1.35), tuck into dihedral door waist (z = 0.05)
        const frontArch = 0.14 * Math.exp(-Math.pow((z + 1.35) / 0.65, 2));
        const rearArch = 0.16 * Math.exp(-Math.pow((z - 1.35) / 0.72, 2));
        const doorTuck = -0.10 * Math.exp(-Math.pow((z - 0.05) / 0.75, 2));
        const bodyEnvelope = THREE.MathUtils.smoothstep(z, -2.7, -1.8) * (1.0 - THREE.MathUtils.smoothstep(z, 2.2, 3.4));

        let x = signX * (0.94 + rowT * 0.08 + (frontArch + rearArch + doorTuck) * bodyEnvelope);
        let y = baseH + 0.07 * Math.sin(u * Math.PI) * (1.0 - rowT * 0.4);

        let wakeWeight = 0;
        if (z > 2.0) {
          const dz = z - 2.0;
          wakeWeight = THREE.MathUtils.clamp(dz / 1.5, 0, 1);
          // Helical Gurney endplate tip vortex curl behind the car!
          const vortexAngle = dz * 2.1 + rowT * 1.8;
          x += signX * Math.cos(vortexAngle) * 0.06 * wakeWeight;
          y += (Math.sin(vortexAngle) * 0.06 + dz * 0.12) * wakeWeight;
        }

        let cp = 0;
        if (z < -1.2) {
          cp = 0.85 * THREE.MathUtils.smoothstep(z, -3.0, -2.1) * (1.0 - THREE.MathUtils.smoothstep(z, -1.9, -1.1));
        } else if (z > 1.35) {
          cp = -0.95 * THREE.MathUtils.smoothstep(z, 1.35, 2.35);
        }

        pts.push(new THREE.Vector3(x, y, z));
        pressures.push(cp);
        wakes.push(wakeWeight);
      }

      const curve = new THREE.CatmullRomCurve3(pts);
      streamSpecs.push({
        points: curve.getPoints(SEGMENTS),
        pressures,
        wakeWeights: wakes,
        width: 0.019,
        seed: ((30 + (signX > 0 ? 8 : 0) + row) * 0.6180339) % 1,
      });
    }
  }

  // Regime C: 10 Venturi Underfloor -> Twin Rear Diffuser Extraction Ribbons
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const baseX = THREE.MathUtils.lerp(-0.76, 0.76, t);
    const pts: THREE.Vector3[] = [];
    const pressures: number[] = [];
    const wakes: number[] = [];

    for (let s = 0; s <= SEGMENTS; s++) {
      const u = s / SEGMENTS;
      const z = THREE.MathUtils.lerp(Z_START, Z_END, u);

      // Route just outboard/underneath splitter & diffuser channels
      const x = baseX * (1.0 + 0.18 * THREE.MathUtils.smoothstep(z, 1.8, 3.5));
      let y = 0.055;
      let wakeWeight = 0;
      if (z > 1.95) {
        const dz = z - 1.95;
        wakeWeight = THREE.MathUtils.clamp(dz / 1.5, 0, 1);
        // Twin carbon diffuser upwash extraction plume
        y += Math.pow(dz, 1.25) * 0.25;
      }

      let cp = 0;
      if (z < -1.4) {
        cp = THREE.MathUtils.smoothstep(z, -3.0, -2.2) * (1.0 - THREE.MathUtils.smoothstep(z, -2.0, -1.4));
      } else if (z > 1.1) {
        cp = -THREE.MathUtils.smoothstep(z, 1.1, 2.1);
      }

      pts.push(new THREE.Vector3(x, y, z));
      pressures.push(cp);
      wakes.push(wakeWeight);
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    streamSpecs.push({
      points: curve.getPoints(SEGMENTS),
      pressures,
      wakeWeights: wakes,
      width: 0.022,
      seed: ((46 + i) * 0.6180339) % 1,
    });
  }

  // 3. Build Single Merged GPU Ribbon BufferGeometry for all 56 CFD Streamlines (1 Draw Call!)
  const numRibbons = streamSpecs.length;
  const ptsPerRibbon = SEGMENTS + 1;
  const vertsPerRibbon = ptsPerRibbon * 2;
  const trisPerRibbon = SEGMENTS * 2;

  const positions = new Float32Array(numRibbons * vertsPerRibbon * 3);
  const aProgress = new Float32Array(numRibbons * vertsPerRibbon);
  const aAcross = new Float32Array(numRibbons * vertsPerRibbon);
  const aSeed = new Float32Array(numRibbons * vertsPerRibbon);
  const aPressure = new Float32Array(numRibbons * vertsPerRibbon);
  const aWake = new Float32Array(numRibbons * vertsPerRibbon);
  const indices = new Uint32Array(numRibbons * trisPerRibbon * 3);

  const tangent = new THREE.Vector3();
  const upHint = new THREE.Vector3(0, 1, 0);
  const sideHint = new THREE.Vector3(1, 0, 0);
  const binormal = new THREE.Vector3();

  let vCursor = 0;
  let iCursor = 0;

  for (let r = 0; r < numRibbons; r++) {
    const spec = streamSpecs[r];
    const baseVertex = vCursor;

    for (let p = 0; p < ptsPerRibbon; p++) {
      const curr = spec.points[p];
      const prev = spec.points[Math.max(0, p - 1)];
      const next = spec.points[Math.min(ptsPerRibbon - 1, p + 1)];

      tangent.subVectors(next, prev);
      if (tangent.lengthSq() < 0.000001) tangent.set(0, 0, 1);
      else tangent.normalize();

      // Tilt ribbon normal slightly outward so ribbons read strongly from both top 3/4 and side views!
      upHint.set(curr.x * 0.45, 1.0, 0.0).normalize();
      binormal.crossVectors(tangent, upHint);
      if (binormal.lengthSq() < 0.0001) {
        binormal.crossVectors(tangent, sideHint);
      }
      binormal.normalize().multiplyScalar(spec.width * 0.5);

      const prog = p / SEGMENTS;
      const cp = spec.pressures[p];
      const wake = spec.wakeWeights[p];

      for (const side of [-1, 1]) {
        positions[vCursor * 3 + 0] = curr.x + binormal.x * side;
        positions[vCursor * 3 + 1] = curr.y + binormal.y * side;
        positions[vCursor * 3 + 2] = curr.z + binormal.z * side;

        aProgress[vCursor] = prog;
        aAcross[vCursor] = side;
        aSeed[vCursor] = spec.seed;
        aPressure[vCursor] = cp;
        aWake[vCursor] = wake;
        vCursor++;
      }

      if (p < SEGMENTS) {
        const i0 = baseVertex + p * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;

        indices[iCursor++] = i0;
        indices[iCursor++] = i1;
        indices[iCursor++] = i2;

        indices[iCursor++] = i1;
        indices[iCursor++] = i3;
        indices[iCursor++] = i2;
      }
    }
  }

  const ribbonGeo = new THREE.BufferGeometry();
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  ribbonGeo.setAttribute('aProgress', new THREE.BufferAttribute(aProgress, 1));
  ribbonGeo.setAttribute('aAcross', new THREE.BufferAttribute(aAcross, 1));
  ribbonGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  ribbonGeo.setAttribute('aPressure', new THREE.BufferAttribute(aPressure, 1));
  ribbonGeo.setAttribute('aWake', new THREE.BufferAttribute(aWake, 1));
  ribbonGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  const ribbonUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uDrsFactor: { value: 0 },
    uFlowRate: { value: 1.0 },
  };

  const ribbonMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: ribbonUniforms,
    vertexShader: /* glsl */ `
      attribute float aProgress;
      attribute float aAcross;
      attribute float aSeed;
      attribute float aPressure;
      attribute float aWake;

      uniform float uTime;
      uniform float uDrsFactor;

      varying float vProgress;
      varying float vAcross;
      varying float vSeed;
      varying float vPressure;
      varying float vWake;

      void main() {
        vProgress = aProgress;
        vAcross = aAcross;
        vSeed = aSeed;
        vPressure = aPressure;
        vWake = aWake;

        vec3 pos = position;
        // DRS Low-Drag mode flattens the rear swan-neck wing upwash plume dynamically!
        pos.y -= aWake * uDrsFactor * 0.24;
        // Subtle high-frequency Kármán vortex shimmer in rear wake
        float flutter = sin(uTime * 11.0 + aSeed * 31.4 + aProgress * 18.0) * 0.016 * aWake * (1.0 - uDrsFactor * 0.5);
        pos.y += flutter;
        pos.x += cos(uTime * 9.0 + aSeed * 25.1 + aProgress * 15.0) * 0.012 * aWake;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uDrsFactor;
      uniform float uFlowRate;

      varying float vProgress;
      varying float vAcross;
      varying float vSeed;
      varying float vPressure;
      varying float vWake;

      void main() {
        if (uOpacity <= 0.002) discard;

        // Smooth anti-aliased glowing ribbon core across width
        float core = 1.0 - abs(vAcross);
        float crossAlpha = pow(max(core, 0.0001), 1.45);

        // Smooth entry & exit fade at tunnel boundaries
        float endFade = smoothstep(0.0, 0.11, vProgress) * (1.0 - smoothstep(0.86, 1.0, vProgress));

        // Traveling high-velocity CFD wind packets moving nose (-Z) to tail (+Z)
        float phase1 = fract(vProgress * 2.4 - uTime * uFlowRate * 0.85 + vSeed);
        float packet1 = pow(max(1.0 - abs(phase1 - 0.5) * 2.0, 0.0001), 3.2);

        float phase2 = fract(vProgress * 5.0 - uTime * uFlowRate * 1.45 + vSeed * 1.7);
        float packet2 = pow(max(1.0 - abs(phase2 - 0.5) * 2.0, 0.0001), 5.0);

        float baseStream = 0.24 + packet1 * 0.65 + packet2 * 0.55;

        // Bernoulli Pressure / Velocity Palette:
        // +1: Molten McLaren Papaya (#FF6B00) front stagnation
        //  0: Pure Laminar Titanium White (#F8FAFC) acceleration
        // -1: Aero Vortex Crimson (#FF293E) low-pressure suction wake
        vec3 colPapaya = vec3(1.0, 0.42, 0.02);
        vec3 colLaminar = vec3(0.95, 0.98, 1.0);
        vec3 colCrimson = vec3(1.0, 0.14, 0.24);

        float p = vPressure;
        // In DRS Low-Drag mode, rear suction wake softens toward laminar white-amber
        p = mix(p, p * 0.38, vWake * uDrsFactor);

        vec3 col = p >= 0.0
          ? mix(colLaminar, colPapaya, clamp(p, 0.0, 1.0))
          : mix(colLaminar, colCrimson, clamp(-p, 0.0, 1.0));

        // Bright hot core inside fast packets
        col = mix(col, vec3(1.0, 1.0, 1.0), packet2 * core * 0.45);

        float alpha = crossAlpha * endFade * baseStream * uOpacity;
        gl_FragColor = vec4(col * (1.15 + packet2 * 0.5), clamp(alpha, 0.0, 0.96));
      }
    `,
  });

  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.frustumCulled = false;
  ribbonMesh.renderOrder = 5;
  group.add(ribbonMesh);

  // 4. Act 05 (340 KM/H Apex Track Pursuit) High-Speed Slipstream Streaks
  const STREAK_COUNT = 260;
  const streakPos = new Float32Array(STREAK_COUNT * 2 * 3);
  const streakMeta = new Float32Array(STREAK_COUNT * 2 * 3); // x: end(0/1), y: seed, z: colorMix

  for (let i = 0; i < STREAK_COUNT; i++) {
    // Distribute around a tunnel cylinder clearing the car center, plus low asphalt skimming streaks
    const angle = Math.random() * Math.PI * 2;
    const isLow = i % 3 === 0;
    const radius = isLow ? 1.25 + Math.random() * 2.8 : 1.55 + Math.random() * 2.9;
    const x = Math.cos(angle) * radius * (isLow ? (Math.random() > 0.5 ? 1 : -1) : 1);
    const y = isLow ? 0.04 + Math.random() * 0.35 : 0.15 + Math.abs(Math.sin(angle)) * (0.6 + Math.random() * 1.9);
    const zBase = (Math.random() - 0.5) * 14.0;
    const len = 0.75 + Math.random() * 1.65;
    const seed = Math.random();
    const colorMix = Math.random();

    // Head vertex
    streakPos[i * 6 + 0] = x;
    streakPos[i * 6 + 1] = y;
    streakPos[i * 6 + 2] = zBase;
    streakMeta[i * 6 + 0] = 0.0;
    streakMeta[i * 6 + 1] = seed;
    streakMeta[i * 6 + 2] = colorMix;

    // Tail vertex
    streakPos[i * 6 + 3] = x;
    streakPos[i * 6 + 4] = y;
    streakPos[i * 6 + 5] = zBase + len;
    streakMeta[i * 6 + 0] = 1.0;
    streakMeta[i * 6 + 1] = seed;
    streakMeta[i * 6 + 2] = colorMix;
  }

  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('aMeta', new THREE.BufferAttribute(streakMeta, 3));

  const streakUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };

  const streakMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: streakUniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aMeta;
      uniform float uTime;
      varying float vEnd;
      varying float vColorMix;
      varying float vZFade;

      void main() {
        vEnd = aMeta.x;
        vColorMix = aMeta.z;

        vec3 p = position;
        // Loop Z continuously from -8m to +8m at ferocious 340 km/h slipstream speed
        float span = 16.0;
        float travel = mod(p.z + 8.0 + uTime * (15.0 + aMeta.y * 9.0), span) - 8.0;
        // Keep tail attached to head without wrapping glitch
        float offsetLen = aMeta.x * (0.85 + aMeta.y * 1.15);
        p.z = travel + offsetLen;

        vZFade = 1.0 - smoothstep(4.5, 8.0, abs(travel));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vEnd;
      varying float vColorMix;
      varying float vZFade;

      void main() {
        if (uOpacity <= 0.002) discard;
        vec3 cWhite = vec3(0.92, 0.96, 1.0);
        vec3 cPapaya = vec3(1.0, 0.44, 0.04);
        vec3 cCrimson = vec3(1.0, 0.16, 0.25);

        vec3 col = vColorMix < 0.65
          ? cWhite
          : (vColorMix < 0.85 ? cPapaya : cCrimson);

        float alpha = (1.0 - vEnd) * vZFade * uOpacity * 0.62;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  streakLines.frustumCulled = false;
  streakLines.renderOrder = 6;
  group.add(streakLines);

  return {
    group,
    update: ({ time, cfdOpacity, drsFactor, windSpeedKmh, pursuitOpacity }) => {
      ribbonUniforms.uTime.value = time;
      ribbonUniforms.uOpacity.value = cfdOpacity;
      ribbonUniforms.uDrsFactor.value = drsFactor;
      ribbonUniforms.uFlowRate.value = THREE.MathUtils.clamp(windSpeedKmh / 250, 0.45, 1.65);
      ribbonMesh.visible = cfdOpacity > 0.003;

      streakUniforms.uTime.value = time;
      streakUniforms.uOpacity.value = pursuitOpacity;
      streakLines.visible = pursuitOpacity > 0.003;
    },
    dispose: () => {
      ribbonGeo.dispose();
      ribbonMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
    },
  };
}
