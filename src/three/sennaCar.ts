import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { StudioAssets } from './studioEnv';
import type { CaliperOption, MsoLivery } from '../data/msoConfigs';

export type SubsystemCategory = 'all' | 'aero-clamshell' | 'powertrain-v8' | 'ccm-axles' | 'monocage-core';

interface ExplodablePart {
  group: THREE.Group;
  offset: THREE.Vector3;
  rotOffset: THREE.Euler;
  category: Exclude<SubsystemCategory, 'all'>;
  isExteriorShell: boolean;
  meshes: THREE.Mesh[];
}

interface WheelAssembly {
  corner: 'FL' | 'FR' | 'RL' | 'RR';
  explodeGroup: THREE.Group;
  spinPivot: THREE.Group;
  signX: number;
  axleWorldCenter: THREE.Vector3;
  radius: number;
}

export interface SennaAnchors {
  noseSplitter: THREE.Vector3;
  roofSnorkel: THREE.Vector3;
  rearWing: THREE.Vector3;
  v8Engine: THREE.Vector3;
  frontLeftBrake: THREE.Vector3;
  monocageCore: THREE.Vector3;
}

export interface SennaCarController {
  rootGroup: THREE.Group;
  chassisMotionGroup: THREE.Group;
  raycastMeshes: THREE.Mesh[];
  anchors: SennaAnchors;
  meshCount: number;
  vertexCount: number;
  applyLivery: (livery: MsoLivery) => void;
  applyCaliper: (caliper: CaliperOption) => void;
  setXrayMode: (enabled: boolean) => void;
  setSubsystemFocus: (category: SubsystemCategory) => void;
  update: (params: {
    dt: number;
    time: number;
    explodeFactor: number;
    drsFactor: number; // 0 = High Downforce 800kg, 1 = DRS Low Drag, -0.5 = Airbrake
    wheelSpeedKmh: number;
    brakeHeat: number; // 0..1 (900C at 1.0)
    tailFlare: number; // 0..1
    chassisPitch: number;
    chassisRoll: number;
    engineVibration: number;
  }) => void;
}

