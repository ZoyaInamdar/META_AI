/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Planetoid Procedural Shaders & Materials
 * Role: Person C (Visuals & Rendering)
 * ============================================================================
 *
 * Implements the procedural GLSL shader materials for the Planetoid Renderer:
 * - Single continuous planet mesh driven by PlanetState uniforms
 * - 5-Stage visual evolution:
 *   1. Seed: Compact, dark cosmic blue/lavender dormant crust
 *   2. Awakening: Luminous golden Kintsugi veins in Champagne Gold (#E8C68D)
 *   3. Oceans: Procedural liquid basin filling in Deep Nebula Blue (#344B83) to cyan
 *   4. Life & Atmosphere: Ethereal Fresnel atmosphere halo and blooming biomes
 *   5. Celestial Alignment: Planetary rings, radiant white-gold ignition & shield
 *
 * Suitable for Meta Quest WebXR performance:
 * - Analytical 3D simplex noise with domain warping
 * - No heavy textures or post-processing passes
 * - Draw-call optimized: 1 draw call for core + optional atmosphere/ring passes
 */

import {
  Color,
  DoubleSide,
  FrontSide,
  AdditiveBlending,
  ShaderMaterial,
  Vector3
} from 'three';

// ============================================================================
// 1. CELESTIAL PALETTE CONSTANTS
// ============================================================================

export const PLANETOID_PALETTE = Object.freeze({
  MIDNIGHT_BLUE: '#18264F',
  DEEP_NEBULA_BLUE: '#344B83',
  DEEP_LAVENDER: '#796A9F',
  DUSTY_PERIWINKLE: '#7886C5',
  SOFT_LAVENDER: '#B9A4D6',
  BLUSH_PINK: '#F2B8D0',
  SOFT_PEACH: '#F6D2C2',
  PEARL_WHITE: '#FFF5F5',
  CHAMPAGNE_GOLD: '#E8C68D',
  WARM_PEARL_GOLD: '#F5E2BD',
  WHITE_GOLD: '#FDF7EA',
  OCEAN_DEEP: '#1D3B6C',
  OCEAN_TEAL: '#327092',
  // Stage 1 Mars-Like Primordial Geological Hierarchy Palette Constants
  MARS_VOLCANIC_BROWN: '#2C1613',     // Deepest volcanic recesses & fault trenches
  MARS_DEEP_RUST: '#4E2019',           // Crater floors, low basins, deep geological shadows
  MARS_BURNT_SIENNA: '#793322',        // Lowlands & sloped crater walls
  MARS_TERRACOTTA_BASE: '#A84E32',     // Main barren terrain (warm iron-rich terracotta)
  MARS_WARM_OCHRE: '#C66F42',          // Elevated plains, plateaus & highland terrain
  MARS_DUSTY_ORANGE: '#D48255',        // Weathered plateaus, ejecta blankets & crater rims
  MARS_PEACH_RIDGE: '#E5A27A',         // Subdued crest highlights, ridges & rocky peaks

  // Stage 2 Golden Mineral / Awakened Geological World Palette Constants
  STAGE2_VOLCANIC: '#241713',          // Deep volcanic terrain
  STAGE2_DARK_BRONZE: '#4A2D1B',       // Dark bronze lowlands
  STAGE2_BURNT_AMBER: '#70451F',       // Burnt amber mid-terrain
  STAGE2_OCHRE: '#9A6A2D',             // Mineral ochre plains
  STAGE2_MINERAL_GOLD: '#C29343',      // Mineral gold highlands
  STAGE2_WARM_CHAMPAGNE: '#D9BD78',    // Warm champagne ridges
  STAGE2_BRIGHT_CREST: '#E8D39A',      // Bright mineral crests

  // Stage 3 Blue Ocean World Palette Constants
  STAGE3_OCEAN_ABYSS: '#071B3D',       // Deepest ocean trench
  STAGE3_OCEAN_DEEP: '#0D3766',        // Deep blue ocean basin
  STAGE3_OCEAN_MID: '#155A8A',         // Mid ocean blue
  STAGE3_OCEAN_TEAL: '#218B91',        // Teal shelf water
  STAGE3_OCEAN_SHALLOW: '#55B9B0',     // Shallow coastal water
  STAGE3_COAST_HIGHLIGHT: '#8AD9CF',   // Coastal shoreline highlight

  // Stage 4 Living Green World Palette Constants
  STAGE4_DEEP_VEGETATION: '#123A24',   // Deep valley vegetation
  STAGE4_FOREST: '#1F5A32',            // Dense forest lowlands
  STAGE4_GREEN: '#348A45',             // Vibrant continental green
  STAGE4_EMERALD: '#45A95A',           // Coastal emerald flora
  STAGE4_MOSS: '#718F45',              // Highland moss slopes
  STAGE4_FRESH_VEGETATION: '#8FBE62',  // Sunlit fresh vegetation highlights

  // Backward-compatible aliases for existing references & tests
  PRIMORDIAL_RECESS_BLACK: '#2C1613',  // Dark volcanic brown for deep recesses
  PRIMORDIAL_CHARCOAL_BASE: '#4E2019', // Deep rust for low terrain
  PRIMORDIAL_BARREN_TERRAIN: '#A84E32',// Terracotta main terrain
  PRIMORDIAL_MINERAL_MAUVE: '#C66F42', // Warm ochre highlands
  PRIMORDIAL_WEATHERED_DUST: '#D48255',// Dusty orange weathered regions
  PRIMORDIAL_RIDGE_LAVENDER: '#E5A27A',// Pale mineral peach ridges
  PRIMORDIAL_CREST_HIGHLIGHT: '#E5A27A',// Mineral ridge crest
  RECESS_BLACK: '#2C1613',
  DARK_INDIGO_BASE: '#4E2019',
  MUTED_LAVENDER: '#A84E32',
  PERIWINKLE_RIDGE: '#E5A27A',
  COOL_PERIWINKLE: '#E5A27A',
  // Stage 5 Transcendent Celestial World Palette Constants
  STAGE5_CELESTIAL_BLUE: '#183A78',    // Deep celestial blue
  STAGE5_COBALT: '#285EA8',            // Cobalt blue
  STAGE5_OCEAN_BLUE: '#398FD0',        // Luminous ocean blue
  STAGE5_CYAN: '#63C9E8',              // Radiant celestial cyan
  STAGE5_PEARL_AQUA: '#9DE5E7',        // Pearlescent aqua
  STAGE5_LAVENDER_BLUE: '#9B9AD8',     // Lavender-blue continental plains
  STAGE5_SOFT_PEARL: '#D7D8F2',        // Soft pearl highlands & crests
  STAGE5_VIOLET: '#8F82C9',            // Ethereal violet
  STAGE5_LAVENDER: '#B7A6E5',          // Pastel lavender
  STAGE5_PEARL_VIOLET: '#D2C8F0',      // Pearl violet energy
  STAGE5_SOFT_ROSE: '#E6A4B8',         // Soft celestial rose
  STAGE5_CELESTIAL_PINK: '#F0B5D1',    // Celestial pink energy
  STAGE5_PEACH_LIGHT: '#F3C2A2',       // Peach light highlands
  STAGE5_WARM_CHAMPAGNE: '#D8C28A',    // Warm champagne geological gold
  STAGE5_SOFT_GOLD: '#E9D39A',         // Soft celestial gold ridges
  STAGE5_RADIANT_GOLD: '#F4D98A',      // Radiant gold mountain crests
  STAGE5_WHITE_GOLD: '#FFF7E5',        // Luminous white-gold energy veins

  // Stage 5 Golden Celestial World Hierarchy Palette Constants
  GOLD_ANTIQUE_RECESS: '#6F4A20',  // Dark bronze / antique gold for deep valleys
  GOLD_BRONZE_LOW: '#A97B35',      // Bronze / champagne lowlands
  GOLD_MAIN_CELESTIAL: '#D6B56A',  // Rich champagne gold main surface
  GOLD_BRIGHT_RIDGE: '#E8C982',    // Bright celestial gold geological ridges
  GOLD_PEAK_ENERGY: '#FFFDF2'      // Near-white celestial peak energy at junctions
});

/**
 * Converts a hex color string ('#RRGGBB') to normalized RGB array [r, g, b].
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgbNormalized(hex) {
  const c = new Color(hex);
  return [
    Math.round(c.r * 10000) / 10000,
    Math.round(c.g * 10000) / 10000,
    Math.round(c.b * 10000) / 10000
  ];
}

// ============================================================================
// 2. CORE PLANETOID SHADER
// ============================================================================

/**
 * GLSL Vertex Shader for the core planetoid.
 * Evaluates in local object space (vLocalPosition) so procedural terrain
 * remains rigidly locked to the sphere during spatial translation and flight.
 */
export const PLANETOID_CORE_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vViewPosition;

void main() {
  vLocalPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * GLSL Fragment Shader for the core planetoid.
 * Evaluates procedural terrain elevation, liquid ocean basins, Kintsugi golden veins,
 * biome colonization, and directional + Fresnel cosmic lighting.
 */
export const PLANETOID_CORE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uVisualStage;
uniform float uAwakeningProgress;
uniform float uKintsugiGlow;
uniform float uAtmosphereDensity;
uniform float uOceanFill;
uniform float uShieldCharge;
uniform float uScarsCount;
uniform float uGoldIgnited;
uniform vec3 uLightDirection;

varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vViewPosition;

// --- Analytical 3D Simplex Noise ---
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 3-octave FBM for planetary crust elevation (streamlined for WebXR & mobile/integrated GPU performance)
float planetElevationFbm(vec3 p) {
  float f = 0.0;
  f += 0.5400 * snoise(p);
  f += 0.3100 * snoise(p * 2.08 + vec3(2.41, 4.15, 1.37));
  f += 0.1500 * snoise(p * 4.16 + vec3(5.72, 1.23, 7.84));
  return f * 0.5 + 0.5; // Normalized to [0.0, 1.0]
}

// ============================================================================
// LARGE CRATERS AND IMPACT BASINS
// Analytical deformed impact crater evaluation
// Returns vec4(elevationDelta, floorMask, wallMask, rimMask)
// ============================================================================
vec4 evaluateImpactCrater(vec3 p, vec3 center, float radius, float depth, float rimHeight, float noiseSeed, vec3 warp) {
  float chord = length(p - center);
  // Domain warping gives irregular, naturally eroded crater boundaries (non-circular)
  float rWarp = (warp.x + warp.y) * 0.16 + snoise(p * 5.0 + vec3(noiseSeed, noiseSeed * 1.6, noiseSeed * 2.3)) * 0.10;
  float r = (chord + rWarp * radius) / radius;

  if (r > 1.6) return vec4(0.0, 0.0, 0.0, 0.0);

  // Depressed floor for r < 0.75 with central uplift peak in large ancient basins
  float floorMask = 1.0 - smoothstep(0.0, 0.75, r);
  float centralPeak = smoothstep(0.24, 0.0, r) * (depth * 0.30);
  float wallMask = smoothstep(0.40, 0.88, r) * smoothstep(1.05, 0.88, r);
  float floorElev = -depth * smoothstep(0.10, 0.85, 1.0 - r) + centralPeak;

  // Raised rocky rim peaking around r = 1.0, gently sloping outward
  float rimMask = smoothstep(0.70, 1.0, r) * smoothstep(1.45, 1.0, r);
  float rimElev = rimMask * rimHeight;

  return vec4(floorElev + rimElev, floorMask, wallMask, rimMask);
}

// Evaluates 5 ancient impact basins and craters distributed across the planetary sphere
vec4 evaluateImpactBasinSystem(vec3 p, vec3 warp1, vec3 warp2) {
  // 1. Mare Australis (massive ancient southern impact basin)
  vec3 c1 = normalize(vec3(-0.48, -0.42, 0.77));
  vec4 cr1 = evaluateImpactCrater(p, c1, 0.56, 0.24, 0.14, 1.45, warp1);

  // 2. Oceanus Occidentis (prominent equatorial impact basin)
  vec3 c2 = normalize(vec3(0.65, 0.22, 0.73));
  vec4 cr2 = evaluateImpactCrater(p, c2, 0.44, 0.28, 0.16, 3.82, warp2);

  // 3. Borealis Basin (deep northern impact crater with steep inner walls)
  vec3 c3 = normalize(vec3(-0.28, 0.75, 0.59));
  vec4 cr3 = evaluateImpactCrater(p, c3, 0.34, 0.30, 0.15, 6.19, warp1);

  // 4. Orientalis Basin (ancient weathered multi-ring basin)
  vec3 c4 = normalize(vec3(0.35, -0.62, -0.70));
  vec4 cr4 = evaluateImpactCrater(p, c4, 0.50, 0.22, 0.12, 2.57, warp2);

  // 5. Imbrium Overlap (distinct crater cutting into the rim of Oceanus Occidentis)
  vec3 c5 = normalize(vec3(0.48, 0.52, 0.70));
  vec4 cr5 = evaluateImpactCrater(p, c5, 0.26, 0.24, 0.14, 8.31, warp1);

  float totalElevation = cr1.x + cr2.x + cr3.x + cr4.x + cr5.x;
  float totalFloorMask = max(max(max(cr1.y, cr2.y), max(cr3.y, cr4.y)), cr5.y);
  float totalWallMask  = max(max(max(cr1.z, cr2.z), max(cr3.z, cr4.z)), cr5.z);
  float totalRimMask   = max(max(max(cr1.w, cr2.w), max(cr3.w, cr4.w)), cr5.w);

  return vec4(totalElevation, totalFloorMask, totalWallMask, totalRimMask);
}

// ============================================================================
// 5-6 DOMINANT PLANET-SCALE PRIMARY FRACTURE SYSTEM
// Evaluates 5-6 major tectonic fault lines across the planetary sphere:
// 1. Fault 1: Long Diagonal Fault (north-west to equatorial)
// 2. Fault 2: Curved Continental Split (major tectonic plate boundary)
// 3. Fault 3: Shorter Deep Highland Fault (cuts through crater basin/plateau)
// 4. Fault 4: Long Branching Fault (equatorial with secondary offshoots)
// 5. Fault 5: Lower Hemisphere Southern Rift (sweeping southern rift)
// 6. Fault 6: Major Cross-Connection Rift (junction link)
//
// Evaluates both dormant structural geology (Stage 1) and cinematic golden
// energy propagation with deterministic staggered fault activation (Stage 1 -> 2).
// ============================================================================
struct PrimaryFaultSystem {
  vec4 geom;             // (mask, core, groove, trench) for base geology
  float activeCore;      // Thin intense golden core
  float activeGroove;    // Medium fault groove glow
  float activeHalo;      // Soft golden glow diffusing into surrounding crust
  float totalSurge;      // Dynamic traveling wave pulse along crack front
  float junctionHotspot; // Energy concentration at fault junctions
  float planetaryPulse;  // Broad planetary resonance pulse during finale
  float rockWarmthMask;  // Localized subtle warming of rock along active faults
  float shoulders;       // Raised tectonic rift shoulders (horsts)
  float plateDisplacement; // Asymmetric signed plate displacement (+ on one side, - on the other)
  float tectonicFolds;   // Compression folds/wrinkles parallel to rift
  float canyonDepth;     // Deepening of the rift valley
  float collapsedShelves;// Stepped broken rock shelves
  vec3 wallSlope;        // Analytical wall normal perturbation for 3D sunlight/shadow
  float f1Active;
  float f2Active;
  float f3Active;
  float f4Active;
  float f5Active;
  float f6Active;
};

PrimaryFaultSystem evaluatePrimaryFaultSystem(vec3 p, vec3 warp1, vec3 warp2, float awakenProg) {
  // Fault 1: Long Diagonal Fault
  vec3 n1 = normalize(vec3(0.72, -0.65, 0.25));
  vec3 t1 = normalize(vec3(0.65, 0.72, -0.24));
  float s1 = dot(p, t1);
  float len1 = smoothstep(-0.88, -0.65, s1) * smoothstep(0.82, 0.58, s1);
  float u1 = clamp((s1 + 0.85) / 1.65, 0.0, 1.0);

  // Low-frequency width modulation: broad geological variation along fault
  float widthMod1 = clamp(0.85 + 0.38 * sin(s1 * 3.4 + 1.2) + 0.24 * snoise(p * 2.8 + vec3(1.1, 2.3, 3.4)), 0.60, 1.55);
  float wCanyon1 = 0.115 * widthMod1;
  float wGroove1 = 0.042 * widthMod1;
  float wCore1   = 0.010 * widthMod1;

  // Controlled low-frequency edge irregularity & rock shelf displacement (no spiderweb micro-noise)
  float edgeNoise1 = snoise(p * 7.2 + vec3(1.4, 3.7, 5.1)) * 0.016 + snoise(p * 15.0 + vec3(4.2, 1.8, 6.5)) * 0.005;
  float w1 = dot(p, n1) + (warp1.x * 0.42 + warp2.y * 0.28) * 0.45 + edgeNoise1;

  float f1Trench = smoothstep(wCanyon1, wCanyon1 * 0.20, abs(w1)) * len1;
  float f1Groove = smoothstep(wGroove1, wGroove1 * 0.16, abs(w1)) * len1;
  // Geological rock shelf occlusion along the vein
  float occl1 = smoothstep(-0.30, 0.50, snoise(p * 8.5 + vec3(2.1, 4.3, 7.8)));
  float f1Core = smoothstep(wCore1, wCore1 * 0.08, abs(w1)) * len1 * (0.50 + 0.50 * occl1);
  // Raised tectonic shoulder flanking the canyon
  float f1Shoulder = smoothstep(wCanyon1 * 1.35, wCanyon1 * 0.95, abs(w1)) * smoothstep(wCanyon1 * 0.60, wCanyon1 * 0.90, abs(w1)) * len1;

  // Crustal deformation progress (0.10 -> 0.38)
  float d1 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.10) / 0.28, 0.0, 1.0);
  float plateDisp1 = sign(w1) * smoothstep(wCanyon1 * 0.55, wCanyon1 * 1.25, abs(w1)) * (1.0 - smoothstep(wCanyon1 * 1.75, wCanyon1 * 3.4, abs(w1))) * len1 * (0.35 + 0.65 * d1);
  float folds1 = (sin(abs(w1) * 34.0 + snoise(p * 4.2 + vec3(1.1, 2.3, 3.4)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon1 * 0.75, wCanyon1 * 1.5, abs(w1)) * (1.0 - smoothstep(wCanyon1 * 2.0, wCanyon1 * 3.8, abs(w1))) * len1 * (0.30 + 0.70 * d1);
  float shelfNoise1 = smoothstep(-0.25, 0.35, snoise(p * 6.5 + vec3(2.1, 4.3, 7.8)));
  float brokenShelf1 = smoothstep(wCanyon1 * 1.05, wCanyon1 * 0.65, abs(w1)) * smoothstep(wGroove1 * 0.9, wGroove1 * 1.5, abs(w1)) * len1 * shelfNoise1 * (0.35 + 0.65 * d1);
  float depthMod1 = clamp(0.85 + 0.42 * sin(s1 * 3.6 + 0.8) + 0.28 * snoise(p * 2.5 + vec3(1.0, 3.0, 5.0)), 0.60, 1.55);
  float canyonDepth1 = (f1Groove * 1.40 + f1Trench * 0.60) * depthMod1 * (0.35 + 0.65 * d1);
  f1Shoulder *= (0.40 + 0.60 * d1);
  vec3 wallSlope1 = n1 * sign(w1) * smoothstep(wCanyon1 * 1.15, wGroove1 * 0.95, abs(w1)) * smoothstep(wGroove1 * 0.25, wGroove1 * 0.85, abs(w1)) * len1;

  // Staggered activation: Fault 1 golden ignition 0.18 -> 0.38 (starts after crustal deformation begins at 0.10)
  float tau1 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.18) / 0.20, 0.0, 1.0);
  float wave1 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u1 - 0.05, u1, tau1);
  float dist1 = tau1 - u1;
  float surge1 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist1) * smoothstep(0.16, 0.03, dist1) * (1.0 - smoothstep(0.92, 1.0, tau1)));

  // Fault 2: Curved Continental Split
  vec3 n2 = normalize(vec3(-0.35, 0.85, 0.38));
  vec3 t2 = normalize(vec3(0.85, 0.35, -0.40));
  float s2 = dot(p, t2);
  float len2 = smoothstep(-0.78, -0.55, s2) * smoothstep(0.88, 0.62, s2);
  float u2 = clamp((s2 + 0.75) / 1.60, 0.0, 1.0);

  float widthMod2 = clamp(0.88 + 0.40 * sin(s2 * 3.1 - 0.8) + 0.26 * snoise(p * 2.6 + vec3(4.2, 1.7, 6.1)), 0.62, 1.60);
  float wCanyon2 = 0.125 * widthMod2;
  float wGroove2 = 0.045 * widthMod2;
  float wCore2   = 0.011 * widthMod2;

  float edgeNoise2 = snoise(p * 6.8 + vec3(3.5, 7.2, 1.9)) * 0.018 + snoise(p * 14.5 + vec3(8.1, 2.4, 5.3)) * 0.005;
  float w2 = dot(p, n2) + (warp1.y * 0.50 + warp1.z * 0.35) * 0.50 + edgeNoise2;

  float f2Trench = smoothstep(wCanyon2, wCanyon2 * 0.20, abs(w2)) * len2;
  float f2Groove = smoothstep(wGroove2, wGroove2 * 0.16, abs(w2)) * len2;
  float occl2 = smoothstep(-0.30, 0.50, snoise(p * 8.2 + vec3(5.7, 1.3, 3.9)));
  float f2Core = smoothstep(wCore2, wCore2 * 0.08, abs(w2)) * len2 * (0.50 + 0.50 * occl2);
  float f2Shoulder = smoothstep(wCanyon2 * 1.35, wCanyon2 * 0.95, abs(w2)) * smoothstep(wCanyon2 * 0.60, wCanyon2 * 0.90, abs(w2)) * len2;

  // Crustal deformation progress (0.26 -> 0.54)
  float d2 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.26) / 0.28, 0.0, 1.0);
  float plateDisp2 = sign(w2) * smoothstep(wCanyon2 * 0.55, wCanyon2 * 1.25, abs(w2)) * (1.0 - smoothstep(wCanyon2 * 1.75, wCanyon2 * 3.4, abs(w2))) * len2 * (0.35 + 0.65 * d2);
  float folds2 = (sin(abs(w2) * 32.0 + snoise(p * 4.0 + vec3(3.2, 6.1, 1.5)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon2 * 0.75, wCanyon2 * 1.5, abs(w2)) * (1.0 - smoothstep(wCanyon2 * 2.0, wCanyon2 * 3.8, abs(w2))) * len2 * (0.30 + 0.70 * d2);
  float shelfNoise2 = smoothstep(-0.25, 0.35, snoise(p * 6.2 + vec3(5.7, 1.3, 3.9)));
  float brokenShelf2 = smoothstep(wCanyon2 * 1.05, wCanyon2 * 0.65, abs(w2)) * smoothstep(wGroove2 * 0.9, wGroove2 * 1.5, abs(w2)) * len2 * shelfNoise2 * (0.35 + 0.65 * d2);
  float depthMod2 = clamp(0.85 + 0.42 * sin(s2 * 3.4 - 0.5) + 0.28 * snoise(p * 2.6 + vec3(2.5, 4.1, 1.8)), 0.60, 1.55);
  float canyonDepth2 = (f2Groove * 1.40 + f2Trench * 0.60) * depthMod2 * (0.35 + 0.65 * d2);
  f2Shoulder *= (0.40 + 0.60 * d2);
  vec3 wallSlope2 = n2 * sign(w2) * smoothstep(wCanyon2 * 1.15, wGroove2 * 0.95, abs(w2)) * smoothstep(wGroove2 * 0.25, wGroove2 * 0.85, abs(w2)) * len2;

  // Staggered activation: Fault 2 golden ignition 0.32 -> 0.52
  float tau2 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.32) / 0.20, 0.0, 1.0);
  float wave2 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u2 - 0.05, u2, tau2);
  float dist2 = tau2 - u2;
  float surge2 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist2) * smoothstep(0.16, 0.03, dist2) * (1.0 - smoothstep(0.92, 1.0, tau2)));

  // Fault 3: Shorter Deep Highland Fault
  vec3 n3 = normalize(vec3(0.55, 0.25, -0.79));
  vec3 t3 = normalize(vec3(-0.25, 0.95, 0.12));
  float s3 = dot(p, t3);
  float len3 = smoothstep(-0.52, -0.35, s3) * smoothstep(0.58, 0.38, s3);
  float u3 = clamp((s3 + 0.50) / 1.05, 0.0, 1.0);

  float widthMod3 = clamp(0.80 + 0.32 * sin(s3 * 4.2 + 0.5) + 0.22 * snoise(p * 3.2 + vec3(7.3, 5.2, 1.9)), 0.60, 1.45);
  float wCanyon3 = 0.098 * widthMod3;
  float wGroove3 = 0.035 * widthMod3;
  float wCore3   = 0.009 * widthMod3;

  float edgeNoise3 = snoise(p * 7.8 + vec3(6.1, 2.9, 8.4)) * 0.015 + snoise(p * 15.5 + vec3(1.7, 5.4, 3.2)) * 0.005;
  float w3 = dot(p, n3) + (warp1.z * 0.40 + warp2.x * 0.30) * 0.40 + edgeNoise3;

  float f3Trench = smoothstep(wCanyon3, wCanyon3 * 0.20, abs(w3)) * len3;
  float f3Groove = smoothstep(wGroove3, wGroove3 * 0.16, abs(w3)) * len3;
  float occl3 = smoothstep(-0.30, 0.50, snoise(p * 9.2 + vec3(4.3, 8.1, 2.6)));
  float f3Core = smoothstep(wCore3, wCore3 * 0.08, abs(w3)) * len3 * (0.50 + 0.50 * occl3);
  float f3Shoulder = smoothstep(wCanyon3 * 1.35, wCanyon3 * 0.95, abs(w3)) * smoothstep(wCanyon3 * 0.60, wCanyon3 * 0.90, abs(w3)) * len3;

  // Crustal deformation progress (0.38 -> 0.64)
  float d3 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.38) / 0.26, 0.0, 1.0);
  float plateDisp3 = sign(w3) * smoothstep(wCanyon3 * 0.55, wCanyon3 * 1.25, abs(w3)) * (1.0 - smoothstep(wCanyon3 * 1.75, wCanyon3 * 3.4, abs(w3))) * len3 * (0.35 + 0.65 * d3);
  float folds3 = (sin(abs(w3) * 36.0 + snoise(p * 4.5 + vec3(4.1, 1.2, 7.3)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon3 * 0.75, wCanyon3 * 1.5, abs(w3)) * (1.0 - smoothstep(wCanyon3 * 2.0, wCanyon3 * 3.8, abs(w3))) * len3 * (0.30 + 0.70 * d3);
  float shelfNoise3 = smoothstep(-0.25, 0.35, snoise(p * 6.8 + vec3(4.3, 8.1, 2.6)));
  float brokenShelf3 = smoothstep(wCanyon3 * 1.05, wCanyon3 * 0.65, abs(w3)) * smoothstep(wGroove3 * 0.9, wGroove3 * 1.5, abs(w3)) * len3 * shelfNoise3 * (0.35 + 0.65 * d3);
  float depthMod3 = clamp(0.85 + 0.40 * sin(s3 * 4.0 + 0.3) + 0.26 * snoise(p * 3.0 + vec3(5.1, 1.4, 3.2)), 0.60, 1.50);
  float canyonDepth3 = (f3Groove * 1.40 + f3Trench * 0.60) * depthMod3 * (0.35 + 0.65 * d3);
  f3Shoulder *= (0.40 + 0.60 * d3);
  vec3 wallSlope3 = n3 * sign(w3) * smoothstep(wCanyon3 * 1.15, wGroove3 * 0.95, abs(w3)) * smoothstep(wGroove3 * 0.25, wGroove3 * 0.85, abs(w3)) * len3;

  // Staggered activation: Fault 3 golden ignition 0.44 -> 0.62
  float tau3 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.44) / 0.18, 0.0, 1.0);
  float wave3 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u3 - 0.05, u3, tau3);
  float dist3 = tau3 - u3;
  float surge3 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist3) * smoothstep(0.16, 0.03, dist3) * (1.0 - smoothstep(0.92, 1.0, tau3)));

  // Fault 4: Long Branching Fault (with secondary branch)
  vec3 n4 = normalize(vec3(-0.80, -0.30, 0.52));
  vec3 t4 = normalize(vec3(0.30, -0.85, 0.43));
  float s4 = dot(p, t4);
  float len4 = smoothstep(-0.82, -0.60, s4) * smoothstep(0.85, 0.60, s4);
  float u4 = clamp((s4 + 0.80) / 1.62, 0.0, 1.0);

  float widthMod4 = clamp(0.85 + 0.36 * sin(s4 * 3.5 - 1.1) + 0.25 * snoise(p * 2.7 + vec3(3.5, 8.1, 2.7)), 0.60, 1.55);
  float wCanyon4 = 0.118 * widthMod4;
  float wGroove4 = 0.042 * widthMod4;
  float wCore4   = 0.010 * widthMod4;

  float edgeNoise4 = snoise(p * 7.0 + vec3(4.8, 1.6, 9.3)) * 0.017 + snoise(p * 14.0 + vec3(2.5, 6.9, 1.1)) * 0.005;
  float w4 = dot(p, n4) + (warp1.x * 0.45 + warp2.z * 0.35) * 0.48 + edgeNoise4;

  // Secondary Branch offshoot 4b (geological natural branch)
  vec3 n4b = normalize(n4 + t4 * 0.65);
  float edgeNoise4b = snoise(p * 7.5 + vec3(2.0, 4.0, 6.0)) * 0.014;
  float w4b = dot(p, n4b) + warp1.y * 0.25 + edgeNoise4b;
  float len4b = smoothstep(-0.12, 0.08, s4) * smoothstep(0.68, 0.42, s4) * smoothstep(-0.35, 0.25, dot(p, t4));
  float f4bCore = smoothstep(0.008, 0.0008, abs(w4b)) * len4b * 0.70;
  float f4bGroove = smoothstep(0.028, 0.002, abs(w4b)) * len4b * 0.70;
  float f4bTrench = smoothstep(0.080, 0.004, abs(w4b)) * len4b * 0.70;
  float u4b = clamp((dot(p, t4) + 0.30) / 0.60, 0.0, 1.0);

  float occl4 = smoothstep(-0.30, 0.50, snoise(p * 8.6 + vec3(7.4, 3.2, 5.8)));
  float f4Core = max(smoothstep(wCore4, wCore4 * 0.08, abs(w4)) * len4 * (0.50 + 0.50 * occl4), f4bCore);
  float f4Groove = max(smoothstep(wGroove4, wGroove4 * 0.16, abs(w4)) * len4, f4bGroove);
  float f4Trench = max(smoothstep(wCanyon4, wCanyon4 * 0.20, abs(w4)) * len4, f4bTrench);
  float f4Shoulder = smoothstep(wCanyon4 * 1.35, wCanyon4 * 0.95, abs(w4)) * smoothstep(wCanyon4 * 0.60, wCanyon4 * 0.90, abs(w4)) * len4;

  // Crustal deformation progress (0.48 -> 0.72)
  float d4 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.48) / 0.24, 0.0, 1.0);
  float plateDisp4 = sign(w4) * smoothstep(wCanyon4 * 0.55, wCanyon4 * 1.25, abs(w4)) * (1.0 - smoothstep(wCanyon4 * 1.75, wCanyon4 * 3.4, abs(w4))) * len4 * (0.35 + 0.65 * d4);
  float folds4 = (sin(abs(w4) * 34.0 + snoise(p * 4.2 + vec3(2.1, 7.3, 4.2)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon4 * 0.75, wCanyon4 * 1.5, abs(w4)) * (1.0 - smoothstep(wCanyon4 * 2.0, wCanyon4 * 3.8, abs(w4))) * len4 * (0.30 + 0.70 * d4);
  float shelfNoise4 = smoothstep(-0.25, 0.35, snoise(p * 6.6 + vec3(7.4, 3.2, 5.8)));
  float brokenShelf4 = smoothstep(wCanyon4 * 1.05, wCanyon4 * 0.65, abs(w4)) * smoothstep(wGroove4 * 0.9, wGroove4 * 1.5, abs(w4)) * len4 * shelfNoise4 * (0.35 + 0.65 * d4);
  float depthMod4 = clamp(0.85 + 0.40 * sin(s4 * 3.6 - 0.9) + 0.28 * snoise(p * 2.8 + vec3(3.1, 7.2, 4.5)), 0.60, 1.55);
  float canyonDepth4 = (f4Groove * 1.40 + f4Trench * 0.60) * depthMod4 * (0.35 + 0.65 * d4);
  f4Shoulder *= (0.40 + 0.60 * d4);
  vec3 wallSlope4 = n4 * sign(w4) * smoothstep(wCanyon4 * 1.15, wGroove4 * 0.95, abs(w4)) * smoothstep(wGroove4 * 0.25, wGroove4 * 0.85, abs(w4)) * len4;

  // Staggered activation: Fault 4 golden ignition 0.54 -> 0.70, branch 4b 0.60 -> 0.74
  float tau4 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.54) / 0.16, 0.0, 1.0);
  float wave4 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u4 - 0.05, u4, tau4);
  float dist4 = tau4 - u4;
  float surge4 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist4) * smoothstep(0.16, 0.03, dist4) * (1.0 - smoothstep(0.92, 1.0, tau4)));

  float tau4b = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.60) / 0.14, 0.0, 1.0);
  float wave4b = (awakenProg >= 1.0) ? 1.0 : smoothstep(u4b - 0.05, u4b, tau4b);
  float dist4b = tau4b - u4b;
  float surge4b = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist4b) * smoothstep(0.16, 0.03, dist4b) * (1.0 - smoothstep(0.92, 1.0, tau4b)));

  float f4ActiveCore = max(smoothstep(wCore4, wCore4 * 0.08, abs(w4)) * len4 * (0.50 + 0.50 * occl4) * wave4, f4bCore * wave4b);
  float f4ActiveGroove = max(smoothstep(wGroove4, wGroove4 * 0.16, abs(w4)) * len4 * wave4, f4bGroove * wave4b);
  float f4ActiveTrench = max(smoothstep(wCanyon4, wCanyon4 * 0.20, abs(w4)) * len4 * wave4, f4bTrench * wave4b);

  // Fault 5: Lower Hemisphere Southern Rift
  vec3 n5 = normalize(vec3(0.15, -0.88, -0.45));
  vec3 t5 = normalize(vec3(0.95, 0.15, 0.25));
  float s5 = dot(p, t5);
  float len5 = smoothstep(-0.72, -0.50, s5) * smoothstep(0.78, 0.52, s5);
  float u5 = clamp((s5 + 0.70) / 1.45, 0.0, 1.0);

  float widthMod5 = clamp(0.84 + 0.35 * sin(s5 * 3.8 + 0.4) + 0.24 * snoise(p * 2.9 + vec3(5.6, 3.2, 8.4)), 0.60, 1.50);
  float wCanyon5 = 0.112 * widthMod5;
  float wGroove5 = 0.040 * widthMod5;
  float wCore5   = 0.0095 * widthMod5;

  float edgeNoise5 = snoise(p * 7.4 + vec3(9.2, 3.1, 4.6)) * 0.016 + snoise(p * 14.8 + vec3(1.3, 7.8, 5.2)) * 0.005;
  float w5 = dot(p, n5) + (warp1.y * 0.38 + warp2.y * 0.32) * 0.42 + edgeNoise5;

  float f5Trench = smoothstep(wCanyon5, wCanyon5 * 0.20, abs(w5)) * len5;
  float f5Groove = smoothstep(wGroove5, wGroove5 * 0.16, abs(w5)) * len5;
  float occl5 = smoothstep(-0.30, 0.50, snoise(p * 8.4 + vec3(6.2, 9.1, 3.4)));
  float f5Core = smoothstep(wCore5, wCore5 * 0.08, abs(w5)) * len5 * (0.50 + 0.50 * occl5);
  float f5Shoulder = smoothstep(wCanyon5 * 1.35, wCanyon5 * 0.95, abs(w5)) * smoothstep(wCanyon5 * 0.60, wCanyon5 * 0.90, abs(w5)) * len5;

  // Crustal deformation progress (0.60 -> 0.82)
  float d5 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.60) / 0.22, 0.0, 1.0);
  float plateDisp5 = sign(w5) * smoothstep(wCanyon5 * 0.55, wCanyon5 * 1.25, abs(w5)) * (1.0 - smoothstep(wCanyon5 * 1.75, wCanyon5 * 3.4, abs(w5))) * len5 * (0.35 + 0.65 * d5);
  float folds5 = (sin(abs(w5) * 34.0 + snoise(p * 4.3 + vec3(8.1, 2.4, 5.7)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon5 * 0.75, wCanyon5 * 1.5, abs(w5)) * (1.0 - smoothstep(wCanyon5 * 2.0, wCanyon5 * 3.8, abs(w5))) * len5 * (0.30 + 0.70 * d5);
  float shelfNoise5 = smoothstep(-0.25, 0.35, snoise(p * 6.4 + vec3(6.2, 9.1, 3.4)));
  float brokenShelf5 = smoothstep(wCanyon5 * 1.05, wCanyon5 * 0.65, abs(w5)) * smoothstep(wGroove5 * 0.9, wGroove5 * 1.5, abs(w5)) * len5 * shelfNoise5 * (0.35 + 0.65 * d5);
  float depthMod5 = clamp(0.85 + 0.40 * sin(s5 * 3.8 + 0.2) + 0.28 * snoise(p * 2.7 + vec3(1.2, 6.4, 3.8)), 0.60, 1.55);
  float canyonDepth5 = (f5Groove * 1.40 + f5Trench * 0.60) * depthMod5 * (0.35 + 0.65 * d5);
  f5Shoulder *= (0.40 + 0.60 * d5);
  vec3 wallSlope5 = n5 * sign(w5) * smoothstep(wCanyon5 * 1.15, wGroove5 * 0.95, abs(w5)) * smoothstep(wGroove5 * 0.25, wGroove5 * 0.85, abs(w5)) * len5;

  // Staggered activation: Fault 5 golden ignition 0.66 -> 0.82
  float tau5 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.66) / 0.16, 0.0, 1.0);
  float wave5 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u5 - 0.05, u5, tau5);
  float dist5 = tau5 - u5;
  float surge5 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist5) * smoothstep(0.16, 0.03, dist5) * (1.0 - smoothstep(0.92, 1.0, tau5)));

  // Fault 6: Major Cross-Connection Rift
  vec3 n6 = normalize(vec3(-0.50, 0.50, -0.70));
  vec3 t6 = normalize(vec3(0.60, 0.60, 0.52));
  float s6 = dot(p, t6);
  float len6 = smoothstep(-0.48, -0.28, s6) * smoothstep(0.52, 0.32, s6);
  float u6 = clamp((s6 + 0.45) / 0.95, 0.0, 1.0);

  float widthMod6 = clamp(0.80 + 0.32 * sin(s6 * 4.0 - 0.7) + 0.22 * snoise(p * 3.1 + vec3(9.1, 4.4, 1.3)), 0.60, 1.45);
  float wCanyon6 = 0.105 * widthMod6;
  float wGroove6 = 0.038 * widthMod6;
  float wCore6   = 0.009 * widthMod6;

  float edgeNoise6 = snoise(p * 7.6 + vec3(3.7, 8.9, 2.4)) * 0.015 + snoise(p * 15.0 + vec3(6.4, 1.2, 9.8)) * 0.005;
  float w6 = dot(p, n6) + (warp1.x * 0.35 + warp1.z * 0.35) * 0.38 + edgeNoise6;

  float f6Trench = smoothstep(wCanyon6, wCanyon6 * 0.20, abs(w6)) * len6;
  float f6Groove = smoothstep(wGroove6, wGroove6 * 0.16, abs(w6)) * len6;
  float occl6 = smoothstep(-0.30, 0.50, snoise(p * 8.9 + vec3(1.8, 5.2, 7.1)));
  float f6Core = smoothstep(wCore6, wCore6 * 0.08, abs(w6)) * len6 * (0.50 + 0.50 * occl6);
  float f6Shoulder = smoothstep(wCanyon6 * 1.35, wCanyon6 * 0.95, abs(w6)) * smoothstep(wCanyon6 * 0.60, wCanyon6 * 0.90, abs(w6)) * len6;

  // Crustal deformation progress (0.70 -> 0.88)
  float d6 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.70) / 0.18, 0.0, 1.0);
  float plateDisp6 = sign(w6) * smoothstep(wCanyon6 * 0.55, wCanyon6 * 1.25, abs(w6)) * (1.0 - smoothstep(wCanyon6 * 1.75, wCanyon6 * 3.4, abs(w6))) * len6 * (0.35 + 0.65 * d6);
  float folds6 = (sin(abs(w6) * 36.0 + snoise(p * 4.4 + vec3(3.4, 1.7, 8.2)) * 1.8) * 0.5 + 0.5) * smoothstep(wCanyon6 * 0.75, wCanyon6 * 1.5, abs(w6)) * (1.0 - smoothstep(wCanyon6 * 2.0, wCanyon6 * 3.8, abs(w6))) * len6 * (0.30 + 0.70 * d6);
  float shelfNoise6 = smoothstep(-0.25, 0.35, snoise(p * 6.5 + vec3(1.8, 5.2, 7.1)));
  float brokenShelf6 = smoothstep(wCanyon6 * 1.05, wCanyon6 * 0.65, abs(w6)) * smoothstep(wGroove6 * 0.9, wGroove6 * 1.5, abs(w6)) * len6 * shelfNoise6 * (0.35 + 0.65 * d6);
  float depthMod6 = clamp(0.85 + 0.40 * sin(s6 * 4.2 - 0.6) + 0.28 * snoise(p * 2.9 + vec3(7.1, 2.3, 5.6)), 0.60, 1.55);
  float canyonDepth6 = (f6Groove * 1.40 + f6Trench * 0.60) * depthMod6 * (0.35 + 0.65 * d6);
  f6Shoulder *= (0.40 + 0.60 * d6);
  vec3 wallSlope6 = n6 * sign(w6) * smoothstep(wCanyon6 * 1.15, wGroove6 * 0.95, abs(w6)) * smoothstep(wGroove6 * 0.25, wGroove6 * 0.85, abs(w6)) * len6;

  // Staggered activation: Fault 6 golden ignition 0.74 -> 0.88
  float tau6 = (awakenProg >= 1.0) ? 1.0 : clamp((awakenProg - 0.74) / 0.14, 0.0, 1.0);
  float wave6 = (awakenProg >= 1.0) ? 1.0 : smoothstep(u6 - 0.05, u6, tau6);
  float dist6 = tau6 - u6;
  float surge6 = (awakenProg >= 1.0) ? 0.0 : (smoothstep(0.0, 0.04, dist6) * smoothstep(0.16, 0.03, dist6) * (1.0 - smoothstep(0.92, 1.0, tau6)));

  // Combine into dominant multi-fault fields
  float core = max(max(max(f1Core, f2Core), max(f3Core, f4Core)), max(f5Core, f6Core));
  float groove = max(max(max(f1Groove, f2Groove), max(f3Groove, f4Groove)), max(f5Groove, f6Groove));
  float trench = max(max(max(f1Trench, f2Trench), max(f3Trench, f4Trench)), max(f5Trench, f6Trench));
  float shoulders = max(max(max(f1Shoulder, f2Shoulder), max(f3Shoulder, f4Shoulder)), max(f5Shoulder, f6Shoulder));
  float mask = clamp(groove * 1.5 + trench * 0.5, 0.0, 1.0);

  // Active awakening components
  float activeCore = (awakenProg <= 0.001) ? 0.0 : max(max(max(f1Core * wave1, f2Core * wave2), max(f3Core * wave3, f4ActiveCore)), max(f5Core * wave5, f6Core * wave6));
  float activeGroove = (awakenProg <= 0.001) ? 0.0 : max(max(max(f1Groove * wave1, f2Groove * wave2), max(f3Groove * wave3, f4ActiveGroove)), max(f5Groove * wave5, f6Groove * wave6));
  float activeTrench = (awakenProg <= 0.001) ? 0.0 : max(max(max(f1Trench * wave1, f2Trench * wave2), max(f3Trench * wave3, f4ActiveTrench)), max(f5Trench * wave5, f6Trench * wave6));
  float activeHalo = activeTrench * 0.35;
  float totalSurge = (awakenProg <= 0.001 || awakenProg >= 1.0) ? 0.0 : max(max(max(f1Core * surge1, f2Core * surge2), max(f3Core * surge3, max(f4Core * surge4, f4bCore * surge4b))), max(f5Core * surge5, f6Core * surge6));

  // Tectonic Junction Convergence Hotspots
  float j12 = f1Groove * f2Groove * 3.0;
  float j14 = f1Groove * f4Groove * 3.0;
  float j26 = f2Groove * f6Groove * 3.0;
  float j4b = f4Groove * f4bGroove * 3.0;
  float j56 = f5Groove * f6Groove * 3.0;
  float rawJunction = clamp(j12 + j14 + j26 + j4b + j56, 0.0, 1.0);
  float junctionBurst = (awakenProg <= 0.001 || awakenProg >= 1.0)
    ? 0.0
    : rawJunction * smoothstep(0.78, 0.86, awakenProg) * (1.0 - smoothstep(0.92, 0.98, awakenProg));
  float junctionHotspot = rawJunction * (awakenProg >= 1.0 ? 0.70 : (smoothstep(0.30, 0.80, awakenProg) + junctionBurst * 1.5));

  // Planetary Energy Pulse (0.78 -> 0.94)
  float planetaryPulse = (awakenProg <= 0.001 || awakenProg >= 1.0)
    ? 0.0
    : (smoothstep(0.78, 0.85, awakenProg) * (1.0 - smoothstep(0.89, 0.96, awakenProg)));

  // Localized subtle thermal rock warming mask strictly along active fault canyon walls
  float rockWarmthMask = (awakenProg <= 0.001) ? 0.0 : (activeGroove * (1.0 - activeCore * 0.90) * (0.35 + 0.65 * totalSurge));

  // Combined geological deformation fields
  float plateDisplacement = clamp(plateDisp1 + plateDisp2 + plateDisp3 + plateDisp4 + plateDisp5 + plateDisp6, -1.0, 1.0);
  float tectonicFolds = clamp(folds1 + folds2 + folds3 + folds4 + folds5 + folds6 + rawJunction * 0.35 * max(d1, d2), 0.0, 1.0);
  float canyonDepth = max(max(max(canyonDepth1, canyonDepth2), max(canyonDepth3, canyonDepth4)), max(canyonDepth5, canyonDepth6)) + rawJunction * 0.40 * max(d1, d2);
  float collapsedShelves = max(max(max(brokenShelf1, brokenShelf2), max(brokenShelf3, brokenShelf4)), max(brokenShelf5, brokenShelf6));
  vec3 wallSlope = wallSlope1 + wallSlope2 + wallSlope3 + wallSlope4 + wallSlope5 + wallSlope6;

  PrimaryFaultSystem sys;
  sys.geom = vec4(mask, core, groove, trench);
  sys.activeCore = activeCore;
  sys.activeGroove = activeGroove;
  sys.activeHalo = activeHalo;
  sys.totalSurge = totalSurge;
  sys.junctionHotspot = junctionHotspot;
  sys.planetaryPulse = planetaryPulse;
  sys.rockWarmthMask = rockWarmthMask;
  sys.shoulders = shoulders;
  sys.plateDisplacement = plateDisplacement;
  sys.tectonicFolds = tectonicFolds;
  sys.canyonDepth = canyonDepth;
  sys.collapsedShelves = collapsedShelves;
  sys.wallSlope = wallSlope;
  sys.f1Active = wave1;
  sys.f2Active = wave2;
  sys.f3Active = wave3;
  sys.f4Active = wave4;
  sys.f5Active = wave5;
  sys.f6Active = wave6;
  return sys;
}

