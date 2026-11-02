export interface MsoLivery {
  id: string;
  name: string;
  code: string;
  primaryHex: string;
  accentHex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  swatchGradient: string;
  priceDeltaGbp: number;
  description: string;
}

export interface CaliperOption {
  id: string;
  name: string;
  hex: string;
  code: string;
}

export interface ActDefinition {
  index: number;
  id: string;
  code: string;
  range: [number, number];
  peakScroll: number;
  backdropTitle: string;
  kicker: string;
  headline: string;
  align: 'left' | 'right';
  telemetry: {
    speedKmh: number;
    downforceKg: number;
    wingAngleDeg: number;
    brakeTempC: number;
    boostBar: number;
    gear: string;
  };
}

export const MSO_LIVERIES: MsoLivery[] = [
  {
    id: 'papaya-spark',
    name: 'Molten Papaya Spark',
    code: 'MSO-P800-OR',
    primaryHex: '#FF6B00',
    accentHex: '#181B22',
    metalness: 0.42,
    roughness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    swatchGradient: 'linear-gradient(135deg, #FF8A2B 0%, #FF6B00 55%, #B83D00 100%)',
    priceDeltaGbp: 18500,
    description: 'High-metallic McLaren heritage papaya tri-coat with exposed 2x2 twill carbon aero blades.',
  },
  {
    id: 'burton-blue',
    name: 'MSO Burton Blue',
    code: 'MSO-B412-BL',
    primaryHex: '#0D5CFF',
    accentHex: '#FF6B00',
    metalness: 0.48,
    roughness: 0.18,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    swatchGradient: 'linear-gradient(135deg, #3B82F6 0%, #0D5CFF 55%, #072A88 100%)',
    priceDeltaGbp: 21400,
    description: 'Launch-specification deep cobalt metallic paired with Papaya splitter & endplate pinstripes.',
  },
  {
    id: 'silica-white',
    name: 'Silica White // Crimson',
    code: 'MSO-W109-WH',
    primaryHex: '#E8EDF5',
    accentHex: '#FF293E',
    metalness: 0.24,
    roughness: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    swatchGradient: 'linear-gradient(135deg, #FFFFFF 0%, #DCE3EE 60%, #9AA4B6 100%)',
    priceDeltaGbp: 24000,
    description: 'Championship ceramic pearl white clearcoat contrasted with Aero Crimson splitter & wing vanes.',
  },
  {
    id: 'stealth-carbon',
    name: 'Stealth Satin Carbon',
    code: 'MSO-C990-FC',
    primaryHex: '#1C2029',
    accentHex: '#FF6B00',
    metalness: 0.34,
    roughness: 0.36,
    clearcoat: 0.55,
    clearcoatRoughness: 0.24,
    swatchGradient: 'linear-gradient(135deg, #343A48 0%, #1C2029 55%, #0B0D12 100%)',
    priceDeltaGbp: 68500,
    description: 'Full Visual Carbon Fibre Body (67 bespoke autoclaved panels) finished in satin Woking lacquer.',
  },
  {
    id: 'verde-mantis',
    name: 'MSO Napier Green',
    code: 'MSO-G704-NP',
    primaryHex: '#3AE824',
    accentHex: '#151820',
    metalness: 0.40,
    roughness: 0.19,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    swatchGradient: 'linear-gradient(135deg, #6EFF54 0%, #3AE824 55%, #168309 100%)',
    priceDeltaGbp: 22800,
    description: 'High-visibility GT3 endurance fluorescent pearl lacquer engineered for pit-wall telemetry tracking.',
  },
];

export const CALIPER_OPTIONS: CaliperOption[] = [
  { id: 'papaya', name: 'McLaren Papaya', hex: '#FF6B00', code: 'CAL-PAP' },
  { id: 'crimson', name: 'Telemetry Crimson', hex: '#FF293E', code: 'CAL-CRM' },
  { id: 'burton', name: 'Burton Cobalt', hex: '#1463FF', code: 'CAL-BLU' },
  { id: 'acid-volt', name: 'Acid Volt', hex: '#C6FF00', code: 'CAL-VLT' },
];

