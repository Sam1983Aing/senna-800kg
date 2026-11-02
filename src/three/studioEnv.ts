import * as THREE from 'three';

export interface StudioAssets {
  envMap: THREE.Texture;
  carbonBumpMap: THREE.CanvasTexture;
  brakeBumpMap: THREE.CanvasTexture;
  brakeThermalMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createStudioAssets(renderer: THREE.WebGLRenderer): StudioAssets {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x06070a);

  // Smooth studio sky/floor gradient dome
  const domeGeo = new THREE.SphereGeometry(28, 48, 32);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        float len = max(length(vWorldPos), 0.0001);
        vec3 dir = vWorldPos / len;
        float y = dir.y;
        vec3 nadir = vec3(0.025, 0.028, 0.038);
        vec3 horizon = vec3(0.11, 0.125, 0.16);
        vec3 zenith = vec3(0.04, 0.048, 0.068);
        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(max(y, 0.0001), 0.65))
          : mix(horizon, nadir, pow(max(-y, 0.0001), 0.55));
        // Subtle warm papaya horizon bounce on rear-left, cool titanium on front-right
        float warmRim = max(0.0, dot(dir, normalize(vec3(-0.75, 0.12, 0.65))));
        float coolRim = max(0.0, dot(dir, normalize(vec3(0.75, 0.18, -0.63))));
        col += vec3(0.55, 0.20, 0.03) * pow(max(warmRim, 0.0001), 5.0) * 0.65;
        col += vec3(0.16, 0.24, 0.38) * pow(max(coolRim, 0.0001), 4.0) * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Helper to create soft-edged HDR light panels for automotive contour reflections
  const makeSoftbox = (
    w: number,
    h: number,
    colorHex: number,
    intensity: number,
    pos: [number, number, number],
    lookAt: [number, number, number]
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const col = new THREE.Color(colorHex).multiplyScalar(intensity);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: col },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          vec2 d = abs(vUv - 0.5) * 2.0;
          float fx = 1.0 - smoothstep(0.62, 1.0, d.x);
          float fy = 1.0 - smoothstep(0.55, 1.0, d.y);
          float mask = pow(max(fx * fy, 0.0001), 1.35);
          gl_FragColor = vec4(uColor * mask, mask);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.lookAt(...lookAt);
    envScene.add(mesh);
    return { geo, mat };
  };

  const panels = [
    // Primary Woking wind-tunnel overhead linear spine softbox
    makeSoftbox(4.2, 17.5, 0xf8fafc, 5.2, [0, 9.5, 0], [0, 0, 0]),
    // Left & right 48-degree body shoulder contour strips (essential for Senna fender & dihedral glass lines!)
    makeSoftbox(2.4, 15.5, 0xeef4ff, 3.8, [-7.8, 5.4, 0], [0, 0.6, 0]),
    makeSoftbox(2.4, 15.5, 0xfff5eb, 3.8, [7.8, 5.4, 0], [0, 0.6, 0]),
    // Front nose splitter key fill
    makeSoftbox(7.5, 2.6, 0xdce8ff, 3.1, [0, 3.2, -11.5], [0, 0.5, 0]),
    // Rear swan-neck wing & diffuser warm Molten Papaya rim kicker
    makeSoftbox(8.5, 2.8, 0xff7b24, 3.6, [-3.0, 3.4, 11.5], [0, 0.7, 0]),
    // Low side sill accent strips so lower carbon rocker blades gleam cleanly
    makeSoftbox(1.1, 13.0, 0xc8d8f0, 2.2, [-9.5, 1.35, 0], [0, 0.35, 0]),
    makeSoftbox(1.1, 13.0, 0xff9a52, 2.0, [9.5, 1.35, 0], [0, 0.35, 0]),
  ];

  const renderTarget = pmrem.fromScene(envScene, 0.018);
  const envMap = renderTarget.texture;

  // Clean up temporary scene geometries
  domeGeo.dispose();
  domeMat.dispose();
  for (const p of panels) {
    p.geo.dispose();
    p.mat.dispose();
  }
  pmrem.dispose();

  const carbonBumpMap = createCarbonWeaveTexture();
  const { brakeBumpMap, brakeThermalMap } = createBrakeDiscTextures();

  return {
    envMap,
    carbonBumpMap,
    brakeBumpMap,
    brakeThermalMap,
    dispose: () => {
      renderTarget.dispose();
      carbonBumpMap.dispose();
      brakeBumpMap.dispose();
      brakeThermalMap.dispose();
    },
  };
}

function createCarbonWeaveTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#606060';
  ctx.fillRect(0, 0, size, size);

  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const phase = ((x / cell) + (y / cell)) % 4;
      const bright = phase < 2 ? 196 : 74;
      const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      grad.addColorStop(0, `rgb(${bright - 25},${bright - 25},${bright - 25})`);
      grad.addColorStop(0.5, `rgb(${bright},${bright},${bright})`);
      grad.addColorStop(1, `rgb(${bright - 35},${bright - 35},${bright - 35})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cell - 1, cell - 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 42);
  tex.needsUpdate = true;
  return tex;
}

function createBrakeDiscTextures(): {
  brakeBumpMap: THREE.CanvasTexture;
  brakeThermalMap: THREE.CanvasTexture;
} {
  const size = 512;

  // 1. Bump map with concentric carbon-ceramic grooves + cross-drilled cooling vents
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#888888';
  bCtx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  for (let r = 95; r < 244; r += 2.5) {
    const shade = 126 + Math.sin(r * 1.9) * 26;
    bCtx.strokeStyle = `rgb(${shade | 0},${shade | 0},${shade | 0})`;
    bCtx.lineWidth = 1.4;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.stroke();
  }

  // Curved radial cross-drilled Brembo CCM-R vents
  bCtx.fillStyle = '#141414';
  const arms = 24;
  for (let a = 0; a < arms; a++) {
    const baseAngle = (a / arms) * Math.PI * 2;
    for (let step = 0; step < 5; step++) {
      const r = 118 + step * 25;
      const theta = baseAngle + step * 0.065;
      const hx = cx + Math.cos(theta) * r;
      const hy = cy + Math.sin(theta) * r;
      bCtx.beginPath();
      bCtx.arc(hx, hy, 4.2, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  const brakeBumpMap = new THREE.CanvasTexture(bumpCanvas);
  brakeBumpMap.needsUpdate = true;

  // 2. Incandescent 900C thermal emissive map
  const thermCanvas = document.createElement('canvas');
  thermCanvas.width = size;
  thermCanvas.height = size;
  const tCtx = thermCanvas.getContext('2d')!;
  tCtx.fillStyle = '#000000';
  tCtx.fillRect(0, 0, size, size);

  const radGrad = tCtx.createRadialGradient(cx, cy, 88, cx, cy, 248);
  radGrad.addColorStop(0.0, '#000000');
  radGrad.addColorStop(0.14, '#3d0800');
  radGrad.addColorStop(0.35, '#ff4800');
  radGrad.addColorStop(0.62, '#ff881a');
  radGrad.addColorStop(0.86, '#ff3300');
  radGrad.addColorStop(1.0, '#120200');

  tCtx.fillStyle = radGrad;
  tCtx.beginPath();
  tCtx.arc(cx, cy, 248, 0, Math.PI * 2);
  tCtx.fill();

  // Darken drilled holes slightly for hyper-realistic glowing ceramic look
  tCtx.fillStyle = 'rgba(20, 4, 0, 0.72)';
  for (let a = 0; a < arms; a++) {
    const baseAngle = (a / arms) * Math.PI * 2;
    for (let step = 0; step < 5; step++) {
      const r = 118 + step * 25;
      const theta = baseAngle + step * 0.065;
      const hx = cx + Math.cos(theta) * r;
      const hy = cy + Math.sin(theta) * r;
      tCtx.beginPath();
      tCtx.arc(hx, hy, 4.0, 0, Math.PI * 2);
      tCtx.fill();
    }
  }

  const brakeThermalMap = new THREE.CanvasTexture(thermCanvas);
  brakeThermalMap.colorSpace = THREE.SRGBColorSpace;
  brakeThermalMap.needsUpdate = true;

  return { brakeBumpMap, brakeThermalMap };
}