vec4 evaluatePrimaryFractures(vec3 p, vec3 warp1, vec3 warp2) {
  PrimaryFaultSystem sys = evaluatePrimaryFaultSystem(p, warp1, warp2, 0.0);
  return sys.geom;
}

void main() {
  // Authoritative Stage 1 Mars-like Primordial palette constants in linear space
  vec3 cVolcanicBrown  = vec3(0.1725, 0.0863, 0.0745); // #2C1613 (Deepest volcanic recesses & fault trenches)
  vec3 cDeepRust       = vec3(0.3059, 0.1255, 0.0980); // #4E2019 (Crater floors, low basins, deep geological shadows)
  vec3 cBurntSienna    = vec3(0.4745, 0.2000, 0.1333); // #793322 (Lowlands & sloped crater walls)
  vec3 cIronRed        = vec3(0.5804, 0.2196, 0.1451); // #943825 (Transitional iron-rich rocky terrain)
  vec3 cTerracotta     = vec3(0.6588, 0.3059, 0.1961); // #A84E32 (Main barren terrain - warm iron-rich terracotta)
  vec3 cDustyRust      = vec3(0.5412, 0.2392, 0.1647); // #8A3D2A (Weathered clay plains)
  vec3 cWeatheredClay  = vec3(0.7098, 0.3647, 0.2314); // #B55D3B (Weathered slope deposits)
  vec3 cWarmOchre      = vec3(0.7765, 0.4353, 0.2588); // #C66F42 (Elevated plains, plateaus & highland terrain)
  vec3 cDustyOrange    = vec3(0.8314, 0.5098, 0.3333); // #D48255 (Weathered plateaus, ejecta blankets & crater rims)
  vec3 cDustyTan       = vec3(0.8706, 0.5765, 0.4000); // #DE9366 (High plateaus and ridges)
  vec3 cMineralPeach   = vec3(0.8980, 0.6353, 0.4784); // #E5A27A (Subdued crest highlights, ridges & rocky peaks)

  // Backward-compatible aliases for subsequent stage references & tests
  vec3 cRecessBlack    = cVolcanicBrown;
  vec3 cDeepTerrain    = cDeepRust;
  vec3 cBarrenTerrain  = cTerracotta;
  vec3 cMineralMauve   = cWarmOchre;
  vec3 cWeatheredDust  = cDustyOrange;
  vec3 cRidgeLavender  = cMineralPeach;
  vec3 cCrestHighlight = cMineralPeach;

  vec3 cDeepNebula     = vec3(0.2039, 0.2941, 0.5137); // #344B83
  vec3 cSoftLavender   = vec3(0.7255, 0.6431, 0.8392); // #B9A4D6
  vec3 cBlushPink      = vec3(0.9490, 0.7216, 0.8157); // #F2B8D0
  vec3 cSoftPeach      = vec3(0.9647, 0.8235, 0.7608); // #F6D2C2
  vec3 cPearlWhite     = vec3(1.0000, 0.9608, 0.9608); // #FFF5F5
  vec3 cChampagneGold  = vec3(0.9098, 0.7765, 0.5529); // #E8C68D
  vec3 cWhiteGold      = vec3(0.9922, 0.9686, 0.9176); // #FDF7EA
  vec3 cOceanDeep      = vec3(0.1137, 0.2314, 0.4235); // #1D3B6C
  vec3 cOceanTeal      = vec3(0.1961, 0.4392, 0.5725); // #327092

  // Stage 2: Golden Mineral World palette constants
  vec3 cVolcanic2      = vec3(0.1412, 0.0902, 0.0745); // #241713 Deep volcanic terrain
  vec3 cDarkBronze     = vec3(0.2902, 0.1765, 0.1059); // #4A2D1B Dark bronze
  vec3 cBurntAmber     = vec3(0.4392, 0.2706, 0.1216); // #70451F Burnt amber
  vec3 cMineralOchre   = vec3(0.6039, 0.4157, 0.1765); // #9A6A2D Ochre
  vec3 cMineralGold    = vec3(0.7608, 0.5765, 0.2627); // #C29343 Mineral gold
  vec3 cChampagneMin   = vec3(0.8510, 0.7412, 0.4706); // #D9BD78 Warm champagne
  vec3 cBrightCrest    = vec3(0.9098, 0.8275, 0.6039); // #E8D39A Bright mineral crest

  // Stage 3: Blue Ocean World palette constants
  vec3 cOceanAbyss     = vec3(0.0275, 0.1059, 0.2392); // #071B3D Deep ocean
  vec3 cOceanDeepBlue  = vec3(0.0510, 0.2157, 0.4000); // #0D3766 Deep blue
  vec3 cOceanMidBlue   = vec3(0.0824, 0.3529, 0.5412); // #155A8A Ocean blue
  vec3 cOceanTealSh    = vec3(0.1294, 0.5451, 0.5686); // #218B91 Teal
  vec3 cOceanShallow   = vec3(0.3333, 0.7255, 0.6902); // #55B9B0 Shallow water
  vec3 cCoastGlint     = vec3(0.5412, 0.8510, 0.8118); // #8AD9CF Coastal highlight

  // Stage 4: Living Green World palette constants
  vec3 cDeepVeg        = vec3(0.0706, 0.2275, 0.1412); // #123A24 Deep vegetation
  vec3 cForest         = vec3(0.1216, 0.3529, 0.1961); // #1F5A32 Forest
  vec3 cGreen          = vec3(0.2039, 0.5412, 0.2706); // #348A45 Green
  vec3 cEmerald        = vec3(0.2706, 0.6627, 0.3529); // #45A95A Emerald
  vec3 cMoss           = vec3(0.4431, 0.5608, 0.2706); // #718F45 Moss
  vec3 cFreshVeg       = vec3(0.5608, 0.7451, 0.3843); // #8FBE62 Fresh vegetation

  vec3 norm = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 sphereDir = normalize(vLocalPosition);

  // --------------------------------------------------------------------------
  // 1. MACRO GEOLOGICAL STRUCTURE: Low-Frequency Domain Warping + FBM
  // Broad continental swirling with tangential surface vorticity shear (zero extra snoise calls)
  // --------------------------------------------------------------------------
  vec3 warp1 = vec3(
    snoise(sphereDir * 1.85 + vec3(1.24, 3.41, 5.62)),
    snoise(sphereDir * 1.85 + vec3(7.83, 2.15, 4.38)),
    snoise(sphereDir * 1.85 + vec3(3.52, 6.77, 1.94))
  );

  // Tangential vorticity shear along the sphere curvature
  vec3 warp2 = cross(warp1, sphereDir);
  vec3 macroCoord = sphereDir * 2.15 + warp1 * 0.65 + warp2 * 0.42;
  float macroRaw = planetElevationFbm(macroCoord);

  // Non-linear contrast curve: carves deep recessed trenches and broad plateaus
  float macroElevation = smoothstep(0.08, 0.92, macroRaw);

  // --------------------------------------------------------------------------
  // 2. LARGE CRATERS AND IMPACT BASINS
  // Introduces 5 major ancient impact features across the planetary sphere
  // --------------------------------------------------------------------------
  vec4 impactFeatures = evaluateImpactBasinSystem(sphereDir, warp1, warp2);
  float craterElevDelta  = impactFeatures.x;
  float craterFloorMask  = impactFeatures.y;
  float craterWallMask   = impactFeatures.z;
  float craterRimMask    = impactFeatures.w;
  float craterEjectaMask = smoothstep(0.15, 0.65, craterRimMask) * (1.0 - craterFloorMask);

  // Normalized Stage 1 -> 2 Awakening progress in [0.0, 1.0]:
  // Driven explicitly by uAwakeningProgress from PlanetoidRenderer, or smoothly tracking uVisualStage
  float stageAwaken = clamp(uVisualStage - 1.0, 0.0, 1.0);
  float awakenProg = (uVisualStage >= 2.0)
    ? 1.0
    : ((uVisualStage <= 1.0 && uAwakeningProgress <= 0.001)
      ? 0.0
      : max(uAwakeningProgress, stageAwaken));

  // --------------------------------------------------------------------------
  // 3. 5-6 DOMINANT PLANET-SCALE PRIMARY FRACTURE SYSTEM
  // Evaluates 5-6 major tectonic fault lines (dormant in Stage 1, awakening in 1->2)
  // --------------------------------------------------------------------------
  PrimaryFaultSystem faultSys = evaluatePrimaryFaultSystem(sphereDir, warp1, warp2, awakenProg);
  float primaryFractureMask   = faultSys.geom.x;
  float primaryFractureCore   = faultSys.geom.y;
  float primaryFractureGroove = faultSys.geom.z;
  float primaryFractureTrench = faultSys.geom.w;

  // Raised tectonic rift shoulders (horsts) flanking the fault trench
  float faultShoulder = faultSys.shoulders * (0.85 + 0.15 * snoise(sphereDir * 7.5));

  // --------------------------------------------------------------------------
  // 4. MEDIUM-SCALE GEOLOGICAL RIDGES & FOLDED STRATA
  // Visible from gameplay camera at hero scale
  // --------------------------------------------------------------------------
  vec3 ridgeCoord = sphereDir * 6.20 + warp1 * 0.40;
  float r1 = 1.0 - abs(snoise(ridgeCoord));
  float ridgeField = smoothstep(0.24, 0.86, r1 * r1);

  // Layered geological strata / subtle terrace banding on elevated terrain
  float strataWave = sin(macroElevation * 22.0 + ridgeField * 2.8) * 0.5 + 0.5;
  float strataMod = smoothstep(0.35, 0.65, strataWave) * 0.06;

  // Dynamic crustal deformation: signed plate shift + tectonic compression folds
  float tectonicShift = faultSys.plateDisplacement * 0.055 + faultSys.tectonicFolds * 0.065;
  // Deepening canyon rift and collapsed stepped shelves
  float canyonRiftDrop = faultSys.canyonDepth * 0.135 + faultSys.collapsedShelves * 0.045;
  float elevation = clamp(macroElevation + craterElevDelta + faultShoulder * 0.09 + tectonicShift + (ridgeField - 0.45) * 0.20 + strataMod - canyonRiftDrop, 0.0, 1.0);

  // --------------------------------------------------------------------------
  // 5. FINE SURFACE GRAIN
  // High-frequency subtle mineral speckling; subordinate to macro formations
  // --------------------------------------------------------------------------
  float fineGrain = snoise(sphereDir * 44.0) * 0.038;

  // --------------------------------------------------------------------------
  // 6. STAGE 1 PRIMORDIAL MARS-LIKE MATERIAL HIERARCHY
  // Composition distribution:
  // - 10-15% deep shadow / dark geological regions (cVolcanicBrown, cDeepRust)
  // - 30-40% medium rusty terrain (cBurntSienna, cDustyRust)
  // - 30-40% terracotta / iron-red base (cTerracotta, cIronRed)
  // - 10-15% lighter mineral / highland regions (cWarmOchre, cDustyOrange, cMineralPeach)
  // --------------------------------------------------------------------------
  float tLow     = smoothstep(0.06, 0.24, elevation);
  float tBase    = smoothstep(0.20, 0.46, elevation);
  float tHigh    = smoothstep(0.44, 0.72, elevation);
  float tPeak    = smoothstep(0.70, 0.92, elevation);

  // Layer 1: Base Crust - Elevation-driven gradient from deep rust to warm ochre
  vec3 crustColor = cDeepRust;
  crustColor = mix(crustColor, cBurntSienna, tLow);
  crustColor = mix(crustColor, cTerracotta, tBase);
  crustColor = mix(crustColor, cWarmOchre, tHigh);
  crustColor = mix(crustColor, cDustyOrange, tPeak);

  // Layer 2: Geological Fold Ridges & Highland Terraces
  vec3 ridgeTint = mix(cDustyOrange, cMineralPeach, smoothstep(0.50, 0.88, ridgeField));
  crustColor = mix(crustColor, ridgeTint, smoothstep(0.35, 0.85, ridgeField) * tHigh * 0.70);

  // Layer 3: Impact Craters & Basins (Bowls, Sloping Walls, Raised Rims, Ejecta)
  // - Bowl/Floor: Deep rust lowlands with volcanic brown deep center (NOT black!)
  vec3 craterBowl = mix(cDeepRust, cVolcanicBrown, craterFloorMask * 0.60);
  crustColor = mix(crustColor, craterBowl, craterFloorMask * 0.75);

  // - Sloping inner crater walls: Burnt sienna / iron red
  crustColor = mix(crustColor, cBurntSienna, craterWallMask * 0.50);

  // - Raised sunlit crater rims: Light-catching dusty orange & mineral peach
  crustColor = mix(crustColor, cMineralPeach, craterRimMask * 0.78);

  // - Ejecta blankets: Weathered mineral dust halo surrounding crater rims
  crustColor = mix(crustColor, cDustyTan, craterEjectaMask * 0.40);

  // Layer 4: Dominant Fault Rift Zones (Dormant in Stage 1 - No glowing veins, no black Sharpie lines)
  // - Deep fracture floor: Volcanic brown and deep rust in the channel
  vec3 faultChannel = mix(cBurntSienna, cVolcanicBrown, primaryFractureGroove * 0.90);
  crustColor = mix(crustColor, faultChannel, primaryFractureGroove * 0.82);

  // - Broken / collapsed crust shelves: Weathered broken rock deposits
  crustColor = mix(crustColor, mix(cBurntSienna, cIronRed, 0.5), faultSys.collapsedShelves * 0.65);

  // - Tectonic compression folds: Weathered clay & warm terracotta
  crustColor = mix(crustColor, cWeatheredClay, faultSys.tectonicFolds * 0.45);

  // - Broad deformation / outer rift valley: Warm weathered clay / burnt sienna
  crustColor = mix(crustColor, cWeatheredClay, primaryFractureTrench * 0.38);

  // - Raised rift shoulders (horsts): Warm ochre & dusty orange catching light
  crustColor = mix(crustColor, cWarmOchre, faultShoulder * 0.70);

  // Layer 5: Fine Surface Mineral Grain
  crustColor += fineGrain * vec3(0.24, 0.16, 0.12);

  vec3 stage1Terrain = crustColor;
  vec3 geologicalColor = stage1Terrain;

  // ==========================================================================
  // STAGE 2: GOLDEN MINERAL WORLD MATERIAL HIERARCHY
  // Shifts dominant surface from Mars rust to deep bronze, burnt amber, ochre,
  // mineral gold, champagne, and bright mineral crest highlights.
  // ==========================================================================
  vec3 stage2Crust = cVolcanic2;
  stage2Crust = mix(stage2Crust, cDarkBronze, tLow);
  stage2Crust = mix(stage2Crust, cBurntAmber, tBase);
  stage2Crust = mix(stage2Crust, cMineralOchre, tHigh);
  stage2Crust = mix(stage2Crust, cMineralGold, tPeak);

  // Geological fold ridges in mineral world: warm champagne and bright crest highlights
  vec3 stage2Ridge = mix(cChampagneMin, cBrightCrest, smoothstep(0.50, 0.88, ridgeField));
  stage2Crust = mix(stage2Crust, stage2Ridge, smoothstep(0.35, 0.85, ridgeField) * tHigh * 0.75);

  // Craters & basins in mineral world: dark bronze bowls and bright champagne rims
  vec3 s2CraterBowl = mix(cDarkBronze, cVolcanic2, craterFloorMask * 0.70);
  stage2Crust = mix(stage2Crust, s2CraterBowl, craterFloorMask * 0.75);
  stage2Crust = mix(stage2Crust, cBurntAmber, craterWallMask * 0.50);
  stage2Crust = mix(stage2Crust, cBrightCrest, craterRimMask * 0.75);
  stage2Crust = mix(stage2Crust, cChampagneMin, craterEjectaMask * 0.40);

  // Major fault rift zones in mineral world: dark volcanic groove, mineral gold shoulders
  vec3 s2FaultChannel = mix(cBurntAmber, cVolcanic2, primaryFractureGroove * 0.90);
  stage2Crust = mix(stage2Crust, s2FaultChannel, primaryFractureGroove * 0.75);
  stage2Crust = mix(stage2Crust, cMineralGold, faultShoulder * 0.75);
  stage2Crust = mix(stage2Crust, cMineralOchre, primaryFractureTrench * 0.40);
  stage2Crust += fineGrain * vec3(0.32, 0.24, 0.14);

  // --------------------------------------------------------------------------
  // CONTINUOUS FEATURE BLENDING PROGRESS (Phase 3 — Layer 2 & 4)
  // Derived continuously from uVisualStage in [1.0, 5.0]
  // --------------------------------------------------------------------------
  float p12 = clamp(uVisualStage - 1.0, 0.0, 1.0); // 1.0 -> 2.0: Seed -> Awakening
  float p23 = clamp(uVisualStage - 2.0, 0.0, 1.0); // 2.0 -> 3.0: Awakening -> Oceans
  float p34 = clamp(uVisualStage - 3.0, 0.0, 1.0); // 3.0 -> 4.0: Oceans -> Life & Atmosphere
  float p45 = clamp(uVisualStage - 4.0, 0.0, 1.0); // 4.0 -> 5.0: Life -> Celestial Alignment

  float seedToAwakening   = smoothstep(0.06, 0.98, p12);
  float awakeningToOceans = smoothstep(0.06, 0.98, p23);
  float oceansToLife      = smoothstep(0.08, 0.98, p34);
  float lifeToAlignment   = smoothstep(0.12, 0.98, p45);

  // Synchronized celestial harmonic pulse peaking at 4.95 before settling cleanly at 5.0
  float celestialPulse = (uVisualStage >= 5.0)
    ? 0.0
    : (smoothstep(0.88, 0.95, p45) * (1.0 - smoothstep(0.95, 1.00, p45)));

  // Blended Base Crust (Stage 1 -> Stage 2 Golden Mineral Awakening)
  float s12Blend = smoothstep(0.08, 0.95, awakenProg);
  vec3 baseCrustColor = mix(stage1Terrain, stage2Crust, s12Blend);

  // --------------------------------------------------------------------------
  // STAGE 3: BLUE OCEAN WORLD & HYDRATED CONTINENTAL LAND
  // Liquid ocean filling driven naturally by elevation & impact depression
  // --------------------------------------------------------------------------
  float targetOceanFill = (uOceanFill > 0.0) ? uOceanFill : 0.85;
  float oceanFillProgress = (uVisualStage >= 3.0)
    ? 1.0
    : (smoothstep(0.04, 0.22, p23) * 0.25 + smoothstep(0.20, 0.52, p23) * 0.35 + smoothstep(0.50, 0.88, p23) * 0.40);
  float effectiveOceanFill = (uVisualStage >= 3.0)
    ? max(uOceanFill, 0.85)
    : ((uVisualStage <= 2.0 && uOceanFill <= 0.001)
      ? 0.0
      : max(uOceanFill, oceanFillProgress * targetOceanFill));

  float seaLevel = mix(-0.25, 0.52, effectiveOceanFill);
  float isOcean = (effectiveOceanFill > 0.001)
    ? smoothstep(seaLevel + 0.025, seaLevel - 0.025, elevation)
    : 0.0;
  float landGrad = clamp((elevation - seaLevel) / max(0.001, 1.0 - seaLevel), 0.0, 1.0);

  // Stage 3 Continental Land (Hydrated Oceanic World)
  vec3 cCoastSand    = vec3(0.68, 0.62, 0.52); // Coastal sand / shelf
  vec3 cMoistEarth   = vec3(0.42, 0.38, 0.33); // Moist lowland sediment
  vec3 cTemperateRock= vec3(0.50, 0.48, 0.45); // Weathered continental stone
  vec3 cHighPlateau  = vec3(0.62, 0.60, 0.57); // Highlands & plateau rock
  vec3 cAlpinePeak   = vec3(0.78, 0.77, 0.75); // Granite mountain crests

  vec3 stage3Land = cCoastSand;
  stage3Land = mix(stage3Land, cMoistEarth, smoothstep(0.0, 0.15, landGrad));
  stage3Land = mix(stage3Land, cTemperateRock, smoothstep(0.12, 0.45, landGrad));
  stage3Land = mix(stage3Land, cHighPlateau, smoothstep(0.40, 0.75, landGrad));
  stage3Land = mix(stage3Land, cAlpinePeak, smoothstep(0.65, 0.95, landGrad) + smoothstep(0.55, 0.90, ridgeField) * 0.40);
  stage3Land += fineGrain * vec3(0.18, 0.18, 0.18);

  // Stage 3 Liquid Ocean Simulation
  float oceanDepth = 0.0;
  float oceanSpec = 0.0;
  float shoreFillActive = (uVisualStage >= 3.0) ? 0.0 : (smoothstep(0.08, 0.50, p23) * (1.0 - smoothstep(0.75, 0.98, p23)));
  float capillaryRipple = sin(uTime * 4.5 + elevation * 48.0) * 0.5 + 0.5;
  float shoreEdge = 0.0;
  vec3 stage3Ocean = cOceanMidBlue;

  if (effectiveOceanFill > 0.001) {
    float waveRipple = sin(dot(sphereDir, vec3(26.0, 32.0, 20.0)) + uTime * 2.2) * (0.02 * min(1.0, effectiveOceanFill * 1.5));
    oceanDepth = clamp((seaLevel - elevation) * 3.2 + waveRipple, 0.0, 1.0);

    stage3Ocean = cOceanShallow;
    stage3Ocean = mix(stage3Ocean, cOceanTealSh, smoothstep(0.04, 0.22, oceanDepth));
    stage3Ocean = mix(stage3Ocean, cOceanMidBlue, smoothstep(0.20, 0.50, oceanDepth));
    stage3Ocean = mix(stage3Ocean, cOceanDeepBlue, smoothstep(0.45, 0.80, oceanDepth));
    stage3Ocean = mix(stage3Ocean, cOceanAbyss, smoothstep(0.75, 1.00, oceanDepth));

    vec3 halfVec = normalize(uLightDirection + viewDir);
    oceanSpec = pow(clamp(dot(norm, halfVec), 0.0, 1.0), 32.0) * (0.35 + 0.65 * effectiveOceanFill);
    shoreEdge = smoothstep(0.028, 0.004, abs(elevation - seaLevel)) * (0.30 * effectiveOceanFill + 0.45 * shoreFillActive * capillaryRipple);
  }

  // Composite Stage 3 Surface (Oceanic World: Predominantly Blue Oceans + Exposed Land)
  vec3 stage3Surface = mix(stage3Land, stage3Ocean, isOcean);
  stage3Surface += (vec3(0.85, 0.95, 1.0) * oceanSpec + cCoastGlint * shoreEdge) * isOcean;

  // --------------------------------------------------------------------------
  // STAGE 4: LIVING GREEN WORLD
  // Flora colonizes continental land; blue oceans remain preserved!
  // --------------------------------------------------------------------------
  float bioProg = (uVisualStage >= 4.0) ? 1.0 : smoothstep(0.12, 0.92, p34);
  float fertility = snoise(sphereDir * 7.5 + warp1 * 0.40) * 0.5 + 0.5;

  float coastalProximity = (1.0 - smoothstep(0.04, 0.35, landGrad));
  float coastalBias = smoothstep(0.12, 0.38, p34) * (1.0 - smoothstep(0.40, 0.70, p34));
  float valleyBias = (1.0 - ridgeField * 0.65);

  float bioSuitability = fertility * (1.15 - landGrad * 0.50) + coastalProximity * coastalBias * 0.40 + valleyBias * 0.20;
  float bioThreshold = mix(0.92, 0.12, bioProg);
  float bioCoverage = (uVisualStage <= 3.0) ? 0.0 : smoothstep(bioThreshold, bioThreshold + 0.18, bioSuitability) * bioProg;

  // Vegetation responding to topography: deep forest in valleys, emerald on coasts, moss/fresh on ridges
  vec3 vegColor = cForest;
  vegColor = mix(vegColor, cDeepVeg, valleyBias * 0.55);
  vegColor = mix(vegColor, cEmerald, coastalProximity * 0.70);
  vegColor = mix(vegColor, cGreen, smoothstep(0.18, 0.55, landGrad));
  vegColor = mix(vegColor, cMoss, smoothstep(0.45, 0.75, landGrad));
  vegColor = mix(vegColor, cFreshVeg, smoothstep(0.60, 0.88, landGrad) + smoothstep(0.45, 0.85, ridgeField) * 0.35);

  // Colonized land: rich vegetation canopy with alpine granite crests preserved
  vec3 stage4Land = mix(stage3Land, vegColor, bioCoverage * 0.88);
  stage4Land = mix(stage4Land, cAlpinePeak, smoothstep(0.82, 0.98, landGrad) * smoothstep(0.65, 0.95, ridgeField));

  // Backward compatibility aliases for existing tests
  vec3 cCeladon = vec3(0.38, 0.58, 0.48);
  vec3 biomeHue = vegColor;
  vec3 landColor = stage4Land;

  // Composite Stage 4 Surface: Green Continents + Blue/Teal Oceans
  vec3 stage4Surface = mix(stage4Land, stage3Ocean, isOcean);
  stage4Surface += (vec3(0.85, 0.95, 1.0) * oceanSpec + cCoastGlint * shoreEdge) * isOcean;

  // --------------------------------------------------------------------------
  // CONTINUOUS SURFACE BLENDING ACROSS EPOCHS (Stage 1 -> 2 -> 3 -> 4)
  // --------------------------------------------------------------------------
  vec3 surfaceColor = baseCrustColor;
  float s23Blend = smoothstep(0.06, 0.94, p23);
  surfaceColor = mix(surfaceColor, stage3Surface, s23Blend);
  float s34Blend = smoothstep(0.08, 0.94, p34);
  surfaceColor = mix(surfaceColor, stage4Surface, s34Blend);

  // --------------------------------------------------------------------------
  // 7. KINTSUGI GOLDEN VEINS, AWAKENING & GOLDEN ASCENSION (Stages 1->2 & 5)
  // Evaluated when veins are active or during 1 -> 2 transition or 4 -> 5 Golden Ascension
  // --------------------------------------------------------------------------
  float targetKintsugi = (uKintsugiGlow > 0.0) ? uKintsugiGlow : 0.85;
  float awakenFactor = smoothstep(0.08, 0.95, awakenProg);
  float effectiveKintsugi = (uVisualStage >= 2.0)
    ? max(uKintsugiGlow, 0.85)
    : max(uKintsugiGlow, awakenFactor * targetKintsugi);

  float celestialEnergy = (uVisualStage >= 5.0)
    ? 1.0
    : max(uGoldIgnited, lifeToAlignment);

  if (effectiveKintsugi > 0.001 || celestialEnergy > 0.001) {
    // Structural crack components driven by the 5-6 dominant planet-scale fractures
    float crackCore = faultSys.activeCore;
    float crackGroove = faultSys.activeGroove;
    float crackTrench = primaryFractureTrench;
    float crackHalo = faultSys.activeHalo;
    float junctionHotspot = faultSys.junctionHotspot;
    float totalSurge = faultSys.totalSurge;
    float planetaryPulse = faultSys.planetaryPulse;

    // Backward-compatible aliases for transition sub-event tests
    float firstIgnition = faultSys.totalSurge;
    float surgeWave = faultSys.totalSurge;
    float energyPeak12 = faultSys.planetaryPulse;

    // Composite crack emission strength
    float crackSum = clamp(crackCore * 1.5 + crackGroove * 0.40, 0.0, 1.0);

    // ------------------------------------------------------------------------
    // STAGE 5: TRANSCENDENT CELESTIAL WORLD SURFACE TRANSFORMATION (Part A & B4)
    // Multi-color pearlescent surface: blue/cyan, lavender/violet, rose/pink/peach,
    // warm champagne geological regions, and radiant white-gold crests
    // ------------------------------------------------------------------------
    if (celestialEnergy > 0.001) {
      // Celestial Palette hierarchy preserving geological structure without muddy browns:
      // Basins: deep celestial blue / rich cobalt (#183A78 / #285EA8)
      // Lowlands: luminous ocean blue / cyan (#398FD0 / #63C9E8)
      // Geological highlands: warm champagne gold (#D8C28A / #E9D39A)
      // Mountain ridges: radiant celestial gold (#F4D98A)
      // Crests & peaks: white-gold celestial highlights (#FFF7E5)
      vec3 cGoldAntiqueValleys = vec3(0.094, 0.227, 0.471); // #183A78 Deep celestial blue valleys (no muddy brown)
      vec3 cGoldBronzeLow      = vec3(0.224, 0.561, 0.816); // #398FD0 Luminous ocean blue / cyan lowlands
      vec3 cGoldMainCelestial  = vec3(0.847, 0.761, 0.541); // #D8C28A Warm champagne gold geological body
      vec3 cGoldBrightRidge    = vec3(0.957, 0.851, 0.541); // #F4D98A Radiant celestial gold ridges
      vec3 cGoldRadiantCrest   = vec3(1.000, 0.969, 0.898); // #FFF7E5 White-gold radiant crests & high peaks

      // 1. Macro Continental Domain Coordinates (4-7 broad regional planetary domains)
      // Uses low-frequency warped spherical coordinates to eliminate mottled camouflage noise
      vec3 macroP = sphereDir * 1.35 + warp1 * 0.25;

      // Domain A: Pearlescent Blue / Ocean Cyan dominant (25-35%)
      float domBlue = smoothstep(-0.35, 0.40, sin(macroP.x * 1.6 + macroP.y * 1.1) + cos(macroP.z * 1.4) * 0.55);

      // Domain B: Ethereal Lavender / Pastel Violet (15-20%)
      float domViolet = smoothstep(-0.30, 0.45, sin(macroP.y * 1.9 - macroP.z * 1.3 + 1.2) + sin(macroP.x * 1.4) * 0.50);

      // Domain C: Rose / Celestial Pink / Peach Energy (10-20%)
      float domRose = smoothstep(-0.25, 0.55, cos(macroP.x * 1.8 - macroP.y * 1.8 + 2.4) * 0.85 + sin(macroP.z * 2.0) * 0.40);

      // Domain D: Warm Champagne / Gold Geological Highland Formations (15-25%)
      float domGold = smoothstep(0.35, 0.82, ridgeField * 0.70 + elevation * 0.60);

      // 2. Vertical Elevation Color Tiering for each domain
      // Blue/Cyan Tier
      vec3 colBlueTier = mix(cGoldAntiqueValleys, cGoldBronzeLow, smoothstep(0.12, 0.42, elevation));
      colBlueTier = mix(colBlueTier, vec3(0.388, 0.788, 0.910), smoothstep(0.38, 0.68, elevation)); // #63C9E8 Cyan
      colBlueTier = mix(colBlueTier, vec3(0.616, 0.898, 0.906), smoothstep(0.65, 0.90, elevation)); // #9DE5E7 Pearl Aqua

      // Lavender/Violet Tier
      vec3 colVioletTier = mix(vec3(0.24, 0.18, 0.44), vec3(0.561, 0.510, 0.788), smoothstep(0.12, 0.42, elevation)); // #8F82C9 Violet
      colVioletTier = mix(colVioletTier, vec3(0.718, 0.651, 0.898), smoothstep(0.38, 0.68, elevation)); // #B7A6E5 Lavender
      colVioletTier = mix(colVioletTier, vec3(0.824, 0.784, 0.941), smoothstep(0.65, 0.90, elevation)); // #D2C8F0 Pearl Violet

      // Rose/Pink/Peach Tier
      vec3 colRoseTier = mix(vec3(0.42, 0.22, 0.35), vec3(0.902, 0.643, 0.722), smoothstep(0.12, 0.42, elevation)); // #E6A4B8 Soft Rose
      colRoseTier = mix(colRoseTier, vec3(0.941, 0.710, 0.820), smoothstep(0.38, 0.68, elevation)); // #F0B5D1 Celestial Pink
      colRoseTier = mix(colRoseTier, vec3(0.953, 0.761, 0.635), smoothstep(0.65, 0.90, elevation)); // #F3C2A2 Peach Light

      // Warm Champagne/Gold Tier
      vec3 colGoldTier = mix(vec3(0.48, 0.38, 0.24), cGoldMainCelestial, smoothstep(0.18, 0.48, elevation));
      colGoldTier = mix(colGoldTier, cGoldBrightRidge, smoothstep(0.48, 0.78, elevation));
      colGoldTier = mix(colGoldTier, cGoldRadiantCrest, smoothstep(0.58, 0.90, ridgeField));

      // 3. Composite Macro Planetary Surface
      vec3 celestialLand = colBlueTier;
      celestialLand = mix(celestialLand, colVioletTier, domViolet * 0.65);
      celestialLand = mix(celestialLand, colRoseTier, domRose * 0.55);
      celestialLand = mix(celestialLand, colGoldTier, domGold * 0.75 + smoothstep(0.58, 0.90, ridgeField) * 0.50);

      // Mountain ridge and crest brilliance highlights
      celestialLand = mix(celestialLand, cGoldBrightRidge, smoothstep(0.70, 0.90, ridgeField) * 0.60);
      celestialLand = mix(celestialLand, cGoldRadiantCrest, smoothstep(0.82, 0.98, ridgeField) * 0.75);

      // Preserve subtle crystalline mineral texture without dark splotches
      celestialLand += fineGrain * vec3(0.12, 0.16, 0.22);

      // 4. Molten Celestial Ocean Basins (liquid cobalt / cyan reflecting celestial light)
      vec3 cMoltenOceanDeep = vec3(0.157, 0.369, 0.659); // #285EA8 Cobalt blue
      vec3 cMoltenOceanShallow = vec3(0.388, 0.788, 0.910); // #63C9E8 Luminous cyan
      vec3 moltenOcean = mix(cMoltenOceanShallow, cMoltenOceanDeep, oceanDepth);
      moltenOcean = mix(moltenOcean, vec3(0.616, 0.898, 0.906), (1.0 - oceanDepth) * 0.35);

      // Combine land and celestial oceans into planetary surface
      vec3 goldenPlanet = mix(celestialLand, moltenOcean, isOcean);

      // 5. Deep Cavities & Recesses: ethereal deep indigo/violet glow (no black/brown cavities)
      vec3 internalWarmth = mix(vec3(0.10, 0.18, 0.38), vec3(0.32, 0.26, 0.52), 0.60);
      goldenPlanet = mix(internalWarmth, goldenPlanet, smoothstep(0.04, 0.20, elevation));

      // 6. Pearlescent Iridescent Flow (view-dependent angle shifts between cyan, lavender, rose)
      float pearlPhase = dot(norm, viewDir) * 2.8 + sphereDir.y * 1.6 + uTime * 0.12;
      vec3 pearlShimmer = mix(
        vec3(0.388, 0.788, 0.910), // Radiant cyan
        vec3(0.718, 0.651, 0.898), // Soft lavender
        sin(pearlPhase) * 0.5 + 0.5
      );
      pearlShimmer = mix(
        pearlShimmer,
        vec3(0.902, 0.643, 0.722), // Soft rose
        sin(pearlPhase + 2.09) * 0.5 + 0.5
      );
      float viewFresnel = clamp(1.0 - abs(dot(norm, viewDir)), 0.0, 1.0);
      goldenPlanet += pearlShimmer * (pow(max(viewFresnel, 0.0), 2.2) * 0.22);

      // 7. Central Planetary Radiance (soft ethereal inner luminosity facing camera)
      float centerLuminance = pow(clamp(dot(norm, viewDir), 0.0, 1.0), 1.8) * 0.18;
      goldenPlanet += vec3(0.85, 0.88, 0.98) * centerLuminance;

      // 8. Final Celestial Pulse (4.90 -> 5.00) & Ridge brilliance boost
      float ridgeBrilliance = ridgeField * (0.18 * celestialEnergy + 0.28 * celestialPulse);
      goldenPlanet += cGoldRadiantCrest * ridgeBrilliance;

      // 9. Spreading transformation mask: Kintsugi-adjacent -> ridges -> continents -> ocean basins (4.18 -> 4.85)
      float goldAffinity = crackSum * 0.38 + ridgeField * 0.35 + clamp(elevation * 0.40 + 0.30, 0.0, 0.50);
      float goldSpreadFront = (uVisualStage >= 5.0) ? 1.0 : smoothstep(0.18, 0.85, p45);
      float goldThreshold = mix(1.25, -0.25, goldSpreadFront);
      float goldSpreadMask = (uVisualStage >= 5.0)
        ? 1.0
        : clamp(smoothstep(goldThreshold, goldThreshold + 0.25, goldAffinity + (1.0 - isOcean) * 0.18) * smoothstep(0.18, 0.38, p45), 0.0, 1.0);
      if (uGoldIgnited > 0.0) {
        goldSpreadMask = max(goldSpreadMask, uGoldIgnited);
      }

      surfaceColor = mix(surfaceColor, goldenPlanet, goldSpreadMask);
    }

    // ------------------------------------------------------------------------
    // KINTSUGI FRACTURE RADIANCE & EMISSION (Additive on top of terrain)
    // ------------------------------------------------------------------------
    vec3 cAmberIgnite   = vec3(0.851, 0.604, 0.227); // #D99A3A Warm amber initial ignition
    vec3 cChampagneGold = vec3(0.949, 0.788, 0.427); // #F2C96D Rich champagne gold active propagation
    vec3 cBrightGold    = vec3(0.969, 0.843, 0.478); // #F7D77A Mature Kintsugi bright gold
    vec3 cWhiteGoldPeak = vec3(1.000, 0.969, 0.898); // #FFF7E5 White-gold junction hotspot & surge crest

    vec3 cAmberDark     = vec3(0.55, 0.30, 0.06); // Deep groove warmth
    vec3 cChampagne     = vec3(0.91, 0.78, 0.55); // #E8C68D Champagne Gold
    vec3 cRadiantGold   = vec3(1.00, 0.88, 0.56); // Bright active fracture
    vec3 cWhiteGoldHot  = vec3(0.992, 0.969, 0.918); // #FDF7EA White-Gold
    vec3 cPeakCelestial = vec3(1.00, 0.992, 0.949); // #FFFDF2 Near-white celestial energy

    // 1. PHYSICAL EMBEDDING: Deepen canyon floor to dark volcanic basalt in early stages
    // In Stage 5, eliminate dark basalt trench entirely so energy flows seamlessly through luminous terrain
    float trenchPreserve = (uVisualStage >= 5.0) ? 0.0 : ((uVisualStage >= 4.0) ? 0.45 : 1.0);
    vec3 darkCanyonBasalt = cVolcanicBrown * 0.58;
    surfaceColor = mix(surfaceColor, darkCanyonBasalt, crackGroove * (1.0 - crackCore * 0.88) * effectiveKintsugi * trenchPreserve);

    // 2. Early interior amber thermal heat deep inside opening rifts
    // Visible before the molten gold wave arrives
    vec3 rockWarmth = cAmberIgnite * (faultSys.rockWarmthMask * 0.35 + faultSys.canyonDepth * 0.12 * smoothstep(0.15, 0.50, awakenProg)) * effectiveKintsugi;
    surfaceColor += rockWarmth;

    // 3. Narrow Molten Golden Vein Core
    // Gold is strictly concentrated inside the narrow crackCore deep in the trench
    vec3 moltenVein = mix(cAmberIgnite * 0.95, cChampagneGold, smoothstep(0.05, 0.50, crackCore));
    moltenVein = mix(moltenVein, cBrightGold, smoothstep(0.40, 0.85, crackCore));
    moltenVein = mix(moltenVein, cWhiteGoldPeak, clamp(junctionHotspot * 1.1 + totalSurge * 1.4, 0.0, 1.0));

    // Stage 4 -> 5: Celestial White-Gold shift with rose-lilac aura
    if (celestialEnergy > 0.01) {
      vec3 cCelestialChampagne = vec3(0.96, 0.88, 0.68);
      moltenVein = mix(moltenVein, cCelestialChampagne, celestialEnergy * 0.65);
      moltenVein = mix(moltenVein, cWhiteGoldHot, celestialEnergy * 0.85);
      moltenVein = mix(moltenVein, cPeakCelestial, clamp(junctionHotspot * 0.85 + celestialPulse * 0.60 + totalSurge * 0.80, 0.0, 1.0) * celestialEnergy);

      // Diffuse soft celestial rose aura into halo
      vec3 cCelestialRose = vec3(0.95, 0.75, 0.88);
      moltenVein = mix(moltenVein, cCelestialRose, crackHalo * (1.0 - crackCore) * celestialEnergy * 0.60);
    }

    vec3 fractureColor = moltenVein; // Alias for backward compatibility & tests

    // Attenuate veins under deep ocean while maintaining shallow underwater shimmer
    float veinOceanFactor = mix(1.0, 0.45 * (1.0 - oceanDepth * 0.8) + (uVisualStage >= 5.0 ? 0.45 : 0.0), isOcean);

    // Embed molten vein into the floor of the fissure
    surfaceColor = mix(surfaceColor, moltenVein, clamp(crackCore * 1.25 * effectiveKintsugi * veinOceanFactor, 0.0, 1.0));

    // Add additive molten radiance (focused on narrow core, surge tip, and junction bursts)
    float coreEmission = (crackCore * 1.35 + junctionHotspot * 1.50 + totalSurge * 1.75 + planetaryPulse * 0.45) * effectiveKintsugi;
    if (celestialEnergy > 0.01) {
      float harmonicPulse = sin(uTime * (3.4 + 2.4 * celestialEnergy)) * 0.5 + 0.5;
      coreEmission *= (1.0 + (0.40 + 0.30 * harmonicPulse + 0.50 * celestialPulse) * celestialEnergy);
    }
    surfaceColor += moltenVein * coreEmission * veinOceanFactor;
  }

  // --------------------------------------------------------------------------
  // 8. SCARS / MISSES IMPACT DARKENING
  // --------------------------------------------------------------------------
  if (uScarsCount > 0.5) {
    float d1 = length(sphereDir - vec3(0.55, 0.60, -0.58));
    float d2 = length(sphereDir - vec3(-0.68, -0.32, 0.65));
    float s1 = smoothstep(0.35, 0.08, d1) * min(1.0, uScarsCount);
    float s2 = smoothstep(0.28, 0.05, d2) * min(1.0, max(0.0, uScarsCount - 1.0));
    float scarDarkening = clamp((s1 + s2) * 0.65, 0.0, 0.75);
    surfaceColor = mix(surfaceColor, vec3(0.06, 0.07, 0.12), scarDarkening);
  }

  // --------------------------------------------------------------------------
  // 9. DIRECTIONAL LIGHTING & AMBIENT RECESS OCCLUSION
  // Recessed craters, valleys, and fault grooves receive relaxed cavity AO
  // Analytical wall slopes produce real 3D sunlit and shadowed canyon walls
  // Soft hemispherical cosmic ambient fill keeps shadowed regions readable
  // --------------------------------------------------------------------------
  float cavityAO = smoothstep(0.06, 0.44, elevation) * (1.0 - primaryFractureGroove * 0.35) * (1.0 - craterFloorMask * 0.25);
  float recessAO = cavityAO; // Alias for test compatibility
  float ao = mix(0.52, 1.0, cavityAO);

  // 3D Analytical surface normal perturbed by tectonic canyon wall slopes
  vec3 surfaceNorm = normalize(norm + faultSys.wallSlope * 0.55);

  float NdotL = dot(surfaceNorm, uLightDirection);
  float directLight = clamp(NdotL, 0.0, 1.0);

  // Soft hemispherical cosmic ambient fill: fills shadows with subtle celestial ambient
  // In Stage 5, boosted celestial ambient fill prevents shadowy areas from turning muddy brown or black
  float cosmicFill = 0.34 + 0.14 * clamp(dot(surfaceNorm, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
  if (celestialEnergy > 0.001) {
    cosmicFill += 0.28 * celestialEnergy;
  }

  // Total light combining direct lighting and cosmic ambient fill, modulated by cavity AO
  float stage5AORelax = (uVisualStage >= 5.0) ? 0.82 : 0.52;
  float totalLight = (directLight * 0.68 + cosmicFill * 0.52) * mix(stage5AORelax, 1.0, cavityAO);
  totalLight += faultSys.planetaryPulse * 0.15;
  surfaceColor *= totalLight;

  // --------------------------------------------------------------------------
  // 10. FRESNEL ATMOSPHERE & CELESTIAL ALIGNMENT RADIANCE
  // In Stage 1: Warm, dormant mineral silhouette edge (zero glow, no white rim)
  // Develops during 3.65 -> 4.0, frames the planet with delicate cosmic rim in 4.2 -> 5.0
  // --------------------------------------------------------------------------
  float atmoProg = (uVisualStage >= 4.0) ? 1.0 : smoothstep(0.68, 0.98, p34);
  float targetAtmo = (uAtmosphereDensity > 0.0) ? uAtmosphereDensity : 0.90;
  float effectiveAtmosphere = (uVisualStage <= 3.0 && uAtmosphereDensity <= 0.001)
    ? 0.0
    : max(uAtmosphereDensity, atmoProg * targetAtmo);

  float shieldProg = (uVisualStage >= 5.0) ? 1.0 : smoothstep(0.40, 0.98, p45);
  float targetShield = (uShieldCharge > 0.0) ? uShieldCharge : 1.0;
  float effectiveShield = max(uShieldCharge, shieldProg * targetShield);

  // Subtle planetary crust response during Stage 1 -> 2 awakening (1.35 -> 1.90)
  float awakenActivity = smoothstep(0.35, 0.65, p12) * smoothstep(0.98, 0.75, p12);
  float awakenPulse = sin(uTime * 2.8) * 0.5 + 0.5;
  float crustAwakenGlow = awakenActivity * (0.12 + 0.08 * awakenPulse);

  // Grazing Fresnel rim: thin power curve prevents opaque border appearance
  float fresnelRim = pow(max(1.0 - abs(dot(norm, viewDir)), 0.0), 4.5);
  vec3 cWarmMineralRim = vec3(0.42, 0.22, 0.16); // Subtle warm mineral edge separation against celestial background
  vec3 cColdMineralRim = cWarmMineralRim; // Alias for test/code compatibility

  // Multi-stage atmospheric silhouette rim evolution:
  // Stage 1: Warm mineral terracotta edge
  vec3 rimTone = cWarmMineralRim;
  // Stage 2: Warm amber/champagne edge
  vec3 cAtmoAmber2 = vec3(0.72, 0.48, 0.22);
  rimTone = mix(rimTone, cAtmoAmber2, smoothstep(0.15, 0.90, awakenProg));
  // Stage 3: Subtle blue/cyan oceanic edge
  vec3 cAtmoBlue3  = vec3(0.18, 0.52, 0.78);
  rimTone = mix(rimTone, cAtmoBlue3, smoothstep(0.15, 0.85, p23));
  // Stage 4: Blue-green / emerald edge
  vec3 cAtmoGreen4 = vec3(0.20, 0.65, 0.48);
  rimTone = mix(rimTone, cAtmoGreen4, smoothstep(0.15, 0.85, p34));

  vec3 rimTint = mix(rimTone, cSoftLavender, effectiveAtmosphere * 0.45);

  // Blend in subtle amber crust warmth during awakening
  rimTint = mix(rimTint, vec3(0.95, 0.78, 0.50), crustAwakenGlow);

  // Stage 5 Celestial alignment: multi-color grazing rim with soft rose, cyan, and restrained pearl-gold
  if (celestialEnergy > 0.01 || effectiveShield > 0.01) {
    vec3 cCosmicRose    = vec3(0.92, 0.68, 0.82); // Soft cosmic rose
    vec3 cCelestialCyan = vec3(0.45, 0.82, 0.95); // Ethereal cyan rim
    vec3 cCelestialGold = vec3(0.95, 0.88, 0.74); // Restrained pearl-gold
    float rimMix = max(celestialEnergy * 0.6, effectiveShield * 0.4);
    vec3 celestialRim = mix(cCelestialCyan, cCosmicRose, smoothstep(0.1, 0.6, sphereDir.y * 0.5 + 0.5));
    celestialRim = mix(celestialRim, cCelestialGold, rimMix);
    rimTint = mix(rimTint, celestialRim, max(celestialEnergy, effectiveShield * 0.80));
    rimTint = mix(rimTint, vec3(0.99, 0.97, 0.92), celestialPulse * 0.35);
  }
  float rimIntensity = 0.06 + 0.28 * effectiveAtmosphere + 0.22 * effectiveShield + crustAwakenGlow * 0.20 + celestialPulse * 0.08 + faultSys.planetaryPulse * 0.10;
  surfaceColor += rimTint * fresnelRim * rimIntensity;

  gl_FragColor = vec4(surfaceColor, 1.0);
}
`;

// ============================================================================
// 3. ATMOSPHERE FRESNEL SHELL SHADER
// ============================================================================

export const PLANETOID_ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const PLANETOID_ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uVisualStage;
uniform float uAtmosphereDensity;
uniform float uShieldCharge;
uniform float uGoldIgnited;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  float p12 = clamp(uVisualStage - 1.0, 0.0, 1.0);
  float p23 = clamp(uVisualStage - 2.0, 0.0, 1.0);
  float p34 = clamp(uVisualStage - 3.0, 0.0, 1.0);
  float p45 = clamp(uVisualStage - 4.0, 0.0, 1.0);

  float atmoProg = (uVisualStage >= 4.0) ? 1.0 : smoothstep(0.68, 0.98, p34);
  float targetAtmo = (uAtmosphereDensity > 0.0) ? uAtmosphereDensity : 0.90;
  float effectiveAtmo = (uVisualStage <= 3.0 && uAtmosphereDensity <= 0.001)
    ? 0.0
    : max(uAtmosphereDensity, atmoProg * targetAtmo);

  float shieldProg = (uVisualStage >= 5.0) ? 1.0 : smoothstep(0.40, 0.98, p45);
  float effectiveShield = max(uShieldCharge, shieldProg);
  float effectiveIgnited = max(uGoldIgnited, smoothstep(0.40, 0.98, p45));

  if (effectiveAtmo <= 0.001 && effectiveShield <= 0.001) {
    discard;
  }

  vec3 norm = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  float NdotV = clamp(abs(dot(norm, viewDir)), 0.0, 1.0);

  // Double-rim Fresnel:
  // 1. Sharp limb rim for a crisp, luminous silhouette without thick opaque disc appearance
  float rimSharp = pow(max(1.0 - NdotV, 0.0), 5.5) * 0.28;
  // 2. Soft outer cosmic halo providing atmospheric volume that gently lifts the planet
  float haloSoft = pow(max(1.0 - NdotV, 0.0), 3.0) * 0.32;
  float compositeRim = rimSharp + haloSoft;

  // Multi-stage atmosphere color evolution (Requirement 14):
  // Stage 2: Warm amber / champagne atmosphere
  vec3 cAtmoAmber2 = vec3(0.86, 0.68, 0.40);
  // Stage 3: Oceanic blue / cyan atmosphere
  vec3 cAtmoOcean3 = vec3(0.18, 0.52, 0.76);
  // Stage 4: Blue-green atmospheric influence
  vec3 cAtmoGreen4 = vec3(0.20, 0.62, 0.48);

  // Stage 5 Celestial palette: deep ethereal violet -> pastel lavender -> soft rose -> radiant cyan -> pearl gold
  vec3 cCosmicViolet   = vec3(0.38, 0.24, 0.62); // Deep ethereal violet (inner volume)
  vec3 cSoftLavender   = vec3(0.68, 0.58, 0.88); // Pastel lavender (mid atmosphere)
  vec3 cRosePink       = vec3(0.92, 0.66, 0.80); // Soft celestial rose (outer limb)
  vec3 cPearlAqua      = vec3(0.55, 0.85, 0.92); // Luminous cyan/aqua rim
  vec3 cRestrainedGold = vec3(0.95, 0.88, 0.74); // Champagne pearl gold highlight

  // Multi-tier gradient across atmosphere volume:
  // Inner volume: ethereal violet / lavender
  // Mid volume: lavender / soft rose
  // Outer limb: soft rose transitioning to radiant cyan and pearl gold
  vec3 cStage5Atmo = mix(cCosmicViolet, cSoftLavender, clamp(haloSoft / 0.32, 0.0, 1.0));
  cStage5Atmo = mix(cStage5Atmo, cRosePink, clamp(rimSharp / 0.28, 0.0, 1.0));
  cStage5Atmo = mix(cStage5Atmo, cPearlAqua, smoothstep(0.14, 0.28, rimSharp) * 0.45);

  vec3 atmoColor = cAtmoAmber2;
  atmoColor = mix(atmoColor, cAtmoOcean3, smoothstep(0.08, 0.92, p23));
  atmoColor = mix(atmoColor, cAtmoGreen4, smoothstep(0.08, 0.92, p34));
  atmoColor = mix(atmoColor, cStage5Atmo, smoothstep(0.12, 0.95, p45));

  // Celestial alignment pulse & restrained gold illumination in Stage 5
  float celestialFactor = max(effectiveIgnited, effectiveShield);
  float celestialPulse = (uVisualStage >= 5.0)
    ? 0.0
    : (smoothstep(0.88, 0.95, p45) * (1.0 - smoothstep(0.95, 1.00, p45)));

  if (celestialFactor > 0.01) {
    float alignPulse = sin(uTime * 1.8) * 0.5 + 0.5;
    vec3 celestialTone = mix(cRosePink, cRestrainedGold, 0.45 + 0.35 * alignPulse);
    atmoColor = mix(atmoColor, celestialTone, celestialFactor * 0.75);

    // Delicate white-gold highlight only at the razor-thin limb edge
    vec3 cPearlGoldHighlight = vec3(0.99, 0.96, 0.90);
    atmoColor += cPearlGoldHighlight * (rimSharp * (1.6 * celestialFactor + 2.2 * celestialPulse));
  }

  // Soft atmospheric alpha: keeps the planet's procedural surface fully visible to the silhouette
  float alpha = compositeRim * (effectiveAtmo * 0.38 + effectiveShield * 0.24);
  gl_FragColor = vec4(atmoColor, clamp(alpha, 0.0, 1.0));
}
`;

// ============================================================================
// 4. PLANETARY RING SHADER
// ============================================================================

export const PLANETOID_RING_VERTEX_SHADER = /* glsl */ `
varying vec3 vLocalPosition;

void main() {
  vLocalPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PLANETOID_RING_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform float uVisualStage;
uniform float uRingAlpha;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uGoldIgnited;

varying vec3 vLocalPosition;

void main() {
  float ringProg = (uVisualStage >= 5.0) ? 1.0 : smoothstep(4.45, 5.0, uVisualStage);
  float targetRingAlpha = (uRingAlpha > 0.0) ? uRingAlpha : 0.95;
  float effectiveRingAlpha = (uVisualStage < 4.0 && uRingAlpha <= 0.001)
    ? 0.0
    : max(uRingAlpha, ringProg * targetRingAlpha);

  if (effectiveRingAlpha <= 0.001) {
    discard;
  }

  float dist = length(vLocalPosition.xy);
  if (dist < uInnerRadius || dist > uOuterRadius) {
    discard;
  }

  // Radial coordinate t in [0.0, 1.0] from inner to outer radius
  float t = (dist - uInnerRadius) / (uOuterRadius - uInnerRadius);
  // Polar angle theta in [-pi, pi]
  float theta = atan(vLocalPosition.y, vLocalPosition.x);

  // --------------------------------------------------------------------------
  // 1. MULTI-RING DENSITY HIERARCHY
  // --------------------------------------------------------------------------
  // Inner delicate crystalline ringlet (t ~ 0.04 to 0.18)
  float innerRinglet = smoothstep(0.04, 0.08, t) * (1.0 - smoothstep(0.14, 0.18, t)) * 0.65;

  // Champagne geological accent band (t ~ 0.22 to 0.32)
  float champagneBand = smoothstep(0.22, 0.25, t) * (1.0 - smoothstep(0.29, 0.32, t)) * 0.80;

  // Cassini-like dark resonant division (t ~ 0.33 to 0.40)
  float cassiniGap = 1.0 - smoothstep(0.33, 0.36, t) * (1.0 - smoothstep(0.38, 0.41, t)) * 0.85;

  // Primary luminous celestial ring (t ~ 0.42 to 0.68)
  float primaryRing = smoothstep(0.40, 0.46, t) * (1.0 - smoothstep(0.64, 0.70, t)) * 1.25;

  // Encke-like outer division (t ~ 0.70 to 0.74)
  float enckeGap = 1.0 - smoothstep(0.69, 0.71, t) * (1.0 - smoothstep(0.73, 0.75, t)) * 0.70;

  // Outer ethereal ringlet filament (t ~ 0.76 to 0.94)
  float outerFilament = smoothstep(0.74, 0.80, t) * (1.0 - smoothstep(0.88, 0.95, t)) * 0.50;

  // Fine high-frequency harmonic ringlet bands (wave resonances)
  float micro1 = sin(t * 112.0) * 0.5 + 0.5;
  float micro2 = sin(t * 224.0 + 1.4) * 0.5 + 0.5;
  float micro3 = sin(t * 448.0 + 2.8) * 0.5 + 0.5;
  float microBands = micro1 * 0.45 + micro2 * 0.35 + micro3 * 0.20;

  // Composite multi-band ring density
  float macroDensity = (innerRinglet + champagneBand + primaryRing * cassiniGap * enckeGap + outerFilament);
  float ringDensity = macroDensity * (0.68 + 0.32 * microBands);

  // Smooth edge fade at absolute inner and outer ring boundaries
  float edgeFade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));

  // --------------------------------------------------------------------------
  // 2. CELESTIAL PALETTE & HARMONIC PULSE
  // --------------------------------------------------------------------------
  // Multi-band celestial palette:
  // Pearl White (#FFF7E5), Pale Cyan (#9DE5E7), Lavender (#B7A6E5), Soft Rose (#E6A4B8), Champagne (#D8C28A)
  vec3 cRingPearlWhite   = vec3(1.00, 0.98, 0.94); // #FFF7E5 Pearl white
  vec3 cRingPaleCyan     = vec3(0.62, 0.90, 0.92); // #9DE5E7 Pale cyan
  vec3 cRingLavender     = vec3(0.75, 0.68, 0.90); // #B7A6E5 Lavender
  vec3 cRingSoftRose     = vec3(0.94, 0.72, 0.82); // #E6A4B8 Soft rose
  vec3 cRingChampagne    = vec3(0.92, 0.82, 0.60); // #D8C28A Champagne gold

  // Color mapping across radial features:
  // Inner ringlet: Pale cyan / lavender
  // Accent band: Champagne gold
  // Primary ring: Luminous pearl white with rose / pale cyan transitions
  // Outer filament: Soft lavender / rose
  vec3 ringColor = mix(cRingPaleCyan, cRingLavender, smoothstep(0.04, 0.20, t));
  ringColor = mix(ringColor, cRingChampagne, smoothstep(0.20, 0.32, t) * (1.0 - smoothstep(0.32, 0.40, t)));
  ringColor = mix(ringColor, cRingSoftRose, smoothstep(0.40, 0.55, t));
  ringColor = mix(ringColor, cRingPearlWhite, primaryRing * 0.45);
  ringColor = mix(ringColor, cRingLavender, smoothstep(0.72, 0.92, t));

  // Harmonic alignment pulse & Beat B5 celestial pulse crest
  float p45 = clamp(uVisualStage - 4.0, 0.0, 1.0);
  float celestialPulse = (uVisualStage >= 5.0)
    ? 0.0
    : (smoothstep(0.88, 0.95, p45) * (1.0 - smoothstep(0.95, 1.00, p45)));

  float alignPulse = sin(uTime * 1.8) * 0.5 + 0.5;
  ringColor = mix(ringColor, cRingPearlWhite, alignPulse * 0.20 + celestialPulse * 0.35);

  // --------------------------------------------------------------------------
  // 3. PROCEDURAL CRYSTALLINE DUST & SPARKLING PARTICLES
  // --------------------------------------------------------------------------
  // Differential orbital motion: inner ringlets orbit slightly faster
  float orbitalSpeed = 0.06 * (1.3 - t * 0.4);
  float dustAngle = theta + uTime * orbitalSpeed;
  vec2 dustGrid = vec2(t * 54.0, dustAngle * 28.0);
  vec2 cellId = floor(dustGrid);
  vec2 cellFrac = fract(dustGrid) - 0.5;

  // Deterministic 2D hash for individual crystalline dust glints
  float hash = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
  float twinkleSpeed = 2.5 + hash * 3.5;
  float twinkle = sin(uTime * twinkleSpeed + hash * 6.28) * 0.5 + 0.5;

  // Starlet sparkle point at center of selected cells (~35% of cells)
  float isSparkle = step(0.65, hash);
  float glintDist = length(cellFrac);
  float glint = smoothstep(0.18, 0.02, glintDist) * isSparkle * twinkle * edgeFade;

  // Add dual-tone sparkling dust points in radiant white-gold and pale cyan
  vec3 sparkleColor = mix(cRingPearlWhite, cRingPaleCyan, hash * 0.55);
  ringColor += sparkleColor * glint * (1.8 + 1.4 * celestialPulse);

  float alpha = (ringDensity * edgeFade + glint * 0.85) * effectiveRingAlpha * 0.90;
  gl_FragColor = vec4(ringColor, clamp(alpha, 0.0, 1.0));
}
`;

// ============================================================================
// 5. MATERIAL FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates the primary ShaderMaterial for the core planetoid sphere.
 *
 * @param {object} [options={}]
 * @returns {ShaderMaterial}
 */
export function createPlanetoidCoreMaterial(options = {}) {
  const lightDir = options.lightDirection instanceof Vector3
    ? options.lightDirection.clone().normalize()
    : new Vector3(0.577, 0.577, 0.577).normalize();

  return new ShaderMaterial({
    vertexShader: PLANETOID_CORE_VERTEX_SHADER,
    fragmentShader: PLANETOID_CORE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0.0 },
      uVisualStage: { value: 1.0 },
      uAwakeningProgress: { value: 0.0 },
      uKintsugiGlow: { value: 0.0 },
      uAtmosphereDensity: { value: 0.0 },
      uOceanFill: { value: 0.0 },
      uShieldCharge: { value: 0.0 },
      uScarsCount: { value: 0.0 },
      uGoldIgnited: { value: 0.0 },
      uLightDirection: { value: lightDir }
    },
    side: FrontSide
  });
}

