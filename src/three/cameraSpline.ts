import * as THREE from 'three';

export interface SplinePose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  offsetXFrac: number; // Negative moves 3D car RIGHT (for LEFT UI card); Positive moves 3D car LEFT (for RIGHT UI card)
  rollDeg: number;
}

interface Waypoint {
  t: number;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  offsetXFrac: number;
  rollDeg: number;
}

// 13 Precision Waypoints spanning 0.00 -> 1.00 across the 6 Cinematic Acts
const WAYPOINTS: Waypoint[] = [
  // ACT 01 (0.00 - 0.16): Form Follows Downforce (Editorial LEFT -> Car RIGHT)
  {
    t: 0.0,
    pos: [5.25, 1.38, -6.20],
    target: [0.0, 0.48, 0.02],
    fov: 30.5,
    offsetXFrac: -0.108,
    rollDeg: 0,
  },
  {
    t: 0.09,
    pos: [3.60, 1.22, -6.55],
    target: [0.0, 0.46, -0.05],
    fov: 31.5,
    offsetXFrac: -0.095,
    rollDeg: -0.6,
  },

  // ACT 02 (0.16 - 0.34): Live CFD Wind Tunnel 800 KG @ 250 KM/H (Editorial RIGHT -> Car LEFT)
  {
    t: 0.18,
    pos: [-4.95, 1.56, -5.35],
    target: [0.0, 0.54, 0.04],
    fov: 33,
    offsetXFrac: 0.105,
    rollDeg: 0.5,
  },
  {
    t: 0.25,
    pos: [-6.35, 1.82, -3.85],
    target: [0.0, 0.56, 0.10],
    fov: 34,
    offsetXFrac: 0.112,
    rollDeg: 0.0,
  },
  {
    t: 0.32,
    pos: [-6.55, 2.05, 0.45],
    target: [0.0, 0.62, 0.12],
    fov: 34.5,
    offsetXFrac: 0.09,
    rollDeg: 0.0,
  },

  // ACT 03 (0.34 - 0.53): Monocage III 276-Mesh Anatomical Explosion (Editorial LEFT -> Car RIGHT)
  {
    t: 0.41,
    pos: [-6.65, 2.74, 5.55],
    target: [0.0, 0.64, -0.04],
    fov: 38,
    offsetXFrac: -0.105,
    rollDeg: 0.0,
  },
  {
    t: 0.50,
    pos: [-6.55, 2.68, 5.80],
    target: [0.0, 0.64, -0.04],
    fov: 38,
    offsetXFrac: -0.105,
    rollDeg: 0.0,
  },

  // ACT 04 (0.53 - 0.70): M840TR 4.0L Twin-Turbo V8 & 900C CCM-R Brakes (Editorial RIGHT -> Car LEFT)
  {
    t: 0.58,
    pos: [-4.15, 1.54, 2.95],
    target: [-0.15, 0.52, 0.20],
    fov: 32.5,
    offsetXFrac: 0.115,
    rollDeg: 0.0,
  },
  {
    t: 0.64,
    pos: [-4.05, 1.28, -1.85],
    target: [-0.22, 0.44, -0.35],
    fov: 32,
    offsetXFrac: 0.115,
    rollDeg: -0.6,
  },

  // ACT 05 (0.70 - 0.86): Apex Track Pursuit 340 KM/H (Editorial LEFT -> Car RIGHT)
  {
    t: 0.74,
    pos: [3.45, 0.90, 5.20],
    target: [0.0, 0.48, -0.35],
    fov: 43,
    offsetXFrac: -0.12,
    rollDeg: 1.6,
  },
  {
    t: 0.82,
    pos: [4.55, 0.98, 4.05],
    target: [0.0, 0.48, -0.20],
    fov: 41,
    offsetXFrac: -0.11,
    rollDeg: 1.1,
  },

  // ACT 06 (0.86 - 1.00): MSO Bespoke Specification Studio (Editorial RIGHT -> Car LEFT)
  {
    t: 0.92,
    pos: [-5.15, 1.44, -5.75],
    target: [0.0, 0.48, 0.02],
    fov: 31,
    offsetXFrac: 0.11,
    rollDeg: 0.0,
  },
  {
    t: 1.0,
    pos: [-5.35, 1.42, -5.95],
    target: [0.0, 0.48, 0.02],
    fov: 31,
    offsetXFrac: 0.11,
    rollDeg: 0.0,
  },
];

export class CameraSplineRig {
  private posCurve: THREE.CatmullRomCurve3;
  private targetCurve: THREE.CatmullRomCurve3;
  private denseSamples = 240;
  private scalarTable: { fov: number; offsetXFrac: number; rollDeg: number }[] = [];

