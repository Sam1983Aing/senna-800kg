import './style.css';
import * as THREE from 'three';
import { ACTS, CALIPER_OPTIONS, MSO_LIVERIES, type CaliperOption, type MsoLivery } from './data/msoConfigs';
import { createStudioAssets } from './three/studioEnv';
import { createFloorStage } from './three/floorStage';
import { loadSennaCar, type SennaCarController, type SubsystemCategory } from './three/sennaCar';
import { createCfdAeroSystem, type CfdAeroSystem } from './three/cfdStreamlines';
import { CameraSplineRig, type SplinePose } from './three/cameraSpline';
import { M840trAudioEngine } from './audio/v8Audio';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  const loaderCurtain = document.getElementById('loader-curtain')!;
  const loaderFill = document.getElementById('loader-bar-fill')!;
  const loaderPct = document.getElementById('loader-pct')!;
  const loaderStatus = document.getElementById('loader-status')!;

  // 1. Studio WebGL2 Renderer (alpha: true for Spatial Depth Typography Sandwich!)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.12, 85);

  // 2. Procedural HDR Wind-Tunnel Studio Environment
  const studio = createStudioAssets(renderer);
  scene.environment = studio.envMap;
  scene.environmentIntensity = 1.34;

  // Dynamic Scene Lighting
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x12151f, 0.56);
  scene.add(hemiLight);

  const keySoftboxLight = new THREE.DirectionalLight(0xffffff, 2.38);
  keySoftboxLight.position.set(2.5, 7.5, -3.5);
  scene.add(keySoftboxLight);

  const rimPapayaLight = new THREE.DirectionalLight(0xff7a1f, 1.48);
  rimPapayaLight.position.set(-5.5, 3.2, 5.5);
  scene.add(rimPapayaLight);

  const coolFillLight = new THREE.DirectionalLight(0xa5c8ff, 1.15);
  coolFillLight.position.set(5.5, 2.6, 4.0);
  scene.add(coolFillLight);

  // Molten 900C Brembo Rotor Point Lights & Crimson Taillight Point Light
  const brakeGlowLightFL = new THREE.PointLight(0xff4d00, 0, 2.6, 2.0);
  brakeGlowLightFL.position.set(-0.92, 0.34, -1.34);
  scene.add(brakeGlowLightFL);

  const brakeGlowLightRL = new THREE.PointLight(0xff4d00, 0, 2.6, 2.0);
  brakeGlowLightRL.position.set(-0.92, 0.36, 1.34);
  scene.add(brakeGlowLightRL);

  const tailCrimsonLight = new THREE.PointLight(0xff1932, 0.85, 3.8, 1.8);
  tailCrimsonLight.position.set(0, 0.68, 2.52);
  scene.add(tailCrimsonLight);

  // 3. Wind-Tunnel Specular & Contact-Shadow Floor Plane
  const floorStage = createFloorStage();
  scene.add(floorStage.mesh);

  // Application Interactive State
  let activeLivery: MsoLivery = MSO_LIVERIES[0];
  let activeCaliper: CaliperOption = CALIPER_OPTIONS[0];
  let xrayMode = false;
  let drsLowDrag = false;
  let windTunnelSpeedKmh = 250;
  let manualExplodeOverride: number | null = null;
  let isRevving = false;
  let paceAirbrakeMode = false;

  // 4. Load Real 364k-Vertex McLaren Senna GLB & Trace 56 Live CFD Streamlines
  let senna: SennaCarController | null = null;
  let cfdSystem: CfdAeroSystem | null = null;

  try {
    senna = await loadSennaCar(studio, activeLivery, activeCaliper, (pct) => {
      const p = Math.round(pct * 100);
      loaderFill.style.width = `${Math.max(12, p)}%`;
      loaderPct.textContent = `${String(p).padStart(2, '0')}%`;
    });
    scene.add(senna.rootGroup);

    const meshBadge = document.getElementById('mesh-count-badge');
    if (meshBadge) {
      meshBadge.textContent = `${senna.meshCount} CAD MESHES · ${Math.round(senna.vertexCount / 1000)}K VERTS`;
    }

    loaderStatus.textContent = 'COMPUTING 56 BERNOULLI CFD STREAMLINES...';
    cfdSystem = createCfdAeroSystem(senna.raycastMeshes);
    scene.add(cfdSystem.group);
  } catch (err) {
    console.error('Failed to load Senna GLB:', err);
  } finally {
    loaderFill.style.width = '100%';
    loaderPct.textContent = '100%';
    requestAnimationFrame(() => {
      loaderCurtain.classList.add('is-loaded');
    });
  }

  // 5. Audio Engine & Camera Spline Rig
  const audio = new M840trAudioEngine();
  const splineRig = new CameraSplineRig();
  const currentPose: SplinePose = splineRig.evaluate(0);

  // 6. DOM References & Interactive UI Wiring
  const backdropWordStage = document.getElementById('backdrop-word-stage')!;
  const backdropWordEl = document.getElementById('backdrop-word')!;
  const backdropSubEl = document.getElementById('backdrop-sub')!;
  const backdropGlowEl = document.getElementById('backdrop-glow')!;
  const actCard5 = document.getElementById('act-card-5')!;

  const teleSpeedEl = document.getElementById('tele-speed')!;
  const teleDownforceEl = document.getElementById('tele-downforce')!;
  const teleWingEl = document.getElementById('tele-wing')!;
  const teleBrakeEl = document.getElementById('tele-brake')!;
  const teleBoostEl = document.getElementById('tele-boost')!;

  const splinePctEl = document.getElementById('spline-pct')!;
  const splineFillEl = document.getElementById('spline-fill')!;
  const splineThumbEl = document.getElementById('spline-thumb')!;
  const splineTrackEl = document.getElementById('spline-track')!;
  const actDots = Array.from(document.querySelectorAll<HTMLButtonElement>('.act-dot'));
  const actCards = Array.from(document.querySelectorAll<HTMLElement>('.act-card'));

  const btnXray = document.getElementById('btn-xray')!;
  const btnAudio = document.getElementById('btn-audio')!;
  const audioLabel = document.getElementById('audio-label')!;

  const scrollToFraction = (frac: number, instant = false) => {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({
      top: THREE.MathUtils.clamp(frac, 0, 1) * maxScroll,
      behavior: instant ? 'instant' : 'smooth',
    });
  };

  document.getElementById('brand-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToFraction(0);
  });

  for (const dot of actDots) {
    dot.addEventListener('click', () => {
      const idx = Number(dot.dataset.act || 0);
      const act = ACTS[idx];
      if (act) scrollToFraction(act.peakScroll);
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-jump-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.jumpAct || 0);
      const act = ACTS[idx];
      if (act) scrollToFraction(act.peakScroll);
    });
  });

  // Interactive Vertical Spline Scrub Bar Dragging
  let isScrubbingSpline = false;
  const scrubFromClientY = (clientY: number) => {
    const rect = splineTrackEl.getBoundingClientRect();
    const frac = THREE.MathUtils.clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
    scrollToFraction(frac, true);
  };
  splineTrackEl.addEventListener('pointerdown', (e) => {
    isScrubbingSpline = true;
    splineTrackEl.setPointerCapture(e.pointerId);
    scrubFromClientY(e.clientY);
  });
  splineTrackEl.addEventListener('pointermove', (e) => {
    if (isScrubbingSpline) scrubFromClientY(e.clientY);
  });
  splineTrackEl.addEventListener('pointerup', () => {
    isScrubbingSpline = false;
  });

  // [X] CAD & CFD Telemetry X-Ray Toggle
  const toggleXray = () => {
    xrayMode = !xrayMode;
    btnXray.classList.toggle('is-active', xrayMode);
    senna?.setXrayMode(xrayMode);
  };
  btnXray.addEventListener('click', toggleXray);

  // Procedural Web Audio Toggle
  const syncAudioUi = (on: boolean) => {
    btnAudio.classList.toggle('is-active', on);
    audioLabel.textContent = on ? 'V8 SYNTH LIVE' : 'V8 SYNTH OFF';
  };
  btnAudio.addEventListener('click', async () => {
    const on = await audio.toggle();
    syncAudioUi(on);
  });

  // Act 02: DRS Wing Mode, Wind Tunnel Velocity Slider & Live SVG Quadratic Load Curve
  const btnDrsDownforce = document.getElementById('btn-drs-downforce')!;
  const btnDrsLowdrag = document.getElementById('btn-drs-lowdrag')!;
  const drsReadoutEl = document.getElementById('drs-readout')!;
  const sliderWindSpeed = document.getElementById('slider-wind-speed') as HTMLInputElement;
  const windSpeedValEl = document.getElementById('wind-speed-val')!;
  const cfdCurveCursor = document.getElementById('cfd-curve-cursor')!;
  const cfdCurveDot = document.getElementById('cfd-curve-dot')!;
  const cfdActivePath = document.getElementById('cfd-active-path')!;
  const cfdCurveLiveTag = document.getElementById('cfd-curve-live-tag')!;

  const updateAeroReadouts = () => {
    const ratio = windTunnelSpeedKmh / 250;
    const rawDf = 800.4 * ratio * ratio * (drsLowDrag ? 0.56 : 1.0);
    const clampedDf = Math.min(drsLowDrag ? 540.0 : 800.4, rawDf);
    const aoa = drsLowDrag ? -2.0 : 16.8;
    drsReadoutEl.textContent = `AoA ${aoa.toFixed(1)}° // ${clampedDf.toFixed(1)} KG`;
    windSpeedValEl.textContent = `${windTunnelSpeedKmh} KM/H`;
    cfdCurveLiveTag.textContent = `${windTunnelSpeedKmh} KM/H // ${clampedDf.toFixed(1)} KG`;

    // Update SVG sparkline operating cursor (x: 28..346 for 160..340 km/h; y: 62..14 for 0..800.4 kg)
    const u = THREE.MathUtils.clamp((windTunnelSpeedKmh - 160) / (340 - 160), 0, 1);
    const cx = 28 + u * (346 - 28);
    const cy = 62 - (clampedDf / 800.4) * (62 - 14);
    cfdCurveCursor.setAttribute('x1', cx.toFixed(1));
    cfdCurveCursor.setAttribute('x2', cx.toFixed(1));
    cfdCurveDot.setAttribute('cx', cx.toFixed(1));
    cfdCurveDot.setAttribute('cy', cy.toFixed(1));
    cfdActivePath.setAttribute(
      'd',
      drsLowDrag ? 'M 28 54 Q 130 43 212 31 L 346 29' : 'M 28 49 Q 128 31 212 14 L 346 14'
    );
    cfdActivePath.setAttribute('stroke', drsLowDrag ? '#38bdf8' : '#ff6b00');
    cfdCurveDot.setAttribute('fill', drsLowDrag ? '#38bdf8' : '#ff6b00');

    updateDossierFields();
  };

  btnDrsDownforce.addEventListener('click', () => {
    drsLowDrag = false;
    btnDrsDownforce.classList.add('is-selected');
    btnDrsLowdrag.classList.remove('is-selected');
    updateAeroReadouts();
  });

  btnDrsLowdrag.addEventListener('click', () => {
    drsLowDrag = true;
    btnDrsLowdrag.classList.add('is-selected');
    btnDrsDownforce.classList.remove('is-selected');
    updateAeroReadouts();
  });

  sliderWindSpeed.addEventListener('input', () => {
    windTunnelSpeedKmh = Number(sliderWindSpeed.value);
    updateAeroReadouts();
  });

  // Act 03: Manual Explosion Override Slider & Subsystem Filter Chips
  const sliderExplode = document.getElementById('slider-explode') as HTMLInputElement;
  const explodeValEl = document.getElementById('explode-val')!;
  const btnExplodeAuto = document.getElementById('btn-explode-auto')!;
  const subsystemLabelEl = document.getElementById('subsystem-label')!;
  const subChips = Array.from(document.querySelectorAll<HTMLButtonElement>('.sub-chip'));

  sliderExplode.addEventListener('input', () => {
    manualExplodeOverride = Number(sliderExplode.value) / 100;
    explodeValEl.textContent = `MANUAL ${sliderExplode.value}%`;
    btnExplodeAuto.classList.remove('is-active');
  });

  btnExplodeAuto.addEventListener('click', () => {
    manualExplodeOverride = null;
    explodeValEl.textContent = 'AUTO SPLINE';
    btnExplodeAuto.classList.add('is-active');
  });

  const subLabels: Record<SubsystemCategory, string> = {
    all: 'ALL 276 ASSEMBLIES',
    'aero-clamshell': 'CARBON AERO CLAMSHELL',
    'powertrain-v8': 'M840TR 4.0L V8 & TURBOS',
    'ccm-axles': 'BREMBO CCM-R & RCC II',
    'monocage-core': 'MONOCAGE III CORE',
  };

  for (const chip of subChips) {
    chip.addEventListener('click', () => {
      const cat = (chip.dataset.sub || 'all') as SubsystemCategory;
      subChips.forEach((c) => c.classList.toggle('is-selected', c === chip));
      subsystemLabelEl.textContent = subLabels[cat];
      senna?.setSubsystemFocus(cat);
    });
  }

  // Act 04: HOLD TO REV // LAUNCH CONTROL Pedal + 3-Bar Live Telemetry Meter
  const btnRevPedal = document.getElementById('btn-rev-pedal')!;
  const dynoRpmEl = document.getElementById('dyno-rpm')!;
  const dynoBoostEl = document.getElementById('dyno-boost')!;
  const dynoTempEl = document.getElementById('dyno-temp')!;
  const rpmBarFillEl = document.getElementById('rpm-bar-fill')!;
  const boostBarFillEl = document.getElementById('boost-bar-fill')!;
  const tempBarFillEl = document.getElementById('temp-bar-fill')!;

  const startRev = async () => {
    isRevving = true;
    btnRevPedal.classList.add('is-revving');
    if (!audio.isEnabled()) {
      const ok = await audio.enable();
      syncAudioUi(ok);
    }
  };
  const stopRev = () => {
    isRevving = false;
    btnRevPedal.classList.remove('is-revving');
  };

  btnRevPedal.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    void startRev();
  });
  window.addEventListener('pointerup', stopRev);
  window.addEventListener('pointercancel', stopRev);

  // Act 05: Track Pace Mode Toggle
  const btnPaceVmax = document.getElementById('btn-pace-vmax')!;
  const btnPaceBrake = document.getElementById('btn-pace-brake')!;
  const paceModeReadoutEl = document.getElementById('pace-mode-readout')!;
  const pursuitGearEl = document.getElementById('pursuit-gear')!;

  btnPaceVmax.addEventListener('click', () => {
    paceAirbrakeMode = false;
    btnPaceVmax.classList.add('is-selected');
    btnPaceBrake.classList.remove('is-selected');
    paceModeReadoutEl.textContent = 'V-MAX 340 KM/H';
  });
  btnPaceBrake.addEventListener('click', () => {
    paceAirbrakeMode = true;
    btnPaceBrake.classList.add('is-selected');
    btnPaceVmax.classList.remove('is-selected');
    paceModeReadoutEl.textContent = '2.84G AIRBRAKE 900°C';
  });

  // Act 06: MSO Bespoke Diagonal-Split Metallic Swatch Tiles & Brembo Caliper Swatches
  const liverySwatchRow = document.getElementById('livery-swatch-row')!;
  const caliperSwatchRow = document.getElementById('caliper-swatch-row')!;
  const liveryNameReadout = document.getElementById('livery-name-readout')!;
  const liveryDescEl = document.getElementById('livery-desc')!;
  const caliperNameReadout = document.getElementById('caliper-name-readout')!;
  const msoLivePriceEl = document.getElementById('mso-live-price')!;

  // Modal elements
  const dossierModal = document.getElementById('dossier-modal')!;
  const dosLivery = document.getElementById('dos-livery')!;
  const dosCaliper = document.getElementById('dos-caliper')!;
  const dosWing = document.getElementById('dos-wing')!;
  const dosPriceGbp = document.getElementById('dos-price-gbp')!;
  const dosPriceAlt = document.getElementById('dos-price-alt')!;

  const updateDossierFields = () => {
    dosLivery.textContent = `${activeLivery.name} (${activeLivery.code})`;
    dosCaliper.textContent = `${activeCaliper.name} (${activeCaliper.code})`;
    dosWing.textContent = drsLowDrag
      ? 'DRS Low-Drag Trim · -2.0° AoA (340 km/h V-Max)'
      : 'High Downforce Trim · +16.8° AoA (800.4 kg @ 250 km/h)';

    const baseGbp = 875000 + activeLivery.priceDeltaGbp;
    const chf = Math.round(baseGbp * 1.14);
    const eur = Math.round(baseGbp * 1.19);
    const gbpText = `GBP ${baseGbp.toLocaleString('en-US')}`;
    dosPriceGbp.textContent = gbpText;
    msoLivePriceEl.textContent = gbpText;
    dosPriceAlt.textContent = `CHF ${chf.toLocaleString('en-US')} // EUR ${eur.toLocaleString('en-US')}`;
  };

  MSO_LIVERIES.forEach((liv, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `livery-swatch${i === 0 ? ' is-selected' : ''}`;
    btn.style.background = liv.swatchGradient;
    const shortCode = liv.code.split('-')[1] || 'MSO';
    btn.innerHTML = `
      <span class="livery-swatch-accent" style="background:${liv.accentHex}"></span>
      <span class="livery-swatch-code">${shortCode}</span>
    `;
    btn.title = `${liv.name} (${liv.code})`;
    btn.setAttribute('aria-label', liv.name);
    btn.addEventListener('click', () => {
      activeLivery = liv;
      liveryNameReadout.textContent = liv.name.toUpperCase();
      liveryDescEl.textContent = liv.description;
      liverySwatchRow.querySelectorAll('.livery-swatch').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      senna?.applyLivery(liv);
      updateDossierFields();
    });
    liverySwatchRow.appendChild(btn);
  });

  CALIPER_OPTIONS.forEach((cal, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `caliper-swatch${i === 0 ? ' is-selected' : ''}`;
    btn.innerHTML = `<span class="caliper-dot" style="background:${cal.hex}"></span><span>${cal.name.split(' ').pop()?.toUpperCase()}</span>`;
    btn.title = cal.name;
    btn.addEventListener('click', () => {
      activeCaliper = cal;
      caliperNameReadout.textContent = cal.name.toUpperCase();
      caliperSwatchRow.querySelectorAll('.caliper-swatch').forEach((el) => el.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      senna?.applyCaliper(cal);
      updateDossierFields();
    });
    caliperSwatchRow.appendChild(btn);
  });

  updateAeroReadouts();

  // Modal Open / Close / Print / Submit
  const openModal = () => {
    updateDossierFields();
    dossierModal.hidden = false;
  };
  const closeModal = () => {
    dossierModal.hidden = true;
  };

  document.getElementById('btn-open-dossier')?.addEventListener('click', openModal);
  document.getElementById('btn-cta-dossier')?.addEventListener('click', openModal);
  document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
  dossierModal.addEventListener('click', (e) => {
    if (e.target === dossierModal) closeModal();
  });
  document.getElementById('btn-print-dossier')?.addEventListener('click', () => {
    window.print();
  });

  const allocationForm = document.getElementById('allocation-form') as HTMLFormElement;
  const allocationConfirm = document.getElementById('allocation-confirm')!;
  allocationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameVal = (document.getElementById('inp-name') as HTMLInputElement).value.trim();
    const circuitInput = allocationForm.querySelector<HTMLInputElement>('input[name="circuit"]:checked');
    const circuitName = circuitInput?.value || 'Silverstone GP Circuit';
    const refId = `MSO-P15-341-${Math.floor(1000 + Math.random() * 9000)}`;
    allocationConfirm.hidden = false;
    allocationConfirm.textContent = `CONFIRMED // REF ${refId}: Telemetry dossier for ${activeLivery.name} dispatched for ${nameVal}. Pit Garage 01 reserved at ${circuitName}.`;
  });

  // Keyboard Shortcuts: [X] X-Ray, [Space] Hold-to-Rev, [Escape] Close Modal
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'x' || e.key === 'X') {
      toggleXray();
    } else if (e.code === 'Space' && dossierModal.hidden) {
      if (smoothScroll > 0.50 && smoothScroll < 0.72) {
        e.preventDefault();
        if (!isRevving) void startRev();
      }
    } else if (e.key === 'Escape' && !dossierModal.hidden) {
      closeModal();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && isRevving) {
      stopRev();
    }
  });

  // 7. Collision-Free 3D-Projected CAD/CFD Telemetry Callouts with 1px SVG Leader Lines!
  interface CalloutPin {
    id: string;
    title: string;
    metric: string;
    getAnchor: () => THREE.Vector3;
    visibleInActs: number[];
    prefOffset: [number, number]; // [dx, dy] preferred offset from 3D anchor dot to card top-left
    onClick: () => void;
    dotEl: HTMLDivElement;
    cardEl: HTMLDivElement;
    lineEl: SVGPolylineElement;
  }

  const calloutLayer = document.getElementById('callout-layer')!;
  const calloutSvg = document.getElementById('callout-svg') as unknown as SVGSVGElement;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const pins: CalloutPin[] = [];

  if (senna) {
    const s = senna;
    const pinDefs: Omit<CalloutPin, 'dotEl' | 'cardEl' | 'lineEl'>[] = [
      {
        id: 'splitter',
        title: 'CARBON FRONT SPLITTER',
        metric: 'Cp +0.94 // +218 KG FRONT LOAD',
        getAnchor: () => s.anchors.noseSplitter,
        visibleInActs: [1],
        prefOffset: [16, -64],
        onClick: () => {
          drsLowDrag = false;
          btnDrsDownforce.click();
        },
      },
      {
        id: 'ccmr',
        title: 'BREMBO CCM-R 390MM ROTOR',
        metric: '900°C PEAK // 200-0 IN 100.0M',
        getAnchor: () => s.anchors.frontLeftBrake,
        visibleInActs: [3],
        prefOffset: [22, 34],
        onClick: () => {
          void startRev();
          setTimeout(stopRev, 850);
        },
      },
      {
        id: 'monocage',
        title: 'MONOCAGE III SAFETY CELL',
        metric: '78.2 KG // 39,000 NM/DEG',
        getAnchor: () => s.anchors.monocageCore,
        visibleInActs: [2],
        prefOffset: [-190, -72],
        onClick: () => {
          subChips[0]?.click();
        },
      },
      {
        id: 'v8',
        title: 'M840TR 4.0L TWIN-TURBO V8',
        metric: '800 PS // +1.42 BAR INCONEL',
        getAnchor: () => s.anchors.v8Engine,
        visibleInActs: [2, 3],
        prefOffset: [-50, 48],
        onClick: () => {
          if (activeActIndex === 2) subChips[2]?.click();
        },
      },
      {
        id: 'wing',
        title: 'SWAN-NECK DUAL WING',
        metric: '6,500 CM² // 800.4 KG @ 250 KM/H',
        getAnchor: () => s.anchors.rearWing,
        visibleInActs: [1, 2],
        prefOffset: [28, -68],
        onClick: () => {
          if (activeActIndex === 1) {
            if (drsLowDrag) btnDrsDownforce.click();
            else btnDrsLowdrag.click();
          }
        },
      },
    ];

    for (const def of pinDefs) {
      const lineEl = document.createElementNS(SVG_NS, 'polyline');
      lineEl.setAttribute('fill', 'none');
      lineEl.setAttribute('stroke', 'rgba(255, 107, 0, 0.72)');
      lineEl.setAttribute('stroke-width', '1');
      lineEl.style.display = 'none';
      calloutSvg.appendChild(lineEl);

      const dotEl = document.createElement('div');
      dotEl.className = 'cad-anchor-dot is-hidden';
      calloutLayer.appendChild(dotEl);

      const cardEl = document.createElement('div');
      cardEl.className = 'cad-label-card is-hidden';
      cardEl.innerHTML = `${def.title}<em>${def.metric}</em>`;
      cardEl.addEventListener('click', def.onClick);
      calloutLayer.appendChild(cardEl);

      pins.push({ ...def, dotEl, cardEl, lineEl });
    }
  }

  // 8. Pointer Tracking & Viewport Resize
  let targetPointerX = 0;
  let targetPointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;

  window.addEventListener('pointermove', (e) => {
    targetPointerX = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
    targetPointerY = -((e.clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
  });

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 9. Main 60/120fps Render & Physics Choreography Loop
  const getRawScrollFraction = (): number => {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
  };

  let smoothScroll = getRawScrollFraction();
  let activeActIndex = -1;
  let currentRpm = 1050;
  let currentBrakeHeat = 0;
  let currentCfdOpacity = 0;
  let trackOffsetZ = 0;
  let lastGearNum = 7;
  let shiftLunge = 0;

  const liveryThreeColor = new THREE.Color(activeLivery.primaryHex);
  const projVec = new THREE.Vector3();
  const shakeVec = new THREE.Vector3();

  let prevTime = performance.now() * 0.001;

  const determineActIndex = (t: number): number => {
    if (t < 0.16) return 0;
    if (t < 0.34) return 1;
    if (t < 0.535) return 2;
    if (t < 0.70) return 3;
    if (t < 0.86) return 4;
    return 5;
  };

  const backdropSubtitles = [
    'WOKING WIND TUNNEL // CHASSIS #341',
    'BERNOULLI STREAMLINE CORRELATION // 250 KM/H',
    '276-MESH AUTOCLAVED CARBON DECONSTRUCTION',
    '3,994 CC FLAT-PLANE CRANK // 900°C CCM-R',
    'SILVERSTONE HANGAR STRAIGHT // 2.84G RCC II',
    'MCLAREN SPECIAL OPERATIONS // 1 OF 500',
  ];

  interface ActivePinLayout {
    pin: CalloutPin;
    ax: number;
    ay: number;
    bx: number;
    by: number;
  }

  const CARD_W = 214;
  const CARD_H = 38;
  const MIN_VERT_SEP = 56; // Guaranteed >= 56px vertical center-to-center / top-to-top separation!

  const tick = (nowMs: number) => {
    requestAnimationFrame(tick);

    const now = nowMs * 0.001;
    const dt = Math.min(0.05, Math.max(0.001, now - prevTime));
    prevTime = now;

    // Silky damped scroll interpolation
    const rawScroll = getRawScrollFraction();
    const prevSmooth = smoothScroll;
    smoothScroll = THREE.MathUtils.lerp(smoothScroll, rawScroll, 1 - Math.exp(-9.5 * dt));
    if (Math.abs(rawScroll - smoothScroll) < 0.00015) smoothScroll = rawScroll;
    const scrollVelocity = (smoothScroll - prevSmooth) / dt;

    // Footer Stage Lift as visitor reaches 100% scroll (so car, Act 06 MSO plaque, and Colophon Footer compose seamlessly!)
    const footerLiftFrac = THREE.MathUtils.smoothstep(smoothScroll, 0.90, 0.995);

    // Smooth pointer interpolation -> shifts studio overhead softbox reflection across hood & glass!
    smoothPointerX = THREE.MathUtils.lerp(smoothPointerX, targetPointerX, 1 - Math.exp(-6.0 * dt));
    smoothPointerY = THREE.MathUtils.lerp(smoothPointerY, targetPointerY, 1 - Math.exp(-6.0 * dt));
    keySoftboxLight.position.set(
      2.5 + smoothPointerX * 2.6,
      7.5 + smoothPointerY * 1.2,
      -3.5 + smoothPointerY * 1.6
    );

    // Update Spline Scrub Bar UI
    const pctInt = Math.round(smoothScroll * 100);
    splinePctEl.textContent = `${String(pctInt).padStart(2, '0')}%`;
    splineFillEl.style.height = `${smoothScroll * 100}%`;
    splineThumbEl.style.top = `${smoothScroll * 100}%`;
    splineTrackEl.setAttribute('aria-valuenow', String(pctInt));

    // Active Act Transition & Spatial Depth Typography Backdrop Update
    const newActIdx = determineActIndex(smoothScroll);
    if (newActIdx !== activeActIndex) {
      activeActIndex = newActIdx;
      const act = ACTS[activeActIndex];

      backdropWordEl.textContent = act.backdropTitle;
      backdropSubEl.textContent = backdropSubtitles[activeActIndex];

      actCards.forEach((card, i) => card.classList.toggle('is-active', i === activeActIndex));
      actDots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeActIndex));

      if (activeActIndex !== 2 && senna) {
        senna.setSubsystemFocus('all');
        subChips.forEach((c, idx) => c.classList.toggle('is-selected', idx === 0));
        subsystemLabelEl.textContent = subLabels.all;
      }
    }

    // Evaluate 3D Catmull-Rom Camera Spline
    splineRig.evaluate(smoothScroll, currentPose);

    // Lift Act 06 MSO Atelier Plaque & Spatial Backdrop gracefully above the Colophon Footer at 100% scroll
    const act6TopPct = THREE.MathUtils.lerp(52.5, 42.0, footerLiftFrac);
    actCard5.style.setProperty('--act6-top', `${act6TopPct.toFixed(2)}%`);
    const backdropTopVh = THREE.MathUtils.lerp(19.0, 12.8, footerLiftFrac);
    backdropWordStage.style.setProperty('--backdrop-top', `${backdropTopVh.toFixed(2)}vh`);

    const carSideVw = -currentPose.offsetXFrac * 82;
    const skewDeg = THREE.MathUtils.clamp(-scrollVelocity * 16, -8.5, 8.5);
    const parallaxY = (smoothScroll - ACTS[activeActIndex].peakScroll) * -36;
    backdropWordStage.style.setProperty('--backdrop-x', `${carSideVw.toFixed(2)}vw`);
    backdropWordStage.style.setProperty('--backdrop-y', `${parallaxY.toFixed(1)}px`);
    backdropWordStage.style.setProperty('--backdrop-skew', `${skewDeg.toFixed(2)}deg`);
    backdropGlowEl.style.transform = `translate3d(calc(-50% + ${(carSideVw * 0.65).toFixed(1)}vw), -50%, 0)`;

    // Compute Act-Driven 3D Physics Envelopes
    const autoExplode =
      THREE.MathUtils.smoothstep(smoothScroll, 0.345, 0.425) *
      (1.0 - THREE.MathUtils.smoothstep(smoothScroll, 0.505, 0.565));

    const effectiveExplode =
      manualExplodeOverride !== null && activeActIndex === 2
        ? manualExplodeOverride
        : autoExplode;

    if (manualExplodeOverride === null && activeActIndex === 2) {
      sliderExplode.value = String(Math.round(effectiveExplode * 100));
    }

    const act2Cfd =
      THREE.MathUtils.smoothstep(smoothScroll, 0.145, 0.195) *
      (1.0 - THREE.MathUtils.smoothstep(smoothScroll, 0.325, 0.365));
    const targetCfdOpacity = Math.max(act2Cfd, xrayMode ? 0.92 : 0.0);
    currentCfdOpacity = THREE.MathUtils.lerp(currentCfdOpacity, targetCfdOpacity, 1 - Math.exp(-8.0 * dt));

    const pursuitEnv =
      THREE.MathUtils.smoothstep(smoothScroll, 0.685, 0.73) *
      (1.0 - THREE.MathUtils.smoothstep(smoothScroll, 0.845, 0.885));

    let currentSpeedKmh = 0;
    let activeGearStr = ACTS[activeActIndex].telemetry.gear;
    let targetRpm = 1050;
    let targetBoost = 0.0;
    let targetBrakeHeat = 0.0;
    let targetDrs = drsLowDrag ? 1.0 : 0.0;
    let chassisPitch = 0;

    if (activeActIndex === 1) {
      currentSpeedKmh = windTunnelSpeedKmh;
      targetRpm = 3800 + (windTunnelSpeedKmh - 160) * 18;
      targetBoost = 0.65 + ((windTunnelSpeedKmh - 160) / 180) * 0.65;
      targetBrakeHeat = 0.12;
    } else if (activeActIndex === 3 || isRevving) {
      currentSpeedKmh = isRevving ? 268 : 195;
      targetRpm = isRevving ? 8380 + Math.sin(now * 38) * 110 : 3650 + Math.sin(now * 2.2) * 140;
      targetBoost = isRevving ? 1.42 : 0.92;
      targetBrakeHeat = isRevving ? 1.0 : 0.95; // Blazing 890-900C CCM-R rotors in Act 04!
      if (isRevving) {
        chassisPitch = -0.012;
      }
    } else if (pursuitEnv > 0.05) {
      if (paceAirbrakeMode) {
        currentSpeedKmh = 218;
        targetRpm = 6950;
        targetBoost = 0.45;
        targetBrakeHeat = 0.98;
        targetDrs = -0.75;
        chassisPitch = 0.018;
        activeGearStr = '4';
      } else {
        const cycle = (now * 0.28) % 1;
        const gearNum = cycle < 0.30 ? 5 : cycle < 0.62 ? 6 : 7;
        if (gearNum !== lastGearNum) {
          lastGearNum = gearNum;
          shiftLunge = 1.0;
          if (activeActIndex === 4) audio.triggerUpshiftBark();
        }
        const gearLocal = cycle < 0.30 ? cycle / 0.30 : cycle < 0.62 ? (cycle - 0.30) / 0.32 : (cycle - 0.62) / 0.38;
        currentSpeedKmh = Math.round(276 + cycle * 64);
        targetRpm = 6100 + gearLocal * 2250;
        targetBoost = 1.38;
        targetBrakeHeat = 0.64;
        targetDrs = 0.85;
        activeGearStr = String(gearNum);
      }
    }

    shiftLunge = THREE.MathUtils.lerp(shiftLunge, 0, 1 - Math.exp(-7.5 * dt));
    chassisPitch -= shiftLunge * 0.016 * pursuitEnv;

    currentRpm = THREE.MathUtils.lerp(currentRpm, targetRpm, 1 - Math.exp(-10.0 * dt));
    currentBrakeHeat = THREE.MathUtils.lerp(currentBrakeHeat, targetBrakeHeat, 1 - Math.exp(-5.5 * dt));

    const shakeAmp = pursuitEnv * 0.008 + (isRevving ? 0.006 : 0) + shiftLunge * 0.015 * pursuitEnv;
    shakeVec.set(
      Math.sin(now * 43.0) * shakeAmp,
      Math.cos(now * 57.0) * shakeAmp * 0.8,
      Math.sin(now * 31.0) * shakeAmp
    );

    splineRig.applyToCamera(
      camera,
      currentPose,
      window.innerWidth,
      window.innerHeight,
      smoothPointerX,
      smoothPointerY,
      shakeVec,
      footerLiftFrac
    );

    const wheelSpeed =
      activeActIndex === 1
        ? windTunnelSpeedKmh * 0.65
        : activeActIndex === 3 || isRevving
          ? (isRevving ? 260 : 95)
          : currentSpeedKmh * pursuitEnv;

    trackOffsetZ += (wheelSpeed / 3.6) * dt;

    const tailFlare = Math.max(pursuitEnv * (paceAirbrakeMode ? 1.0 : 0.65), isRevving ? 0.85 : 0.18);
    senna?.update({
      dt,
      time: now,
      explodeFactor: effectiveExplode,
      drsFactor: targetDrs,
      wheelSpeedKmh: wheelSpeed,
      brakeHeat: currentBrakeHeat,
      tailFlare,
      chassisPitch,
      chassisRoll: 0,
      engineVibration: isRevving ? 1.0 : activeActIndex === 3 ? 0.25 : pursuitEnv * 0.35,
    });

    const brakeLightIntensity = Math.pow(Math.max(currentBrakeHeat, 0), 1.35) * 3.5;
    brakeGlowLightFL.intensity = brakeLightIntensity;
    brakeGlowLightRL.intensity = brakeLightIntensity * 0.8;
    tailCrimsonLight.intensity = 0.85 + tailFlare * 2.6;

    cfdSystem?.update({
      time: now,
      cfdOpacity: currentCfdOpacity * (1.0 - effectiveExplode * 0.65),
      drsFactor: Math.max(0, targetDrs),
      windSpeedKmh: activeActIndex === 1 ? windTunnelSpeedKmh : Math.max(250, currentSpeedKmh),
      pursuitOpacity: pursuitEnv,
    });

    liveryThreeColor.set(activeLivery.primaryHex);
    floorStage.update({
      time: now,
      trackOffsetZ,
      explodeFactor: effectiveExplode,
      liveryColor: liveryThreeColor,
      brakeHeat: currentBrakeHeat,
      tailGlow: 0.38 + tailFlare * 0.85,
      xrayFactor: xrayMode ? 1.0 : 0.0,
      speedFactor: pursuitEnv,
    });

    audio.update({
      rpm: currentRpm,
      throttle: isRevving ? 1.0 : pursuitEnv > 0.2 ? (paceAirbrakeMode ? 0.2 : 0.88) : activeActIndex === 1 ? 0.35 : 0.08,
      boostBar: targetBoost,
      windIntensity: Math.max(currentCfdOpacity * 0.75, pursuitEnv * 0.95),
      windSpeedKmh: activeActIndex === 1 ? windTunnelSpeedKmh : Math.max(180, currentSpeedKmh),
    });

    // Update Live Header & Act 04/05 Telemetry DOM Readouts
    const liveDf =
      currentSpeedKmh > 10
        ? Math.min(targetDrs > 0.5 ? 540 : 800.4, 800.4 * Math.pow(currentSpeedKmh / 250, 2) * (targetDrs > 0.5 ? 0.56 : 1.0))
        : ACTS[activeActIndex].telemetry.downforceKg;
    const liveWingDeg = THREE.MathUtils.lerp(16.8, -2.0, THREE.MathUtils.clamp((targetDrs + 0.2) / 1.2, 0, 1));
    const liveTempC = Math.round(72 + currentBrakeHeat * 836);

    teleSpeedEl.innerHTML = `${String(Math.round(currentSpeedKmh)).padStart(3, '0')} <small>KM/H</small>`;
    teleDownforceEl.innerHTML = `${liveDf.toFixed(1)} <small>KG</small>`;
    teleWingEl.innerHTML = `${liveWingDeg.toFixed(1)}<small>°</small>`;
    teleBrakeEl.innerHTML = `${String(liveTempC).padStart(3, '0')} <small>°C</small>`;
    teleBrakeEl.classList.toggle('accent-crimson', liveTempC > 550);
    teleBoostEl.innerHTML = `+${targetBoost.toFixed(2)} <small>BAR</small>`;

    if (activeActIndex === 3 || isRevving) {
      dynoRpmEl.innerHTML = `${Math.round(currentRpm).toLocaleString('en-US')} <small>/ 8,500 RPM</small>`;
      dynoBoostEl.innerHTML = `+${targetBoost.toFixed(2)} <small>/ +1.42 BAR</small>`;
      dynoTempEl.innerHTML = `${liveTempC} <small>/ 900 °C</small>`;
      rpmBarFillEl.style.width = `${THREE.MathUtils.clamp((currentRpm / 8500) * 100, 8, 100)}%`;
      boostBarFillEl.style.width = `${THREE.MathUtils.clamp((targetBoost / 1.42) * 100, 6, 100)}%`;
      tempBarFillEl.style.width = `${THREE.MathUtils.clamp((liveTempC / 910) * 100, 10, 100)}%`;
    }

    if (activeActIndex === 4) {
      pursuitGearEl.textContent = `G${activeGearStr}`;
    }

    // 10. 2D Screen-Space Collision-Free Callout Layout & 1px SVG Leader Lines!
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw >= 920 && senna) {
      const cardIsLeft = ACTS[activeActIndex].align === 'left';
      // Safe horizontal stage zone strictly outside the active editorial panel & right spline rail
      const safeMinX = cardIsLeft ? 515 : 22;
      const safeMaxX = cardIsLeft ? vw - 68 : vw - 535;
      const safeMinY = 78;
      const safeMaxY = vh - (footerLiftFrac > 0.2 ? 235 : 68);

      const visibleLayouts: ActivePinLayout[] = [];

      for (const pin of pins) {
        const shouldShow = (xrayMode || pin.visibleInActs.includes(activeActIndex)) && footerLiftFrac < 0.5;
        if (!shouldShow) {
          pin.dotEl.classList.add('is-hidden');
          pin.cardEl.classList.add('is-hidden');
          pin.lineEl.style.display = 'none';
          continue;
        }

        projVec.copy(pin.getAnchor());
        projVec.project(camera);

        if (projVec.z > 0.99 || projVec.z < -0.99) {
          pin.dotEl.classList.add('is-hidden');
          pin.cardEl.classList.add('is-hidden');
          pin.lineEl.style.display = 'none';
          continue;
        }

        const ax = (projVec.x * 0.5 + 0.5) * vw;
        const ay = (-projVec.y * 0.5 + 0.5) * vh;

        if (ax < safeMinX - 18 || ax > safeMaxX + 18 || ay < safeMinY || ay > safeMaxY) {
          pin.dotEl.classList.add('is-hidden');
          pin.cardEl.classList.add('is-hidden');
          pin.lineEl.style.display = 'none';
          continue;
        }

        const bx = THREE.MathUtils.clamp(ax + pin.prefOffset[0], safeMinX, Math.max(safeMinX, safeMaxX - CARD_W));
        const by = THREE.MathUtils.clamp(ay + pin.prefOffset[1], safeMinY, Math.max(safeMinY, safeMaxY - CARD_H));

        visibleLayouts.push({ pin, ax, ay, bx, by });
      }

      // Iterative 2D Screen-Space Vertical & Horizontal Separation Pass (>= 56px vertical separation!)
      for (let iter = 0; iter < 8; iter++) {
        visibleLayouts.sort((a, b) => a.by - b.by);
        for (let i = 0; i < visibleLayouts.length; i++) {
          for (let j = i + 1; j < visibleLayouts.length; j++) {
            const a = visibleLayouts[i];
            const b = visibleLayouts[j];
            const horizOverlap = Math.abs(a.bx - b.bx) < CARD_W + 14;
            if (!horizOverlap) continue;

            const dy = b.by - a.by;
            if (dy < MIN_VERT_SEP) {
              const push = (MIN_VERT_SEP - dy) * 0.5 + 0.5;
              a.by -= push;
              b.by += push;
            }
          }
        }
        for (const item of visibleLayouts) {
          item.by = THREE.MathUtils.clamp(item.by, safeMinY, Math.max(safeMinY, safeMaxY - CARD_H));
          item.bx = THREE.MathUtils.clamp(item.bx, safeMinX, Math.max(safeMinX, safeMaxX - CARD_W));
        }
      }

      // Commit collision-free DOM positions + crisp 1px SVG bent leader polylines!
      for (const item of visibleLayouts) {
        const { pin, ax, ay, bx, by } = item;
        pin.dotEl.classList.remove('is-hidden');
        pin.dotEl.style.left = `${ax.toFixed(1)}px`;
        pin.dotEl.style.top = `${ay.toFixed(1)}px`;

        pin.cardEl.classList.remove('is-hidden');
        pin.cardEl.style.left = `${bx.toFixed(1)}px`;
        pin.cardEl.style.top = `${by.toFixed(1)}px`;

        const boxMidY = by + CARD_H * 0.5;
        // Connect to left edge of card if card is right of anchor, right edge if card is left, or nearest horizontal edge
        const connectLeft = ax <= bx + CARD_W * 0.5;
        const connectX = connectLeft ? bx : bx + CARD_W;
        const elbowX = connectLeft
          ? Math.min(bx - 10, (ax + bx) * 0.5)
          : Math.max(bx + CARD_W + 10, (ax + bx + CARD_W) * 0.5);

        pin.lineEl.style.display = 'block';
        pin.lineEl.setAttribute(
          'points',
          `${ax.toFixed(1)},${ay.toFixed(1)} ${elbowX.toFixed(1)},${boxMidY.toFixed(1)} ${connectX.toFixed(1)},${boxMidY.toFixed(1)}`
        );
      }
    }

    renderer.render(scene, camera);
  };

  requestAnimationFrame(tick);
}

void bootstrap();