export const ACTS: ActDefinition[] = [
  {
    index: 0,
    id: 'act-01',
    code: 'ACT 01 // 00%–16%',
    range: [0.0, 0.16],
    peakScroll: 0.0,
    backdropTitle: 'SENNA 800',
    kicker: 'ACT 01 · WOKING AERODYNAMIC HOMOLOGATION',
    headline: 'FORM FOLLOWS DOWNFORCE',
    align: 'left',
    telemetry: {
      speedKmh: 0,
      downforceKg: 0,
      wingAngleDeg: 14.5,
      brakeTempC: 68,
      boostBar: 0.0,
      gear: 'N',
    },
  },
  {
    index: 1,
    id: 'act-02',
    code: 'ACT 02 // 16%–34%',
    range: [0.16, 0.34],
    peakScroll: 0.25,
    backdropTitle: 'DOWNFORCE',
    kicker: 'ACT 02 · LIVE CFD CORRELATION TUNNEL',
    headline: '800.4 KG AT 250 KM/H',
    align: 'right',
    telemetry: {
      speedKmh: 250,
      downforceKg: 800.4,
      wingAngleDeg: 16.8,
      brakeTempC: 245,
      boostBar: 1.18,
      gear: '5',
    },
  },
  {
    index: 2,
    id: 'act-03',
    code: 'ACT 03 // 34%–52%',
    range: [0.34, 0.52],
    peakScroll: 0.48,
    backdropTitle: 'MONOCAGE III',
    kicker: 'ACT 03 · 276-MESH STRUCTURAL DECONSTRUCTION',
    headline: '1,198 KG CARBON ARCHITECTURE',
    align: 'left',
    telemetry: {
      speedKmh: 0,
      downforceKg: 800.4,
      wingAngleDeg: 12.0,
      brakeTempC: 110,
      boostBar: 0.0,
      gear: 'P',
    },
  },
  {
    index: 3,
    id: 'act-04',
    code: 'ACT 04 // 52%–70%',
    range: [0.52, 0.70],
    peakScroll: 0.61,
    backdropTitle: 'M840TR V8',
    kicker: 'ACT 04 · FLAT-PLANE CRANK & CCM-R THERMAL',
    headline: '800 PS & 900°C CARBON ROTORS',
    align: 'right',
    telemetry: {
      speedKmh: 212,
      downforceKg: 615.0,
      wingAngleDeg: 18.2,
      brakeTempC: 894,
      boostBar: 1.42,
      gear: '4',
    },
  },
  {
    index: 4,
    id: 'act-05',
    code: 'ACT 05 // 70%–86%',
    range: [0.70, 0.86],
    peakScroll: 0.76,
    backdropTitle: '340 KM/H',
    kicker: 'ACT 05 · SILVERSTONE HANGAR STRAIGHT PURSUIT',
    headline: 'APEX VELOCITY & RCC II',
    align: 'left',
    telemetry: {
      speedKmh: 340,
      downforceKg: 800.4,
      wingAngleDeg: 4.2,
      brakeTempC: 710,
      boostBar: 1.42,
      gear: '7',
    },
  },
  {
    index: 5,
    id: 'act-06',
    code: 'ACT 06 // 86%–100%',
    range: [0.86, 1.0],
    peakScroll: 1.0,
    backdropTitle: 'BESPOKE MSO',
    kicker: 'ACT 06 · MCLAREN SPECIAL OPERATIONS COMMISSION',
    headline: 'CHASSIS #341 SPECIFICATION',
    align: 'right',
    telemetry: {
      speedKmh: 0,
      downforceKg: 800.4,
      wingAngleDeg: 15.0,
      brakeTempC: 82,
      boostBar: 0.0,
      gear: 'P',
    },
  },
];