  constructor() {
    // Re-sample waypoints uniformly along t in [0..1] so CatmullRomCurve3 parameter u matches scroll progress t closely
    const posPts: THREE.Vector3[] = [];
    const targetPts: THREE.Vector3[] = [];

    for (let i = 0; i <= this.denseSamples; i++) {
      const u = i / this.denseSamples;
      // Find bracketing waypoints
      let idx = 0;
      while (idx < WAYPOINTS.length - 2 && WAYPOINTS[idx + 1].t < u) {
        idx++;
      }
      const w0 = WAYPOINTS[Math.max(0, idx - 1)];
      const w1 = WAYPOINTS[idx];
      const w2 = WAYPOINTS[idx + 1];
      const w3 = WAYPOINTS[Math.min(WAYPOINTS.length - 1, idx + 2)];

      const span = Math.max(0.0001, w2.t - w1.t);
      const localT = THREE.MathUtils.clamp((u - w1.t) / span, 0, 1);
      // Smooth Hermite interpolation for scalar parameters, Catmull-Rom for 3D vectors
      const smoothT = localT * localT * (3 - 2 * localT);

      const p = catmullRomVec3(w0.pos, w1.pos, w2.pos, w3.pos, localT);
      const tgt = catmullRomVec3(w0.target, w1.target, w2.target, w3.target, localT);

      if (i % 8 === 0 || i === this.denseSamples) {
        posPts.push(p);
        targetPts.push(tgt);
      }

      this.scalarTable.push({
        fov: THREE.MathUtils.lerp(w1.fov, w2.fov, smoothT),
        offsetXFrac: THREE.MathUtils.lerp(w1.offsetXFrac, w2.offsetXFrac, smoothT),
        rollDeg: THREE.MathUtils.lerp(w1.rollDeg, w2.rollDeg, smoothT),
      });
    }

    this.posCurve = new THREE.CatmullRomCurve3(posPts, false, 'centripetal', 0.5);
    this.targetCurve = new THREE.CatmullRomCurve3(targetPts, false, 'centripetal', 0.5);
  }

  public evaluate(t: number, outPose?: SplinePose): SplinePose {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const pose: SplinePose = outPose ?? {
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      fov: 31,
      offsetXFrac: 0,
      rollDeg: 0,
    };

    this.posCurve.getPoint(clamped, pose.position);
    this.targetCurve.getPoint(clamped, pose.target);

    const fIdx = clamped * this.denseSamples;
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(this.denseSamples, i0 + 1);
    const frac = fIdx - i0;

    const s0 = this.scalarTable[i0];
    const s1 = this.scalarTable[i1];
    pose.fov = THREE.MathUtils.lerp(s0.fov, s1.fov, frac);
    pose.offsetXFrac = THREE.MathUtils.lerp(s0.offsetXFrac, s1.offsetXFrac, frac);
    pose.rollDeg = THREE.MathUtils.lerp(s0.rollDeg, s1.rollDeg, frac);

    return pose;
  }

  public applyToCamera(
    camera: THREE.PerspectiveCamera,
    pose: SplinePose,
    viewportWidth: number,
    viewportHeight: number,
    pointerX: number,
    pointerY: number,
    shakeOffset?: THREE.Vector3,
    footerLiftFrac = 0
  ): void {
    const aspect = viewportWidth / Math.max(viewportHeight, 1);
    const isMobile = viewportWidth < 920 || aspect < 0.95;

    // On portrait mobile viewports (e.g. 390x844), pull camera back along view ray & widen FOV slightly so 100% of 4.64m car fits edge-to-edge!
    const effectiveFov = isMobile ? Math.min(46, pose.fov + 12) : pose.fov;
    const viewRay = pose.position.clone().sub(pose.target);
    if (isMobile) {
      const mobileDistMult = THREE.MathUtils.clamp(0.84 / Math.max(aspect, 0.38), 1.18, 1.88);
      viewRay.multiplyScalar(mobileDistMult);
    } else if (footerLiftFrac > 0.01) {
      // Pull slightly back as full-width MSO colophon footer rises at 100% scroll so car breathes cleanly
      viewRay.multiplyScalar(1.0 + footerLiftFrac * 0.08);
    }

    // Subtle cursor-driven studio parallax
    const parallaxScale = isMobile ? 0.08 : 0.22;
    const camPos = pose.target.clone().add(viewRay);
    camPos.x += pointerX * parallaxScale;
    camPos.y = Math.max(0.28, camPos.y + pointerY * parallaxScale * 0.65);

    if (shakeOffset) {
      camPos.add(shakeOffset);
    }

    camera.fov = effectiveFov;
    camera.aspect = aspect;
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    if (Math.abs(pose.rollDeg) > 0.01) {
      const forward = pose.target.clone().sub(camPos).normalize();
      camera.up.applyAxisAngle(forward, THREE.MathUtils.degToRad(pose.rollDeg));
    }
    camera.lookAt(pose.target);

    if (isMobile) {
      // Shift 3D car upward into upper-middle stage above bottom-docked mobile card
      camera.setViewOffset(
        viewportWidth,
        viewportHeight,
        0,
        viewportHeight * 0.14,
        viewportWidth,
        viewportHeight
      );
    } else {
      // Positive offsetY shifts the 3D car UP on screen so at 100% scroll it clears the bottom colophon footer!
      const yOffset = viewportHeight * (-0.012 + footerLiftFrac * 0.105);
      camera.setViewOffset(
        viewportWidth,
        viewportHeight,
        pose.offsetXFrac * viewportWidth,
        yOffset,
        viewportWidth,
        viewportHeight
      );
    }

    camera.updateProjectionMatrix();
  }
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

function catmullRomVec3(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  t: number
): THREE.Vector3 {
  return new THREE.Vector3(
    catmullRomScalar(a[0], b[0], c[0], d[0], t),
    catmullRomScalar(a[1], b[1], c[1], d[1], t),
    catmullRomScalar(a[2], b[2], c[2], d[2], t)
  );
}