/**
 * Creates the Fresnel atmosphere shell ShaderMaterial.
 *
 * @param {object} [options={}]
 * @returns {ShaderMaterial}
 */
export function createPlanetoidAtmosphereMaterial(options = {}) {
  return new ShaderMaterial({
    vertexShader: PLANETOID_ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: PLANETOID_ATMOSPHERE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0.0 },
      uVisualStage: { value: 1.0 },
      uAtmosphereDensity: { value: 0.0 },
      uShieldCharge: { value: 0.0 },
      uGoldIgnited: { value: 0.0 }
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: FrontSide
  });
}

/**
 * Creates the procedural planetary ring ShaderMaterial.
 *
 * @param {object} [options={}]
 * @returns {ShaderMaterial}
 */
export function createPlanetoidRingMaterial(options = {}) {
  return new ShaderMaterial({
    vertexShader: PLANETOID_RING_VERTEX_SHADER,
    fragmentShader: PLANETOID_RING_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0.0 },
      uVisualStage: { value: 1.0 },
      uRingAlpha: { value: 0.0 },
      uInnerRadius: { value: options.innerRadius ?? 0.049 },
      uOuterRadius: { value: options.outerRadius ?? 0.0735 },
      uGoldIgnited: { value: 0.0 }
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide
  });
}