export async function loadSennaCar(
  studio: StudioAssets,
  initialLivery: MsoLivery,
  initialCaliper: CaliperOption,
  onProgress?: (pct: number) => void
): Promise<SennaCarController> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const gltf = await new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      `${import.meta.env.BASE_URL}models/mclaren.glb`,
      (res) => resolve(res.scene),
      (ev) => {
        if (onProgress && ev.total > 0) {
          onProgress(Math.min(0.95, ev.loaded / ev.total));
        }
      },
      (err) => reject(err)
    );
  });

  dracoLoader.dispose();

  const rootGroup = new THREE.Group();
  rootGroup.name = 'SennaRoot';

  const chassisMotionGroup = new THREE.Group();
  chassisMotionGroup.name = 'SennaChassisMotion';
  rootGroup.add(chassisMotionGroup);

  const modelHolder = new THREE.Group();
  modelHolder.name = 'SennaNormalizedHolder';
  modelHolder.add(gltf);
  chassisMotionGroup.add(modelHolder);

  // 1. Hide duplicate driver/Stig seat variant to eliminate seat Z-fighting
  gltf.traverse((obj) => {
    if (/stig/i.test(obj.name)) {
      obj.visible = false;
    }
  });

  // 2. Deterministic Orientation Check: verify nose (bumper_F) faces -Z and rear (bumper_R) faces +Z
  modelHolder.updateMatrixWorld(true);
  let frontZ = 0;
  let rearZ = 0;
  let foundFront = false;
  let foundRear = false;

  gltf.traverse((obj) => {
    if (!obj.visible) return;
    if (!foundFront && /bumper_F/i.test(obj.name)) {
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        frontZ = (b.min.z + b.max.z) * 0.5;
        foundFront = true;
      }
    }
    if (!foundRear && /bumper_R/i.test(obj.name)) {
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        rearZ = (b.min.z + b.max.z) * 0.5;
        foundRear = true;
      }
    }
  });

  if ((foundFront && foundRear && frontZ > rearZ) || (!foundFront && !foundRear)) {
    gltf.rotation.y = Math.PI;
  }

  // 3. Exact 4.64m Normalization, Centered in X/Z, Lowest Tire Vertex Resting at Y = 0.000m
  modelHolder.updateMatrixWorld(true);
  const rawBox = new THREE.Box3();
  const visibleMeshes: THREE.Mesh[] = [];
  let vertexCount = 0;

  gltf.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      // Check ancestor visibility
      let cur: THREE.Object3D | null = mesh;
      let vis = true;
      while (cur) {
        if (!cur.visible) {
          vis = false;
          break;
        }
        cur = cur.parent;
      }
      if (!vis) return;

      visibleMeshes.push(mesh);
      const posAttr = mesh.geometry.attributes.position;
      if (posAttr) vertexCount += posAttr.count;
      rawBox.expandByObject(mesh);
    }
  });

  const rawSize = rawBox.getSize(new THREE.Vector3());
  const targetLength = 4.64; // Exact normalized length in meters
  const uniformScale = targetLength / Math.max(rawSize.z, 0.001);
  modelHolder.scale.setScalar(uniformScale);
  modelHolder.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3();
  for (const m of visibleMeshes) {
    scaledBox.expandByObject(m);
  }
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

  modelHolder.position.set(
    -scaledCenter.x,
    -scaledBox.min.y,
    -scaledCenter.z
  );
  rootGroup.updateMatrixWorld(true);

  // 4. Studio-Grade Physical Materials Registry
  const primaryPaintMat = new THREE.MeshPhysicalMaterial({
    name: 'MSO_PrimaryPaint',
    color: new THREE.Color(initialLivery.primaryHex),
    metalness: initialLivery.metalness,
    roughness: initialLivery.roughness,
    clearcoat: initialLivery.clearcoat,
    clearcoatRoughness: initialLivery.clearcoatRoughness,
    envMapIntensity: 1.75,
  });

  const accentPaintMat = new THREE.MeshPhysicalMaterial({
    name: 'MSO_AccentPaint',
    color: new THREE.Color(initialLivery.accentHex),
    metalness: 0.36,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.6,
  });

  const glossCarbonMat = new THREE.MeshPhysicalMaterial({
    name: 'MSO_TwillCarbon',
    color: new THREE.Color(0x181c24),
    metalness: 0.30,
    roughness: 0.24,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    bumpMap: studio.carbonBumpMap,
    bumpScale: 0.0024,
    envMapIntensity: 1.55,
  });

  const satinRaceCarbonMat = new THREE.MeshPhysicalMaterial({
    name: 'MSO_SatinRaceParts',
    color: new THREE.Color(0x202530),
    metalness: 0.44,
    roughness: 0.38,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    bumpMap: studio.carbonBumpMap,
    bumpScale: 0.0016,
    envMapIntensity: 1.35,
  });

  const engineAlloyMat = new THREE.MeshPhysicalMaterial({
    name: 'M840TR_InconelAlloy',
    color: new THREE.Color(0x525b6e),
    metalness: 0.85,
    roughness: 0.28,
    clearcoat: 0.2,
    envMapIntensity: 1.75,
  });

  const chassisAlloyMat = new THREE.MeshStandardMaterial({
    name: 'Monocage_SuspensionAlloy',
    color: new THREE.Color(0x2e3442),
    metalness: 0.72,
    roughness: 0.35,
    envMapIntensity: 1.4,
  });

  const billetChromeMat = new THREE.MeshPhysicalMaterial({
    name: 'MSO_BilletChrome',
    color: new THREE.Color(0xdce4f0),
    metalness: 0.94,
    roughness: 0.13,
    clearcoat: 0.5,
    envMapIntensity: 1.9,
  });

  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    name: 'Senna_GorillaGlass',
    color: new THREE.Color(0x0f1622),
    transparent: true,
    opacity: 0.44,
    metalness: 0.12,
    roughness: 0.04,
    ior: 1.52,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.2,
    depthWrite: false,
  });

  const tireRubberMat = new THREE.MeshPhysicalMaterial({
    name: 'Pirelli_TrofeoR',
    color: new THREE.Color(0x15181f),
    metalness: 0.08,
    roughness: 0.62,
    clearcoat: 0.14,
    clearcoatRoughness: 0.45,
    envMapIntensity: 0.95,
  });

  const brakeRotorMat = new THREE.MeshPhysicalMaterial({
    name: 'Brembo_CCMR_Rotor',
    color: new THREE.Color(0x3b404a),
    metalness: 0.66,
    roughness: 0.33,
    bumpMap: studio.brakeBumpMap,
    bumpScale: 0.014,
    emissive: new THREE.Color(0xff4800),
    emissiveMap: studio.brakeThermalMap,
    emissiveIntensity: 0.0,
    envMapIntensity: 1.5,
  });

  const caliperMat = new THREE.MeshPhysicalMaterial({
    name: 'Brembo_MonoblockCaliper',
    color: new THREE.Color(initialCaliper.hex),
    metalness: 0.38,
    roughness: 0.19,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.65,
  });

  const alcantaraMat = new THREE.MeshStandardMaterial({
    name: 'Cabin_Alcantara',
    color: new THREE.Color(0x14171e),
    metalness: 0.05,
    roughness: 0.86,
    envMapIntensity: 0.7,
  });

  const stitchingMat = new THREE.MeshStandardMaterial({
    name: 'Cabin_ContrastStitching',
    color: new THREE.Color(initialCaliper.hex),
    metalness: 0.15,
    roughness: 0.5,
  });

  const grilleMat = new THREE.MeshStandardMaterial({
    name: 'Aero_MeshGrille',
    color: new THREE.Color(0x0b0d12),
    metalness: 0.55,
    roughness: 0.45,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    name: 'LED_HeadlightBlade',
    color: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0xe6f2ff),
    emissiveIntensity: 2.6,
    roughness: 0.1,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    name: 'LED_TaillightBlade',
    color: new THREE.Color(0xff1a30),
    emissive: new THREE.Color(0xff142b),
    emissiveIntensity: 2.8,
    roughness: 0.15,
  });

  const cockpitScreenMat = new THREE.MeshStandardMaterial({
    name: 'Telemetry_OLED',
    color: new THREE.Color(0x101824),
    emissive: new THREE.Color(0xff6b00),
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });

  // Ghosted X-Ray material for exterior clamshell panels when [X] CAD/CFD X-Ray is active
  const xrayShellMat = new THREE.MeshPhysicalMaterial({
    name: 'CAD_XRay_Shell',
    color: new THREE.Color(0x162030),
    transparent: true,
    opacity: 0.17,
    metalness: 0.2,
    roughness: 0.18,
    emissive: new THREE.Color(0xff6b00),
    emissiveIntensity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const originalMaterialMap = new Map<THREE.Mesh, THREE.Material>();

  for (const mesh of visibleMeshes) {
    const rawMatName = Array.isArray(mesh.material)
      ? (mesh.material[0]?.name || '')
      : (mesh.material?.name || '');
    const mName = `${mesh.parent?.name || ''}_${mesh.name}`.toLowerCase();
    const matKey = rawMatName.toLowerCase();

    let assigned: THREE.Material = satinRaceCarbonMat;

    if (mName.includes('taillight') || matKey === 'a_red') {
      assigned = taillightMat;
    } else if (mName.includes('display') || mName.includes('int_screen') || matKey.includes('intscreen') || matKey.includes('display')) {
      assigned = cockpitScreenMat;
    } else if (mName.includes('headlight') && matKey.includes('headlight')) {
      assigned = headlightMat;
    } else if (mName.includes('signal') || matKey.includes('signal') || matKey.includes('headlight')) {
      assigned = headlightMat;
    } else if (matKey === 'sennapaintmain') {
      assigned = primaryPaintMat;
    } else if (matKey === 'sennapaint') {
      assigned = accentPaintMat;
    } else if (matKey.includes('senna_glass')) {
      assigned = canopyGlassMat;
    } else if (matKey.includes('caliper')) {
      assigned = caliperMat;
    } else if (matKey.includes('amdb11_brake')) {
      assigned = brakeRotorMat;
    } else if (matKey.includes('scene_-_root') || mName.startsWith('object_4')) {
      assigned = tireRubberMat;
    } else if (matKey.includes('a_carbon') || matKey.includes('blacksenna')) {
      assigned = glossCarbonMat;
    } else if (matKey.includes('scintilla_engine')) {
      assigned = engineAlloyMat;
    } else if (matKey.includes('euansenna_main') || matKey.includes('scintilla_main')) {
      assigned = chassisAlloyMat;
    } else if (matKey.includes('chrome') || matKey.includes('mirror') || matKey.includes('intbadges')) {
      assigned = billetChromeMat;
    } else if (matKey.includes('cuciture') || matKey.includes('stitching') || matKey.includes('dot3')) {
      assigned = stitchingMat;
    } else if (matKey.includes('alcantara') || matKey.includes('mainint') || matKey.includes('carpet') || matKey.includes('cinture') || matKey.includes('plastic')) {
      assigned = alcantaraMat;
    } else if (matKey.includes('grille')) {
      assigned = grilleMat;
    } else if (matKey.includes('senna_raceparts')) {
      assigned = satinRaceCarbonMat;
    }

    mesh.material = assigned;
    originalMaterialMap.set(mesh, assigned);
  }

  // 5. Build 4 Coaxial Wheel + Tire Spin Pivots (0.000mm Wobble!)
  rootGroup.updateMatrixWorld(true);

  const quadrantWheelMeshes: Record<'FL' | 'FR' | 'RL' | 'RR', THREE.Mesh[]> = {
    FL: [],
    FR: [],
    RL: [],
    RR: [],
  };

  const assignedToSpecialPivot = new Set<THREE.Mesh>();

  // First pass: find the 4 wheel rim centroids from `wheel1paint` (excluding `seat` or `steer`)
  const rimBoxes: Record<'FL' | 'FR' | 'RL' | 'RR', THREE.Box3> = {
    FL: new THREE.Box3(),
    FR: new THREE.Box3(),
    RL: new THREE.Box3(),
    RR: new THREE.Box3(),
  };

  for (const mesh of visibleMeshes) {
    const fullName = `${mesh.parent?.name || ''}_${mesh.name}`;
    if (/wheel1paint/i.test(fullName) && !/seat|steer/i.test(fullName)) {
      const b = new THREE.Box3().setFromObject(mesh);
      const c = b.getCenter(new THREE.Vector3());
      const corner: 'FL' | 'FR' | 'RL' | 'RR' =
        c.z < 0 ? (c.x < 0 ? 'FL' : 'FR') : (c.x < 0 ? 'RL' : 'RR');
      quadrantWheelMeshes[corner].push(mesh);
      rimBoxes[corner].expandByObject(mesh);
      assignedToSpecialPivot.add(mesh);
    }
  }

  // Second pass: attach matching Pirelli Trofeo R tire meshes (`Object_4001..004`, dot stripped by GLTFLoader!) to their nearest rim centroid
  for (const mesh of visibleMeshes) {
    if (assignedToSpecialPivot.has(mesh)) continue;
    const fullName = `${mesh.parent?.name || ''}_${mesh.name}`;
    if (mesh.material === tireRubberMat || /object_4/i.test(fullName)) {
      const b = new THREE.Box3().setFromObject(mesh);
      const c = b.getCenter(new THREE.Vector3());
      const corner: 'FL' | 'FR' | 'RL' | 'RR' =
        c.z < 0 ? (c.x < 0 ? 'FL' : 'FR') : (c.x < 0 ? 'RL' : 'RR');
      const rimCenter = rimBoxes[corner].getCenter(new THREE.Vector3());
      if (c.distanceTo(rimCenter) < 0.45) {
        quadrantWheelMeshes[corner].push(mesh);
        rimBoxes[corner].expandByObject(mesh);
        assignedToSpecialPivot.add(mesh);
      }
    }
  }

  const wheelAssemblies: WheelAssembly[] = [];
  for (const corner of ['FL', 'FR', 'RL', 'RR'] as const) {
    const meshes = quadrantWheelMeshes[corner];
    if (meshes.length === 0) continue;

    // Combined bounding box of tire + rim gives true geometric cylinder center
    const combinedBox = rimBoxes[corner];
    const axleWorldCenter = combinedBox.getCenter(new THREE.Vector3());
    const size = combinedBox.getSize(new THREE.Vector3());
    const radius = Math.max(size.y, size.z) * 0.5;

    const explodeGroup = new THREE.Group();
    explodeGroup.name = `WheelExplode_${corner}`;
    chassisMotionGroup.add(explodeGroup);
    explodeGroup.updateMatrixWorld(true);

    const spinPivot = new THREE.Group();
    spinPivot.name = `WheelSpinPivot_${corner}`;
    const localCenter = chassisMotionGroup.worldToLocal(axleWorldCenter.clone());
    spinPivot.position.copy(localCenter);
    explodeGroup.add(spinPivot);
    spinPivot.updateMatrixWorld(true);

    for (const m of meshes) {
      spinPivot.attach(m);
    }

    wheelAssemblies.push({
      corner,
      explodeGroup,
      spinPivot,
      signX: axleWorldCenter.x < 0 ? -1 : 1,
      axleWorldCenter,
      radius: Math.max(radius, 0.32),
    });
  }

  // 6. Active Swan-Neck Rear Wing DRS Pivot (`euansenna_rear_spoiler_GTR`)
  const wingMeshes: THREE.Mesh[] = [];
  const wingBox = new THREE.Box3();
  for (const mesh of visibleMeshes) {
    if (assignedToSpecialPivot.has(mesh)) continue;
    const fullName = `${mesh.parent?.name || ''}_${mesh.name}`;
    if (/rear_spoiler_GTR/i.test(fullName)) {
      wingMeshes.push(mesh);
      wingBox.expandByObject(mesh);
      assignedToSpecialPivot.add(mesh);
    }
  }

  const wingExplodeGroup = new THREE.Group();
  wingExplodeGroup.name = 'WingExplodeGroup';
  chassisMotionGroup.add(wingExplodeGroup);
  wingExplodeGroup.updateMatrixWorld(true);

  const wingDrsPivot = new THREE.Group();
  wingDrsPivot.name = 'WingDrsPivot';
  let rearWingAnchor = new THREE.Vector3(0, 1.18, 2.05);
  if (wingMeshes.length > 0 && !wingBox.isEmpty()) {
    const wc = wingBox.getCenter(new THREE.Vector3());
    rearWingAnchor = wc.clone();
    const hingeWorld = new THREE.Vector3(
      wc.x,
      wingBox.min.y + (wingBox.max.y - wingBox.min.y) * 0.68,
      wingBox.min.z + (wingBox.max.z - wingBox.min.z) * 0.58
    );
    wingDrsPivot.position.copy(chassisMotionGroup.worldToLocal(hingeWorld));
    wingExplodeGroup.add(wingDrsPivot);
    wingDrsPivot.updateMatrixWorld(true);
    for (const m of wingMeshes) {
      wingDrsPivot.attach(m);
    }
  } else {
    wingExplodeGroup.add(wingDrsPivot);
  }

  // 7. Semantic 276-Mesh Anatomical Explosion Grouping (by assembly node)
  const explodableParts: ExplodablePart[] = [];

  // Register wing as an explodable aero part too
  if (wingMeshes.length > 0) {
    explodableParts.push({
      group: wingExplodeGroup,
      offset: new THREE.Vector3(0, 0.64, 0.34),
      rotOffset: new THREE.Euler(0.10, 0, 0),
      category: 'aero-clamshell',
      isExteriorShell: true,
      meshes: wingMeshes,
    });
  }

  // Register 4 wheel assemblies as explodable axle parts
  for (const w of wheelAssemblies) {
    explodableParts.push({
      group: w.explodeGroup,
      offset: new THREE.Vector3(w.signX * 0.86, 0.0, 0.0),
      rotOffset: new THREE.Euler(0, 0, 0),
      category: 'ccm-axles',
      isExteriorShell: false,
      meshes: quadrantWheelMeshes[w.corner],
    });
  }

  // Group remaining visible meshes by their immediate assembly parent name
  const assemblyBuckets = new Map<string, THREE.Mesh[]>();
  for (const mesh of visibleMeshes) {
    if (assignedToSpecialPivot.has(mesh)) continue;
    const key = mesh.parent?.name || mesh.name;
    const list = assemblyBuckets.get(key) || [];
    list.push(mesh);
    assemblyBuckets.set(key, list);
  }

  let v8Anchor = new THREE.Vector3(0, 0.56, 0.92);
  let flBrakeAnchor = new THREE.Vector3(-0.82, 0.34, -1.34);
  let snorkelAnchor = new THREE.Vector3(0, 1.19, 0.12);
  let splitterAnchor = new THREE.Vector3(0, 0.16, -2.24);

  for (const [assemblyName, meshes] of assemblyBuckets.entries()) {
    const b = new THREE.Box3();
    for (const m of meshes) b.expandByObject(m);
    const c = b.getCenter(new THREE.Vector3());
    const n = assemblyName.toLowerCase();
    const signX = Math.abs(c.x) < 0.08 ? 0 : c.x < 0 ? -1 : 1;

    let offset = new THREE.Vector3(0, 0, 0);
    let rotOffset = new THREE.Euler(0, 0, 0);
    let category: Exclude<SubsystemCategory, 'all'> = 'monocage-core';
    let isExteriorShell = false;

    if (n.includes('brakedisc')) {
      // Brembo CCM-R rotor + 6-piston caliper assembly steps half-way out along X axle
      const sX = c.x < 0 ? -1 : 1;
      offset.set(sX * 0.44, 0.0, 0.0);
      category = 'ccm-axles';
      if (c.x < 0 && c.z < 0) flBrakeAnchor = c.clone();
    } else if (/door_l|doorglass_l|doorpanel_l|mirror_l/.test(n)) {
      // Left McLaren Dihedral Door swings outward & upward!
      offset.set(-0.62, 0.52, -0.06);
      rotOffset.set(0.06, -0.14, 0.34);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (/door_r|doorglass_r|doorpanel_r|mirror_r/.test(n)) {
      // Right McLaren Dihedral Door swings outward & upward!
      offset.set(0.62, 0.52, -0.06);
      rotOffset.set(0.06, 0.14, -0.34);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('hood')) {
      offset.set(0, 0.48, -0.42);
      rotOffset.set(-0.12, 0, 0);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('bumper_f') || n.includes('headlight')) {
      offset.set(signX * 0.12, 0.12, -0.72);
      category = 'aero-clamshell';
      isExteriorShell = true;
      if (n.includes('bumper_f')) splitterAnchor = new THREE.Vector3(0, b.min.y + 0.08, b.min.z + 0.08);
    } else if (n.includes('fender_l') || n.includes('fender_r')) {
      const sX = n.includes('_l') ? -1 : 1;
      offset.set(sX * 0.54, 0.30, -0.20);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('roof_hardtop') || n.includes('windshield')) {
      offset.set(0, 0.68, 0.02);
      category = 'aero-clamshell';
      isExteriorShell = true;
      if (n.includes('roof_hardtop')) snorkelAnchor = new THREE.Vector3(0, b.max.y, c.z);
    } else if (n.includes('trunklid')) {
      offset.set(0, 0.72, 0.36);
      rotOffset.set(0.14, 0, 0);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('flank_hardtop')) {
      offset.set(0, 0.56, 0.44);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('flank_l') || n.includes('flank_r')) {
      const sX = n.includes('_l') ? -1 : 1;
      offset.set(sX * 0.56, 0.28, 0.34);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('sideskirt')) {
      const sX = n.includes('_l') ? -1 : 1;
      offset.set(sX * 0.48, -0.06, 0.0);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (n.includes('bumper_r')) {
      offset.set(0, 0.14, 0.76);
      category = 'aero-clamshell';
      isExteriorShell = true;
    } else if (
      /engine_v8|turbo|chargepipe|downpipe|header|exhaust|intake_pipe|intercooler|transaxle|transfercase|driveshaft/.test(n)
    ) {
      offset.set(signX * 0.14, 0.34, 0.18);
      category = 'powertrain-v8';
      if (n.includes('engine_v8')) v8Anchor = c.clone();
    } else if (
      /upperarm|lowerarm|hub|coilover|swaybar|tierod|halfshaft|radiator|radhose|wheelhouse/.test(n)
    ) {
      offset.set(signX * 0.22, 0.04, 0.0);
      category = 'ccm-axles';
    } else {
      // Monocage III core tub, seats, steering, subframes stay anchored at datum origin
      offset.set(0, 0, 0);
      category = 'monocage-core';
      // Outer body painted or glass skin on `euansenna_body` still ghosts in X-Ray mode
      isExteriorShell = false;
    }

    const partGroup = new THREE.Group();
    partGroup.name = `ExplodePart_${assemblyName}`;
    // Pivot around assembly centroid so dihedral door rotations pivot cleanly around the door!
    const localPivot = chassisMotionGroup.worldToLocal(c.clone());
    partGroup.position.copy(localPivot);
    chassisMotionGroup.add(partGroup);
    partGroup.updateMatrixWorld(true);

    for (const m of meshes) {
      partGroup.attach(m);
    }

    // Store base local position on userData for clean additive explosion offset
    partGroup.userData.basePos = localPivot.clone();

    explodableParts.push({
      group: partGroup,
      offset,
      rotOffset,
      category,
      isExteriorShell,
      meshes,
    });
  }

  // Ensure wheel & wing groups also store basePos
  wingExplodeGroup.userData.basePos = wingExplodeGroup.position.clone();
  for (const w of wheelAssemblies) {
    w.explodeGroup.userData.basePos = w.explodeGroup.position.clone();
  }

  // 8. Build CAD Technical Edge Wireframe Overlay for [X] X-Ray Mode
  const cadLineMatExterior = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xff6b00),
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  const cadLineMatInternal = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x7dd3fc),
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });

  const cadEdgeLines: THREE.LineSegments[] = [];
  for (const part of explodableParts) {
    for (const m of part.meshes) {
      const posAttr = m.geometry.attributes.position;
      if (!posAttr || posAttr.count < 24) continue;
      // Build crisp EdgesGeometry with 26-degree crease threshold
      const edgesGeo = new THREE.EdgesGeometry(m.geometry, 26);
      if (edgesGeo.attributes.position.count === 0) {
        edgesGeo.dispose();
        continue;
      }
      const lineMat = part.isExteriorShell ? cadLineMatExterior : cadLineMatInternal;
      const lineSeg = new THREE.LineSegments(edgesGeo, lineMat);
      lineSeg.visible = false;
      lineSeg.renderOrder = 4;
      m.add(lineSeg);
      cadEdgeLines.push(lineSeg);
    }
  }

  let xrayEnabled = false;
  let focusedCategory: SubsystemCategory = 'all';

  const syncMaterialStates = () => {
    for (const part of explodableParts) {
      const isDimmedByFocus =
        focusedCategory !== 'all' && part.category !== focusedCategory;

      for (const m of part.meshes) {
        const orig = originalMaterialMap.get(m)!;
        if (xrayEnabled) {
          // Ghost exterior aero clamshell & body paint panels to reveal Monocage III & M840TR V8 inside!
          const isPaintedBody =
            orig === primaryPaintMat ||
            orig === accentPaintMat ||
            (part.isExteriorShell && orig !== headlightMat && orig !== taillightMat);
          m.material = isPaintedBody ? xrayShellMat : orig;
        } else if (isDimmedByFocus) {
          m.material = xrayShellMat;
        } else {
          m.material = orig;
        }
      }
    }

    for (const line of cadEdgeLines) {
      line.visible = xrayEnabled;
    }
  };

  // Raycast silhouette meshes (exterior shell + body + glass + wing) for CFD streamline path tracing!
  const raycastMeshes = visibleMeshes.filter((m) => {
    const n = `${m.parent?.name || ''}_${m.name}`.toLowerCase();
    return /body|bumper|hood|fender|roof|windshield|door|flank|trunklid|rear_spoiler/.test(n);
  });

  const anchors: SennaAnchors = {
    noseSplitter: splitterAnchor,
    roofSnorkel: snorkelAnchor,
    rearWing: rearWingAnchor,
    v8Engine: v8Anchor,
    frontLeftBrake: flBrakeAnchor,
    monocageCore: new THREE.Vector3(0, 0.45, -0.10),
  };

  if (onProgress) onProgress(1.0);

  let currentDrsRot = 0;

  return {
    rootGroup,
    chassisMotionGroup,
    raycastMeshes: raycastMeshes.length > 10 ? raycastMeshes : visibleMeshes,
    anchors,
    meshCount: visibleMeshes.length,
    vertexCount,
    applyLivery: (livery: MsoLivery) => {
      primaryPaintMat.color.set(livery.primaryHex);
      primaryPaintMat.metalness = livery.metalness;
      primaryPaintMat.roughness = livery.roughness;
      primaryPaintMat.clearcoat = livery.clearcoat;
      primaryPaintMat.clearcoatRoughness = livery.clearcoatRoughness;
      if (livery.id === 'stealth-carbon') {
        primaryPaintMat.bumpMap = studio.carbonBumpMap;
        primaryPaintMat.bumpScale = 0.0024;
      } else {
        primaryPaintMat.bumpMap = null;
        primaryPaintMat.bumpScale = 0;
      }
      primaryPaintMat.needsUpdate = true;

      accentPaintMat.color.set(livery.accentHex);
      accentPaintMat.needsUpdate = true;
    },
    applyCaliper: (caliper: CaliperOption) => {
      caliperMat.color.set(caliper.hex);
      stitchingMat.color.set(caliper.hex);
    },
    setXrayMode: (enabled: boolean) => {
      xrayEnabled = enabled;
      syncMaterialStates();
    },
    setSubsystemFocus: (category: SubsystemCategory) => {
      focusedCategory = category;
      syncMaterialStates();
    },
    update: ({
      dt,
      time,
      explodeFactor,
      drsFactor,
      wheelSpeedKmh,
      brakeHeat,
      tailFlare,
      chassisPitch,
      chassisRoll,
      engineVibration,
    }) => {
      // Smoothly articulate 276-mesh anatomical explosion
      const easedExplode = THREE.MathUtils.smoothstep(explodeFactor, 0, 1);
      for (const part of explodableParts) {
        const basePos = part.group.userData.basePos as THREE.Vector3;
        part.group.position.set(
          basePos.x + part.offset.x * easedExplode,
          basePos.y + part.offset.y * easedExplode,
          basePos.z + part.offset.z * easedExplode
        );
        part.group.rotation.set(
          part.rotOffset.x * easedExplode,
          part.rotOffset.y * easedExplode,
          part.rotOffset.z * easedExplode
        );
      }

      // Active Swan-Neck Rear Wing DRS articulation (smoothly damped)
      const targetWingPitch = -drsFactor * 0.24;
      currentDrsRot = THREE.MathUtils.lerp(currentDrsRot, targetWingPitch, 1 - Math.exp(-10 * dt));
      wingDrsPivot.rotation.x = currentDrsRot;

      // Coaxial Wheel + Pirelli Tire Stroboscopic Rotation
      // v (m/s) = km/h / 3.6; omega (rad/s) = v / radius
      // Car faces -Z, so rolling forward (-Z) rotates around X with negative sign (top moves toward -Z)
      const speedMs = wheelSpeedKmh / 3.6;
      for (const w of wheelAssemblies) {
        const omega = speedMs / w.radius;
        w.spinPivot.rotation.x -= omega * dt;
      }

      // 900C Incandescent Brembo CCM-R Thermal Glow + Rear LED Tail-Blade Flare
      const flicker = 1.0 + Math.sin(time * 28.0) * 0.03 * brakeHeat;
      brakeRotorMat.emissiveIntensity = Math.pow(Math.max(brakeHeat, 0), 1.35) * 3.8 * flicker;
      taillightMat.emissiveIntensity = 2.4 + tailFlare * 3.2;

      // Dynamic RCC II Chassis Pitch, Roll & Flat-Plane V8 Torque Vibration
      const vibRoll = Math.sin(time * 62.0) * 0.0045 * engineVibration;
      const vibY = Math.cos(time * 88.0) * 0.0012 * engineVibration;
      chassisMotionGroup.rotation.x = chassisPitch;
      chassisMotionGroup.rotation.z = chassisRoll + vibRoll;
      chassisMotionGroup.position.y = vibY;
    },
  };
}
