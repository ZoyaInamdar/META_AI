/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - OrreryVisualSystem (Phase 3)
 * Subsystem: Cosmic Narrative & Astronomical Orrery Visual Architecture
 * ============================================================================
 *
 * Visual interpreter for the 5-chapter cosmic storyline:
 *   Chapter 1: Three-Body Capture (Hyperbolic -> Capture Burn -> Bound Eccentric)
 *   Chapter 2: Binary Resonance (Chaotic Circumbinary -> Resonance Stabilization -> Resonance 2:1)
 *   Chapter 3: Gravity Assist (Binary Transfer -> Gravity Assist -> Bound Outer Orbit)
 *   Chapter 4: Roche Disruption (Satellite Approach -> Roche Shepherding -> Ring Formed)
 *   Chapter 5: Supernova Deflection (Supernova Threat -> Supernova Deflection -> Atmosphere Protected)
 *
 * Architectural Guarantees:
 * 1. Visual interpreter only: Reads NarrativeDirector and OrreryState as single source of truth.
 * 2. Zero physics engines: No N-body, RK4, Verlet, Euler, or Roche numerical solvers.
 * 3. Zero per-frame heap allocations in update(dt).
 * 4. Anchored at (0.0, 2.10, -3.80) in upper celestial midground (behind hero planetoid,
 *    in front of distant skybox and golden belt).
 * 5. Elegant pastel cosmic aesthetic harmonized with Celestial Kendama palette.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3
} from 'three';
import { createPlanetoidCoreMaterial } from './PlanetoidShader.js';
import { Events } from '../contracts/Interfaces.js';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import NarrativeDirector, {
  TOTAL_CHAPTERS
} from '../game/NarrativeDirector.js';
import OrreryState, {
  ManeuverStatus,
  OrbitalState
} from '../game/OrreryState.js';

/**
 * Default 3D spatial anchor for the Orrery visual system.
 * Positioned in central forward celestial space at (0, 1.75, -2.35) to frame cleanly
 * as the primary cosmic attraction directly in the player's forward sightline above Kendama.
 */
export const ORRERY_DEFAULT_ANCHOR = Object.freeze({
  x: 0.0,
  y: 1.75,
  z: -2.35
});

/**
 * Palette constants for the Orrery Visual System.
 */
export const ORRERY_PALETTE = Object.freeze({
  // Primary Central Star (Champagne / Warm Gold / Rose-Gold)
  STAR_GOLD: '#F6C879',
  STAR_CHAMPAGNE_CORE: '#FFE4B5',
  STAR_INNER_GLOW: '#FFF1D2',
  STAR_AMBER: '#E8A84E',
  STAR_ROSE_GOLD: '#D97A45',
  STAR_CORONA_PRIMARY: '#F4C77A',
  STAR_CORONA_ROSE: '#E9A6A6',

  // Secondary Perturber World (Mysterious Crystalline Amethyst / Indigo / Cyan)
  SECONDARY_VIOLET_DEEP: '#30245C',
  SECONDARY_VIOLET_MID: '#51408A',
  SECONDARY_AMETHYST: '#7466B8',
  SECONDARY_TERRAIN_SOFT: '#8F7FD1',
  SECONDARY_TERRAIN_LAVENDER: '#B49AE8',
  SECONDARY_TERRAIN_MINERAL: '#D7C5FF',
  SECONDARY_ACCENT_SAPPHIRE: '#385F9E',
  SECONDARY_ACCENT_BLUE_VIOLET: '#4E8BB5',
  SECONDARY_ACCENT_CYAN: '#82C7D8',
  SECONDARY_RIM_FRESNEL: '#C9B6FF',

  // Stage 1 Primordial Mars-like World (Evolving Player Planet - LOCKED)
  PLANETOID_TERRACOTTA: '#A84E32',
  PLANETOID_DEEP_RUST: '#4E2019',
  PLANETOID_RUST_LOWLAND: '#793322',
  PLANETOID_WARM_OCHRE: '#C66F42',
  PLANETOID_PEACH_RIDGE: '#E5A27A',

  // General & Legacy Orrery Chapter Palettes
  STAR_PEACH: '#F7C59F',
  STAR_LAVENDER: '#D5C6E8',
  PLANETOID_CYAN: '#A8E6CF',
  PEARL_WHITE: '#FFFFFF',
  WARM_WHITE: '#FFF5F5',
  ORBIT_CYAN: '#8BDBE8',
  ORBIT_GOLD: '#DBB67D',
  ORBIT_FAINT: '#6A7B9B',
  BURN_FLARE: '#FF9E64',
  ROCHE_DISRUPTED: '#FAD2E1',
  SHIELD_CREST: '#70D6FF',
  ATMOSPHERE_BLUE: '#9BF6FF',

  // Phase 2B Stable State Typography & Cosmic Sparkle Palette (Section 8 & 9)
  STABLE_STATE_CORE: '#FFF3D0',       // Warm ivory/champagne main core
  STABLE_STATE_GOLD_EDGE: '#D89A4A',  // Definition dark gold stroke/edge against bright nebula
  STABLE_STATE_HIGHLIGHT: '#FFE0A3',  // Secondary warm golden highlight
  STABLE_STATE_GLOW: '#E8A84E',       // Soft golden glow halo
  STABLE_STATE_SPARKLES: '#FFF8E8'
});

/**
 * Helper to build an analytic elliptical or hyperbolic orbit path BufferGeometry.
 * @param {object} params
 * @returns {BufferGeometry}
 */
function createOrbitGeometry(params = {}) {
  const {
    pointsCount = 64,
    semiMajorAxis = 1.0,
    eccentricity = 0.0,
    isHyperbolic = false,
    startAngle = 0,
    endAngle = Math.PI * 2
  } = params;

  const positions = new Float32Array(pointsCount * 3);
  const a = semiMajorAxis;
  const e = eccentricity;

  for (let i = 0; i < pointsCount; i++) {
    const t = i / (pointsCount - 1);
    const angle = startAngle + t * (endAngle - startAngle);

    let x = 0;
    let z = 0;

    if (isHyperbolic) {
      // Open hyperbolic trajectory segment
      const r = (a * Math.max(0.1, e * e - 1.0)) / (1.0 + e * Math.cos(angle));
      x = r * Math.sin(angle);
      z = -r * Math.cos(angle);
    } else {
      // Closed elliptical orbit (focus at origin)
      const b = a * Math.sqrt(Math.max(0.01, 1.0 - e * e));
      x = a * Math.cos(angle) - a * e;
      z = b * Math.sin(angle);
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = z;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Phase 2A: Catch cosmic response duration in seconds.
 * 4-phase sequence: Anticipation (~0.15s), Synchronization (~0.25s), Peak (~0.15s), Return (~0.45s).
 */
export const CATCH_RESPONSE_DURATION = 1.0;

/**
 * Phase 2B: Three-Body Alignment Cinematic Phases.
 */
export const AlignmentPhase = Object.freeze({
  IDLE: 'IDLE',
  CONVERGING: 'CONVERGING',
  ALIGNED: 'ALIGNED',
  PULSE: 'PULSE',
  REVEAL_HOLD: 'REVEAL_HOLD',
  RETURNING: 'RETURNING'
});

/**
 * Phase 2B: Three-Body Alignment Cinematic Timings (in seconds, ~3.45s total duration).
 * 0.00 – 0.20 s: Anticipation (orbits fade, start positions cached)
 * 0.20 – 0.65 s: Gravitational Convergence (rapid acceleration to straight-line syzygy)
 * 0.65 – 0.95 s: Alignment Settling (subtle settling into equilibrium)
 * 0.95 – 1.35 s: STABLE STATE & Energy Charge ("STABLE STATE" text fades in)
 * 1.35 – 1.75 s: Grand Cosmic Pulse (synchronized peak at 1.55s, sync wave, energy rays)
 * 1.75 – 2.65 s: Reveal Hold (~0.90s hold, aligned system held steady, text readable)
 * 2.65 – 3.45 s: Smooth Return (text fades out, gentle separation, accelerating return to orbits)
 * 3.45 s+: Normal Orbit
 */
export const ALIGNMENT_TIMINGS = Object.freeze({
  ANTICIPATION_END: 0.20,
  CONVERGE_END: 0.65,
  SETTLING_END: 0.95,
  ALIGNED_END: 1.35,
  PULSE_END: 1.75,
  HOLD_END: 2.65,
  TOTAL_DURATION: 3.45
});

/**
 * Chapter Transition States for OrreryVisualSystem.
 */
export const ChapterTransitionState = Object.freeze({
  IDLE: 'IDLE',
  TRANSITIONING: 'TRANSITIONING',
  COMPLETE: 'COMPLETE'
});

/**
 * Chapter 1 -> Chapter 2 smooth visual handoff duration in seconds.
 */
export const CHAPTER_TRANSITION_DURATION = 2.0;

/**
 * Phase 3B: Chapter 2 Binary Resonance State Machine states.
 */
export const Ch2ResonanceState = Object.freeze({
  IDLE: 'IDLE',
  CHAOTIC_CIRCUMBINARY: 'CHAOTIC_CIRCUMBINARY',
  RESONANCE_STABILIZATION: 'RESONANCE_STABILIZATION',
  RESONANCE_2_1: 'RESONANCE_2_1'
});

/**
 * Phase 3B: resonanceProgress threshold to enter RESONANCE_STABILIZATION.
 */
export const RESONANCE_STABILIZATION_THRESHOLD = 0.35;

/**
 * Phase 3B: Per-catch calibration contribution to resonanceProgress.
 */
export const RESONANCE_CATCH_CONTRIBUTION = Object.freeze({
  ASSISTED: 0.028,
  CLEAN: 0.065
});

/**
 * Phase 3B: Duration in seconds for the RESONANCE LOCKED milestone sprite display.
 */
export const RESONANCE_LOCKED_DURATION = 2.0;

/** @private Phase 3B: Number of harmonic node markers along the resonant ring. */
const CH2_HARMONIC_NODE_COUNT = 10;

/** @private Phase 3B: Orbital wobble base amplitude (chaotic circumbinary). */
const CH2_WOBBLE_BASE_AMPLITUDE = 0.14;

/** @private Phase 3B: Primary wobble frequency (radians/sec). */
const CH2_WOBBLE_FREQUENCY = 0.72;

/** @private Phase 3B: Vertical displacement amplitude. */
const CH2_VERTICAL_AMPLITUDE = 0.04;

/** @private Phase 3B: Vertical displacement frequency. */
const CH2_VERTICAL_FREQUENCY = 1.15;

/** @private Phase 3B: Angular wobble scale. */
const CH2_ANGULAR_WOBBLE = 0.11;

/** @private Phase 3B: Secondary angular wobble frequency. */
const CH2_WOBBLE_FREQUENCY2 = 0.44;

/** Phase 3C: Number of particles in the instanced resonance field. */
export const CH2_PARTICLE_COUNT = 100;

/** Phase 3C: Duration of the binary resonance shockwave in seconds. */
export const CH2_SHOCKWAVE_DURATION = 1.0;

/**
 * Zero-allocation Hermite smoothstep scalar helper.
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
function smoothstepScalar(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge0 ? 1.0 : 0.0;
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Resolves catch response intensity from ScoreEvent payload or raw score data.
 * Mapping:
 *   - ASSISTED: ~0.55
 *   - CLEAN: ~0.80
 *   - HIGH QUALITY CLEAN / PERFECT (cadence > 1.1, mult > 1.4, streak >= 2, or energy >= 35): 1.0
 * @param {any} payload
 * @returns {number} intensity in [0.55, 1.0]
 */
export function resolveCatchIntensity(payload) {
  if (!payload && payload !== 0) return 0.80;

  // Raw number fallback
  if (typeof payload === 'number') {
    return payload >= 35 ? 1.0 : (payload >= 15 ? 0.80 : 0.55);
  }

  // Unpack wrapped payload or direct ScoreEvent
  const score = payload.payload || payload;
  const catchType = String(score.catchType || payload.catchType || '').toUpperCase();
  const multTotal = score.multipliers?.total ?? payload.multipliers?.total ?? 1.0;
  const cadence = score.multipliers?.cadence ?? payload.multipliers?.cadence ?? 1.0;
  const streak = score.currentStreak ?? score.streak ?? payload.currentStreak ?? payload.streak ?? 0;
  const awarded = score.awardedEnergy ?? payload.awardedEnergy ?? 0;

  if (catchType === 'ASSISTED') {
    return 0.55;
  }

  if (catchType === 'PERFECT') {
    return 1.0;
  }

  if (catchType === 'CLEAN') {
    if (multTotal > 1.4 || cadence > 1.1 || streak >= 2 || awarded >= 35) {
      return 1.0;
    }
    return 0.80;
  }

  // Fallback if catchType string is not explicit but energy is awarded
  if (awarded >= 35) return 1.0;
  if (awarded > 0) return 0.80;

  return 0.80;
}

/**
 * Helper to draw a delicate 4-pointed diamond star sparkle inside the 2D canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {string} color
 * @param {string} glowColor
 */
function drawCanvasDiamondSparkle(ctx, cx, cy, radius, color, glowColor) {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = radius * 1.5;
  ctx.fillStyle = color;
  // Vertical diamond needle
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx, cy, cx + radius * 0.28, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + radius);
  ctx.quadraticCurveTo(cx, cy, cx - radius * 0.28, cy);
  ctx.closePath();
  ctx.fill();
  // Horizontal diamond needle
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.85, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - radius * 0.24);
  ctx.quadraticCurveTo(cx, cy, cx + radius * 0.85, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + radius * 0.24);
  ctx.closePath();
  ctx.fill();
  // Bright central spark
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0.5, radius * 0.22), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Creates a lightweight dynamic procedural CanvasTexture for the world-space "STABLE STATE" text.
 * Renders floating futuristic uppercase letters in warm champagne gold with layered emissive glow
 * (bright crisp core #FFF4D8, main champagne #FFE6C4, outer warm glow #F5D0A9, and diamond accents #FFF8E8).
 * Strictly transparent background: NO box, NO panel, NO border, NO container.
 * Safely falls back to a mock/dummy texture in headless or test runner environments.
 * @returns {CanvasTexture|object}
 */
export function createStableStateTextTexture(displayText = 'STABLE STATE') {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 1024, 256);

      const isLong = displayText.length > 14;
      const fontSize = isLong ? 58 : 72;
      const letterSpacing = isLong ? '10px' : '16px';

      // Elegant celestial serif typography: refined semi-bold/bold serif stack (Sections 6, 8, 9, 10)
      ctx.font = `600 ${fontSize}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = letterSpacing;
      }

      // Layer 1: Soft warm golden halo (Section 10)
      ctx.save();
      ctx.shadowColor = 'rgba(232, 168, 78, 0.45)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(216, 154, 74, 0.55)';
      ctx.fillText(displayText, 512, 128);
      ctx.restore();

      // Layer 2: Secondary warm golden highlight glow (Section 8: #FFE0A3)
      ctx.save();
      ctx.shadowColor = 'rgba(255, 224, 163, 0.70)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#FFE0A3';
      ctx.fillText(displayText, 512, 128);
      ctx.restore();

      // Layer 3: Dark/warm gold definition edge / stroke (Section 8 & 9: #D89A4A) for high contrast against nebula
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#D89A4A';
      ctx.strokeText(displayText, 512, 128);
      ctx.restore();

      // Layer 4: Warm ivory / bright champagne letter core (Section 8: #FFF3D0)
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF3D0';
      ctx.fillText(displayText, 512, 128);
      ctx.restore();

      // Layer 5: Razor-sharp delicate gilded highlight (#FFFDF0)
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = '#FFFDF0';
      ctx.strokeText(displayText, 512, 128);
      ctx.restore();

      // Delicate diamond star accents flanking and framing the typography (Section 11)
      // Top row: ✦  ✧  ✦
      drawCanvasDiamondSparkle(ctx, 512, 46, 11.0, '#FFF8E8', 'rgba(255, 248, 232, 0.90)');
      drawCanvasDiamondSparkle(ctx, 420, 52, 7.5, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');
      drawCanvasDiamondSparkle(ctx, 604, 52, 7.5, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');

      // Bottom row: ✦  ✧  ✦
      drawCanvasDiamondSparkle(ctx, 512, 210, 11.0, '#FFF8E8', 'rgba(255, 248, 232, 0.90)');
      drawCanvasDiamondSparkle(ctx, 420, 204, 7.5, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');
      drawCanvasDiamondSparkle(ctx, 604, 204, 7.5, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');

      // Flanking side stars: ✧  ...  ✧
      drawCanvasDiamondSparkle(ctx, 102, 128, 9.0, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');
      drawCanvasDiamondSparkle(ctx, 922, 128, 9.0, '#FFE0A3', 'rgba(255, 224, 163, 0.75)');
    }
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  // Headless test runner fallback
  return {
    isTexture: true,
    image: { width: 1024, height: 256 },
    generateMipmaps: false,
    needsUpdate: false,
    dispose: () => {}
  };
}

/**
 * Creates a lightweight dynamic procedural CanvasTexture for the travelling shimmer glint (Section 6).
 * @returns {CanvasTexture|object}
 */
export function createShimmerGlintTexture() {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      drawCanvasDiamondSparkle(ctx, 64, 64, 36.0, '#FFFDE8', 'rgba(255, 248, 232, 0.95)');
    }
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  // Headless test runner fallback
  return {
    isTexture: true,
    image: { width: 128, height: 128 },
    generateMipmaps: false,
    needsUpdate: false,
    dispose: () => {}
  };
}

/**
 * Creates a dynamic procedural CanvasTexture for the Chapter 2 "RESONANCE ACHIEVED" milestone sprite.
 * Reuses the exact same 5-layer warm champagne gold / ivory core, gilded definition stroke,
 * and diamond celestial sparkle accents as Chapter 1's "STABLE STATE" achievement message.
 * @param {string} [displayText='RESONANCE ACHIEVED']
 * @returns {CanvasTexture|object}
 */
export function createResonanceAchievedTextTexture(displayText = 'RESONANCE ACHIEVED') {
  return createStableStateTextTexture(displayText);
}

/**
 * Backward compatibility alias for createResonanceAchievedTextTexture.
 * @param {string} [displayText='RESONANCE ACHIEVED']
 * @returns {CanvasTexture|object}
 */
export function createResonanceLockedTextTexture(displayText = 'RESONANCE ACHIEVED') {
  return createResonanceAchievedTextTexture(displayText);
}

/**
 * Creates a lightweight procedural ShaderMaterial for the Chapter 1 Primary Central Star.
 * Renders a warm champagne center, golden body, amber edge, and subtle rose-gold limb
 * without the flat cartoon appearance of MeshBasicMaterial.
 * @param {object} [options]
 * @returns {ShaderMaterial}
 */
export function createPrimaryStarMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uCoreColor: { value: new Color(ORRERY_PALETTE.STAR_CHAMPAGNE_CORE) }, // #FFE4B5
    uInnerGlowColor: { value: new Color(ORRERY_PALETTE.STAR_INNER_GLOW) }, // #FFF1D2
    uMainGoldColor: { value: new Color(ORRERY_PALETTE.STAR_GOLD) },       // #F6C879
    uAmberColor: { value: new Color(ORRERY_PALETTE.STAR_AMBER) },         // #E8A84E
    uRoseEdgeColor: { value: new Color(ORRERY_PALETTE.STAR_ROSE_GOLD) },  // #D97A45
    uCatchResponse: { value: 0.0 },
    uOpacity: { value: options.opacity ?? 0.90 }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vPosition;

    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -normalize(mvPosition.xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uCoreColor;
    uniform vec3 uInnerGlowColor;
    uniform vec3 uMainGoldColor;
    uniform vec3 uAmberColor;
    uniform vec3 uRoseEdgeColor;
    uniform float uCatchResponse;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vPosition;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      float facing = clamp(dot(N, V), 0.0, 1.0);

      // Organic subtle convection shimmer
      float shimmer = sin(vPosition.x * 10.0 + uTime * 1.8) * cos(vPosition.y * 10.0 - uTime * 1.4) * 0.035;
      float f = clamp(facing + shimmer, 0.0, 1.0);

      // Layered celestial star gradient:
      // Glancing limb (f: 0.0 - 0.22): Rose-gold to Amber
      // Mid-limb (f: 0.22 - 0.60): Amber to Main warm gold
      // Mid-body (f: 0.60 - 0.85): Main gold to Champagne core
      // Luminous center (f: 0.85 - 1.0): Champagne to Inner glow
      vec3 col = uRoseEdgeColor;
      col = mix(col, uAmberColor, smoothstep(0.0, 0.22, f));
      col = mix(col, uMainGoldColor, smoothstep(0.22, 0.60, f));
      col = mix(col, uCoreColor, smoothstep(0.60, 0.85, f));
      col = mix(col, uInnerGlowColor, smoothstep(0.85, 1.0, f));

      // Phase 2A: Temporary core luminosity boost during catch synchronization
      col += (uCoreColor * 0.16 + uInnerGlowColor * 0.12) * uCatchResponse;

      gl_FragColor = vec4(col, uOpacity);
    }
  `;

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });

  material.color = new Color(ORRERY_PALETTE.STAR_GOLD);
  return material;
}

/**
 * Creates a lightweight corona ShaderMaterial for Star A.
 * Blends from warm gold at the inner boundary to a soft subtle rose tint at the outer edge,
 * harmonizing with the whimsical cosmic nebula without turning pink.
 * @param {object} [options]
 * @returns {ShaderMaterial}
 */
export function createPrimaryCoronaMaterial(options = {}) {
  const primaryCol = options.primaryColor ? new Color(options.primaryColor) : new Color(ORRERY_PALETTE.STAR_CORONA_PRIMARY);
  const outerCol = options.outerColor ? new Color(options.outerColor) : (options.roseOuterColor ? new Color(options.roseOuterColor) : new Color(ORRERY_PALETTE.STAR_CORONA_ROSE));
  const uniforms = {
    uTime: { value: 0.0 },
    uPrimaryColor: { value: primaryCol },
    uRoseOuterColor: { value: outerCol },
    uBaseOpacity: { value: options.opacity ?? 0.20 }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -normalize(mvPosition.xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uPrimaryColor;
    uniform vec3 uRoseOuterColor;
    uniform float uBaseOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      float facing = clamp(dot(N, V), 0.0, 1.0);

      // Hollow corona halo: maximum opacity at limb, fading softly
      float halo = pow(1.0 - facing, 1.7);
      
      // Shift from warm gold at inner base to subtle rose at outer edge (max 38% rose to stay golden)
      vec3 col = mix(uPrimaryColor, uRoseOuterColor, pow(1.0 - facing, 2.2) * 0.38);

      float alpha = halo * uBaseOpacity;
      gl_FragColor = vec4(col, alpha);
    }
  `;

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: 0 // FrontSide
  });

  material.color = new Color(ORRERY_PALETTE.STAR_CORONA_PRIMARY);
  return material;
}

/**
 * Creates a lightweight procedural ShaderMaterial for the Chapter 1 Secondary Perturber World
 * and Chapter 2 Binary Celestial Bodies.
 * Renders a rich crystalline celestial world with procedural elevation, organic terrain variation,
 * directional lighting with ambient floor for true 3D spherical depth, mineral deposit rifts,
 * and a soft luminous Fresnel rim.
 * Completely configurable via palette parameters, noise seeds, and lighting while maintaining
 * identical default behavior for Chapter 1.
 * @param {object} [options]
 * @returns {ShaderMaterial}
 */
export function createSecondaryPlanetMaterial(options = {}) {
  const lightDir = (options.lightDirection || new Vector3(0.32, 0.42, 0.85)).clone().normalize();

  // Palette colors: options take precedence, with robust fallbacks to Chapter 1 defaults
  const deepCol = options.baseDeepColor || options.deepColor || options.darkColor || options.deepViolet || ORRERY_PALETTE.SECONDARY_VIOLET_DEEP;
  const midCol = options.baseMidColor || options.secondaryColor || options.midColor || options.secondaryViolet || ORRERY_PALETTE.SECONDARY_VIOLET_MID;
  const highCol = options.baseHighColor || options.amethystColor || options.amethyst || ORRERY_PALETTE.SECONDARY_AMETHYST;

  const softCol = options.terrainSoftColor || options.softColor || options.softViolet || ORRERY_PALETTE.SECONDARY_TERRAIN_SOFT;
  const luminousCol = options.terrainHighlightColor || options.luminousColor || options.luminousLavender || ORRERY_PALETTE.SECONDARY_TERRAIN_LAVENDER;
  const mineralCol = options.terrainMineralColor || options.paleMineralColor || options.coreColor || options.paleMineral || ORRERY_PALETTE.SECONDARY_TERRAIN_MINERAL;

  const accentDeepCol = options.accentDeepColor || options.mutedSapphireColor || options.mutedSapphire || ORRERY_PALETTE.SECONDARY_ACCENT_SAPPHIRE;
  const accentMidCol = options.accentMidColor || options.blueVioletColor || options.blueViolet || ORRERY_PALETTE.SECONDARY_ACCENT_BLUE_VIOLET;
  const accentHighCol = options.accentHighlightColor || options.cyanAccentColor || options.cyanAccent || ORRERY_PALETTE.SECONDARY_ACCENT_CYAN;

  const rimCol = options.rimColor || ORRERY_PALETTE.SECONDARY_RIM_FRESNEL;

  const seed = (options.noiseSeed || new Vector3(0.0, 0.0, 0.0)).clone();
  const noiseScale = options.noiseScale !== undefined ? options.noiseScale : 1.0;
  const surfaceSpeed = options.surfaceSpeed !== undefined ? options.surfaceSpeed : 0.0;
  const initialOpacity = options.opacity !== undefined ? options.opacity : 0.92;

  const uniforms = {
    uTime: { value: 0.0 },
    uLightDirection: { value: lightDir },
    // Base gradient
    uDeepViolet: { value: new Color(deepCol) },
    uSecondaryViolet: { value: new Color(midCol) },
    uAmethyst: { value: new Color(highCol) },
    // Terrain / Mineral highlights
    uSoftViolet: { value: new Color(softCol) },
    uLuminousLavender: { value: new Color(luminousCol) },
    uPaleMineral: { value: new Color(mineralCol) },
    // Restrained accents in rifts
    uMutedSapphire: { value: new Color(accentDeepCol) },
    uBlueViolet: { value: new Color(accentMidCol) },
    uCyanAccent: { value: new Color(accentHighCol) },
    // Rim / Fresnel
    uRimColor: { value: new Color(rimCol) },
    // Differentiable procedural parameters
    uNoiseSeed: { value: seed },
    uNoiseScale: { value: noiseScale },
    uSurfaceSpeed: { value: surfaceSpeed },
    // Dynamic response & surge
    uCatchResponse: { value: 0.0 },
    uSurge: { value: options.surge ?? 0.0 },
    uResonanceProgress: { value: 0.0 },
    uOpacity: { value: initialOpacity },
    // Aliases for Chapter 2 test suite compatibility
    uCoreColor: { value: new Color(mineralCol) },
    uMidColor: { value: new Color(midCol) },
    uDarkColor: { value: new Color(deepCol) }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;

    void main() {
      vLocalPos = normalize(position);
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -normalize(mvPosition.xyz);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uLightDirection;
    uniform vec3 uDeepViolet;
    uniform vec3 uSecondaryViolet;
    uniform vec3 uAmethyst;
    uniform vec3 uSoftViolet;
    uniform vec3 uLuminousLavender;
    uniform vec3 uPaleMineral;
    uniform vec3 uMutedSapphire;
    uniform vec3 uBlueViolet;
    uniform vec3 uCyanAccent;
    uniform vec3 uRimColor;
    uniform vec3 uNoiseSeed;
    uniform float uNoiseScale;
    uniform float uSurfaceSpeed;
    uniform float uCatchResponse;
    uniform float uSurge;
    uniform float uResonanceProgress;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;

    // Fast 3-octave trigonometric noise for crystalline/organic terrain relief
    float crystallineTerrain(vec3 p, float t) {
      vec3 q = (p + uNoiseSeed) * uNoiseScale;
      q.x += t * uSurfaceSpeed;
      float n = sin(q.x * 4.5 + sin(q.y * 5.2 + q.z * 3.8) * 1.6) * 0.5 + 0.5;
      n += (sin(q.y * 9.3 + q.z * 7.8) * 0.5 + 0.5) * 0.32;
      n += (cos(q.x * 16.5 - q.y * 14.2 + q.z * 11.0) * 0.5 + 0.5) * 0.18;
      return n / 1.5;
    }

    void main() {
      vec3 P = vLocalPos;
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      vec3 WN = normalize(vWorldNormal);

      // Procedural elevation & terrain relief
      float elev = crystallineTerrain(P, uTime);

      // Base gradient: Deep -> Secondary -> High
      vec3 baseCol = uDeepViolet;
      baseCol = mix(baseCol, uSecondaryViolet, smoothstep(0.05, 0.35, elev));
      baseCol = mix(baseCol, uAmethyst, smoothstep(0.35, 0.58, elev));

      // Terrain / Mineral Highlights (selective regions)
      vec3 terrainCol = baseCol;
      terrainCol = mix(terrainCol, uSoftViolet, smoothstep(0.58, 0.76, elev));
      terrainCol = mix(terrainCol, uLuminousLavender, smoothstep(0.76, 0.88, elev));
      terrainCol = mix(terrainCol, uPaleMineral, smoothstep(0.88, 1.00, elev));

      vec3 col = terrainCol;

      // Restrained accents in sparse bands / mineral deposit rifts
      float band = sin(P.y * (16.0 * uNoiseScale) + sin(P.x * 8.0 + P.z * 6.0 + uNoiseSeed.x) * 2.0);
      float accentMask = smoothstep(0.78, 0.92, band) * smoothstep(0.30, 0.70, elev);
      if (accentMask > 0.01) {
        vec3 accentCol = mix(uMutedSapphire, uBlueViolet, smoothstep(0.78, 0.87, band));
        accentCol = mix(accentCol, uCyanAccent, smoothstep(0.87, 0.97, band));
        col = mix(col, accentCol, accentMask * 0.55);
      }

      // Directional Key Lighting with ambient floor to give real 3D planetary dimensionality
      float NdotL = clamp(dot(WN, uLightDirection), 0.0, 1.0);
      float light = 0.35 + 0.65 * NdotL;
      col *= light;

      // Subtle Fresnel / Rim highlight to separate from cosmic background with soft luminous edges
      float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
      col += uRimColor * (fresnel * 0.32);

      // Dynamic Catch response & surge boost during synchronization / scoring
      float totalResponse = clamp(uCatchResponse + uSurge, 0.0, 2.0);
      col += (uRimColor * 0.22 + uCyanAccent * 0.14) * (fresnel * totalResponse);

      // Resonance locked luminous bloom enhancement
      col += uPaleMineral * (uResonanceProgress * 0.12 * pow(elev, 2.0));

      gl_FragColor = vec4(col, uOpacity);
    }
  `;

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false
  });

  material.color = options.color ? new Color(options.color) : (options.baseHighColor ? new Color(highCol) : new Color(ORRERY_PALETTE.SECONDARY_AMETHYST));

  Object.defineProperty(material, 'opacity', {
    get() {
      return this.uniforms.uOpacity.value;
    },
    set(v) {
      this.uniforms.uOpacity.value = v;
    }
  });

  return material;
}

/**
 * Creates a lightweight procedural ShaderMaterial for Our Planet's atmospheric aura.
 * Renders a warm terracotta / coral / soft gold atmospheric limb halo that frames the
 * primordial world and reinforces its identity as the player's evolving protagonist world.
 * Zero post-processing overhead: 1 draw call, depthWrite false.
 * @param {object} [options]
 * @returns {ShaderMaterial}
 */
export function createPlanetaryAuraMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uBaseColor: { value: new Color(ORRERY_PALETTE.PLANETOID_WARM_OCHRE) },  // #C66F42
    uRimColor: { value: new Color(ORRERY_PALETTE.STAR_GOLD) },              // #F6C879
    uCoralColor: { value: new Color(ORRERY_PALETTE.PLANETOID_PEACH_RIDGE) },// #E5A27A
    uAuraIntensity: { value: 1.0 },
    uAuraOpacity: { value: options.opacity ?? 0.22 }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -normalize(mvPosition.xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    uniform vec3 uCoralColor;
    uniform float uAuraIntensity;
    uniform float uAuraOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      float facing = clamp(dot(N, V), 0.0, 1.0);

      // Smooth atmospheric limb halo
      float limb = pow(1.0 - facing, 2.8);

      // Color transition from warm ochre at inner rim to peach coral and soft gold at outer edge
      vec3 col = mix(uBaseColor, uCoralColor, smoothstep(0.1, 0.6, limb));
      col = mix(col, uRimColor, smoothstep(0.6, 1.0, limb));

      float alpha = limb * uAuraOpacity * uAuraIntensity;
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
    }
  `;

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: FrontSide
  });

  material.color = new Color(ORRERY_PALETTE.PLANETOID_WARM_OCHRE);
  return material;
}

/**
 * Creates a dedicated procedural ShaderMaterial for Chapter 2 Binary Celestial Stars.
 * Renders living, flowing stellar plasma convection cells, radiant internal core emission,
 * spherical dimensional key lighting (with an elevated ambient floor of 0.58), and a luminous
 * stellar limb Fresnel emission.
 * Zero orthogonal grid artifacts (no checkerboards), zero planetary terrain/craters/rocky noise.
 * @param {object} [options]
 * @returns {ShaderMaterial}
 */
export function createStellarBodyMaterial(options = {}) {
  const coreCol = options.coreColor ? new Color(options.coreColor) : new Color('#FFFDF8');
  const midCol = options.midColor ? new Color(options.midColor) : new Color(ORRERY_PALETTE.STAR_PEACH);
  const darkCol = options.darkColor ? new Color(options.darkColor) : new Color('#D98A52');
  const rimCol = options.rimColor ? new Color(options.rimColor) : new Color('#FFE8C2');
  const accentCol = options.accentColor ? new Color(options.accentColor) : new Color('#FFF0D6');
  const lightDir = options.lightDirection ? options.lightDirection.clone().normalize() : new Vector3(0.5, 0.7, 0.5).normalize();
  const noiseSeed = options.noiseSeed ? options.noiseSeed.clone() : new Vector3(14.2, 7.8, 23.5);

  const uniforms = {
    uTime: { value: 0.0 },
    uLightDirection: { value: lightDir },
    uCoreColor: { value: coreCol },
    uMidColor: { value: midCol },
    uDarkColor: { value: darkCol },
    uDeepViolet: { value: darkCol }, // compatibility alias for tests
    uRimColor: { value: rimCol },
    uAccentColor: { value: accentCol },
    uNoiseSeed: { value: noiseSeed },
    uNoiseScale: { value: options.noiseScale ?? 1.0 },
    uNoiseFrequency: { value: options.noiseFrequency ?? 5.5 },
    uSurfaceSpeed: { value: options.surfaceSpeed ?? 0.03 },
    uCatchResponse: { value: 0.0 },
    uSurge: { value: 0.0 },
    uResonanceProgress: { value: 0.0 },
    uOpacity: { value: options.opacity ?? 0.95 }
  };

  const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;

    void main() {
      vLocalPos = normalize(position);
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = -normalize(mvPosition.xyz);
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform vec3 uLightDirection;
    uniform vec3 uCoreColor;
    uniform vec3 uMidColor;
    uniform vec3 uDarkColor;
    uniform vec3 uRimColor;
    uniform vec3 uAccentColor;
    uniform vec3 uNoiseSeed;
    uniform float uNoiseScale;
    uniform float uNoiseFrequency;
    uniform float uSurfaceSpeed;
    uniform float uCatchResponse;
    uniform float uSurge;
    uniform float uResonanceProgress;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;
    varying vec3 vWorldNormal;

    // Smooth domain-warped trigonometric convection pattern for living stellar plasma
    // Eliminates orthogonal grid checkerboards, hard rocky edges, and high-frequency noise
    float stellarPlasma(vec3 p, float t, vec3 seed, float freq) {
      vec3 q = (p + seed) * (freq * uNoiseScale);
      
      // Continuous 3D domain-warp flow: fluid convection vortexes
      vec3 w1 = vec3(
        sin(q.y * 1.25 + q.z * 0.85 + t * 0.75),
        sin(q.z * 1.15 + q.x * 0.95 - t * 0.65),
        sin(q.x * 1.35 + q.y * 0.75 + t * 0.85)
      );
      vec3 q2 = q + w1 * 0.55;

      // 3-octave rotated harmonic wave planes (diagonal angles avoid axial checkerboard)
      float n1 = 0.5 + 0.5 * sin(q2.x * 1.35 + q2.y * 1.15 + t * 0.90);
      float n2 = 0.5 + 0.5 * sin(q2.y * 1.75 - q2.z * 1.35 - t * 0.70);
      float n3 = 0.5 + 0.5 * cos(q2.z * 2.35 + q2.x * 1.65 + t * 1.15);

      return 0.50 * n1 + 0.32 * n2 + 0.18 * n3;
    }

    void main() {
      vec3 P = vLocalPos;
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewDir);
      vec3 WN = normalize(vWorldNormal);

      float t = uTime * uSurfaceSpeed;
      float plasma = stellarPlasma(P, t, uNoiseSeed, uNoiseFrequency);

      // Smooth multi-tier plasma temperature gradient:
      // Dark boundary -> Mid plasma -> Inner plasma -> Radiant Core
      vec3 col = mix(uDarkColor, uMidColor, smoothstep(0.08, 0.52, plasma));
      col = mix(col, uRimColor, smoothstep(0.42, 0.78, plasma) * 0.65);
      col = mix(col, uCoreColor, smoothstep(0.68, 0.96, plasma) * 0.85);

      // Delicate secondary energy filament streams (cyan accents for Star 2, champagne flare for Star 1)
      vec3 qAccent = (P + uNoiseSeed * 0.5) * (uNoiseFrequency * 1.4);
      float stream = 0.5 + 0.5 * sin(qAccent.x * 1.8 + qAccent.z * 2.2 + sin(qAccent.y * 2.4 + t * 1.4) * 1.6);
      float streamMask = smoothstep(0.72, 0.96, stream) * smoothstep(0.25, 0.85, plasma);
      col = mix(col, uAccentColor, streamMask * 0.35);

      // Internal stellar core radiance (hot luminous emission from interior outward)
      float facing = clamp(dot(N, V), 0.0, 1.0);
      float coreRadiance = pow(facing, 1.35);
      col = mix(col, uCoreColor, coreRadiance * 0.35);
      col += uCoreColor * (coreRadiance * 0.28);

      // Spherical dimensionality: elevated ambient floor (0.58) ensures far side remains glowing plasma
      float NdotL = clamp(dot(WN, uLightDirection), 0.0, 1.0);
      float light = 0.58 + 0.42 * NdotL;
      col *= light;

      // Luminous stellar limb / Fresnel emission
      float limb = pow(1.0 - facing, 2.2);
      col += uRimColor * (limb * 0.65);
      col += uCoreColor * (pow(limb, 2.0) * 0.35);

      // Dynamic Catch Surge / Scoring response flare
      float totalSurge = clamp(uSurge + uCatchResponse, 0.0, 2.0);
      col += (uCoreColor * 0.40 + uRimColor * 0.30) * (totalSurge * (0.35 + 0.65 * limb));

      // Resonance progress coherence: as resonance locks, core luminosity and standing waves harmonize
      col += uCoreColor * (uResonanceProgress * 0.22 * coreRadiance);
      col += uRimColor * (uResonanceProgress * 0.18 * limb);

      gl_FragColor = vec4(col, uOpacity);
    }
  `;

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false
  });

  material.color = new Color(midCol);

  Object.defineProperty(material, 'opacity', {
    get() {
      return this.uniforms.uOpacity.value;
    },
    set(v) {
      this.uniforms.uOpacity.value = v;
    }
  });

  return material;
}

/**
 * OrreryVisualSystem - Three.js Astronomical Orrery Visual Layer
 */
export class OrreryVisualSystem {
  /**
   * @param {Object} [options={}]
   * @param {NarrativeDirector} [options.narrativeDirector]
   * @param {THREE.Group} [options.parentGroup]
   * @param {EventBus} [options.eventBus=defaultEventBus]
   * @param {Vector3|Object} [options.anchorPosition=ORRERY_DEFAULT_ANCHOR]
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus !== undefined ? options.eventBus : defaultEventBus;
    this.narrativeDirector = options.narrativeDirector || new NarrativeDirector({ eventBus: this.eventBus });
    this.parentGroup = options.parentGroup || null;

    // Root Group
    this.group = new Group();
    this.group.name = 'orrery-visual-system';
    this.group.renderOrder = -100;

    // Anchor positioning & viewing orientation
    const anchor = options.anchorPosition || ORRERY_DEFAULT_ANCHOR;
    this.anchorPosition = new Vector3(anchor.x, anchor.y, anchor.z);
    this.group.position.copy(this.anchorPosition);
    this.group.rotation.x = 0.35; // Forward inclination (~20 deg) presenting wide open orbital ellipses to player sightline

    // Simulation & parametric state
    this.simTime = 0.0;
    this.orbitSpeed = 1.0;
    this.activeChapter = 1;
    this.visualStage = 1.0;
    this.awakeningProgress = 0.0;

    // Phase 2A: Catch cosmic synchronization response state
    this._catchResponseActive = false;
    this._catchResponseTime = 0.0;
    this._catchResponseIntensity = 0.0;
    this._catchResponseSurge = 0.0;

    // Phase 2B: Three-Body Alignment Cinematic State Machine
    this._alignmentActive = false;
    this._alignmentTime = 0.0;
    this._alignmentPhase = AlignmentPhase.IDLE;
    this._alignmentIntensity = 1.0;
    this._alignmentProgress = 0.0;
    this._alignmentPulse = 0.0;

    // Phase 3A: Chapter 1 -> Chapter 2 Smooth Visual Handoff State Machine
    this._chapterTransitionState = ChapterTransitionState.IDLE;
    this._chapterTransitionTime = 0.0;
    this._chapterTransitionDuration = CHAPTER_TRANSITION_DURATION;
    this._chapterTransitionProgress = 0.0;
    this._transitionFromChapter = 1;
    this._transitionToChapter = 2;

    // Zero-allocation pre-allocated vectors for alignment interpolation
    // Straight horizontal syzygy from camera perspective:
    // Secondary Perturber (-0.84, 0, 0) ─── Our Planet (-0.42, 0, 0) ─── Primary Star (0, 0, 0)
    // All centers lie on Y = 0, Z = 0: strictly equal screen-space elevation and zero tilt/diagonal drift
    this._orbitPosPlanet = new Vector3();
    this._orbitPosPerturber = new Vector3();
    this._alignPosStar = new Vector3(0.0, 0.0, 0.0);
    this._alignPosPlanet = new Vector3(-0.42, 0.0, 0.0);
    this._alignPosPerturber = new Vector3(-0.84, 0.0, 0.0);

    // Zero-allocation pre-allocated vectors and caches for Chapter 1 -> 2 transition
    this._transStartPosPlanet = new Vector3();
    this._transStartPosStar = new Vector3();
    this._transStartPosPerturber = new Vector3();
    this._transTargetPosPlanet = new Vector3();
    this._transStartOpStableState = 0.0;
    this._transStartOpShimmer = 0.0;
    this._transStartOpSparkles = 0.0;

    // Phase 3B: Chapter 2 Resonance State Machine (pre-allocated, zero-heap hot path)
    this._ch2ResonanceState = Ch2ResonanceState.IDLE;
    this._resonanceProgress = 0.0;
    this._resonanceLocked = false;
    this._resonanceLockedTriggered = false;
    this._resonanceLockedTime = 0.0;
    this._resonanceCompletionEmitted = false;
    this._ch2BaseAngle = 0.0;
    this._ch2RadialOffset = 0.0;
    this._ch2VerticalOffset = 0.0;
    this._ch2AngleOffset = 0.0;
    this._ch2EffectiveWobble = 0.0;

    // Phase 3C: Binary Resonance FX Layer state (pre-allocated, zero-heap hot path)
    this._ch2ParticleData = new Float32Array(CH2_PARTICLE_COUNT * 4);
    this._tempMatrix = new Matrix4();
    this._ch2ShockwaveActive = false;
    this._ch2ShockwaveTriggered = false;
    this._ch2ShockwaveTime = 0.0;

    // Chapter 2 Mystical Visual Pass: Pre-allocated typed buffers for zero-allocation updates
    this._ch2StarBridgePositions = new Float32Array(16 * 3);  // 16 points = 48 floats
    this._ch2TriadBridgePositions = new Float32Array(32 * 3); // 32 points = 96 floats (Star 1 -> Planet -> Star 2)
    this._ch2FilamentPositions = new Float32Array(96 * 3);    // 96 points = 288 floats (4-petal rosette)
    this._ch2TrailPositions = new Float32Array(64 * 3);       // 64 points = 192 floats
    this._ch2HighlightPositions = new Float32Array(2 * 3);    // 2 points = 6 floats

    // Chapter 2 Mystical Visual Pass: Scene object references
    this.ch2ConcentricRing1 = null;
    this.ch2ConcentricRing2 = null;
    this.ch2ConcentricRing3 = null;
    this.ch2CardinalAxes = null;
    this.ch2StarBridgeLine = null;
    this.ch2TriadBridgeLine = null;
    this.ch2PlanetAura = null;
    this.ch2ResonanceFilaments = null;
    this.ch2PlanetTrailLine = null;
    this.ch2TravelingHighlights = null;
    this.ch2ShockwaveEchoMesh = null;
    this._planetoidRenderer = options.planetoidRenderer || null;

    // Development-only Chapter 2 Debug Showcase state
    this._chapter2DebugMode = false;
    this._chapter2PreDebugChapter = 1;
    this._chapter2DebugPlayActive = false;
    this._chapter2DebugPlayElapsed = 0.0;
    this._chapter2DebugPlayStep = -1;

    // Persistent pre-allocated math objects for zero-allocation per-frame updates
    this._tempVec1 = new Vector3();
    this._tempVec2 = new Vector3();
    this._tempColor = new Color();

    // Arrays to collect owned disposable resources
    this._geometries = [];
    this._materials = [];
    this._textures = [];
    this._unsubs = [];

    // Shared reusable base sphere geometries
    this._sharedStarGeom = new SphereGeometry(1.0, 20, 14);
    this._geometries.push(this._sharedStarGeom);

    // Initialize 5 Chapter Visual Subsystems
    this.chapterGroups = [null]; // 1-indexed for convenience
    for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
      const chGroup = new Group();
      chGroup.name = `chapter-${ch}-root`;
      chGroup.visible = (ch === 1);
      this.group.add(chGroup);
      this.chapterGroups.push(chGroup);
    }

    this._setupChapter1Visuals();
    this._setupChapter2Visuals();
    this._setupChapter3Visuals();
    this._setupChapter4Visuals();
    this._setupChapter5Visuals();

    // Enforce midground renderOrder (-100) and depthWrite: false across all visual renderables
    // so Three.js renders Orrery in front of celestial landmarks (-920) and behind foreground planetoid (0)
    // without mutual transparent fragment rejection.
    this.group.traverse((obj) => {
      if (obj.isMesh || obj.isLine || obj.isPoints) {
        obj.renderOrder = -100;
        if (obj.material) {
          obj.material.depthWrite = false;
        }
      }
    });

    // Attach to parent
    if (this.parentGroup && typeof this.parentGroup.add === 'function') {
      this.parentGroup.add(this.group);
    }

    // Attach to window for intuitive runtime console inspection & debug APIs
    if (typeof window !== 'undefined') {
      window.orreryVisualSystem = this;
    }

    // Subscribe to pipeline events for visual reactive accents
    this._subscribeEvents();

    // Sync initial state
    this._syncFromDirector();
  }

  /**
   * Builds an analytical Mars-like terrestrial planet geometry with subtle
   * lowlands/highlands elevation displacement and baked terrain vertex colors.
   *
   * Color bands match Stage 1 Mars-like primordial geological hierarchy:
   * - Deep Rust (#4E2019): Deep impact basins & crater depressions
   * - Burnt Sienna / Lowland (#793322): Sloped crater walls & lowlands
   * - Terracotta Base (#A84E32): Primary iron-rich barren crust
   * - Warm Ochre (#C66F42): Elevated plains & weathered plateaus
   * - Peach Ridge (#E5A27A): Crest highlights & mountain ridges
   *
   * @param {number} [radius=1.0]
   * @param {number} [widthSeg=24]
   * @param {number} [heightSeg=16]
   * @returns {SphereGeometry}
   * @private
   */
  _createTerrestrialPlanetGeometry(radius = 1.0, widthSeg = 24, heightSeg = 16) {
    const geom = new SphereGeometry(radius, widthSeg, heightSeg);
    const posAttr = geom.getAttribute('position');
    const vertexCount = posAttr.count;

    const colors = new Float32Array(vertexCount * 3);

    // Color definitions
    const cDeepRust = new Color(ORRERY_PALETTE.PLANETOID_DEEP_RUST);       // #4E2019
    const cBurntSienna = new Color(ORRERY_PALETTE.PLANETOID_RUST_LOWLAND); // #793322
    const cTerracotta = new Color(ORRERY_PALETTE.PLANETOID_TERRACOTTA);   // #A84E32
    const cWarmOchre = new Color(ORRERY_PALETTE.PLANETOID_WARM_OCHRE);    // #C66F42
    const cPeachRidge = new Color(ORRERY_PALETTE.PLANETOID_PEACH_RIDGE);  // #E5A27A

    const tempNormal = new Vector3();
    const tempColor = new Color();

    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      tempNormal.set(x, y, z).normalize();
      const nx = tempNormal.x;
      const ny = tempNormal.y;
      const nz = tempNormal.z;

      // Analytical spherical harmonic terrain height (-1 to +1)
      const h1 = Math.sin(nx * 3.2 + nz * 2.1) * 0.45;
      const h2 = Math.cos(ny * 3.8 + nx * 1.7) * 0.35;
      const h3 = Math.sin(nz * 5.5 - ny * 2.4 + nx * 3.1) * 0.20;
      const elevation = h1 + h2 + h3; // range approx -1.0 to 1.0

      // Modulate vertex radius subtly (±2.5%) for non-spherical silhouette readability
      const rMod = 1.0 + elevation * 0.025;
      posAttr.setXYZ(i, x * rMod, y * rMod, z * rMod);

      // Interpolate geological color palette based on elevation
      if (elevation < -0.35) {
        // Deep impact basins / crater floors
        const t = Math.max(0, Math.min(1, (elevation - (-1.0)) / 0.65));
        tempColor.copy(cDeepRust).lerp(cBurntSienna, t * 0.5);
      } else if (elevation < 0.0) {
        // Lowlands & transitional plains
        const t = (elevation - (-0.35)) / 0.35;
        tempColor.copy(cBurntSienna).lerp(cTerracotta, t);
      } else if (elevation < 0.45) {
        // Primary terracotta crust to elevated ochre plateaus
        const t = elevation / 0.45;
        tempColor.copy(cTerracotta).lerp(cWarmOchre, t);
      } else {
        // Highland ridges & rocky crest peaks
        const t = Math.min(1, (elevation - 0.45) / 0.55);
        tempColor.copy(cWarmOchre).lerp(cPeachRidge, t);
      }

      // In Three.js MeshBasicMaterial with vertexColors: true:
      // diffuseColor.rgb = material.color.rgb * vertexColor.rgb
      // Store relative modulation ratios so material.color remains #A84E32
      // while WebGL renders the exact Martian palette hierarchy.
      colors[i * 3] = tempColor.r / cTerracotta.r;
      colors[i * 3 + 1] = tempColor.g / cTerracotta.g;
      colors[i * 3 + 2] = tempColor.b / cTerracotta.b;
    }

    geom.setAttribute('color', new BufferAttribute(colors, 3));
    posAttr.needsUpdate = true;
    geom.computeVertexNormals();

    return geom;
  }

  // ==========================================================================
  // 1. CHAPTER VISUAL CONSTRUCTIONS
  // ==========================================================================

  /**
   * Chapter 1: Three-Body Capture
   * Primary star, secondary perturber body, planetoid node, open hyperbolic and closed bound orbits.
   * Large celestial stage composition centered in forward player sightline.
   * @private
   */
  _setupChapter1Visuals() {
    const root = this.chapterGroups[1];

    // Scale Chapter 1 Three-Body system to occupy the forward celestial field of view
    root.scale.setScalar(2.2);

    // Primary Central Star (Star A - Gravitational Anchor - Champagne / Warm Gold / Rose-Gold)
    this.ch1StarGeom = new SphereGeometry(1.0, 24, 18);
    this._geometries.push(this.ch1StarGeom);
    const starMat = createPrimaryStarMaterial({ opacity: 0.90 });
    this._materials.push(starMat);
    this.ch1PrimaryStar = new Mesh(this.ch1StarGeom, starMat);
    this.ch1PrimaryStar.name = 'primary-star';
    this.ch1PrimaryStar.scale.setScalar(0.145);
    this.ch1PrimaryStar.userData = {
      isPrimaryStar: true,
      palette: {
        core: ORRERY_PALETTE.STAR_CHAMPAGNE_CORE,
        innerGlow: ORRERY_PALETTE.STAR_INNER_GLOW,
        gold: ORRERY_PALETTE.STAR_GOLD,
        amber: ORRERY_PALETTE.STAR_AMBER,
        roseEdge: ORRERY_PALETTE.STAR_ROSE_GOLD
      }
    };

    // Soft stellar corona glow for Star A (warm gold with subtle rose outer tint)
    const starGlowMat = createPrimaryCoronaMaterial({ opacity: 0.20 });
    this._materials.push(starGlowMat);
    this.ch1StarGlow = new Mesh(this.ch1StarGeom, starGlowMat);
    this.ch1StarGlow.name = 'primary-star-glow';
    this.ch1StarGlow.scale.setScalar(1.20);
    this.ch1PrimaryStar.add(this.ch1StarGlow);

    root.add(this.ch1PrimaryStar);

    // Single Synchronization Wave Ring (Centered on 3-body syzygy alignment at Our Planet, expands rapidly during pulse)
    // Section 17: Thin, rapid expansion, fades cleanly, does NOT resemble persistent orbit
    const waveGeom = new RingGeometry(0.20, 0.45, 48);
    this._geometries.push(waveGeom);
    const waveMat = new MeshBasicMaterial({
      color: new Color('#F5D0A9'), // Warm champagne-rose gold
      transparent: true,
      opacity: 0.0,
      side: DoubleSide,
      depthWrite: false
    });
    this._materials.push(waveMat);
    this.ch1SyncWave = new Mesh(waveGeom, waveMat);
    this.ch1SyncWave.name = 'synchronization-wave';
    this.ch1SyncWave.position.set(-0.924, 0.0, 0.0); // Aligned center at Our Planet (-0.42 * 2.2)
    this.ch1SyncWave.rotation.x = Math.PI * 0.5;
    this.ch1SyncWave.renderOrder = -99;
    this.ch1SyncWave.visible = false;
    this.group.add(this.ch1SyncWave);

    // Subtle Radial Energy Rays (Layer 4 - Pre-allocated, zero heap allocation)
    // 16 short radial ray segments emanating outward around the aligned system
    const rayPositions = new Float32Array(16 * 2 * 3);
    for (let r = 0; r < 16; r++) {
      const theta = (r / 16.0) * Math.PI * 2.0;
      const rInner = 0.35;
      const rOuter = 0.85;
      rayPositions[r * 6 + 0] = Math.cos(theta) * rInner;
      rayPositions[r * 6 + 1] = Math.sin(theta) * rInner;
      rayPositions[r * 6 + 2] = 0.0;
      rayPositions[r * 6 + 3] = Math.cos(theta) * rOuter;
      rayPositions[r * 6 + 4] = Math.sin(theta) * rOuter;
      rayPositions[r * 6 + 5] = 0.0;
    }
    const rayGeom = new BufferGeometry();
    rayGeom.setAttribute('position', new BufferAttribute(rayPositions, 3));
    this._geometries.push(rayGeom);
    const rayMat = new LineBasicMaterial({
      color: new Color('#FFE4B5'),
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(rayMat);
    this.ch1EnergyRays = new LineSegments(rayGeom, rayMat);
    this.ch1EnergyRays.name = 'energy-rays';
    this.ch1EnergyRays.position.set(-0.924, 0.0, 0.0);
    this.ch1EnergyRays.renderOrder = -99;
    this.ch1EnergyRays.visible = false;
    this.group.add(this.ch1EnergyRays);

    // Floating World-Space "STABLE STATE" Text (Sections 1, 2, 4, 5, 6, 7: elegant serif, 25-35% syzygy width, comfortable vertical gap above Our Planet)
    const textTex = createStableStateTextTexture();
    if (textTex?.isTexture) this._textures.push(textTex);
    const textMat = new SpriteMaterial({
      map: textTex?.isTexture ? textTex : null,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: false
    });
    this._materials.push(textMat);
    this.ch1StableStateText = new Sprite(textMat);
    this.ch1StableStateText.name = 'stable-state-text';
    this.ch1StableStateText.position.set(-0.924, 0.62, 0.0);
    this.ch1StableStateText.scale.set(0.88, 0.22, 1.0); // Refined, elegant cosmic title centered directly above syzygy
    this.ch1StableStateText.renderOrder = -50;
    this.ch1StableStateText.visible = false;
    this.group.add(this.ch1StableStateText);

    // Dynamic Travelling Shimmer Glint across "STABLE STATE" lettering (Section 12)
    const glintTex = createShimmerGlintTexture();
    if (glintTex?.isTexture) this._textures.push(glintTex);
    const glintMat = new SpriteMaterial({
      map: glintTex?.isTexture ? glintTex : null,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      depthTest: false
    });
    this._materials.push(glintMat);
    this.ch1TextShimmerGlint = new Sprite(glintMat);
    this.ch1TextShimmerGlint.name = 'stable-state-glint';
    this.ch1TextShimmerGlint.position.set(-0.924, 0.62, 0.01);
    this.ch1TextShimmerGlint.scale.set(0.16, 0.16, 1.0);
    this.ch1TextShimmerGlint.renderOrder = -49;
    this.ch1TextShimmerGlint.visible = false;
    this.group.add(this.ch1TextShimmerGlint);

    // Preallocated Cosmic Glitter Sparkles around "STABLE STATE" (Section 11: 12 refined sparkle points)
    const sparkleGeom = new BufferGeometry();
    const sparklePositions = new Float32Array([
      -0.42,  0.09, 0.01,
      -0.34, -0.10, 0.01,
      -0.24,  0.11, 0.01,
      -0.15, -0.09, 0.01,
      -0.08,  0.10, 0.01,
       0.00,  0.12, 0.01,
       0.08, -0.10, 0.01,
       0.16,  0.10, 0.01,
       0.26, -0.11, 0.01,
       0.35,  0.09, 0.01,
       0.43, -0.09, 0.01,
       0.00, -0.12, 0.01
    ]);
    sparkleGeom.setAttribute('position', new BufferAttribute(sparklePositions, 3));
    this._geometries.push(sparkleGeom);
    const sparkleMat = new PointsMaterial({
      color: new Color('#FFF3D0'),
      size: 0.028,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(sparkleMat);
    this.ch1StableStateSparkles = new Points(sparkleGeom, sparkleMat);
    this.ch1StableStateSparkles.name = 'stable-state-sparkles';
    this.ch1StableStateSparkles.position.set(-0.924, 0.62, 0.0);
    this.ch1StableStateSparkles.renderOrder = -100;
    this.ch1StableStateSparkles.visible = false;
    this.group.add(this.ch1StableStateSparkles);

    // Secondary Perturber Body (Mysterious Crystalline Amethyst / Indigo / Cyan World)
    this.ch1PerturberGeom = new SphereGeometry(1.0, 24, 18);
    this._geometries.push(this.ch1PerturberGeom);
    const perturberMat = createSecondaryPlanetMaterial({ opacity: 0.92 });
    this._materials.push(perturberMat);
    this.ch1Perturber = new Mesh(this.ch1PerturberGeom, perturberMat);
    this.ch1Perturber.name = 'secondary-perturber';
    this.ch1Perturber.scale.setScalar(0.095);
    this.ch1Perturber.position.set(0.653, 0.066, -0.234);
    this.ch1Perturber.userData = {
      isSecondaryPlanet: true,
      palette: {
        deepViolet: ORRERY_PALETTE.SECONDARY_VIOLET_DEEP,
        secondaryViolet: ORRERY_PALETTE.SECONDARY_VIOLET_MID,
        amethyst: ORRERY_PALETTE.SECONDARY_AMETHYST,
        softViolet: ORRERY_PALETTE.SECONDARY_TERRAIN_SOFT,
        lavender: ORRERY_PALETTE.SECONDARY_TERRAIN_LAVENDER,
        mineral: ORRERY_PALETTE.SECONDARY_TERRAIN_MINERAL,
        sapphire: ORRERY_PALETTE.SECONDARY_ACCENT_SAPPHIRE,
        cyanAccent: ORRERY_PALETTE.SECONDARY_ACCENT_CYAN,
        rim: ORRERY_PALETTE.SECONDARY_RIM_FRESNEL
      }
    };

    // Soft crystalline rim glow for Secondary World (subtle lavender rim separation)
    const perturberGlowMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.SECONDARY_RIM_FRESNEL,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    this._materials.push(perturberGlowMat);
    this.ch1PerturberGlow = new Mesh(this.ch1PerturberGeom, perturberGlowMat);
    this.ch1PerturberGlow.name = 'secondary-perturber-glow';
    this.ch1PerturberGlow.scale.setScalar(1.18);
    this.ch1Perturber.add(this.ch1PerturberGlow);
    root.add(this.ch1Perturber);

    // Captured Planetoid Node (Player's Evolving Planet in Three-Body System)
    // Procedural Stage 1 Planetoid shader material matching the hero planetary visual identity
    this.ch1PlanetGeom = new SphereGeometry(1.0, 32, 24);
    this._geometries.push(this.ch1PlanetGeom);
    const nodeMat = createPlanetoidCoreMaterial({
      lightDirection: new Vector3(0.32, 0.42, 0.85).normalize()
    });
    // Set color property for inspection compatibility while shader computes full procedural terrain
    nodeMat.color = new Color(ORRERY_PALETTE.PLANETOID_TERRACOTTA);
    this._materials.push(nodeMat);
    this.ch1PlanetMaterial = nodeMat;
    this.ch1PlanetNode = new Mesh(this.ch1PlanetGeom, nodeMat);
    this.ch1PlanetNode.name = 'chapter-1-node';
    this.ch1PlanetNode.scale.setScalar(0.18);
    this.ch1PlanetNode.userData = {
      isPlayerPlanet: true,
      stage: 1,
      stageKey: 'seed',
      hasKintsugi: false,
      hasGoldVeins: false,
      surfaceType: 'barren-primordial',
      palette: {
        base: ORRERY_PALETTE.PLANETOID_TERRACOTTA,
        deepRust: ORRERY_PALETTE.PLANETOID_DEEP_RUST,
        burntSienna: ORRERY_PALETTE.PLANETOID_RUST_LOWLAND,
        warmOchre: ORRERY_PALETTE.PLANETOID_WARM_OCHRE,
        peachRidge: ORRERY_PALETTE.PLANETOID_PEACH_RIDGE
      }
    };

    // Soft Atmospheric Aura for Our Planet (reinforces "this is the player's evolving protagonist world")
    // Nested under chapter-1-node to preserve exact 8-child Chapter 1 scene graph contract
    const auraGeom = new SphereGeometry(1.0, 24, 18);
    this._geometries.push(auraGeom);
    const auraMat = createPlanetaryAuraMaterial({ opacity: 0.22 });
    this._materials.push(auraMat);
    this.ch1PlanetAura = new Mesh(auraGeom, auraMat);
    this.ch1PlanetAura.name = 'planet-aura';
    this.ch1PlanetAura.scale.setScalar(1.08);
    this.ch1PlanetNode.add(this.ch1PlanetAura);

    root.add(this.ch1PlanetNode);

    // Open Hyperbolic Incoming Path (Cyan/White - Clear Arrival from Outside the System)
    const hypGeom = createOrbitGeometry({
      pointsCount: 96,
      semiMajorAxis: 0.85,
      eccentricity: 1.35,
      isHyperbolic: true,
      startAngle: -1.35,
      endAngle: 1.35
    });
    this._geometries.push(hypGeom);
    const hypMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_CYAN, transparent: true, opacity: 0.85 });
    this._materials.push(hypMat);
    this.ch1HyperbolicLine = new Line(hypGeom, hypMat);
    this.ch1HyperbolicLine.name = 'hyperbolic-orbit-path';
    this.ch1HyperbolicLine.renderOrder = -110;
    root.add(this.ch1HyperbolicLine);

    // Planet ↔ Star Connection Arc (Intentional, bounded champagne bridge between Our Planet and Star)
    // Named 'bound-orbit-path' for scene graph contract compatibility and aliased to ch1PlanetStarConnection
    const connectGeom = createOrbitGeometry({
      pointsCount: 48,
      semiMajorAxis: 0.45,
      eccentricity: 0.40,
      startAngle: -0.25,
      endAngle: Math.PI * 0.85
    });
    this._geometries.push(connectGeom);
    const connectMat = new MeshBasicMaterial({
      color: new Color('#E8C68D'),
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this._materials.push(connectMat);
    this.ch1BoundOrbitLine = new Line(connectGeom, connectMat);
    this.ch1BoundOrbitLine.name = 'bound-orbit-path';
    this.ch1BoundOrbitLine.renderOrder = -110;
    this.ch1BoundOrbitLine.userData = {
      isConnectionArc: true,
      isBoundOrbit: true,
      color: '#E8C68D',
      opacity: 0.22
    };
    this.ch1PlanetStarConnection = this.ch1BoundOrbitLine;
    this._boundOrbitPositions = connectGeom.attributes.position.array.slice();
    root.add(this.ch1BoundOrbitLine);

    // Dedicated Bounded Orbital Path for Our Planet (Warm Champagne Gold - Local Arc)
    // Bounded to interaction sector [-1.25, 1.25] using Line instead of LineLoop to prevent the
    // giant unwanted ellipse from crossing the entire viewport into the upper-left (apoapsis -3.45m).
    const planetOrbitGeom = createOrbitGeometry({
      pointsCount: 64,
      semiMajorAxis: 0.95,
      eccentricity: 0.65,
      isHyperbolic: false,
      startAngle: -1.25,
      endAngle: 1.25
    });
    this._geometries.push(planetOrbitGeom);
    const planetOrbitMat = new MeshBasicMaterial({
      color: new Color('#E8C68D'),
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this._materials.push(planetOrbitMat);
    this.ch1PlanetOrbitLine = new Line(planetOrbitGeom, planetOrbitMat);
    this.ch1PlanetOrbitLine.name = 'planet-orbit-path';
    this.ch1PlanetOrbitLine.rotation.set(0.10, 0.0, -0.05);
    this.ch1PlanetOrbitLine.renderOrder = -110;
    this.ch1PlanetOrbitLine.userData = {
      isPlanetOrbit: true,
      color: '#E8C68D',
      opacity: 0.28,
      inclination: 0.10,
      eccentricity: 0.65
    };
    root.add(this.ch1PlanetOrbitLine);

    // Dedicated Bounded Orbital Path for Secondary Planet (Luminous Lavender - Local Arc)
    // Bounded to interaction sector [-1.25, 1.25] using Line to prevent giant scene-spanning ring
    const perturberOrbitGeom = createOrbitGeometry({
      pointsCount: 64,
      semiMajorAxis: 0.82,
      eccentricity: 0.28,
      isHyperbolic: false,
      startAngle: -1.25,
      endAngle: 1.25
    });
    this._geometries.push(perturberOrbitGeom);
    const perturberOrbitMat = new MeshBasicMaterial({
      color: new Color('#B49AE8'),
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    this._materials.push(perturberOrbitMat);
    this.ch1PerturberOrbitLine = new Line(perturberOrbitGeom, perturberOrbitMat);
    this.ch1PerturberOrbitLine.name = 'secondary-orbit-path';
    this.ch1PerturberOrbitLine.rotation.set(-0.20, 0.32, 0.16);
    this.ch1PerturberOrbitLine.renderOrder = -110;
    this.ch1PerturberOrbitLine.userData = {
      isSecondaryOrbit: true,
      color: '#B49AE8',
      opacity: 0.24,
      inclination: -0.20,
      eccentricity: 0.28
    };
    root.add(this.ch1PerturberOrbitLine);

    // Retro-Capture Burn Flare (near periapsis)
    const burnGeom = new SphereGeometry(0.06, 12, 8);
    this._geometries.push(burnGeom);
    const burnMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.BURN_FLARE, transparent: true, opacity: 0.0 });
    this._materials.push(burnMat);
    this.ch1BurnFlare = new Mesh(burnGeom, burnMat);
    this.ch1BurnFlare.name = 'capture-burn-flare';
    this.ch1BurnFlare.position.set(0.35, 0.0, 0.0);
    this.ch1BurnFlare.visible = false;
    root.add(this.ch1BurnFlare);
  }

  /**
   * Chapter 2: Binary Resonance
   * Binary stars orbiting mutual barycenter, circumbinary outer planetoid, resonant ring.
   * Coordinate and scale harmonized with Chapter 1 Three-Body system (scale 2.2).
   * @private
   */
  _setupChapter2Visuals() {
    const root = this.chapterGroups[2];

    // Harmonize Chapter 2 group scale with Chapter 1
    root.scale.setScalar(2.2);
    // Center and lower Chapter 2 slightly to frame the triad intimately above the player's Kendama
    root.position.set(0.0, -0.18, 0.22);

    // Barycenter group
    this.ch2Barycenter = new Group();
    this.ch2Barycenter.name = 'chapter-2-barycenter';
    root.add(this.ch2Barycenter);

    // Binary Star 1 (Peach/Champagne/Amber Gold, local scale ≈ 0.12, procedural stellar plasma)
    const star1Mat = createStellarBodyMaterial({
      coreColor: '#FFFDF8',
      midColor: ORRERY_PALETTE.STAR_PEACH,
      darkColor: '#D98A52',
      rimColor: '#FFE8C2',
      accentColor: '#FFF0D6',
      noiseSeed: new Vector3(14.2, 7.8, 23.5),
      noiseScale: 1.0,
      noiseFrequency: 5.2,
      surfaceSpeed: 0.035,
      opacity: 0.95
    });
    this._materials.push(star1Mat);
    this.ch2Star1 = new Mesh(this._sharedStarGeom, star1Mat);
    this.ch2Star1.name = 'star-peach';
    this.ch2Star1.scale.setScalar(0.12);
    this.ch2Star1.position.set(0.19, 0.0, 0.0);
    this.ch2Star1.userData = {
      isStellarBody: true,
      isBinaryStar: true,
      isBinaryPlanet: true,
      bodyIndex: 1,
      paletteKey: 'peach-gold',
      palette: {
        core: '#FFFDF8',
        dark: '#D98A52',
        mid: ORRERY_PALETTE.STAR_PEACH,
        high: '#FFE8C2',
        rim: '#FFE8C2'
      }
    };
    this.ch2Barycenter.add(this.ch2Star1);

    const star1GlowMat = createPrimaryCoronaMaterial({
      opacity: 0.22,
      primaryColor: ORRERY_PALETTE.STAR_PEACH,
      outerColor: '#FFE8D6'
    });
    this._materials.push(star1GlowMat);
    this.ch2Star1Glow = new Mesh(this._sharedStarGeom, star1GlowMat);
    this.ch2Star1Glow.name = 'star-peach-halo';
    this.ch2Star1Glow.scale.setScalar(1.25);
    this.ch2Star1.add(this.ch2Star1Glow);

    // Binary Star 2 (Lavender/Amethyst/Pearl/Cyan, local scale ≈ 0.10, procedural stellar plasma)
    const star2Mat = createStellarBodyMaterial({
      coreColor: '#FAF8FF',
      midColor: '#C4ADE0',
      darkColor: '#8568A8',
      rimColor: '#DDF4FC',
      accentColor: '#7EE6F2',
      noiseSeed: new Vector3(41.7, 58.2, 93.1),
      noiseScale: 1.0,
      noiseFrequency: 5.6,
      surfaceSpeed: -0.030,
      opacity: 0.95
    });
    this._materials.push(star2Mat);
    this.ch2Star2 = new Mesh(this._sharedStarGeom, star2Mat);
    this.ch2Star2.name = 'star-lavender';
    this.ch2Star2.scale.setScalar(0.10);
    this.ch2Star2.position.set(-0.19, 0.0, 0.0);
    this.ch2Star2.userData = {
      isStellarBody: true,
      isBinaryStar: true,
      isBinaryPlanet: true,
      bodyIndex: 2,
      paletteKey: 'lavender-amethyst',
      palette: {
        core: '#FAF8FF',
        dark: '#8568A8',
        mid: '#C4ADE0',
        high: '#7EE6F2',
        rim: '#DDF4FC'
      }
    };
    this.ch2Barycenter.add(this.ch2Star2);

    const star2GlowMat = createPrimaryCoronaMaterial({
      opacity: 0.20,
      primaryColor: ORRERY_PALETTE.STAR_LAVENDER,
      outerColor: '#CDE7F7'
    });
    this._materials.push(star2GlowMat);
    this.ch2Star2Glow = new Mesh(this._sharedStarGeom, star2GlowMat);
    this.ch2Star2Glow.name = 'star-lavender-halo';
    this.ch2Star2Glow.scale.setScalar(1.25);
    this.ch2Star2.add(this.ch2Star2Glow);

    // Step 3: Player Planet Continuity
    // Procedural PlanetoidShader material matching the hero planetary visual identity (Stage 2 Awakening)
    this.ch2PlanetGeom = new SphereGeometry(1.0, 32, 24);
    this._geometries.push(this.ch2PlanetGeom);
    const nodeMat = createPlanetoidCoreMaterial({
      lightDirection: new Vector3(0.32, 0.42, 0.85).normalize()
    });
    nodeMat.uniforms.uVisualStage.value = 2.0;
    nodeMat.uniforms.uAwakeningProgress.value = 1.0;
    nodeMat.color = new Color(ORRERY_PALETTE.PLANETOID_TERRACOTTA);
    this._materials.push(nodeMat);
    this.ch2PlanetMaterial = nodeMat;
    this.ch2PlanetNode = new Mesh(this.ch2PlanetGeom, nodeMat);
    this.ch2PlanetNode.name = 'chapter-2-node';
    this.ch2PlanetNode.scale.setScalar(0.18);
    this.ch2PlanetNode.userData = {
      isPlayerPlanet: true,
      stage: 2,
      stageKey: 'awakening',
      hasKintsugi: true,
      hasGoldVeins: true,
      surfaceType: 'awakening-gold-veins'
    };
    root.add(this.ch2PlanetNode);

    // Player Planet subtle turquoise-gold atmosphere halo
    const planetAuraMat = createPrimaryCoronaMaterial({
      opacity: 0.20,
      primaryColor: '#72D6D6',
      outerColor: '#FFE4B5'
    });
    this._materials.push(planetAuraMat);
    this.ch2PlanetAura = new Mesh(this._sharedStarGeom, planetAuraMat);
    this.ch2PlanetAura.name = 'ch2-planet-aura';
    this.ch2PlanetAura.scale.setScalar(1.25);
    this.ch2PlanetNode.add(this.ch2PlanetAura);

    // Mutual Barycenter Inner Orbit Loop (radius ≈ 0.19 matching star track diameter d ≈ 0.38)
    const innerGeom = createOrbitGeometry({ pointsCount: 64, semiMajorAxis: 0.19, eccentricity: 0.0 });
    this._geometries.push(innerGeom);
    const innerMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_FAINT, transparent: true, opacity: 0.35 });
    this._materials.push(innerMat);
    this.ch2InnerOrbitLine = new LineLoop(innerGeom, innerMat);
    this.ch2InnerOrbitLine.name = 'barycenter-orbit';
    root.add(this.ch2InnerOrbitLine);

    // Outer Resonant Orbit Ring (Champagne Gold, radius ≈ 1.15)
    const outerGeom = createOrbitGeometry({ pointsCount: 96, semiMajorAxis: 1.15, eccentricity: 0.0 });
    this._geometries.push(outerGeom);
    const outerMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_GOLD, transparent: true, opacity: 0.70 });
    this._materials.push(outerMat);
    this.ch2ResonantRing = new LineLoop(outerGeom, outerMat);
    this.ch2ResonantRing.name = 'resonant-ring';
    root.add(this.ch2ResonantRing);

    // Phase 3B: Harmonic node markers (10 lightweight spheres along resonant ring, r = 1.15)
    const harmonicNodeGeom = new SphereGeometry(1.0, 8, 6);
    this._geometries.push(harmonicNodeGeom);
    this.ch2HarmonicNodes = [];
    for (let i = 0; i < CH2_HARMONIC_NODE_COUNT; i++) {
      const angle = (i / CH2_HARMONIC_NODE_COUNT) * Math.PI * 2.0;
      const nodeMat2 = new MeshBasicMaterial({
        color: ORRERY_PALETTE.ORBIT_GOLD,
        transparent: true,
        opacity: 0.0
      });
      this._materials.push(nodeMat2);
      const nodeM = new Mesh(harmonicNodeGeom, nodeMat2);
      nodeM.name = `ch2HarmonicNode-${i}`;
      nodeM.scale.setScalar(0.022);
      nodeM.position.set(1.15 * Math.cos(angle), 0.0, 1.15 * Math.sin(angle));
      nodeM.visible = false;
      root.add(nodeM);
      this.ch2HarmonicNodes.push(nodeM);
    }

    // Phase 3B: RESONANCE ACHIEVED milestone world-space Sprite (reusing Chapter 1 stable-state styling)
    const resonanceLockedTex = createResonanceAchievedTextTexture();
    if (resonanceLockedTex && !resonanceLockedTex.dispose) resonanceLockedTex.dispose = () => {};
    if (Array.isArray(this._textures)) this._textures.push(resonanceLockedTex);
    const resonanceLockedMat = new SpriteMaterial({
      map: resonanceLockedTex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(resonanceLockedMat);
    this.ch2ResonanceLockedText = new Sprite(resonanceLockedMat);
    this.ch2ResonanceLockedText.name = 'ch2-resonance-locked-text';
    this.ch2ResonanceLockedText.scale.set(0.88, 0.22, 1.0);
    this.ch2ResonanceLockedText.position.set(0.0, 0.58, 0.0);
    this.ch2ResonanceLockedText.visible = false;
    this.ch2ResonanceAchievedText = this.ch2ResonanceLockedText;
    root.add(this.ch2ResonanceLockedText);

    // Phase 3C: 100-Particle Instanced Resonance Field (Harmonic Celestial Filaments)
    const particleGeom = new SphereGeometry(1.0, 6, 4);
    this._geometries.push(particleGeom);
    const particleMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: AdditiveBlending
    });
    this._materials.push(particleMat);
    this.ch2ParticleField = new InstancedMesh(particleGeom, particleMat, CH2_PARTICLE_COUNT);
    this.ch2ParticleField.name = 'ch2-particle-field';
    this.ch2ParticleField.visible = false;

    // Harmonic Celestial Stardust Palette (Champagne ~45%, Cyan ~30%, Lavender ~20%, Pearl ~5%)
    const CHAMPAGNE_COLORS = ['#F5E6C8', '#E8C872', '#FFE4B5', '#FCE8AC'];
    const TURQUOISE_COLORS = ['#72D6D6', '#5BBFBA', '#A8E6CF', '#88D8C0'];
    const LAVENDER_COLORS = ['#D5C6E8', '#C3B1E1', '#BDB2FF', '#E6E6FA'];
    const PEARL_COLORS = ['#FFFDF7', '#F8F6FF'];
    const tempCol = new Color();

    // Deterministic distribution along the r ≈ 1.15 resonant corridor (Float32Array(400): [x, y, z, phase])
    for (let i = 0; i < CH2_PARTICLE_COUNT; i++) {
      const angle = (i / CH2_PARTICLE_COUNT) * Math.PI * 2.0 + (((i * 19) % 37) / 37 - 0.5) * 0.22;
      const radius = 1.15 + (((i * 23) % 41) / 41 - 0.5) * 0.18;
      const y = (((i * 13) % 29) / 29 - 0.5) * 0.08;
      const phase = ((i * 31) % 53) / 53 * Math.PI * 2.0;

      const x0 = radius * Math.cos(angle);
      const z0 = radius * Math.sin(angle);

      this._ch2ParticleData[i * 4 + 0] = x0;
      this._ch2ParticleData[i * 4 + 1] = y;
      this._ch2ParticleData[i * 4 + 2] = z0;
      this._ch2ParticleData[i * 4 + 3] = phase;

      if (i < 45) {
        tempCol.set(CHAMPAGNE_COLORS[i % CHAMPAGNE_COLORS.length]);
      } else if (i < 75) {
        tempCol.set(TURQUOISE_COLORS[(i - 45) % TURQUOISE_COLORS.length]);
      } else if (i < 95) {
        tempCol.set(LAVENDER_COLORS[(i - 75) % LAVENDER_COLORS.length]);
      } else {
        tempCol.set(PEARL_COLORS[(i - 95) % PEARL_COLORS.length]);
      }
      this.ch2ParticleField.setColorAt(i, tempCol);

      this._tempMatrix.makeScale(0.003, 0.003, 0.003);
      this._tempMatrix.setPosition(x0, y, z0);
      this.ch2ParticleField.setMatrixAt(i, this._tempMatrix);
    }
    if (this.ch2ParticleField.instanceColor) {
      this.ch2ParticleField.instanceColor.needsUpdate = true;
    }
    this.ch2ParticleField.instanceMatrix.needsUpdate = true;
    root.add(this.ch2ParticleField);

    // Phase 3C: Binary Resonance Shockwave (expanding ring from binary center)
    const shockwaveGeom = new RingGeometry(0.88, 1.0, 48);
    this._geometries.push(shockwaveGeom);
    const shockwaveMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.ORBIT_CYAN,
      side: DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(shockwaveMat);
    this.ch2ShockwaveMesh = new Mesh(shockwaveGeom, shockwaveMat);
    this.ch2ShockwaveMesh.name = 'ch2-resonance-shockwave';
    this.ch2ShockwaveMesh.rotation.x = Math.PI * 0.5;
    this.ch2ShockwaveMesh.scale.setScalar(0.20);
    this.ch2ShockwaveMesh.visible = false;
    root.add(this.ch2ShockwaveMesh);

    // Phase 3C: Protective Shield / Stretch Ring (associated with player planet)
    const shieldGeom = new RingGeometry(1.24, 1.36, 48);
    this._geometries.push(shieldGeom);
    const shieldMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.SHIELD_CREST,
      side: DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(shieldMat);
    this.ch2ShieldRing = new Mesh(shieldGeom, shieldMat);
    this.ch2ShieldRing.name = 'ch2-planet-shield-ring';
    this.ch2ShieldRing.rotation.x = Math.PI * 0.5;
    this.ch2ShieldRing.visible = false;
    this.ch2PlanetNode.add(this.ch2ShieldRing);

    // Mystical Visual Pass: Concentric Astrolabe / Celestial Compass Rings
    // Ring 1: Inner harmonic shell (r ≈ 0.58)
    const ring1Geom = createOrbitGeometry({ pointsCount: 64, semiMajorAxis: 0.58, eccentricity: 0.0 });
    this._geometries.push(ring1Geom);
    const ring1Mat = new MeshBasicMaterial({ color: '#EAD8B1', transparent: true, opacity: 0.0 });
    this._materials.push(ring1Mat);
    this.ch2ConcentricRing1 = new LineLoop(ring1Geom, ring1Mat);
    this.ch2ConcentricRing1.name = 'ch2-concentric-ring-1';
    this.ch2ConcentricRing1.visible = false;
    root.add(this.ch2ConcentricRing1);

    // Ring 2: Outer harmonic ring (r ≈ 1.38)
    const ring2Geom = createOrbitGeometry({ pointsCount: 96, semiMajorAxis: 1.38, eccentricity: 0.0 });
    this._geometries.push(ring2Geom);
    const ring2Mat = new MeshBasicMaterial({ color: '#6EE7E7', transparent: true, opacity: 0.0 });
    this._materials.push(ring2Mat);
    this.ch2ConcentricRing2 = new LineLoop(ring2Geom, ring2Mat);
    this.ch2ConcentricRing2.name = 'ch2-concentric-ring-2';
    this.ch2ConcentricRing2.visible = false;
    root.add(this.ch2ConcentricRing2);

    // Ring 3: Far celestial boundary ring (r ≈ 1.62)
    const ring3Geom = createOrbitGeometry({ pointsCount: 128, semiMajorAxis: 1.62, eccentricity: 0.0 });
    this._geometries.push(ring3Geom);
    const ring3Mat = new MeshBasicMaterial({ color: '#F5E6C8', transparent: true, opacity: 0.0 });
    this._materials.push(ring3Mat);
    this.ch2ConcentricRing3 = new LineLoop(ring3Geom, ring3Mat);
    this.ch2ConcentricRing3.name = 'ch2-concentric-ring-3';
    this.ch2ConcentricRing3.visible = false;
    root.add(this.ch2ConcentricRing3);

    // Mystical Visual Pass: Cardinal crosshair axes (4 radial segments along ±X, ±Z from r=0.25 to r=1.62)
    const axesPositions = new Float32Array([
      0.25, 0.0, 0.0, 1.62, 0.0, 0.0,
      -0.25, 0.0, 0.0, -1.62, 0.0, 0.0,
      0.0, 0.0, 0.25, 0.0, 0.0, 1.62,
      0.0, 0.0, -0.25, 0.0, 0.0, -1.62
    ]);
    const axesGeom = new BufferGeometry();
    axesGeom.setAttribute('position', new BufferAttribute(axesPositions, 3));
    this._geometries.push(axesGeom);
    const axesMat = new LineBasicMaterial({ color: '#F5E6C8', transparent: true, opacity: 0.0 });
    this._materials.push(axesMat);
    this.ch2CardinalAxes = new LineSegments(axesGeom, axesMat);
    this.ch2CardinalAxes.name = 'ch2-cardinal-axes';
    this.ch2CardinalAxes.visible = false;
    root.add(this.ch2CardinalAxes);

    // Mystical Visual Pass: Inter-Stellar Energy Bridge (16-point filament connecting twin stars across barycenter)
    for (let j = 0; j < 16; j++) {
      const u = j / 15.0;
      this._ch2StarBridgePositions[j * 3 + 0] = 0.19 * (1.0 - 2.0 * u);
      this._ch2StarBridgePositions[j * 3 + 1] = 0.0;
      this._ch2StarBridgePositions[j * 3 + 2] = 0.0;
    }
    const starBridgeGeom = new BufferGeometry();
    starBridgeGeom.setAttribute('position', new BufferAttribute(this._ch2StarBridgePositions, 3));
    this._geometries.push(starBridgeGeom);
    const starBridgeMat = new LineBasicMaterial({ color: '#7EEAEA', transparent: true, opacity: 0.0 });
    this._materials.push(starBridgeMat);
    this.ch2StarBridgeLine = new Line(starBridgeGeom, starBridgeMat);
    this.ch2StarBridgeLine.name = 'ch2-star-bridge-line';
    this.ch2StarBridgeLine.visible = false;
    this.ch2Barycenter.add(this.ch2StarBridgeLine);

    // Mystical Visual Pass: Three-Body Triad Bridge (32-point filament connecting Star 1 -> Player Planet -> Star 2)
    const triadBridgeGeom = new BufferGeometry();
    triadBridgeGeom.setAttribute('position', new BufferAttribute(this._ch2TriadBridgePositions, 3));
    this._geometries.push(triadBridgeGeom);
    const triadBridgeMat = new LineBasicMaterial({ color: '#F5E6C8', transparent: true, opacity: 0.0 });
    this._materials.push(triadBridgeMat);
    this.ch2TriadBridgeLine = new Line(triadBridgeGeom, triadBridgeMat);
    this.ch2TriadBridgeLine.name = 'ch2-triad-bridge-line';
    this.ch2TriadBridgeLine.visible = false;
    root.add(this.ch2TriadBridgeLine);

    // Mystical Visual Pass: Sacred Lotus / Guilloché Petals (96-point 4-petal rosette curve)
    for (let i = 0; i < 96; i++) {
      const theta = (i / 96.0) * Math.PI * 2.0;
      const r = 0.685 + 0.465 * Math.cos(4.0 * theta);
      this._ch2FilamentPositions[i * 3 + 0] = r * Math.cos(theta);
      this._ch2FilamentPositions[i * 3 + 1] = 0.0;
      this._ch2FilamentPositions[i * 3 + 2] = r * Math.sin(theta);
    }
    const filamentsGeom = new BufferGeometry();
    filamentsGeom.setAttribute('position', new BufferAttribute(this._ch2FilamentPositions, 3));
    this._geometries.push(filamentsGeom);
    const filamentsMat = new LineBasicMaterial({ color: '#F5E6C8', transparent: true, opacity: 0.0 });
    this._materials.push(filamentsMat);
    this.ch2ResonanceFilaments = new LineLoop(filamentsGeom, filamentsMat);
    this.ch2ResonanceFilaments.name = 'ch2-resonance-filaments';
    this.ch2ResonanceFilaments.visible = false;
    root.add(this.ch2ResonanceFilaments);

    // Mystical Visual Pass: Circumbinary Orbital Trail (64-point closed elliptical/circular path)
    for (let i = 0; i < 64; i++) {
      const theta = (i / 64.0) * Math.PI * 2.0;
      this._ch2TrailPositions[i * 3 + 0] = 1.15 * Math.cos(theta);
      this._ch2TrailPositions[i * 3 + 1] = 0.0;
      this._ch2TrailPositions[i * 3 + 2] = 1.15 * Math.sin(theta);
    }
    const trailGeom = new BufferGeometry();
    trailGeom.setAttribute('position', new BufferAttribute(this._ch2TrailPositions, 3));
    this._geometries.push(trailGeom);
    const trailMat = new LineBasicMaterial({ color: '#8BDBE8', transparent: true, opacity: 0.25 });
    this._materials.push(trailMat);
    this.ch2PlanetTrailLine = new LineLoop(trailGeom, trailMat);
    this.ch2PlanetTrailLine.name = 'ch2-planet-trail-line';
    this.ch2PlanetTrailLine.visible = false;
    root.add(this.ch2PlanetTrailLine);

    // Mystical Visual Pass: Traveling Resonant Highlights (2 diamond highlights at 2:1 harmonic frequency)
    this._ch2HighlightPositions[0] = 1.15;
    this._ch2HighlightPositions[1] = 0.0;
    this._ch2HighlightPositions[2] = 0.0;
    this._ch2HighlightPositions[3] = -1.15;
    this._ch2HighlightPositions[4] = 0.0;
    this._ch2HighlightPositions[5] = 0.0;
    const highlightsGeom = new BufferGeometry();
    highlightsGeom.setAttribute('position', new BufferAttribute(this._ch2HighlightPositions, 3));
    this._geometries.push(highlightsGeom);
    const highlightsMat = new PointsMaterial({ color: '#FFFDF7', size: 0.065, transparent: true, opacity: 0.0 });
    this._materials.push(highlightsMat);
    this.ch2TravelingHighlights = new Points(highlightsGeom, highlightsMat);
    this.ch2TravelingHighlights.name = 'ch2-traveling-highlights';
    this.ch2TravelingHighlights.visible = false;
    root.add(this.ch2TravelingHighlights);

    // Mystical Visual Pass: Secondary Champagne Gold Shockwave Echo
    const shockwaveEchoGeom = new RingGeometry(0.70, 0.82, 48);
    this._geometries.push(shockwaveEchoGeom);
    const shockwaveEchoMat = new MeshBasicMaterial({
      color: '#F5E6C8',
      side: DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this._materials.push(shockwaveEchoMat);
    this.ch2ShockwaveEchoMesh = new Mesh(shockwaveEchoGeom, shockwaveEchoMat);
    this.ch2ShockwaveEchoMesh.name = 'ch2-resonance-shockwave-echo';
    this.ch2ShockwaveEchoMesh.rotation.x = Math.PI * 0.5;
    this.ch2ShockwaveEchoMesh.scale.setScalar(0.20);
    this.ch2ShockwaveEchoMesh.visible = false;
    root.add(this.ch2ShockwaveEchoMesh);
  }

  /**
   * Chapter 3: Gravity Assist
   * Central primary body, massive flyby world, transfer trajectory, and outer orbit shell.
   * Coordinate and scale harmonized with Chapters 1 & 2 (scale 2.2).
   * @private
   */
  _setupChapter3Visuals() {
    const root = this.chapterGroups[3];

    // Harmonize Chapter 3 group scale with Chapters 1 & 2
    root.scale.setScalar(2.2);

    // Center Primary
    const primaryMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.STAR_GOLD, transparent: true, opacity: 0.92 });
    this._materials.push(primaryMat);
    this.ch3Primary = new Mesh(this._sharedStarGeom, primaryMat);
    this.ch3Primary.name = 'chapter-3-primary';
    this.ch3Primary.scale.setScalar(0.13);
    root.add(this.ch3Primary);

    // Massive Flyby World
    const flybyMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.STAR_LAVENDER, transparent: true, opacity: 0.90 });
    this._materials.push(flybyMat);
    this.ch3FlybyWorld = new Mesh(this._sharedStarGeom, flybyMat);
    this.ch3FlybyWorld.name = 'flyby-body';
    this.ch3FlybyWorld.scale.setScalar(0.095);
    this.ch3FlybyWorld.position.set(0.68, 0.0, -0.42);
    root.add(this.ch3FlybyWorld);

    // Step 3: Player Planet Continuity
    // Procedural PlanetoidShader material matching hero planetary visual identity (Stage 3 Ocean World)
    this.ch3PlanetGeom = new SphereGeometry(1.0, 32, 24);
    this._geometries.push(this.ch3PlanetGeom);
    const nodeMat = createPlanetoidCoreMaterial({
      lightDirection: new Vector3(0.32, 0.42, 0.85).normalize()
    });
    nodeMat.uniforms.uVisualStage.value = 3.0;
    nodeMat.uniforms.uAwakeningProgress.value = 1.0;
    if (nodeMat.uniforms.uOceanFill) {
      nodeMat.uniforms.uOceanFill.value = 1.0;
    }
    this._materials.push(nodeMat);
    this.ch3PlanetMaterial = nodeMat;
    this.ch3PlanetNode = new Mesh(this.ch3PlanetGeom, nodeMat);
    this.ch3PlanetNode.name = 'chapter-3-node';
    this.ch3PlanetNode.scale.setScalar(0.18);
    this.ch3PlanetNode.userData = {
      isPlayerPlanet: true,
      stage: 3,
      stageKey: 'ocean',
      surfaceType: 'ocean-world'
    };
    root.add(this.ch3PlanetNode);

    // Transfer Trajectory (Connecting Inner to Outer)
    const transferGeom = createOrbitGeometry({
      pointsCount: 64,
      semiMajorAxis: 0.92,
      eccentricity: 0.45,
      startAngle: -Math.PI * 0.4,
      endAngle: Math.PI * 0.8
    });
    this._geometries.push(transferGeom);
    const transferMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_CYAN, transparent: true, opacity: 0.75 });
    this._materials.push(transferMat);
    this.ch3TransferLine = new Line(transferGeom, transferMat);
    this.ch3TransferLine.name = 'transfer-orbit-path';
    root.add(this.ch3TransferLine);

    // Expanded Outer Bound Orbit Ring
    const outerGeom = createOrbitGeometry({ pointsCount: 64, semiMajorAxis: 1.45, eccentricity: 0.08 });
    this._geometries.push(outerGeom);
    const outerMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_GOLD, transparent: true, opacity: 0.45 });
    this._materials.push(outerMat);
    this.ch3OuterOrbitLine = new LineLoop(outerGeom, outerMat);
    this.ch3OuterOrbitLine.name = 'outer-bound-orbit';
    root.add(this.ch3OuterOrbitLine);
  }

  /**
   * Chapter 4: Roche Disruption
   * Host planet, approaching satellite moon, tidal fragments, expanding ring discs.
   * @private
   */
  _setupChapter4Visuals() {
    const root = this.chapterGroups[4];

    // Host Planet
    const hostMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.STAR_LAVENDER, transparent: true, opacity: 0.95 });
    this._materials.push(hostMat);
    this.ch4HostPlanet = new Mesh(this._sharedStarGeom, hostMat);
    this.ch4HostPlanet.name = 'host-planet';
    this.ch4HostPlanet.scale.setScalar(0.16);
    root.add(this.ch4HostPlanet);

    // Approaching Satellite Moon
    const satMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.WARM_WHITE, transparent: true, opacity: 0.95 });
    this._materials.push(satMat);
    this.ch4Satellite = new Mesh(this._sharedStarGeom, satMat);
    this.ch4Satellite.name = 'approaching-satellite';
    this.ch4Satellite.scale.setScalar(0.055);
    root.add(this.ch4Satellite);

    // Roche Limit Boundary Marker (Faint Loop)
    const limitGeom = createOrbitGeometry({ pointsCount: 48, semiMajorAxis: 0.65, eccentricity: 0.0 });
    this._geometries.push(limitGeom);
    const limitMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ORBIT_FAINT, transparent: true, opacity: 0.35 });
    this._materials.push(limitMat);
    this.ch4RocheLimitLine = new LineLoop(limitGeom, limitMat);
    this.ch4RocheLimitLine.name = 'roche-limit-marker';
    root.add(this.ch4RocheLimitLine);

    // Inner Formed Ring Disc
    const innerRingGeom = new RingGeometry(0.48, 0.70, 48);
    this._geometries.push(innerRingGeom);
    const innerRingMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.ORBIT_GOLD,
      side: DoubleSide,
      transparent: true,
      opacity: 0.15
    });
    this._materials.push(innerRingMat);
    this.ch4InnerRing = new Mesh(innerRingGeom, innerRingMat);
    this.ch4InnerRing.name = 'roche-inner-ring';
    this.ch4InnerRing.rotation.x = Math.PI * 0.40;
    root.add(this.ch4InnerRing);

    // Outer Formed Ring Disc
    const outerRingGeom = new RingGeometry(0.72, 0.95, 48);
    this._geometries.push(outerRingGeom);
    const outerRingMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.ROCHE_DISRUPTED,
      side: DoubleSide,
      transparent: true,
      opacity: 0.10
    });
    this._materials.push(outerRingMat);
    this.ch4OuterRing = new Mesh(outerRingGeom, outerRingMat);
    this.ch4OuterRing.name = 'roche-outer-ring';
    this.ch4OuterRing.rotation.x = Math.PI * 0.40;
    root.add(this.ch4OuterRing);

    // Disrupted Ring Fragments (Points object)
    const fragGeom = new BufferGeometry();
    const fragCount = 32;
    const fragPositions = new Float32Array(fragCount * 3);
    for (let i = 0; i < fragCount; i++) {
      const angle = (i / fragCount) * Math.PI * 2;
      const r = 0.55 + 0.30 * Math.random();
      fragPositions[i * 3] = r * Math.cos(angle);
      fragPositions[i * 3 + 1] = 0.01 * (Math.random() - 0.5);
      fragPositions[i * 3 + 2] = r * Math.sin(angle);
    }
    fragGeom.setAttribute('position', new BufferAttribute(fragPositions, 3));
    this._geometries.push(fragGeom);
    const fragMat = new PointsMaterial({
      color: ORRERY_PALETTE.PEARL_WHITE,
      size: 0.02,
      transparent: true,
      opacity: 0.5
    });
    this._materials.push(fragMat);
    this.ch4Fragments = new Points(fragGeom, fragMat);
    this.ch4Fragments.name = 'roche-fragments';
    this.ch4Fragments.rotation.x = Math.PI * 0.40;
    root.add(this.ch4Fragments);

    // Primary formed ring handle for backwards compatibility
    this.ch4FormedRing = this.ch4InnerRing;
  }

  /**
   * Chapter 5: Supernova Deflection
   * Protected planetary body, collapsing stellar core, expanding shockwave, protective magnetoshield.
   * @private
   */
  _setupChapter5Visuals() {
    const root = this.chapterGroups[5];

    // Protected Planetary World
    const planetMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.ATMOSPHERE_BLUE, transparent: true, opacity: 0.95 });
    this._materials.push(planetMat);
    this.ch5ProtectedPlanet = new Mesh(this._sharedStarGeom, planetMat);
    this.ch5ProtectedPlanet.name = 'chapter-5-world';
    this.ch5ProtectedPlanet.scale.setScalar(0.15);
    root.add(this.ch5ProtectedPlanet);

    // Atmosphere Shell
    const atmoGeom = new SphereGeometry(1.0, 16, 12);
    this._geometries.push(atmoGeom);
    const atmoMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.SHIELD_CREST, transparent: true, opacity: 0.25 });
    this._materials.push(atmoMat);
    this.ch5Atmosphere = new Mesh(atmoGeom, atmoMat);
    this.ch5Atmosphere.name = 'chapter-5-atmosphere';
    this.ch5Atmosphere.scale.setScalar(0.18);
    root.add(this.ch5Atmosphere);

    // Collapsing Stellar Core (Threat Origin)
    const coreMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.STAR_PEACH, transparent: true, opacity: 0.95 });
    this._materials.push(coreMat);
    this.ch5StellarCore = new Mesh(this._sharedStarGeom, coreMat);
    this.ch5StellarCore.name = 'collapsing-core';
    this.ch5StellarCore.scale.setScalar(0.11);
    this.ch5StellarCore.position.set(-1.25, 0.25, 0.0);
    root.add(this.ch5StellarCore);

    // Expanding Supernova Shockwave Arc (Curved shell)
    const shockGeom = createOrbitGeometry({
      pointsCount: 32,
      semiMajorAxis: 0.85,
      eccentricity: 0.3,
      startAngle: -Math.PI * 0.35,
      endAngle: Math.PI * 0.35
    });
    this._geometries.push(shockGeom);
    const shockMat = new MeshBasicMaterial({ color: ORRERY_PALETTE.BURN_FLARE, transparent: true, opacity: 0.70 });
    this._materials.push(shockMat);
    this.ch5ShockwaveLine = new Line(shockGeom, shockMat);
    this.ch5ShockwaveLine.name = 'supernova-shockwave';
    this.ch5ShockwaveLine.position.set(-0.70, 0.15, 0.0);
    root.add(this.ch5ShockwaveLine);

    // Protective Magnetoshield Dome (Facing the threat)
    const shieldGeom = new RingGeometry(0.24, 0.40, 24, 1, 0, Math.PI);
    this._geometries.push(shieldGeom);
    const shieldMat = new MeshBasicMaterial({
      color: ORRERY_PALETTE.SHIELD_CREST,
      side: DoubleSide,
      transparent: true,
      opacity: 0.15 // ramps to 0.95 with shieldCharge
    });
    this._materials.push(shieldMat);
    this.ch5Magnetoshield = new Mesh(shieldGeom, shieldMat);
    this.ch5Magnetoshield.name = 'magnetoshield-dome';
    this.ch5Magnetoshield.position.set(-0.24, 0.03, 0.0);
    this.ch5Magnetoshield.rotation.z = Math.PI * 0.50; // concave towards left threat
    root.add(this.ch5Magnetoshield);
  }

  // ==========================================================================
  // 2. EVENT INTEGRATION (OBSERVING EXISTING PIPELINE)
  // ==========================================================================

  _subscribeEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function') return;

    // EVOLUTION_PROGRESS: reactive charging
    const unsubProgress = this.eventBus.on(Events.EVOLUTION_PROGRESS, (_payload) => {
      this._syncFromDirector();
    });
    if (typeof unsubProgress === 'function') this._unsubs.push(unsubProgress);

    // STAGE_READY: visual maneuver alignment pulse
    const unsubReady = this.eventBus.on(Events.STAGE_READY, (_payload) => {
      this._syncFromDirector();
    });
    if (typeof unsubReady === 'function') this._unsubs.push(unsubReady);

    // TRANSFORMATION_STARTED: maneuver execution onset
    const unsubStart = this.eventBus.on(Events.TRANSFORMATION_STARTED, (_payload) => {
      this._syncFromDirector();
    });
    if (typeof unsubStart === 'function') this._unsubs.push(unsubStart);

    // TRANSFORMATION_COMPLETED: chapter completion & transition to next
    const unsubComplete = this.eventBus.on(Events.TRANSFORMATION_COMPLETED, (_payload) => {
      this._syncFromDirector();
    });
    if (typeof unsubComplete === 'function') this._unsubs.push(unsubComplete);

    // ORRERY_CHAPTER_CHANGED: narrative director advances chapter
    if (Events.ORRERY_CHAPTER_CHANGED) {
      const unsubChapter = this.eventBus.on(Events.ORRERY_CHAPTER_CHANGED, (payload) => {
        const prev = payload?.previousChapter ?? this.activeChapter;
        const next = payload?.chapter ?? 1;
        if (prev === 1 && next === 2 && this._chapterTransitionState === ChapterTransitionState.IDLE) {
          this.startChapterTransition(1, 2);
        } else if (prev === 2 && next === 3 && this._chapterTransitionState === ChapterTransitionState.IDLE) {
          this.startChapterTransition(2, 3);
        }
        this._syncFromDirector();
      });
      if (typeof unsubChapter === 'function') this._unsubs.push(unsubChapter);
    }

    // SCORE: Phase 2A Kendama catch cosmic synchronization response, Phase 2B alignment cinematic,
    //        and Phase 3B Chapter 2 resonance calibration
    const unsubScore = this.eventBus.on(Events.SCORE, (payload) => {
      const intensity = this.triggerCatchResponse(payload);
      if (intensity >= 0.80) {
        this.triggerThreeBodyAlignment(payload);
      }
      this._applyResonanceCalibration(payload);
    });
    if (typeof unsubScore === 'function') this._unsubs.push(unsubScore);
  }

  /**
   * Synchronizes active visual parameters from NarrativeDirector / OrreryState.
   * @private
   */
  _syncFromDirector() {
    if (this._chapter2DebugMode) {
      return;
    }

    let chapter = 1;
    if (this.narrativeDirector) {
      const state = this.narrativeDirector.getState();
      chapter = state.chapter || 1;
      // Reconcile with underlying state if direct chapter advancement occurred
      if (this.narrativeDirector.orreryState && typeof this.narrativeDirector.orreryState.getChapter === 'function') {
        const stateCh = this.narrativeDirector.orreryState.getChapter();
        if (stateCh > chapter) {
          chapter = stateCh;
        }
      }
    }

    const previousChapter = this.activeChapter;
    this.activeChapter = Math.max(1, Math.min(TOTAL_CHAPTERS, chapter));

    // Phase 3A: Chapter 1 -> Chapter 2 transition trigger
    // Phase 4A: Chapter 2 -> Chapter 3 transition trigger
    if (previousChapter === 1 && this.activeChapter === 2 && this._chapterTransitionState === ChapterTransitionState.IDLE) {
      this.startChapterTransition(1, 2);
    } else if (previousChapter === 2 && this.activeChapter === 3 && this._chapterTransitionState === ChapterTransitionState.IDLE) {
      this.startChapterTransition(2, 3);
    } else if (this.activeChapter > 3 && this._chapterTransitionState === ChapterTransitionState.TRANSITIONING) {
      this._chapterTransitionState = ChapterTransitionState.IDLE;
    }

    if (this._chapterTransitionState === ChapterTransitionState.TRANSITIONING) {
      for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
        if (this.chapterGroups[ch]) {
          this.chapterGroups[ch].visible = (ch === this._transitionFromChapter || ch === this._transitionToChapter);
        }
      }
    } else {
      for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
        if (this.chapterGroups[ch]) {
          this.chapterGroups[ch].visible = (ch === this.activeChapter);
        }
      }
    }
  }

  // ==========================================================================
  // 3. ZERO-ALLOCATION PER-FRAME UPDATE LOOP
  // ==========================================================================

  /**
   * Advances deterministic parametric orbits and visual transitions.
   * Safe to call every frame. Strictly zero allocations in the hot path.
   *
   * @param {number} deltaSeconds
   */
  update(deltaSeconds) {
    if (!this.group.visible) return;

    const dt = (typeof deltaSeconds === 'number' && Number.isFinite(deltaSeconds))
      ? Math.max(0.0, Math.min(10.0, deltaSeconds))
      : 0.016;

    this.simTime += dt * this.orbitSpeed;

    // Phase 2A: Update catch cosmic synchronization response state
    this._updateCatchResponse(dt);

    // Phase 2B: Update Three-Body convergence and alignment cinematic state
    this._updateAlignment(dt);

    // Refresh current chapter state
    this._syncFromDirector();

    const state = this.narrativeDirector ? this.narrativeDirector.getState() : null;
    const progress = state ? state.calibrationProgress : 0.0;
    const maneuverStatus = state ? state.maneuverStatus : ManeuverStatus.CALIBRATING;
    const orbitalState = state ? state.orbitalState : OrbitalState.HYPERBOLIC;

    // Update active chapter visuals
    if (this._chapter2DebugMode) {
      this._updateChapter2(dt, progress, maneuverStatus, orbitalState);
    } else if (this._chapterTransitionState === ChapterTransitionState.TRANSITIONING) {
      this._updateChapterTransition(dt, progress, maneuverStatus, orbitalState);
    } else {
      switch (this.activeChapter) {
        case 1:
          this._updateChapter1(dt, progress, maneuverStatus, orbitalState);
          break;
        case 2:
          this._updateChapter2(dt, progress, maneuverStatus, orbitalState);
          break;
        case 3:
          this._updateChapter3(dt, progress, maneuverStatus, orbitalState);
          break;
        case 4:
          this._updateChapter4(dt, progress, maneuverStatus, orbitalState);
          break;
        case 5:
          this._updateChapter5(dt, progress, maneuverStatus, orbitalState);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Updates the Phase 2A catch cosmic response envelope.
   * Strictly zero heap allocation in hot path.
   * @private
   * @param {number} dt
   */
  _updateCatchResponse(dt) {
    if (!this._catchResponseActive) {
      this._catchResponseSurge = 0.0;
      return;
    }

    this._catchResponseTime += dt;
    if (this._catchResponseTime >= CATCH_RESPONSE_DURATION) {
      this._catchResponseActive = false;
      this._catchResponseTime = 0.0;
      this._catchResponseIntensity = 0.0;
      this._catchResponseSurge = 0.0;
      return;
    }

    const u = this._catchResponseTime / CATCH_RESPONSE_DURATION; // 0.0 -> 1.0

    // Smooth envelope:
    // Phase A & B (rise to peak, 0.0 -> 0.40): smoothstep / sine ease-in
    // Phase C & D (decay from peak, 0.40 -> 1.0): cosine ease-out
    let envelope = 0.0;
    if (u < 0.40) {
      const r = u / 0.40;
      envelope = Math.pow(Math.sin(r * Math.PI * 0.5), 1.5);
    } else {
      const d = (u - 0.40) / 0.60;
      envelope = Math.pow(Math.cos(d * Math.PI * 0.5), 2.0);
    }

    this._catchResponseSurge = this._catchResponseIntensity * envelope;
  }

  /**
   * Updates the Phase 2B Three-Body alignment cinematic state machine.
   * Strictly zero heap allocation in hot path.
   * @private
   * @param {number} dt
   */
  _updateAlignment(dt) {
    if (!this._alignmentActive) {
      this._alignmentPhase = AlignmentPhase.IDLE;
      this._alignmentProgress = 0.0;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = false;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = 0.0;
      }
      if (this.ch1TextShimmerGlint) {
        this.ch1TextShimmerGlint.visible = false;
        if (this.ch1TextShimmerGlint.material) this.ch1TextShimmerGlint.material.opacity = 0.0;
      }
      if (this.ch1StableStateSparkles) {
        this.ch1StableStateSparkles.visible = false;
        if (this.ch1StableStateSparkles.material) this.ch1StableStateSparkles.material.opacity = 0.0;
      }
      return;
    }

    this._alignmentTime += dt;
    const t = this._alignmentTime;

    if (t >= ALIGNMENT_TIMINGS.TOTAL_DURATION) {
      this._alignmentActive = false;
      this._alignmentTime = 0.0;
      this._alignmentPhase = AlignmentPhase.IDLE;
      this._alignmentProgress = 0.0;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = false;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = 0.0;
      }
      if (this.ch1TextShimmerGlint) {
        this.ch1TextShimmerGlint.visible = false;
        if (this.ch1TextShimmerGlint.material) this.ch1TextShimmerGlint.material.opacity = 0.0;
      }
      if (this.ch1StableStateSparkles) {
        this.ch1StableStateSparkles.visible = false;
        if (this.ch1StableStateSparkles.material) this.ch1StableStateSparkles.material.opacity = 0.0;
      }

      // Phase 2C Step 2: Emit dedicated Chapter 1 Three-Body syzygy completion event AFTER baseline restoration
      if (this.eventBus && typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, {
          chapter: 1,
          duration: ALIGNMENT_TIMINGS.TOTAL_DURATION
        });
      }
      return;
    }

    this._alignmentProgress = Math.min(1.0, t / ALIGNMENT_TIMINGS.TOTAL_DURATION);

    if (t < ALIGNMENT_TIMINGS.CONVERGE_END) {
      // 0.00 -> 0.65s: CONVERGING (Anticipation 0.00 - 0.20s, Gravitational Acceleration 0.20 - 0.65s)
      this._alignmentPhase = AlignmentPhase.CONVERGING;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
    } else if (t < ALIGNMENT_TIMINGS.ALIGNED_END) {
      // 0.65 -> 1.35s: ALIGNED (Settling 0.65 - 0.95s, Stable State & Energy Charge 0.95 - 1.35s)
      this._alignmentPhase = AlignmentPhase.ALIGNED;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
    } else if (t < ALIGNMENT_TIMINGS.PULSE_END) {
      // 1.35 -> 1.75s: PULSE (bright synchronized cosmic pulse, wave, and radial energy rays)
      this._alignmentPhase = AlignmentPhase.PULSE;
      const pulseT = (t - ALIGNMENT_TIMINGS.ALIGNED_END) / (ALIGNMENT_TIMINGS.PULSE_END - ALIGNMENT_TIMINGS.ALIGNED_END); // 0.0 -> 1.0
      const pulseEnv = Math.sin(pulseT * Math.PI);
      this._alignmentPulse = Math.pow(pulseEnv, 1.2) * this._alignmentIntensity;

      // Layer 3: Cinematic Synchronization Wave update (Section 17: rapid outward pulse, not a persistent ring)
      if (this.ch1SyncWave) {
        this.ch1SyncWave.visible = true;
        const waveScale = 0.35 + 4.20 * Math.pow(pulseT, 0.85);
        this.ch1SyncWave.scale.setScalar(waveScale);
        if (this.ch1SyncWave.material) {
          this.ch1SyncWave.material.opacity = Math.max(0.0, (1.0 - pulseT) * 0.70 * this._alignmentIntensity);
        }
      }

      // Layer 4: Subtle Radial Energy Rays update (peak at pulse, disappear before reveal hold)
      if (this.ch1EnergyRays) {
        this.ch1EnergyRays.visible = true;
        const rayScale = 0.95 + 0.45 * pulseT;
        this.ch1EnergyRays.scale.setScalar(rayScale);
        this.ch1EnergyRays.rotation.z = this.simTime * 0.4;
        if (this.ch1EnergyRays.material) {
          this.ch1EnergyRays.material.opacity = Math.max(0.0, pulseEnv * 0.75 * this._alignmentIntensity);
        }
      }
    } else if (t < ALIGNMENT_TIMINGS.HOLD_END) {
      // 1.75 -> 2.65s: REVEAL HOLD (~0.90s hold: bodies remain aligned, wave & rays gone, system held steady)
      this._alignmentPhase = AlignmentPhase.REVEAL_HOLD;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
    } else {
      // 2.65 -> 3.45s: RETURNING (gentle separation, return acceleration, settling)
      this._alignmentPhase = AlignmentPhase.RETURNING;
      this._alignmentPulse = 0.0;
      if (this.ch1SyncWave) this.ch1SyncWave.visible = false;
      if (this.ch1EnergyRays) this.ch1EnergyRays.visible = false;
    }

    // World-Space "STABLE STATE" floating text, glittering sparkles & shimmer lifecycle (Sections 5, 7, 11, 12, 13, 14, 15)
    const targetTextW = 0.88;
    const targetTextH = 0.22;

    if (t < ALIGNMENT_TIMINGS.SETTLING_END) {
      // 0.00 -> 0.95s: invisible during convergence & settling
      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = false;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = 0.0;
      }
      if (this.ch1TextShimmerGlint) this.ch1TextShimmerGlint.visible = false;
      if (this.ch1StableStateSparkles) this.ch1StableStateSparkles.visible = false;
    } else if (t < 1.15) {
      // 0.95 -> 1.15s: subtle fade in + scale entrance (0.88 -> 1.00, Section 13)
      const fadeIn = (t - ALIGNMENT_TIMINGS.SETTLING_END) / (1.15 - ALIGNMENT_TIMINGS.SETTLING_END);
      const easeEnter = smoothstepScalar(0.0, 1.0, fadeIn);
      const textOpacity = easeEnter * 1.0;
      const enterScale = 0.88 + 0.12 * easeEnter;

      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = true;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = textOpacity;
        this.ch1StableStateText.scale.set(targetTextW * enterScale, targetTextH * enterScale, 1.0);
      }
      if (this.ch1StableStateSparkles) {
        this.ch1StableStateSparkles.visible = true;
        if (this.ch1StableStateSparkles.material) this.ch1StableStateSparkles.material.opacity = textOpacity * 0.75;
        this.ch1StableStateSparkles.scale.setScalar(enterScale);
      }
      if (this.ch1TextShimmerGlint) this.ch1TextShimmerGlint.visible = false;
    } else if (t < ALIGNMENT_TIMINGS.HOLD_END) {
      // 1.15 -> 2.65s: steady hold above Our Planet, sparkling glitter & travelling horizontal shimmer (Sections 12 & 14)
      const textBreathe = 0.02 * Math.sin(this.simTime * 3.0);
      const textOpacity = 0.98 + textBreathe;

      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = true;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = Math.min(1.0, textOpacity);
        this.ch1StableStateText.scale.set(targetTextW, targetTextH, 1.0);
      }
      if (this.ch1StableStateSparkles) {
        this.ch1StableStateSparkles.visible = true;
        const twinkle = 0.65 + 0.35 * Math.sin(this.simTime * 4.8);
        if (this.ch1StableStateSparkles.material) {
          this.ch1StableStateSparkles.material.opacity = Math.min(1.0, textOpacity) * twinkle;
        }
        this.ch1StableStateSparkles.scale.setScalar(0.96 + 0.08 * Math.sin(this.simTime * 3.2));
      }
      if (this.ch1TextShimmerGlint) {
        this.ch1TextShimmerGlint.visible = true;
        const shimmerCycle = 1.0;
        const cycleProgress = ((t - 1.15) % shimmerCycle) / shimmerCycle;
        const glintEnv = Math.sin(cycleProgress * Math.PI);
        const glintX = -0.924 + (-0.38 + 0.76 * cycleProgress);
        this.ch1TextShimmerGlint.position.set(glintX, 0.62, 0.01);
        this.ch1TextShimmerGlint.scale.set(0.16 + 0.04 * glintEnv, 0.16 + 0.04 * glintEnv, 1.0);
        if (this.ch1TextShimmerGlint.material) {
          this.ch1TextShimmerGlint.material.opacity = glintEnv * 0.70 * Math.min(1.0, textOpacity);
        }
      }
    } else if (t < 3.20) {
      // 2.65 -> 3.20s: slow fade out as separation begins (Section 15)
      const fadeOut = (t - ALIGNMENT_TIMINGS.HOLD_END) / (3.20 - ALIGNMENT_TIMINGS.HOLD_END);
      const textOpacity = (1.0 - smoothstepScalar(0.0, 1.0, fadeOut)) * 1.0;

      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = true;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = textOpacity;
        this.ch1StableStateText.scale.set(targetTextW, targetTextH, 1.0);
      }
      if (this.ch1StableStateSparkles) {
        this.ch1StableStateSparkles.visible = textOpacity > 0.05;
        if (this.ch1StableStateSparkles.material) {
          this.ch1StableStateSparkles.material.opacity = textOpacity * 0.65;
        }
      }
      if (this.ch1TextShimmerGlint) {
        this.ch1TextShimmerGlint.visible = textOpacity > 0.10;
        if (this.ch1TextShimmerGlint.material) {
          this.ch1TextShimmerGlint.material.opacity = textOpacity * 0.5;
        }
      }
    } else {
      // 3.20s+: invisible
      if (this.ch1StableStateText) {
        this.ch1StableStateText.visible = false;
        if (this.ch1StableStateText.material) this.ch1StableStateText.material.opacity = 0.0;
      }
      if (this.ch1StableStateSparkles) this.ch1StableStateSparkles.visible = false;
      if (this.ch1TextShimmerGlint) this.ch1TextShimmerGlint.visible = false;
    }
  }

  /**
   * Chapter 1 Parametric Motion
   * @private
   */
  _updateChapter1(_dt, progress, maneuverStatus, orbitalState) {
    const isExecuting = (maneuverStatus === ManeuverStatus.EXECUTING || orbitalState === OrbitalState.CAPTURE_BURN);
    const isBound = (orbitalState === OrbitalState.BOUND_ECCENTRIC || maneuverStatus === ManeuverStatus.COMPLETED);
    const surge = this._catchResponseSurge;
    const alignPulse = this._alignmentPulse;
    const isAlignActive = this._alignmentActive;
    const tAlign = this._alignmentTime;

    // Orbital path quieting multiplier during alignment (Sections 2 & 3: orbitOpacity ≈ 0 during reveal)
    let orbitFade = 1.0;
    let holdProgress = 0.0;
    if (isAlignActive) {
      if (tAlign < ALIGNMENT_TIMINGS.ANTICIPATION_END) {
        // 0.00 -> 0.20s: Anticipation fade down (1.0 -> 0.0)
        orbitFade = 1.0 - (tAlign / ALIGNMENT_TIMINGS.ANTICIPATION_END);
      } else if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
        // 0.20 -> 2.65s: STRICTLY ZERO during convergence, settling, stable state, pulse, and reveal hold!
        orbitFade = 0.0;
        if (tAlign >= ALIGNMENT_TIMINGS.SETTLING_END && tAlign < ALIGNMENT_TIMINGS.ALIGNED_END) {
          holdProgress = (tAlign - ALIGNMENT_TIMINGS.SETTLING_END) / (ALIGNMENT_TIMINGS.ALIGNED_END - ALIGNMENT_TIMINGS.SETTLING_END);
        }
      } else {
        // 2.65 -> 3.45s: Smooth restoration back to 1.0
        const retU = (tAlign - ALIGNMENT_TIMINGS.HOLD_END) / (ALIGNMENT_TIMINGS.TOTAL_DURATION - ALIGNMENT_TIMINGS.HOLD_END);
        orbitFade = smoothstepScalar(0.0, 1.0, retU);
      }
    }

    // Line opacities driven by calibration, transition, Phase 2A catch surge, and Phase 2B alignment fade
    // Section 18: During alignment, set irrelevant orbital visuals to zero visibility/opacity
    if (this.ch1HyperbolicLine) {
      const baseHyp = isBound ? 0.15 : (0.75 + progress * 0.20);
      const hypOp = isAlignActive ? (baseHyp * orbitFade) : baseHyp;
      this.ch1HyperbolicLine.visible = hypOp > 0.005;
      if (this.ch1HyperbolicLine.material) this.ch1HyperbolicLine.material.opacity = hypOp;
    }

    // Dedicated Bounded Orbital Path for Our Planet (fades down during alignment to clear clutter)
    if (this.ch1PlanetOrbitLine) {
      const basePlanetOrbit = isBound ? 0.35 : (0.28 + progress * 0.07);
      const catchBoost = (0.55 - basePlanetOrbit) * surge;
      const planetOp = isAlignActive ? (basePlanetOrbit * orbitFade) : (basePlanetOrbit + catchBoost);
      this.ch1PlanetOrbitLine.visible = planetOp > 0.005;
      if (this.ch1PlanetOrbitLine.material) this.ch1PlanetOrbitLine.material.opacity = planetOp;
    }

    // Dedicated Bounded Orbital Path for Secondary Planet (fades down during alignment)
    if (this.ch1PerturberOrbitLine) {
      const baseSecondaryOrbit = 0.24 + 0.02 * Math.sin(this.simTime * 1.8);
      const catchBoost = (0.45 - baseSecondaryOrbit) * surge;
      const secondaryOp = isAlignActive ? (baseSecondaryOrbit * orbitFade) : (baseSecondaryOrbit + catchBoost);
      this.ch1PerturberOrbitLine.visible = secondaryOp > 0.005;
      if (this.ch1PerturberOrbitLine.material) this.ch1PerturberOrbitLine.material.opacity = secondaryOp;
    }

    // Planet ↔ Star Connection Arc (Section 13: brightens significantly during alignment & pulse)
    if (this.ch1PlanetStarConnection?.material && this.ch1BoundOrbitLine?.geometry?.attributes?.position) {
      const posAttr = this.ch1BoundOrbitLine.geometry.attributes.position;
      const count = posAttr.count;

      if (isAlignActive && tAlign >= ALIGNMENT_TIMINGS.ANTICIPATION_END && tAlign < ALIGNMENT_TIMINGS.TOTAL_DURATION) {
        this.ch1PlanetStarConnection.visible = true;

        // Dynamic straight energy bridge connecting Our Planet and Primary Star
        const pX = this.ch1PlanetNode.position.x;
        const pY = this.ch1PlanetNode.position.y;
        const pZ = this.ch1PlanetNode.position.z;
        const sX = this.ch1PrimaryStar.position.x;
        const sY = this.ch1PrimaryStar.position.y;
        const sZ = this.ch1PrimaryStar.position.z;

        if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
          for (let i = 0; i < count; i++) {
            const f = i / (count - 1);
            posAttr.setXYZ(i, pX * (1.0 - f) + sX * f, pY * (1.0 - f) + sY * f, pZ * (1.0 - f) + sZ * f);
          }
        } else {
          // Returning: blend back smoothly to baseline bound orbit arc
          const retK = smoothstepScalar(ALIGNMENT_TIMINGS.HOLD_END, ALIGNMENT_TIMINGS.TOTAL_DURATION, tAlign);
          for (let i = 0; i < count; i++) {
            const f = i / (count - 1);
            const beamX = pX * (1.0 - f) + sX * f;
            const beamY = pY * (1.0 - f) + sY * f;
            const beamZ = pZ * (1.0 - f) + sZ * f;
            const origX = this._boundOrbitPositions[i * 3];
            const origY = this._boundOrbitPositions[i * 3 + 1];
            const origZ = this._boundOrbitPositions[i * 3 + 2];
            posAttr.setXYZ(
              i,
              beamX * (1.0 - retK) + origX * retK,
              beamY * (1.0 - retK) + origY * retK,
              beamZ * (1.0 - retK) + origZ * retK
            );
          }
        }
        posAttr.needsUpdate = true;

        // Connection conduit opacity envelope
        if (tAlign < ALIGNMENT_TIMINGS.CONVERGE_END) {
          const u = (tAlign - ALIGNMENT_TIMINGS.ANTICIPATION_END) / (ALIGNMENT_TIMINGS.CONVERGE_END - ALIGNMENT_TIMINGS.ANTICIPATION_END);
          this.ch1PlanetStarConnection.material.opacity = 0.22 + 0.28 * u; // 0.22 -> 0.50
        } else if (tAlign < ALIGNMENT_TIMINGS.ALIGNED_END) {
          const u = (tAlign - ALIGNMENT_TIMINGS.CONVERGE_END) / (ALIGNMENT_TIMINGS.ALIGNED_END - ALIGNMENT_TIMINGS.CONVERGE_END);
          this.ch1PlanetStarConnection.material.opacity = 0.50 + 0.15 * u; // 0.50 -> 0.65
        } else if (tAlign < ALIGNMENT_TIMINGS.PULSE_END) {
          const pNorm = alignPulse / Math.max(0.01, this._alignmentIntensity);
          this.ch1PlanetStarConnection.material.opacity = 0.65 + 0.20 * pNorm; // surges to 0.85
        } else if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
          const u = (tAlign - ALIGNMENT_TIMINGS.PULSE_END) / (ALIGNMENT_TIMINGS.HOLD_END - ALIGNMENT_TIMINGS.PULSE_END);
          this.ch1PlanetStarConnection.material.opacity = 0.85 - 0.40 * smoothstepScalar(0.0, 1.0, u); // settles to 0.45
        } else {
          const retU = (tAlign - ALIGNMENT_TIMINGS.HOLD_END) / (ALIGNMENT_TIMINGS.TOTAL_DURATION - ALIGNMENT_TIMINGS.HOLD_END);
          this.ch1PlanetStarConnection.material.opacity = 0.45 - 0.23 * smoothstepScalar(0.0, 1.0, retU); // restores 0.22
        }
      } else {
        // Normal gameplay: restore original bound orbit arc
        if (this._boundOrbitPositions && posAttr.array[0] !== this._boundOrbitPositions[0]) {
          posAttr.array.set(this._boundOrbitPositions);
          posAttr.needsUpdate = true;
        }
        this.ch1PlanetStarConnection.visible = isBound;
        this.ch1PlanetStarConnection.material.opacity = 0.22;
      }
    }

    // Stellar halo & material time updates with catch, hold energy buildup, and alignment pulse surges
    const starHoldSurge = isAlignActive ? (holdProgress * 0.25) : 0.0;
    if (this.ch1StarGlow) {
      const coronaBaseScale = 1.20 + 0.02 * Math.sin(this.simTime * 2.2);
      this.ch1StarGlow.scale.setScalar(coronaBaseScale + 0.08 * surge + 0.06 * starHoldSurge + 0.18 * alignPulse);
      if (this.ch1StarGlow.material?.uniforms?.uTime) {
        this.ch1StarGlow.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch1StarGlow.material?.uniforms?.uBaseOpacity) {
        this.ch1StarGlow.material.uniforms.uBaseOpacity.value = 0.20 + 0.08 * surge + 0.08 * starHoldSurge + 0.22 * alignPulse;
      }
    }
    if (this.ch1PrimaryStar) {
      this.ch1PrimaryStar.scale.setScalar(0.145 * (1.0 + 0.025 * surge + 0.015 * starHoldSurge + 0.05 * alignPulse));
      if (this.ch1PrimaryStar.material?.uniforms?.uTime) {
        this.ch1PrimaryStar.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch1PrimaryStar.material?.uniforms?.uCatchResponse) {
        this.ch1PrimaryStar.material.uniforms.uCatchResponse.value = Math.max(surge, Math.max(starHoldSurge * 1.2, alignPulse * 1.85));
      }
    }

    // Secondary Perturber World updates
    const perturberHoldSurge = isAlignActive ? (holdProgress * 0.20) : 0.0;
    if (this.ch1PerturberGlow) {
      const glowBaseScale = 1.18 + 0.015 * Math.cos(this.simTime * 2.8);
      this.ch1PerturberGlow.scale.setScalar(glowBaseScale + 0.06 * surge + 0.04 * perturberHoldSurge + 0.14 * alignPulse);
      if (this.ch1PerturberGlow.material) {
        this.ch1PerturberGlow.material.opacity = 0.12 + 0.08 * surge + 0.06 * perturberHoldSurge + 0.18 * alignPulse;
      }
    }
    if (this.ch1Perturber) {
      this.ch1Perturber.scale.setScalar(0.095 * (1.0 + 0.02 * surge + 0.01 * perturberHoldSurge + 0.04 * alignPulse));
      this.ch1Perturber.rotation.y = this.simTime * 0.20;
      if (this.ch1Perturber.material?.uniforms?.uTime) {
        this.ch1Perturber.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch1Perturber.material?.uniforms?.uCatchResponse) {
        this.ch1Perturber.material.uniforms.uCatchResponse.value = Math.max(surge, Math.max(perturberHoldSurge * 1.0, alignPulse * 1.65));
      }

      // Secondary Planet movement along its tilted lavender orbit (zero heap allocation)
      const a2 = 0.82;
      const b2 = 0.787; // a2 * sqrt(1 - 0.28^2)
      const angle2 = -this.simTime * 0.85;
      const x2 = a2 * Math.cos(angle2) - a2 * 0.15;
      const z2 = b2 * Math.sin(angle2);
      this._tempVec2.set(x2, 0.0, z2);
      if (this.ch1PerturberOrbitLine) {
        this._tempVec2.applyEuler(this.ch1PerturberOrbitLine.rotation);
      }
    }

    // Burn flare visibility and opacity
    if (this.ch1BurnFlare) {
      this.ch1BurnFlare.visible = isExecuting;
      if (this.ch1BurnFlare.material) {
        this.ch1BurnFlare.material.opacity = isExecuting ? (0.70 + 0.30 * Math.sin(this.simTime * 12.0)) : 0.0;
      }
    }

    // Node positioning, planetary aura, & subtle axial rotation (Phase 2A & 2B protagonist pulse)
    const planetHoldSurge = isAlignActive ? (holdProgress * 0.30) : 0.0;
    if (this.ch1PlanetNode) {
      this.ch1PlanetNode.scale.setScalar(0.18 * (1.0 + 0.035 * surge + 0.02 * planetHoldSurge + 0.07 * alignPulse));
      if (this.ch1PlanetNode.material?.uniforms?.uTime) {
        this.ch1PlanetNode.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch1PlanetNode.material?.uniforms?.uAwakeningProgress) {
        let alignAwaken = 0.0;
        if (isAlignActive) {
          if (tAlign < ALIGNMENT_TIMINGS.CONVERGE_END) {
            alignAwaken = 0.20 * (tAlign / ALIGNMENT_TIMINGS.CONVERGE_END);
          } else if (tAlign < ALIGNMENT_TIMINGS.ALIGNED_END) {
            alignAwaken = 0.20 + 0.15 * holdProgress; // 0.20 -> 0.35
          } else if (tAlign < ALIGNMENT_TIMINGS.PULSE_END) {
            alignAwaken = 0.35 + 0.33 * alignPulse; // surges to 0.68
          } else if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
            alignAwaken = 0.45; // holds warm illumination during reveal
          } else {
            const retU = (tAlign - ALIGNMENT_TIMINGS.HOLD_END) / (ALIGNMENT_TIMINGS.TOTAL_DURATION - ALIGNMENT_TIMINGS.HOLD_END);
            alignAwaken = 0.45 * (1.0 - smoothstepScalar(0.0, 1.0, retU));
          }
        }
        this.ch1PlanetNode.material.uniforms.uAwakeningProgress.value = Math.max(
          this.awakeningProgress,
          Math.max(0.32 * surge, alignAwaken)
        );
      }
      this.ch1PlanetNode.rotation.y = this.simTime * 0.35;

      // Update Our Planet's Dedicated Atmospheric Aura (Sections 6 & 7)
      if (this.ch1PlanetAura) {
        const auraBreath = 0.004 * Math.sin(this.simTime * 2.0);
        let targetAuraScale = 1.08 + auraBreath;
        let targetAuraIntensity = 1.0;
        let targetAuraOpacity = 0.22;

        if (isAlignActive) {
          if (tAlign < ALIGNMENT_TIMINGS.CONVERGE_END) {
            const u = tAlign / ALIGNMENT_TIMINGS.CONVERGE_END;
            targetAuraScale = 1.08 + 0.06 * u;
            targetAuraIntensity = 1.0 + 0.45 * u;
            targetAuraOpacity = 0.22 + 0.10 * u;
          } else if (tAlign < ALIGNMENT_TIMINGS.ALIGNED_END) {
            targetAuraScale = 1.14 + 0.02 * holdProgress;
            targetAuraIntensity = 1.45 + 0.25 * holdProgress;
            targetAuraOpacity = 0.32 + 0.08 * holdProgress;
          } else if (tAlign < ALIGNMENT_TIMINGS.PULSE_END) {
            const pNorm = alignPulse / Math.max(0.01, this._alignmentIntensity);
            targetAuraScale = 1.16 + 0.12 * pNorm;
            targetAuraIntensity = 1.70 + 0.30 * pNorm;
            targetAuraOpacity = 0.40 + 0.15 * pNorm;
          } else if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
            const u = (tAlign - ALIGNMENT_TIMINGS.PULSE_END) / (ALIGNMENT_TIMINGS.HOLD_END - ALIGNMENT_TIMINGS.PULSE_END);
            targetAuraScale = 1.28 - 0.10 * smoothstepScalar(0.0, 1.0, u); // settles to 1.18
            targetAuraIntensity = 2.00 - 0.35 * smoothstepScalar(0.0, 1.0, u); // settles to 1.65
            targetAuraOpacity = 0.55 - 0.17 * smoothstepScalar(0.0, 1.0, u); // settles to 0.38
          } else {
            const retU = (tAlign - ALIGNMENT_TIMINGS.HOLD_END) / (ALIGNMENT_TIMINGS.TOTAL_DURATION - ALIGNMENT_TIMINGS.HOLD_END);
            const easeRet = 1.0 - smoothstepScalar(0.0, 1.0, retU);
            targetAuraScale = 1.08 + 0.10 * easeRet;
            targetAuraIntensity = 1.0 + 0.65 * easeRet;
            targetAuraOpacity = 0.22 + 0.16 * easeRet;
          }
        }

        this.ch1PlanetAura.scale.setScalar(targetAuraScale);
        if (this.ch1PlanetAura.material?.uniforms) {
          this.ch1PlanetAura.material.uniforms.uTime.value = this.simTime;
          this.ch1PlanetAura.material.uniforms.uAuraIntensity.value = targetAuraIntensity;
          this.ch1PlanetAura.material.uniforms.uAuraOpacity.value = targetAuraOpacity;
        }
      }

      if (isBound) {
        // Closed eccentric ellipse along tilted orbit (zero heap allocation)
        const angle = this.simTime * 1.4;
        const a = 0.95;
        const b = 0.72;
        const x1 = a * Math.cos(angle) - a * 0.45;
        const z1 = b * Math.sin(angle);
        this._tempVec1.set(x1, 0.0, z1);
        if (this.ch1PlanetOrbitLine) {
          this._tempVec1.applyEuler(this.ch1PlanetOrbitLine.rotation);
        }
      } else {
        // Incoming hyperbolic segment oscillating near periapsis
        const t = Math.sin(this.simTime * 0.9) * 0.8;
        this._tempVec1.set(
          0.35 + t * t * 0.4,
          0.0,
          t * 0.85
        );
      }
    }

    // Apply Phase 2B Straight Horizontal Syzygy Alignment Position Interpolation (Sections 4, 5, 8, 20)
    if (isAlignActive) {
      if (tAlign < ALIGNMENT_TIMINGS.ANTICIPATION_END) {
        // 0.00 -> 0.20s: Anticipation (orbits fade, start positions cached)
        if (this.ch1PlanetNode) {
          this.ch1PlanetNode.position.copy(this._tempVec1);
          this._orbitPosPlanet.copy(this._tempVec1);
        }
        if (this.ch1Perturber) {
          this.ch1Perturber.position.copy(this._tempVec2);
          this._orbitPosPerturber.copy(this._tempVec2);
        }
      } else if (tAlign < ALIGNMENT_TIMINGS.CONVERGE_END) {
        // 0.20 -> 0.65s: Gravitational Acceleration into straight-line horizontal syzygy
        const u = (tAlign - ALIGNMENT_TIMINGS.ANTICIPATION_END) / (ALIGNMENT_TIMINGS.CONVERGE_END - ALIGNMENT_TIMINGS.ANTICIPATION_END);
        const k = Math.pow(smoothstepScalar(0.0, 1.0, u), 1.5);
        if (this.ch1PlanetNode) {
          this.ch1PlanetNode.position.lerpVectors(this._orbitPosPlanet, this._alignPosPlanet, k);
        }
        if (this.ch1Perturber) {
          this.ch1Perturber.position.lerpVectors(this._orbitPosPerturber, this._alignPosPerturber, k);
        }
      } else if (tAlign < ALIGNMENT_TIMINGS.SETTLING_END) {
        // 0.65 -> 0.95s: Alignment Settling (subtle settling into equilibrium on straight line)
        const u = (tAlign - ALIGNMENT_TIMINGS.CONVERGE_END) / (ALIGNMENT_TIMINGS.SETTLING_END - ALIGNMENT_TIMINGS.CONVERGE_END);
        const settle = 1.0 + 0.012 * Math.sin(u * Math.PI) * (1.0 - u);
        if (this.ch1PlanetNode) {
          this.ch1PlanetNode.position.set(this._alignPosPlanet.x * settle, 0.0, 0.0);
        }
        if (this.ch1Perturber) {
          this.ch1Perturber.position.set(this._alignPosPerturber.x * settle, 0.0, 0.0);
        }
      } else if (tAlign < ALIGNMENT_TIMINGS.HOLD_END) {
        // 0.95 -> 2.65s: Locked Syzygy (Stable State, Grand Pulse, and Reveal Hold)
        // Strictly locked on straight horizontal line: Star(0,0,0), Planet(-0.42,0,0), Perturber(-0.84,0,0)
        if (this.ch1PlanetNode) {
          this.ch1PlanetNode.position.copy(this._alignPosPlanet);
        }
        if (this.ch1Perturber) {
          this.ch1Perturber.position.copy(this._alignPosPerturber);
        }
      } else {
        // 2.65 -> 3.45s: Delayed, gentle separation and accelerating return to ongoing normal orbits
        const uRet = (tAlign - ALIGNMENT_TIMINGS.HOLD_END) / (ALIGNMENT_TIMINGS.TOTAL_DURATION - ALIGNMENT_TIMINGS.HOLD_END);
        const kRet = smoothstepScalar(0.0, 1.0, uRet);
        if (this.ch1PlanetNode) {
          this.ch1PlanetNode.position.lerpVectors(this._alignPosPlanet, this._tempVec1, kRet);
        }
        if (this.ch1Perturber) {
          this.ch1Perturber.position.lerpVectors(this._alignPosPerturber, this._tempVec2, kRet);
        }
      }
    } else {
      // Normal orbital motion
      if (this.ch1PlanetNode) {
        this.ch1PlanetNode.position.copy(this._tempVec1);
      }
      if (this.ch1Perturber) {
        this.ch1Perturber.position.copy(this._tempVec2);
      }
    }
  }

  /**
   * Chapter 2 Parametric Motion (Binary resonance 2:1) — Phase 3B.
   * Wobble-driven orbit: CHAOTIC_CIRCUMBINARY → RESONANCE_STABILIZATION → RESONANCE_2_1.
   * Strictly zero heap allocation in hot path.
   * @private
   */
  _updateChapter2(dt, _progress, _maneuverStatus, _orbitalState) {
    this._suppressForegroundPlanet();

    if (this._chapter2DebugPlayActive) {
      this._updateChapter2DebugPlay(dt);
    }

    const starOmega = this.simTime * 2.2;
    const rStars = 0.19;

    // Binary stars orbiting mutual barycenter at frequency omega with distinctive stellar presence
    if (this.ch2Star1) {
      this.ch2Star1.position.set(rStars * Math.cos(starOmega), 0.0, rStars * Math.sin(starOmega));
      const star1Scale = 0.12 * (1.0 + 0.15 * this._catchResponseSurge + 0.12 * this._resonanceProgress);
      this.ch2Star1.scale.setScalar(star1Scale);
      if (this.ch2Star1.material?.uniforms?.uTime) {
        this.ch2Star1.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch2Star1.material?.uniforms?.uSurge) {
        this.ch2Star1.material.uniforms.uSurge.value = this._catchResponseSurge;
      }
      if (this.ch2Star1.material?.uniforms?.uCatchResponse) {
        this.ch2Star1.material.uniforms.uCatchResponse.value = this._catchResponseSurge;
      }
      if (this.ch2Star1.material?.uniforms?.uResonanceProgress) {
        this.ch2Star1.material.uniforms.uResonanceProgress.value = this._resonanceProgress;
      }
      if (this.ch2Star1Glow?.material?.uniforms?.uTime) {
        this.ch2Star1Glow.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch2Star1Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star1Glow.material.uniforms.uBaseOpacity.value = 0.16 + 0.08 * this._resonanceProgress + 0.08 * this._catchResponseSurge + 0.02 * Math.sin(this.simTime * 3.0);
      }
      if (this.ch2Star1Glow) {
        this.ch2Star1Glow.scale.setScalar(1.25 + 0.10 * this._resonanceProgress + 0.03 * Math.sin(this.simTime * 2.5));
      }
    }
    if (this.ch2Star2) {
      this.ch2Star2.position.set(-rStars * Math.cos(starOmega), 0.0, -rStars * Math.sin(starOmega));
      const star2Scale = 0.10 * (1.0 + 0.15 * this._catchResponseSurge + 0.10 * this._resonanceProgress);
      this.ch2Star2.scale.setScalar(star2Scale);
      if (this.ch2Star2.material?.uniforms?.uTime) {
        this.ch2Star2.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch2Star2.material?.uniforms?.uSurge) {
        this.ch2Star2.material.uniforms.uSurge.value = this._catchResponseSurge;
      }
      if (this.ch2Star2.material?.uniforms?.uCatchResponse) {
        this.ch2Star2.material.uniforms.uCatchResponse.value = this._catchResponseSurge;
      }
      if (this.ch2Star2.material?.uniforms?.uResonanceProgress) {
        this.ch2Star2.material.uniforms.uResonanceProgress.value = this._resonanceProgress;
      }
      if (this.ch2Star2Glow?.material?.uniforms?.uTime) {
        this.ch2Star2Glow.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch2Star2Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star2Glow.material.uniforms.uBaseOpacity.value = 0.15 + 0.08 * this._resonanceProgress + 0.08 * this._catchResponseSurge + 0.02 * Math.sin(this.simTime * 3.2 + 1.2);
      }
      if (this.ch2Star2Glow) {
        this.ch2Star2Glow.scale.setScalar(1.25 + 0.08 * this._resonanceProgress + 0.03 * Math.sin(this.simTime * 2.7 + 1.0));
      }
    }

    // Mystical Visual Pass: Inter-Stellar Energy Bridge across barycenter
    if (this.ch2StarBridgeLine && this.ch2StarBridgeLine.geometry?.attributes?.position && this.ch2Star1 && this.ch2Star2) {
      const posAttr = this.ch2StarBridgeLine.geometry.attributes.position;
      const progress = this._resonanceProgress;

      let bridgeOpacity = 0.0;
      if (progress < 0.15) {
        bridgeOpacity = (progress / 0.15) * 0.20;
      } else if (progress < 1.0) {
        bridgeOpacity = 0.20 + ((progress - 0.15) / 0.85) * 0.50;
      } else {
        bridgeOpacity = 0.75 + 0.10 * Math.sin(this.simTime * 3.0);
      }

      if (this.ch2StarBridgeLine.material) {
        this.ch2StarBridgeLine.material.opacity = Math.max(0.0, Math.min(1.0, bridgeOpacity));
      }
      this.ch2StarBridgeLine.visible = (bridgeOpacity > 0.01);

      if (this.ch2StarBridgeLine.visible) {
        const x1 = this.ch2Star1.position.x;
        const z1 = this.ch2Star1.position.z;
        const x2 = this.ch2Star2.position.x;
        const z2 = this.ch2Star2.position.z;

        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
        const nx = -dz / len;
        const nz = dx / len;

        const sagAmp = (1.0 - progress) * 0.035;

        for (let j = 0; j < 16; j++) {
          const u = j / 15.0;
          const bx = x1 * (1.0 - u) + x2 * u;
          const bz = z1 * (1.0 - u) + z2 * u;
          const sag = sagAmp * Math.sin(u * Math.PI) * Math.sin(this.simTime * 7.0 + u * Math.PI);
          const y = 0.008 * (1.0 - progress) * Math.sin(this.simTime * 5.0 + u * Math.PI * 2.0);

          this._ch2StarBridgePositions[j * 3 + 0] = bx + nx * sag;
          this._ch2StarBridgePositions[j * 3 + 1] = y;
          this._ch2StarBridgePositions[j * 3 + 2] = bz + nz * sag;
        }
        posAttr.needsUpdate = true;
      }
    }

    // Mystical Visual Pass: Three-Body Triad Bridge (Star 1 -> Player Planet -> Star 2)
    if (this.ch2TriadBridgeLine && this.ch2TriadBridgeLine.geometry?.attributes?.position && this.ch2Star1 && this.ch2Star2 && this.ch2PlanetNode) {
      const posAttr = this.ch2TriadBridgeLine.geometry.attributes.position;
      const progress = this._resonanceProgress;

      let triadOpacity = 0.0;
      if (progress < 0.10) {
        triadOpacity = 0.0;
      } else if (progress < 0.35) {
        triadOpacity = ((progress - 0.10) / 0.25) * 0.35;
      } else if (progress < 1.0) {
        triadOpacity = 0.35 + ((progress - 0.35) / 0.65) * 0.40;
      } else {
        triadOpacity = 0.78 + 0.08 * Math.sin(this.simTime * 3.5);
      }

      if (this.ch2TriadBridgeLine.material) {
        this.ch2TriadBridgeLine.material.opacity = Math.max(0.0, Math.min(1.0, triadOpacity));
      }
      this.ch2TriadBridgeLine.visible = (triadOpacity > 0.01);

      if (this.ch2TriadBridgeLine.visible) {
        const x1 = this.ch2Star1.position.x;
        const y1 = this.ch2Star1.position.y;
        const z1 = this.ch2Star1.position.z;
        const x2 = this.ch2Star2.position.x;
        const y2 = this.ch2Star2.position.y;
        const z2 = this.ch2Star2.position.z;
        const px = this.ch2PlanetNode.position.x;
        const py = this.ch2PlanetNode.position.y;
        const pz = this.ch2PlanetNode.position.z;
        const sagFactor = (1.0 - progress);

        // Segment 1: Star 1 -> Player Planet (16 points, j = 0..15)
        for (let j = 0; j < 16; j++) {
          const u = j / 15.0;
          const bx = x1 * (1.0 - u) + px * u;
          const by = y1 * (1.0 - u) + py * u;
          const bz = z1 * (1.0 - u) + pz * u;
          const sag = 0.04 * sagFactor * Math.sin(u * Math.PI) * Math.sin(this.simTime * 5.5 + u * Math.PI);
          this._ch2TriadBridgePositions[j * 3 + 0] = bx;
          this._ch2TriadBridgePositions[j * 3 + 1] = by + sag;
          this._ch2TriadBridgePositions[j * 3 + 2] = bz;
        }

        // Segment 2: Player Planet -> Star 2 (16 points, j = 16..31)
        for (let j = 0; j < 16; j++) {
          const u = j / 15.0;
          const bx = px * (1.0 - u) + x2 * u;
          const by = py * (1.0 - u) + y2 * u;
          const bz = pz * (1.0 - u) + z2 * u;
          const sag = 0.04 * sagFactor * Math.sin(u * Math.PI) * Math.sin(this.simTime * 5.5 + (1.0 - u) * Math.PI + 1.2);
          this._ch2TriadBridgePositions[(16 + j) * 3 + 0] = bx;
          this._ch2TriadBridgePositions[(16 + j) * 3 + 1] = by + sag;
          this._ch2TriadBridgePositions[(16 + j) * 3 + 2] = bz;
        }
        posAttr.needsUpdate = true;
      }
    }

    // Player Planet: wobble-driven parametric circumbinary orbit, damped by resonanceProgress
    if (this.ch2PlanetNode) {
      const outerOmega = starOmega * 0.50; // 2:1 resonance base frequency
      this._ch2EffectiveWobble = CH2_WOBBLE_BASE_AMPLITUDE * (1.0 - this._resonanceProgress);
      this._ch2RadialOffset = this._ch2EffectiveWobble * Math.sin(this.simTime * CH2_WOBBLE_FREQUENCY);
      this._ch2VerticalOffset = CH2_VERTICAL_AMPLITUDE * (1.0 - this._resonanceProgress) * Math.sin(this.simTime * CH2_VERTICAL_FREQUENCY + 0.7);
      this._ch2AngleOffset = CH2_ANGULAR_WOBBLE * (1.0 - this._resonanceProgress) * Math.sin(this.simTime * CH2_WOBBLE_FREQUENCY2);
      const rOuter = 1.15 + this._ch2RadialOffset;
      const angle = outerOmega + this._ch2AngleOffset;
      this.ch2PlanetNode.position.set(rOuter * Math.cos(angle), this._ch2VerticalOffset, rOuter * Math.sin(angle));
      this.ch2PlanetNode.scale.setScalar(0.18 * (1.0 + 0.08 * this._resonanceProgress));

      // Atmospheric aura update
      if (this.ch2PlanetAura?.material?.uniforms?.uTime) {
        this.ch2PlanetAura.material.uniforms.uTime.value = this.simTime;
      }
      if (this.ch2PlanetAura?.material?.uniforms?.uBaseOpacity) {
        this.ch2PlanetAura.material.uniforms.uBaseOpacity.value = 0.20 + 0.22 * this._resonanceProgress + 0.06 * Math.sin(this.simTime * 2.8);
      }
      if (this.ch2PlanetAura) {
        this.ch2PlanetAura.scale.setScalar(1.25 + 0.10 * this._resonanceProgress);
      }

      // Shader uniforms & kintsugi surge response
      if (this.ch2PlanetNode.material?.uniforms) {
        const u = this.ch2PlanetNode.material.uniforms;
        if (u.uTime) u.uTime.value = this.simTime;
        if (u.uKintsugiGlow) {
          if (this._ch2ResonanceState === Ch2ResonanceState.RESONANCE_2_1) {
            u.uKintsugiGlow.value = 0.85 + 0.10 * Math.sin(this.simTime * 3.0);
          } else if (this._catchResponseSurge > 0.0) {
            u.uKintsugiGlow.value = 0.45 * this._catchResponseSurge;
          } else if (this._chapter2DebugMode && this._resonanceProgress >= 0.85) {
            u.uKintsugiGlow.value = 0.45 + 0.10 * Math.sin(this.simTime * 3.0);
          } else {
            u.uKintsugiGlow.value = 0.0;
          }
        }
      }
    }

    // Mystical Visual Pass: Circumbinary Orbital Trail Line
    if (this.ch2PlanetTrailLine && this.ch2PlanetTrailLine.geometry?.attributes?.position) {
      const posAttr = this.ch2PlanetTrailLine.geometry.attributes.position;
      const progress = this._resonanceProgress;
      for (let i = 0; i < 64; i++) {
        const theta = (i / 64.0) * Math.PI * 2.0;
        const wobble = this._ch2EffectiveWobble * Math.sin(theta * 3.0 + this.simTime * CH2_WOBBLE_FREQUENCY);
        const rTrail = 1.15 + wobble;
        this._ch2TrailPositions[i * 3 + 0] = rTrail * Math.cos(theta);
        this._ch2TrailPositions[i * 3 + 1] = 0.0;
        this._ch2TrailPositions[i * 3 + 2] = rTrail * Math.sin(theta);
      }
      posAttr.needsUpdate = true;

      if (this._chapterTransitionState !== ChapterTransitionState.TRANSITIONING) {
        if (this.ch2PlanetTrailLine.material) {
          this.ch2PlanetTrailLine.material.opacity = 0.25 + 0.25 * progress;
        }
        this.ch2PlanetTrailLine.visible = true;
      }
    }

    // Mystical Visual Pass: Sacred Lotus / Guilloché Petals
    if (this.ch2ResonanceFilaments && this.ch2ResonanceFilaments.geometry?.attributes?.position) {
      const posAttr = this.ch2ResonanceFilaments.geometry.attributes.position;
      const progress = this._resonanceProgress;
      let filamentOpacity = 0.0;
      if (progress < 0.20) {
        filamentOpacity = 0.0;
      } else if (progress < 0.50) {
        filamentOpacity = ((progress - 0.20) / 0.30) * 0.45;
      } else if (progress < 1.0) {
        filamentOpacity = 0.45 + ((progress - 0.50) / 0.50) * 0.32;
      } else {
        filamentOpacity = 0.55 + 0.04 * Math.sin(this.simTime * 3.0);
      }

      if (this.ch2ResonanceFilaments.material) {
        this.ch2ResonanceFilaments.material.opacity = Math.max(0.0, Math.min(1.0, filamentOpacity));
      }
      this.ch2ResonanceFilaments.visible = (filamentOpacity > 0.01);

      if (this.ch2ResonanceFilaments.visible) {
        const rot = this.simTime * 0.25;
        const bloom = 0.25 + 0.75 * progress;
        for (let i = 0; i < 96; i++) {
          const theta = (i / 96.0) * Math.PI * 2.0;
          const angle = theta + rot;
          const r = 0.685 + 0.465 * bloom * Math.cos(4.0 * theta);
          this._ch2FilamentPositions[i * 3 + 0] = r * Math.cos(angle);
          this._ch2FilamentPositions[i * 3 + 1] = 0.005 * Math.sin(4.0 * theta + this.simTime * 2.0);
          this._ch2FilamentPositions[i * 3 + 2] = r * Math.sin(angle);
        }
        posAttr.needsUpdate = true;
      }
    }

    // Mystical Visual Pass: Traveling Resonant Highlights
    if (this.ch2TravelingHighlights && this.ch2TravelingHighlights.geometry?.attributes?.position) {
      const posAttr = this.ch2TravelingHighlights.geometry.attributes.position;
      const progress = this._resonanceProgress;
      let hlOpacity = 0.0;
      if (progress < 0.25) {
        hlOpacity = 0.0;
      } else if (progress < 1.0) {
        hlOpacity = ((progress - 0.25) / 0.75) * 0.80;
      } else {
        hlOpacity = 0.85 + 0.12 * Math.sin(this.simTime * 4.0);
      }

      if (this.ch2TravelingHighlights.material) {
        this.ch2TravelingHighlights.material.opacity = Math.max(0.0, Math.min(1.0, hlOpacity));
      }
      this.ch2TravelingHighlights.visible = (hlOpacity > 0.01);

      if (this.ch2TravelingHighlights.visible) {
        const outerOmega = starOmega * 0.50;
        const hlBob = 0.008 * Math.sin(this.simTime * 3.5);

        this._ch2HighlightPositions[0] = 1.15 * Math.cos(outerOmega);
        this._ch2HighlightPositions[1] = hlBob;
        this._ch2HighlightPositions[2] = 1.15 * Math.sin(outerOmega);

        this._ch2HighlightPositions[3] = 1.15 * Math.cos(outerOmega + Math.PI);
        this._ch2HighlightPositions[4] = -hlBob;
        this._ch2HighlightPositions[5] = 1.15 * Math.sin(outerOmega + Math.PI);

        posAttr.needsUpdate = true;
      }
    }

    // Mystical Visual Pass: Concentric astrolabe rings and cardinal crosshair axes
    if (this._chapterTransitionState !== ChapterTransitionState.TRANSITIONING) {
      const progress = this._resonanceProgress;

      // Ring 1 (Inner harmonic shell r = 0.58)
      if (this.ch2ConcentricRing1?.material) {
        let op = 0.0;
        if (progress >= 0.15 && progress < 0.50) {
          op = ((progress - 0.15) / 0.35) * 0.40;
        } else if (progress >= 0.50 && progress < 1.0) {
          op = 0.40 + ((progress - 0.50) / 0.50) * 0.22;
        } else if (progress >= 1.0) {
          op = 0.52 + 0.04 * Math.sin(this.simTime * 2.2);
        }
        this.ch2ConcentricRing1.material.opacity = op;
        this.ch2ConcentricRing1.visible = (op > 0.01);
      }

      // Ring 2 (Outer harmonic ring r = 1.38)
      if (this.ch2ConcentricRing2?.material) {
        let op = 0.0;
        if (progress >= 0.35 && progress < 0.70) {
          op = ((progress - 0.35) / 0.35) * 0.35;
        } else if (progress >= 0.70 && progress < 1.0) {
          op = 0.35 + ((progress - 0.70) / 0.30) * 0.20;
        } else if (progress >= 1.0) {
          op = 0.45 + 0.03 * Math.sin(this.simTime * 2.5);
        }
        this.ch2ConcentricRing2.material.opacity = op;
        this.ch2ConcentricRing2.visible = (op > 0.01);
      }

      // Ring 3 (Far celestial boundary r = 1.62)
      if (this.ch2ConcentricRing3?.material) {
        let op = 0.0;
        if (progress >= 0.50 && progress < 1.0) {
          op = ((progress - 0.50) / 0.50) * 0.45;
        } else if (progress >= 1.0) {
          op = 0.38 + 0.03 * Math.sin(this.simTime * 1.8);
        }
        this.ch2ConcentricRing3.material.opacity = op;
        this.ch2ConcentricRing3.visible = (op > 0.01);
      }

      // Cardinal crosshair axes
      if (this.ch2CardinalAxes?.material) {
        let op = 0.0;
        if (progress >= 0.35 && progress < 1.0) {
          op = 0.18 + ((progress - 0.35) / 0.65) * 0.30;
        } else if (progress >= 1.0) {
          op = 0.35 + 0.03 * Math.sin(this.simTime * 2.0);
        }
        this.ch2CardinalAxes.material.opacity = op;
        this.ch2CardinalAxes.visible = (op > 0.01);
      }
    }

    // Harmonic nodes: traveling wave in stabilization -> synchronous unified pulse at lock
    if (this.ch2HarmonicNodes) {
      const progress = this._resonanceProgress;
      for (let i = 0; i < this.ch2HarmonicNodes.length; i++) {
        const nodeM = this.ch2HarmonicNodes[i];
        if (nodeM?.material) {
          let op = 0.0;
          let nodeScale = 0.024;

          if (progress <= 0.0) {
            op = 0.0;
          } else if (progress < 1.0) {
            const wavePhase = this.simTime * 4.0 - (i / 10.0) * Math.PI * 2.0;
            const pulse = 0.5 + 0.5 * Math.sin(wavePhase);
            op = (0.40 + 0.45 * pulse) * progress;
            nodeScale = 0.024 * (1.0 + 0.35 * pulse);
          } else {
            const syncPulse = 0.5 + 0.5 * Math.sin(this.simTime * 3.5);
            op = 0.82 + 0.18 * syncPulse;
            nodeScale = 0.030 * (1.15 + 0.25 * syncPulse);
          }

          nodeM.material.opacity = op;
          nodeM.scale.setScalar(nodeScale);
          nodeM.visible = (op > 0.01);
        }
      }
    }

    // Baseline ring and inner orbit opacities
    if (this._chapterTransitionState !== ChapterTransitionState.TRANSITIONING) {
      if (this.ch2ResonantRing?.material) {
        this.ch2ResonantRing.material.opacity = 0.28 + this._resonanceProgress * 0.12;
      }
      if (this.ch2InnerOrbitLine?.material) {
        this.ch2InnerOrbitLine.material.opacity = 0.20 + this._resonanceProgress * 0.08;
      }
    }

    // RESONANCE LOCKED milestone display
    this._updateResonanceLockedMilestone(dt);

    // Phase 3C: Update 100-Particle Instanced Resonance Field
    this._updateCh2ParticleField(dt, starOmega);

    // Phase 3C: Update Protective Shield / Stretch Ring
    this._updateCh2ShieldRing(dt);

    // Phase 3C: Update Binary Resonance Shockwave
    this._updateCh2Shockwave(dt);
  }

  // ==========================================================================
  // PHASE 3B: CHAPTER 2 BINARY RESONANCE STATE MACHINE
  // ==========================================================================

  /**
   * Enters the Chapter 2 resonance state machine, initializing CHAOTIC_CIRCUMBINARY.
   * Called automatically when Chapter 1 → Chapter 2 transition completes.
   */
  enterChapter2() {
    this._suppressForegroundPlanet();
    if (this._ch2ResonanceState === Ch2ResonanceState.IDLE) {
      this._ch2ResonanceState = Ch2ResonanceState.CHAOTIC_CIRCUMBINARY;
      this._resonanceProgress = 0.0;
      this._resonanceLocked = false;
      this._resonanceLockedTriggered = false;
      this._resonanceLockedTime = 0.0;
    }
  }

  /**
   * Applies per-catch resonance calibration contribution.
   * Only active when Chapter 2 is running and transition is complete.
   * @private
   * @param {any} payload
   */
  _applyResonanceCalibration(payload) {
    if (this._chapter2DebugMode) return;
    if (this.activeChapter !== 2) return;
    if (this._chapterTransitionState === ChapterTransitionState.TRANSITIONING) return;
    if (this._resonanceLocked) return;

    const catchType = String(payload?.catchType ?? payload?.payload?.catchType ?? 'NONE').toUpperCase();
    let contribution = 0.0;
    if (catchType === 'CLEAN') {
      contribution = RESONANCE_CATCH_CONTRIBUTION.CLEAN;
    } else if (catchType === 'ASSISTED') {
      contribution = RESONANCE_CATCH_CONTRIBUTION.ASSISTED;
    }

    if (contribution > 0.0) {
      const multTotal = payload?.multipliers?.total ?? payload?.payload?.multipliers?.total ?? 1.0;
      const boost = Math.max(1.0, Math.min(2.0, multTotal));
      contribution *= boost;
      this._resonanceProgress = Math.min(1.0, this._resonanceProgress + contribution);
      this._updateCh2ResonanceStateFromProgress();
    }
  }

  /**
   * Updates the Chapter 2 resonance state from the current resonanceProgress value.
   * @private
   */
  _updateCh2ResonanceStateFromProgress() {
    if (this._resonanceProgress >= 1.0) {
      if (this._ch2ResonanceState !== Ch2ResonanceState.RESONANCE_2_1) {
        this._ch2ResonanceState = Ch2ResonanceState.RESONANCE_2_1;
        if (!this._resonanceLockedTriggered) {
          this._resonanceLocked = true;
          this._resonanceLockedTriggered = true;
          this._resonanceLockedTime = 0.0;
          if (this.ch2ResonanceLockedText) {
            this.ch2ResonanceLockedText.visible = true;
          }
          // Phase 3C: Trigger binary resonance shockwave once
          this._ch2ShockwaveActive = true;
          this._ch2ShockwaveTriggered = true;
          this._ch2ShockwaveTime = 0.0;
          if (this.ch2ShockwaveMesh) {
            this.ch2ShockwaveMesh.visible = true;
            this.ch2ShockwaveMesh.scale.setScalar(0.20);
            if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.70;
          }
        }
      }
    } else if (this._resonanceProgress >= RESONANCE_STABILIZATION_THRESHOLD) {
      this._ch2ResonanceState = Ch2ResonanceState.RESONANCE_STABILIZATION;
    } else {
      this._ch2ResonanceState = Ch2ResonanceState.CHAOTIC_CIRCUMBINARY;
    }
  }

  /**
   * Updates the RESONANCE ACHIEVED milestone sprite lifecycle.
   * Reuses the exact same opacity animation, entrance scale, breathing, and timing as Chapter 1.
   * Strictly zero heap allocation.
   * @private
   * @param {number} dt
   */
  _updateResonanceLockedMilestone(dt) {
    if (!this.ch2ResonanceLockedText) return;
    if (!this._resonanceLockedTriggered) {
      this.ch2ResonanceLockedText.visible = false;
      if (this.ch2ResonanceLockedText.material) this.ch2ResonanceLockedText.material.opacity = 0.0;
      return;
    }

    this._resonanceLockedTime += dt;
    const t = this._resonanceLockedTime;
    const targetTextW = 0.88;
    const targetTextH = 0.22;

    let opacity = 0.0;
    if (t < 0.20) {
      // 0.00 -> 0.20s: brief anticipation hold
      opacity = 0.0;
      this.ch2ResonanceLockedText.scale.set(targetTextW * 0.88, targetTextH * 0.88, 1.0);
    } else if (t < 0.45) {
      // 0.20 -> 0.45s: smooth fade in + scale entrance (0.88 -> 1.00) like Chapter 1
      const fadeIn = (t - 0.20) / 0.25;
      const easeEnter = smoothstepScalar(0.0, 1.0, fadeIn);
      opacity = easeEnter;
      const enterScale = 0.88 + 0.12 * easeEnter;
      this.ch2ResonanceLockedText.visible = true;
      this.ch2ResonanceLockedText.scale.set(targetTextW * enterScale, targetTextH * enterScale, 1.0);
    } else if (t < 1.60) {
      // 0.45 -> 1.60s: steady hold above binary center with subtle breathing
      const breathe = 0.02 * Math.sin(this.simTime * 3.0);
      opacity = Math.min(1.0, 0.98 + breathe);
      this.ch2ResonanceLockedText.visible = true;
      this.ch2ResonanceLockedText.scale.set(targetTextW, targetTextH, 1.0);
    } else if (t < RESONANCE_LOCKED_DURATION) {
      // 1.60 -> 2.00s: graceful fade out
      const fadeOut = (t - 1.60) / (RESONANCE_LOCKED_DURATION - 1.60);
      opacity = 1.0 - smoothstepScalar(0.0, 1.0, fadeOut);
      this.ch2ResonanceLockedText.visible = true;
      this.ch2ResonanceLockedText.scale.set(targetTextW, targetTextH, 1.0);
    } else {
      // 2.00s+: completed
      opacity = 0.0;
      this.ch2ResonanceLockedText.visible = false;
    }

    if (t >= 0.20 && t < RESONANCE_LOCKED_DURATION) {
      this.ch2ResonanceLockedText.visible = true;
    }
    if (this._chapter2DebugMode && this._resonanceLocked) {
      this.ch2ResonanceLockedText.visible = true;
    }

    if (this.ch2ResonanceLockedText.material) {
      this.ch2ResonanceLockedText.material.opacity = Math.max(0.0, Math.min(1.0, opacity));
    }

    // Phase 4A: Emit dedicated Chapter 2 Binary Resonance completion event AFTER milestone lifecycle completes
    if (t >= RESONANCE_LOCKED_DURATION && !this._resonanceCompletionEmitted) {
      if (!this._chapter2DebugMode) {
        this._resonanceCompletionEmitted = true;
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
          this.eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, {
            chapter: 2,
            resonanceState: Ch2ResonanceState.RESONANCE_2_1
          });
        }
      }
    }
  }

  /**
   * Returns whether Chapter 2 resonance completion event has been emitted.
   * @returns {boolean}
   */
  isResonanceCompletionEmitted() {
    return this._resonanceCompletionEmitted;
  }

  /**
   * Returns current Chapter 2 resonance progress [0, 1].
   * @returns {number}
   */
  getResonanceProgress() {
    return this._resonanceProgress;
  }

  /**
   * Returns current Chapter 2 resonance state string.
   * @returns {string}
   */
  getCh2ResonanceState() {
    return this._ch2ResonanceState;
  }

  /**
   * Returns whether Chapter 2 resonance is locked (progress reached 1.0).
   * @returns {boolean}
   */
  isResonanceLocked() {
    return this._resonanceLocked;
  }

  /**
   * Returns the RESONANCE ACHIEVED text Sprite for testing / inspection.
   * @returns {Sprite|null}
   */
  getResonanceAchievedText() {
    return this.ch2ResonanceLockedText || null;
  }

  /**
   * Returns the RESONANCE LOCKED text Sprite for testing (backward compatibility alias).
   * @returns {Sprite|null}
   */
  getResonanceLockedText() {
    return this.ch2ResonanceLockedText || null;
  }

  /**
   * Returns the array of harmonic node meshes for testing.
   * @returns {Mesh[]}
   */
  getHarmonicNodes() {
    return this.ch2HarmonicNodes || [];
  }

  /**
   * Updates the 100-particle instanced resonance field.
   * Organizes particles into 3 concentric harmonic lanes (r ≈ 0.58, 1.15, 1.38) with traveling density waves.
   * Strictly zero heap allocation in hot path.
   * @private
   * @param {number} _dt
   * @param {number} _starOmega
   */
  _updateCh2ParticleField(_dt, _starOmega) {
    if (!this.ch2ParticleField) return;

    // Visibility and opacity driven by resonanceProgress
    let particleOpacity = 0.0;
    if (this._resonanceProgress < 0.05) {
      particleOpacity = 0.0;
    } else if (this._resonanceProgress < 0.35) {
      // 0.05 -> 0.35: emerges from 0.0 to 0.28
      particleOpacity = ((this._resonanceProgress - 0.05) / 0.30) * 0.28;
    } else if (this._resonanceProgress < 1.0) {
      // 0.35 -> 1.0: progressively organizes and brightens (0.28 -> 0.62)
      particleOpacity = 0.28 + ((this._resonanceProgress - 0.35) / 0.65) * 0.34;
    } else {
      // Stable locked configuration with gentle celestial shimmer
      particleOpacity = 0.70 + 0.05 * Math.sin(this.simTime * 2.5);
    }

    if (this.ch2ParticleField.material) {
      this.ch2ParticleField.material.opacity = Math.max(0.0, Math.min(1.0, particleOpacity));
    }
    this.ch2ParticleField.visible = (particleOpacity > 0.01);

    if (!this.ch2ParticleField.visible) return;

    const baseDrift = this.simTime * 0.32;
    const progress = this._resonanceProgress;
    const organizationFactor = 1.0 - 0.70 * progress;

    for (let i = 0; i < CH2_PARTICLE_COUNT; i++) {
      const idx = i * 4;
      const x0 = this._ch2ParticleData[idx + 0];
      const y0 = this._ch2ParticleData[idx + 1];
      const z0 = this._ch2ParticleData[idx + 2];
      const phase = this._ch2ParticleData[idx + 3];

      // Reconstruct base angle and radius
      const r0 = Math.sqrt(x0 * x0 + z0 * z0);
      const angle0 = Math.atan2(z0, x0);

      // Target harmonic lanes: Lane 1 (0..19) at 0.58, Lane 2 (20..79) at 1.15, Lane 3 (80..99) at 1.38
      let targetLaneRadius = 1.15;
      let laneSpeedMult = 1.0;
      if (i < 20) {
        targetLaneRadius = 0.58;
        laneSpeedMult = 1.35;
      } else if (i >= 80) {
        targetLaneRadius = 1.38;
        laneSpeedMult = 0.78;
      }

      // Orbital circulation with lane-specific tangential drift
      const angle = angle0 + baseDrift * laneSpeedMult + 0.03 * Math.sin(this.simTime * 0.8 + phase);

      // Radial position: smoothly organizes into targetLaneRadius as progress increases
      const rTarget = 1.15 + (targetLaneRadius - 1.15) * Math.min(1.0, progress * 1.25);
      const r = rTarget + (r0 - 1.15) * organizationFactor + 0.010 * (1.0 - progress) * Math.sin(this.simTime * 1.5 + phase);

      // Vertical position with harmonic breathing
      const py = y0 * (1.0 - 0.50 * progress) + 0.008 * Math.sin(this.simTime * 1.6 + phase);

      const px = r * Math.cos(angle);
      const pz = r * Math.sin(angle);

      // Pulse scale with traveling harmonic density wave
      const densityWave = 0.5 + 0.5 * Math.sin(angle * 2.0 - this.simTime * 2.4 + phase);
      const s = (0.0032 + 0.0012 * densityWave) * (0.75 + 0.25 * progress);

      // Slender directional filament streak along orbital velocity tangent:
      // st: streak length stretches from 0.022 -> 0.052 as resonance stabilizes
      // sr: radial thickness (ultra-slender ~0.0015)
      // sv: vertical thickness (celestial ribbon ~0.0010)
      const st = (0.022 + 0.030 * progress) * (0.85 + 0.30 * densityWave);
      const sr = s * 0.45;
      const sv = s * 0.30;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const m = this._tempMatrix.elements;
      // Column 0: Tangential elongation vector (-st * sinA, 0, st * cosA)
      // Column 1: Vertical thickness vector (0, sv, 0)
      // Column 2: Radial width vector (sr * cosA, 0, sr * sinA)
      // Column 3: World position (px, py, pz)
      m[0] = -st * sinA; m[4] = 0;   m[8]  = sr * cosA;  m[12] = px;
      m[1] = 0;          m[5] = sv;  m[9]  = 0;          m[13] = py;
      m[2] = st * cosA;  m[6] = 0;   m[10] = sr * sinA;  m[14] = pz;
      m[3] = 0;          m[7] = 0;   m[11] = 0;          m[15] = 1;
      this.ch2ParticleField.setMatrixAt(i, this._tempMatrix);
    }
    this.ch2ParticleField.instanceMatrix.needsUpdate = true;
  }

  /**
   * Updates the protective shield / stretch ring around the player planet.
   * Strictly zero heap allocation in hot path.
   * @private
   * @param {number} _dt
   */
  _updateCh2ShieldRing(_dt) {
    if (!this.ch2ShieldRing) return;

    let shieldOpacity = 0.0;
    if (this._resonanceProgress < 0.10) {
      shieldOpacity = 0.0;
    } else if (this._resonanceProgress < 0.35) {
      // 0.10 -> 0.35: barely emerging (0.0 -> 0.15)
      shieldOpacity = ((this._resonanceProgress - 0.10) / 0.25) * 0.15;
    } else if (this._resonanceProgress < 1.0) {
      // 0.35 -> 1.0: expanding and clarifying (0.15 -> 0.50)
      shieldOpacity = 0.15 + ((this._resonanceProgress - 0.35) / 0.65) * 0.35;
    } else {
      // Locked stable state: steady with subtle celestial breathing
      const breathe = 0.03 * Math.sin(this.simTime * 2.6);
      shieldOpacity = 0.50 + breathe;
    }

    // Stretch behavior: starts subtly compressed/elliptical and expands into stable resonant circle
    const stretchX = 1.0 + 0.18 * (1.0 - this._resonanceProgress) * Math.sin(this.simTime * 1.5);
    const stretchY = 1.0 - 0.14 * (1.0 - this._resonanceProgress) * Math.cos(this.simTime * 1.5);
    const baseScale = 1.0 + 0.12 * this._resonanceProgress;
    this.ch2ShieldRing.scale.set(baseScale * stretchX, baseScale * stretchY, 1.0);

    if (this.ch2ShieldRing.material) {
      this.ch2ShieldRing.material.opacity = Math.max(0.0, Math.min(1.0, shieldOpacity));
    }
    this.ch2ShieldRing.visible = (shieldOpacity > 0.01);
  }

  /**
   * Updates the binary resonance shockwave lifecycle (~1.0s total).
   * Animates primary cyan shockwave and secondary champagne gold echo wave.
   * Strictly zero heap allocation in hot path.
   * @private
   * @param {number} dt
   */
  _updateCh2Shockwave(dt) {
    if (!this.ch2ShockwaveMesh) return;
    if (!this._ch2ShockwaveActive) {
      this.ch2ShockwaveMesh.visible = false;
      if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.0;
      if (this.ch2ShockwaveEchoMesh) {
        this.ch2ShockwaveEchoMesh.visible = false;
        if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
      }
      return;
    }

    this._ch2ShockwaveTime += dt;
    const t = this._ch2ShockwaveTime;

    if (t >= CH2_SHOCKWAVE_DURATION) {
      this._ch2ShockwaveActive = false;
      this.ch2ShockwaveMesh.visible = false;
      if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.0;
      if (this.ch2ShockwaveEchoMesh) {
        this.ch2ShockwaveEchoMesh.visible = false;
        if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
      }
      return;
    }

    let scale = 0.20;
    let opacity = 0.0;

    if (t < 0.20) {
      // 0.00–0.20s: compact/high-energy state (scale 0.20 -> 0.40, opacity 0.70 -> 0.90)
      const u = t / 0.20;
      scale = 0.20 + 0.20 * u;
      opacity = 0.70 + 0.20 * u;
    } else if (t < 0.70) {
      // 0.20–0.70s: expand outward through resonant orbit (scale 0.40 -> 2.40, opacity 0.90 -> 0.45)
      const u = (t - 0.20) / 0.50;
      const easeOut = Math.sin(u * Math.PI * 0.5);
      scale = 0.40 + 2.00 * easeOut;
      opacity = 0.90 - 0.45 * u;
    } else {
      // 0.70–1.00s: fade out (scale 2.40 -> 2.65, opacity 0.45 -> 0.0)
      const u = (t - 0.70) / 0.30;
      scale = 2.40 + 0.25 * u;
      opacity = 0.45 * (1.0 - u);
    }

    this.ch2ShockwaveMesh.visible = true;
    this.ch2ShockwaveMesh.scale.setScalar(scale);
    if (this.ch2ShockwaveMesh.material) {
      this.ch2ShockwaveMesh.material.opacity = Math.max(0.0, Math.min(1.0, opacity));
    }

    // Secondary champagne gold echo wave
    if (this.ch2ShockwaveEchoMesh) {
      const tEcho = t - 0.06;
      if (tEcho > 0.0 && tEcho < CH2_SHOCKWAVE_DURATION - 0.06) {
        let echoScale = 0.20;
        let echoOp = 0.0;
        if (tEcho < 0.20) {
          const u = tEcho / 0.20;
          echoScale = 0.20 + 0.18 * u;
          echoOp = 0.60 + 0.15 * u;
        } else if (tEcho < 0.70) {
          const u = (tEcho - 0.20) / 0.50;
          const easeOut = Math.sin(u * Math.PI * 0.5);
          echoScale = 0.38 + 1.82 * easeOut;
          echoOp = 0.75 - 0.40 * u;
        } else {
          const u = (tEcho - 0.70) / 0.24;
          echoScale = 2.20 + 0.20 * u;
          echoOp = 0.35 * (1.0 - u);
        }
        this.ch2ShockwaveEchoMesh.visible = true;
        this.ch2ShockwaveEchoMesh.scale.setScalar(echoScale);
        if (this.ch2ShockwaveEchoMesh.material) {
          this.ch2ShockwaveEchoMesh.material.opacity = Math.max(0.0, Math.min(1.0, echoOp));
        }
      } else {
        this.ch2ShockwaveEchoMesh.visible = false;
        if (this.ch2ShockwaveEchoMesh.material) {
          this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
        }
      }
    }
  }

  /**
   * Returns the InstancedMesh for the 100-particle resonance field.
   * @returns {InstancedMesh|null}
   */
  getCh2ParticleField() {
    return this.ch2ParticleField || null;
  }

  /**
   * Returns the binary resonance shockwave mesh.
   * @returns {Mesh|null}
   */
  getCh2Shockwave() {
    return this.ch2ShockwaveMesh || null;
  }

  /**
   * Returns the protective shield ring mesh around the player planet.
   * @returns {Mesh|null}
   */
  getCh2ShieldRing() {
    return this.ch2ShieldRing || null;
  }

  /**
   * Returns whether the shockwave is currently animating.
   * @returns {boolean}
   */
  isCh2ShockwaveActive() {
    return this._ch2ShockwaveActive;
  }

  /**
   * Returns the particle count constant.
   * @returns {number}
   */
  getCh2ParticleCount() {
    return CH2_PARTICLE_COUNT;
  }

  // ==========================================================================
  // CHAPTER 1 -> CHAPTER 2 TRANSITION STATE MACHINE (STEP 5)
  // ==========================================================================

  /**
   * Initiates a smooth visual transition between chapters (currently 1 -> 2).
   * Duration: 2.0 seconds. Both systems remain visible during transition.
   *
   * @param {number} fromChapter
   * @param {number} toChapter
   * @returns {boolean} True if transition successfully started
   */
  startChapterTransition(fromChapter, toChapter) {
    if (fromChapter === 1 && toChapter === 2) {
      this._chapterTransitionState = ChapterTransitionState.TRANSITIONING;
      this._chapterTransitionTime = 0.0;
      this._chapterTransitionProgress = 0.0;
      this._transitionFromChapter = 1;
      this._transitionToChapter = 2;

      // Ensure both chapter groups remain visible throughout the handoff
      if (this.chapterGroups[1]) this.chapterGroups[1].visible = true;
      if (this.chapterGroups[2]) this.chapterGroups[2].visible = true;

      // Cache start positions for smooth interpolation
      if (this.ch1PlanetNode) {
        this._transStartPosPlanet.copy(this.ch1PlanetNode.position);
        this.ch1PlanetNode.visible = true;
      }
      if (this.ch1PrimaryStar) {
        this._transStartPosStar.copy(this.ch1PrimaryStar.position);
      }
      if (this.ch1Perturber) {
        this._transStartPosPerturber.copy(this.ch1Perturber.position);
      }

      // Hide Chapter 2 planet initially so Chapter 1 protagonist smoothly glides into place
      if (this.ch2PlanetNode) {
        this.ch2PlanetNode.visible = false;
      }

      // Cache starting opacities
      this._transStartOpStableState = this.ch1StableStateText?.material?.opacity ?? 0.0;
      this._transStartOpShimmer = this.ch1TextShimmerGlint?.material?.opacity ?? 0.0;
      this._transStartOpSparkles = this.ch1StableStateSparkles?.material?.opacity ?? 0.0;

      return true;
    } else if (fromChapter === 2 && toChapter === 3) {
      this._chapterTransitionState = ChapterTransitionState.TRANSITIONING;
      this._chapterTransitionTime = 0.0;
      this._chapterTransitionProgress = 0.0;
      this._transitionFromChapter = 2;
      this._transitionToChapter = 3;

      // Ensure both chapter groups remain visible throughout the handoff
      if (this.chapterGroups[2]) this.chapterGroups[2].visible = true;
      if (this.chapterGroups[3]) this.chapterGroups[3].visible = true;

      // Cache start positions for smooth interpolation
      if (this.ch2PlanetNode) {
        this._transStartPosPlanet.copy(this.ch2PlanetNode.position);
        this.ch2PlanetNode.visible = true;
      }

      // Hide Chapter 3 planet initially so Chapter 2 protagonist smoothly glides into place
      if (this.ch3PlanetNode) {
        this.ch3PlanetNode.visible = false;
      }

      return true;
    }
    return false;
  }

  /**
   * Returns whether a chapter visual transition is currently running.
   * @returns {boolean}
   */
  isChapterTransitionActive() {
    return this._chapterTransitionState === ChapterTransitionState.TRANSITIONING;
  }

  /**
   * Returns current chapter transition state descriptor.
   * @returns {object}
   */
  getChapterTransitionState() {
    return {
      state: this._chapterTransitionState,
      time: this._chapterTransitionTime,
      duration: this._chapterTransitionDuration,
      progress: this._chapterTransitionProgress,
      fromChapter: this._transitionFromChapter,
      toChapter: this._transitionToChapter
    };
  }

  /**
   * Advances the 2.0s Chapter handoff (1 -> 2 or 2 -> 3).
   * Strictly zero heap allocation in the hot path.
   *
   * @private
   * @param {number} dt
   * @param {number} progress
   * @param {number} maneuverStatus
   * @param {string} orbitalState
   */
  _updateChapterTransition(dt, progress, maneuverStatus, orbitalState) {
    this._chapterTransitionTime += dt;
    const rawProgress = Math.min(1.0, this._chapterTransitionTime / this._chapterTransitionDuration);
    this._chapterTransitionProgress = rawProgress;
    // Cubic smoothstep easing: 3*u^2 - 2*u^3
    const ease = rawProgress * rawProgress * (3.0 - 2.0 * rawProgress);
    const fadeOut = Math.max(0.0, 1.0 - ease);
    const fadeIn = ease;

    if (this._transitionFromChapter === 1 && this._transitionToChapter === 2) {
      // Advance Chapter 2 binary stars and outer orbit positions for this frame
      this._updateChapter2(dt, progress, maneuverStatus, orbitalState);

      // 1. Smooth coordinate / visual interpolation
      // Player Planet: interpolates from Ch 1 final coordinates toward Ch 2 circumbinary resonant orbit position
      if (this.ch1PlanetNode && this.ch2PlanetNode) {
        this._transTargetPosPlanet.copy(this.ch2PlanetNode.position);
        this.ch1PlanetNode.position.lerpVectors(this._transStartPosPlanet, this._transTargetPosPlanet, ease);
        this.ch2PlanetNode.position.copy(this.ch1PlanetNode.position);
        this.ch1PlanetNode.visible = true;
        this.ch2PlanetNode.visible = false;
      }

      // Primary Star: smoothly migrates toward Binary Star 1 position while fading out
      if (this.ch1PrimaryStar && this.ch2Star1) {
        this.ch1PrimaryStar.position.lerpVectors(this._transStartPosStar, this.ch2Star1.position, ease);
        if (this.ch1PrimaryStar.material) {
          this.ch1PrimaryStar.material.opacity = 0.90 * fadeOut;
        }
        if (this.ch1StarGlow?.material?.uniforms?.uBaseOpacity) {
          this.ch1StarGlow.material.uniforms.uBaseOpacity.value = 0.20 * fadeOut;
        }
      }

      // Secondary Perturber: smoothly migrates toward Binary Star 2 position while fading out
      if (this.ch1Perturber && this.ch2Star2) {
        this.ch1Perturber.position.lerpVectors(this._transStartPosPerturber, this.ch2Star2.position, ease);
        if (this.ch1Perturber.material) {
          this.ch1Perturber.material.opacity = 0.90 * fadeOut;
        }
        if (this.ch1PerturberGlow?.material?.uniforms?.uBaseOpacity) {
          this.ch1PerturberGlow.material.uniforms.uBaseOpacity.value = 0.18 * fadeOut;
        }
      }

      // 2. Fade Chapter 1 orbit lines to 0.0
      if (this.ch1HyperbolicLine?.material) {
        this.ch1HyperbolicLine.material.opacity = 0.22 * fadeOut;
        this.ch1HyperbolicLine.visible = (fadeOut > 0.005);
      }
      if (this.ch1PlanetOrbitLine?.material) {
        this.ch1PlanetOrbitLine.material.opacity = 0.28 * fadeOut;
        this.ch1PlanetOrbitLine.visible = (fadeOut > 0.005);
      }
      if (this.ch1PerturberOrbitLine?.material) {
        this.ch1PerturberOrbitLine.material.opacity = 0.22 * fadeOut;
        this.ch1PerturberOrbitLine.visible = (fadeOut > 0.005);
      }
      if (this.ch1BoundOrbitLine?.material) {
        this.ch1BoundOrbitLine.material.opacity = 0.40 * fadeOut;
        this.ch1BoundOrbitLine.visible = (fadeOut > 0.005);
      }
      if (this.ch1EnergyRays?.material) {
        this.ch1EnergyRays.material.opacity = Math.min(this.ch1EnergyRays.material.opacity, fadeOut);
        this.ch1EnergyRays.visible = (fadeOut > 0.005);
      }
      if (this.ch1SyncWave?.material) {
        this.ch1SyncWave.material.opacity = Math.min(this.ch1SyncWave.material.opacity, fadeOut);
        this.ch1SyncWave.visible = (fadeOut > 0.005);
      }

      // 3. Fade STABLE STATE text and shimmer to 0.0
      if (this.ch1StableStateText?.material) {
        const op = this._transStartOpStableState * fadeOut;
        this.ch1StableStateText.material.opacity = op;
        this.ch1StableStateText.visible = (op > 0.005);
      }
      if (this.ch1TextShimmerGlint?.material) {
        const op = this._transStartOpShimmer * fadeOut;
        this.ch1TextShimmerGlint.material.opacity = op;
        this.ch1TextShimmerGlint.visible = (op > 0.005);
      }
      if (this.ch1StableStateSparkles?.material) {
        const op = this._transStartOpSparkles * fadeOut;
        this.ch1StableStateSparkles.material.opacity = op;
        this.ch1StableStateSparkles.visible = (op > 0.005);
      }

      // 4. Fade in Chapter 2 visuals smoothly
      // Resonant ring: 0.0 -> baseline 0.70
      if (this.ch2ResonantRing?.material) {
        this.ch2ResonantRing.material.opacity = 0.70 * fadeIn;
      }
      // Inner orbit line: 0.0 -> baseline 0.35
      if (this.ch2InnerOrbitLine?.material) {
        this.ch2InnerOrbitLine.material.opacity = 0.35 * fadeIn;
      }
      // Binary Star 1 & 2: 0.0 -> 0.95
      if (this.ch2Star1?.material) {
        this.ch2Star1.material.opacity = 0.95 * fadeIn;
      }
      if (this.ch2Star1Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star1Glow.material.uniforms.uBaseOpacity.value = 0.22 * fadeIn;
      }
      if (this.ch2Star2?.material) {
        this.ch2Star2.material.opacity = 0.95 * fadeIn;
      }
      if (this.ch2Star2Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star2Glow.material.uniforms.uBaseOpacity.value = 0.22 * fadeIn;
      }

      // 5. Completion at t >= 2.0s
      if (rawProgress >= 1.0) {
        this._chapterTransitionState = ChapterTransitionState.IDLE;
        this._chapterTransitionProgress = 1.0;

        if (this.chapterGroups[1]) this.chapterGroups[1].visible = false;
        if (this.chapterGroups[2]) this.chapterGroups[2].visible = true;

        if (this.ch1PlanetNode) this.ch1PlanetNode.visible = false;
        if (this.ch2PlanetNode) {
          this.ch2PlanetNode.visible = true;
          this.ch2PlanetNode.position.copy(this._transTargetPosPlanet);
        }

        // Lock Chapter 2 baseline opacities
        if (this.ch2ResonantRing?.material) this.ch2ResonantRing.material.opacity = 0.70;
        if (this.ch2InnerOrbitLine?.material) this.ch2InnerOrbitLine.material.opacity = 0.35;
        if (this.ch2Star1?.material) this.ch2Star1.material.opacity = 0.95;
        if (this.ch2Star2?.material) this.ch2Star2.material.opacity = 0.95;
        if (this.ch2Star1Glow?.material?.uniforms?.uBaseOpacity) this.ch2Star1Glow.material.uniforms.uBaseOpacity.value = 0.22;
        if (this.ch2Star2Glow?.material?.uniforms?.uBaseOpacity) this.ch2Star2Glow.material.uniforms.uBaseOpacity.value = 0.22;

        // Phase 3B: Enter Chapter 2 resonance state machine
        this.enterChapter2();
      }
    } else if (this._transitionFromChapter === 2 && this._transitionToChapter === 3) {
      // Advance Chapter 3 visual positions for this frame
      this._updateChapter3(dt, progress, maneuverStatus, orbitalState);
      // Advance Chapter 2 binary stars and planet baseline
      this._updateChapter2(dt, progress, maneuverStatus, orbitalState);

      // 1. Smooth coordinate / visual interpolation
      // Player Planet: interpolates from Ch 2 final coordinates toward Ch 3 gravity assist orbit position
      if (this.ch2PlanetNode && this.ch3PlanetNode) {
        this._transTargetPosPlanet.copy(this.ch3PlanetNode.position);
        this.ch2PlanetNode.position.lerpVectors(this._transStartPosPlanet, this._transTargetPosPlanet, ease);
        this.ch3PlanetNode.position.copy(this.ch2PlanetNode.position);
        this.ch2PlanetNode.visible = true;
        this.ch3PlanetNode.visible = false;
      }

      // 2. Fade Chapter 2 visual elements to 0.0
      if (this.ch2ResonantRing?.material) {
        this.ch2ResonantRing.material.opacity = 0.70 * fadeOut;
      }
      if (this.ch2InnerOrbitLine?.material) {
        this.ch2InnerOrbitLine.material.opacity = 0.35 * fadeOut;
      }
      if (this.ch2Star1?.material) {
        this.ch2Star1.material.opacity = 0.95 * fadeOut;
      }
      if (this.ch2Star1Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star1Glow.material.uniforms.uBaseOpacity.value = 0.22 * fadeOut;
      }
      if (this.ch2Star2?.material) {
        this.ch2Star2.material.opacity = 0.95 * fadeOut;
      }
      if (this.ch2Star2Glow?.material?.uniforms?.uBaseOpacity) {
        this.ch2Star2Glow.material.uniforms.uBaseOpacity.value = 0.22 * fadeOut;
      }
      if (this.ch2HarmonicNodes) {
        for (const nodeM of this.ch2HarmonicNodes) {
          if (nodeM?.material) {
            nodeM.material.opacity *= fadeOut;
          }
        }
      }
      if (this.ch2ParticleField?.material) {
        this.ch2ParticleField.material.opacity *= fadeOut;
      }
      if (this.ch2ShieldRing?.material) {
        this.ch2ShieldRing.material.opacity *= fadeOut;
      }
      if (this.ch2ShockwaveMesh?.material) {
        this.ch2ShockwaveMesh.material.opacity *= fadeOut;
      }
      if (this.ch2ShockwaveEchoMesh?.material) {
        this.ch2ShockwaveEchoMesh.material.opacity *= fadeOut;
      }
      if (this.ch2ConcentricRing1?.material) {
        this.ch2ConcentricRing1.material.opacity *= fadeOut;
      }
      if (this.ch2ConcentricRing2?.material) {
        this.ch2ConcentricRing2.material.opacity *= fadeOut;
      }
      if (this.ch2ConcentricRing3?.material) {
        this.ch2ConcentricRing3.material.opacity *= fadeOut;
      }
      if (this.ch2CardinalAxes?.material) {
        this.ch2CardinalAxes.material.opacity *= fadeOut;
      }
      if (this.ch2StarBridgeLine?.material) {
        this.ch2StarBridgeLine.material.opacity *= fadeOut;
      }
      if (this.ch2ResonanceFilaments?.material) {
        this.ch2ResonanceFilaments.material.opacity *= fadeOut;
      }
      if (this.ch2PlanetTrailLine?.material) {
        this.ch2PlanetTrailLine.material.opacity *= fadeOut;
      }
      if (this.ch2TravelingHighlights?.material) {
        this.ch2TravelingHighlights.material.opacity *= fadeOut;
      }
      if (this.ch2TriadBridgeLine?.material) {
        this.ch2TriadBridgeLine.material.opacity *= fadeOut;
      }
      if (this.ch2PlanetAura?.material?.uniforms?.uBaseOpacity) {
        this.ch2PlanetAura.material.uniforms.uBaseOpacity.value = 0.20 * fadeOut;
      }

      // 3. Fade in Chapter 3 visual elements
      if (this.ch3Primary?.material) {
        this.ch3Primary.material.opacity = 0.92 * fadeIn;
      }
      if (this.ch3FlybyWorld?.material) {
        this.ch3FlybyWorld.material.opacity = 0.90 * fadeIn;
      }
      if (this.ch3TransferLine?.material) {
        this.ch3TransferLine.material.opacity = 0.75 * fadeIn;
      }
      if (this.ch3OuterOrbitLine?.material) {
        this.ch3OuterOrbitLine.material.opacity = 0.45 * fadeIn;
      }

      // 4. Completion at t >= 2.0s
      if (rawProgress >= 1.0) {
        this._chapterTransitionState = ChapterTransitionState.IDLE;
        this._chapterTransitionProgress = 1.0;

        if (this.chapterGroups[2]) this.chapterGroups[2].visible = false;
        if (this.chapterGroups[3]) this.chapterGroups[3].visible = true;

        if (this.ch2PlanetNode) this.ch2PlanetNode.visible = false;
        if (this.ch3PlanetNode) {
          this.ch3PlanetNode.visible = true;
          this.ch3PlanetNode.position.copy(this._transTargetPosPlanet);
        }

        // Lock Chapter 3 baseline opacities
        if (this.ch3Primary?.material) this.ch3Primary.material.opacity = 0.92;
        if (this.ch3FlybyWorld?.material) this.ch3FlybyWorld.material.opacity = 0.90;
        if (this.ch3TransferLine?.material) this.ch3TransferLine.material.opacity = 0.75;
        if (this.ch3OuterOrbitLine?.material) this.ch3OuterOrbitLine.material.opacity = 0.45;
      }
    }
  }

  /**
   * Chapter 3 Parametric Motion (Gravity assist flyby)
   * @private
   */
  _updateChapter3(_dt, progress, maneuverStatus, orbitalState) {
    const isOutermost = (orbitalState === OrbitalState.BOUND_OUTER_ORBIT || maneuverStatus === ManeuverStatus.COMPLETED);

    if (this.ch3OuterOrbitLine?.material) {
      this.ch3OuterOrbitLine.material.opacity = isOutermost ? 0.90 : (0.25 + progress * 0.40);
    }

    if (this.ch3PlanetNode) {
      if (isOutermost) {
        // Orbiting expanded outer shell
        const angle = this.simTime * 1.1;
        this.ch3PlanetNode.position.set(1.45 * Math.cos(angle), 0.0, 1.45 * Math.sin(angle));
      } else {
        // Moving along transfer trajectory past flyby world
        const angle = (this.simTime * 1.5) % (Math.PI * 1.2) - Math.PI * 0.4;
        const a = 0.92;
        const b = 0.75;
        this.ch3PlanetNode.position.set(a * Math.cos(angle), 0.0, b * Math.sin(angle));
      }
    }
  }

  /**
   * Chapter 4 Parametric Motion (Roche disruption & ring formation)
   * @private
   */
  _updateChapter4(_dt, progress, _maneuverStatus, orbitalState) {
    // Read rocheProgress from orreryState snapshot if available, else use progress
    const snap = this.narrativeDirector?.orreryState?.getSnapshot();
    const rocheProgress = (snap && typeof snap.rocheProgress === 'number') ? snap.rocheProgress : progress;
    const isRingFormed = (orbitalState === OrbitalState.RING_FORMED || rocheProgress >= 1.0);

    // Formed ring opacities and scales increase as rocheProgress advances
    const innerOpacity = isRingFormed ? 0.85 : (0.15 + rocheProgress * 0.70);
    const outerOpacity = isRingFormed ? 0.75 : (0.10 + rocheProgress * 0.65);
    const ringScale = 1.0 + rocheProgress * 0.10;

    if (this.ch4InnerRing?.material) {
      this.ch4InnerRing.material.opacity = innerOpacity;
      this.ch4InnerRing.scale.setScalar(ringScale);
    }
    if (this.ch4OuterRing?.material) {
      this.ch4OuterRing.material.opacity = outerOpacity;
      this.ch4OuterRing.scale.setScalar(ringScale);
    }
    if (this.ch4Fragments?.material) {
      this.ch4Fragments.material.opacity = isRingFormed ? 0.80 : (0.20 + rocheProgress * 0.60);
    }

    // Satellite inward migration and tidal disruption
    if (this.ch4Satellite) {
      if (isRingFormed) {
        this.ch4Satellite.visible = false;
      } else {
        this.ch4Satellite.visible = true;
        // Inward spiral from 1.25 down to Roche limit ~0.65
        const r = 1.25 - rocheProgress * 0.60;
        const angle = this.simTime * (1.2 + rocheProgress * 1.5);
        this.ch4Satellite.position.set(r * Math.cos(angle), 0.0, r * Math.sin(angle));

        // Scale shrinks as satellite breaks up
        const scale = Math.max(0.001, 0.055 * (1.0 - rocheProgress * 0.80));
        this.ch4Satellite.scale.setScalar(scale);
      }
    }
  }

  /**
   * Chapter 5 Parametric Motion (Supernova deflection & magnetoshield)
   * @private
   */
  _updateChapter5(_dt, progress, _maneuverStatus, orbitalState) {
    const snap = this.narrativeDirector?.orreryState?.getSnapshot();
    const shieldCharge = (snap && typeof snap.shieldCharge === 'number') ? snap.shieldCharge : progress;
    const isProtected = (orbitalState === OrbitalState.ATMOSPHERE_PROTECTED || shieldCharge >= 1.0);

    // Stellar core pulse
    if (this.ch5StellarCore) {
      const pulse = 1.0 + 0.15 * Math.sin(this.simTime * 8.0);
      this.ch5StellarCore.scale.setScalar(0.11 * pulse);
    }

    // Shockwave propagation
    if (this.ch5ShockwaveLine) {
      const waveT = (this.simTime * 1.2) % 1.0;
      const waveX = -1.25 + waveT * 0.95;
      this.ch5ShockwaveLine.position.set(waveX, 0.08, 0.0);
      if (this.ch5ShockwaveLine.material) {
        this.ch5ShockwaveLine.material.opacity = isProtected ? 0.35 : (0.80 - waveT * 0.50);
      }
    }

    // Magnetoshield opacity, scale and strength
    if (this.ch5Magnetoshield) {
      const targetOpacity = isProtected ? 0.95 : (0.15 + shieldCharge * 0.80);
      if (this.ch5Magnetoshield.material) {
        this.ch5Magnetoshield.material.opacity = targetOpacity;
      }
      this.ch5Magnetoshield.scale.setScalar(1.0 + shieldCharge * 0.10);
    }

    // Atmosphere stability
    if (this.ch5Atmosphere?.material) {
      this.ch5Atmosphere.material.opacity = isProtected ? 0.40 : (0.25 + shieldCharge * 0.15);
    }
  }

  // ==========================================================================
  // 4. PUBLIC INSPECTION & CONTROL APIS
  // ==========================================================================

  /**
   * Root Three.js Group alias for this.group.
   * Enables intuitive inspection via window.orreryVisualSystem.root.
   * @returns {Group}
   */
  get root() {
    return this.group;
  }

  /**
   * Returns root Three.js group.
   * @returns {Group}
   */
  getRoot() {
    return this.group;
  }

  /**
   * Sets Orrery root visibility.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.group.visible = Boolean(visible);
  }

  /**
   * Returns current visibility.
   * @returns {boolean}
   */
  isVisible() {
    return Boolean(this.group.visible);
  }

  /**
   * Returns current active chapter index (1-5).
   * @returns {number}
   */
  getChapter() {
    this._syncFromDirector();
    return this.activeChapter;
  }

  /**
   * Returns the Three.js group for a specific chapter (1-5).
   * @param {number} chapter
   * @returns {Group | null}
   */
  getChapterGroup(chapter) {
    if (chapter >= 1 && chapter <= TOTAL_CHAPTERS) {
      return this.chapterGroups[chapter] || null;
    }
    return null;
  }

  /**
   * Returns the Chapter 1 player planet Mesh representation.
   * @returns {Mesh|null}
   */
  getChapter1PlanetNode() {
    return this.ch1PlanetNode;
  }

  /**
   * Returns the Chapter 2 player planet Mesh representation.
   * @returns {Mesh|null}
   */
  getChapter2PlanetNode() {
    return this.ch2PlanetNode;
  }

  /**
   * Returns the Chapter 3 player planet Mesh representation.
   * @returns {Mesh|null}
   */
  getChapter3PlanetNode() {
    return this.ch3PlanetNode;
  }

  /**
   * Returns Our Planet's dedicated orbital path line object in Chapter 1.
   * @returns {LineLoop|null}
   */
  getPlanetOrbitLine() {
    return this.ch1PlanetOrbitLine || null;
  }

  /**
   * Returns Secondary Planet's dedicated orbital path line object in Chapter 1.
   * @returns {LineLoop|null}
   */
  getSecondaryOrbitLine() {
    return this.ch1PerturberOrbitLine || null;
  }

  /**
   * Returns the planetary node for a given chapter (defaults to Chapter 1).
   * For Chapter 1, this represents the player's evolving primordial world.
   * @param {number} [chapter=1]
   * @returns {Mesh|null}
   */
  getPlanetNode(chapter = 1) {
    switch (chapter) {
      case 1: return this.ch1PlanetNode;
      case 2: return this.ch2PlanetNode;
      case 3: return this.ch3PlanetNode;
      case 4: return this.ch4Satellite;
      case 5: return this.ch5ProtectedPlanet;
      default: return this.ch1PlanetNode;
    }
  }

  /**
   * Updates the visual stage and shader uniforms for the player's evolving planet.
   * Mirrors authoritative progression from PlanetEvolutionController.
   *
   * @param {number} stage - Fractional visual stage [1.0 .. 5.0]
   * @param {Object} [params={}] - Optional stage parameters (awakeningProgress, etc.)
   * @returns {boolean} True if successfully set
   */
  setVisualStage(stage, params = {}) {
    if (typeof stage !== 'number' || !Number.isFinite(stage)) return false;
    const clamped = Math.max(1.0, Math.min(5.0, stage));
    this.visualStage = clamped;

    if (typeof params.awakeningProgress === 'number' && Number.isFinite(params.awakeningProgress)) {
      this.awakeningProgress = Math.max(0.0, Math.min(1.0, params.awakeningProgress));
    } else if (clamped <= 1.0) {
      this.awakeningProgress = 0.0;
    } else if (clamped < 2.0) {
      this.awakeningProgress = clamped - 1.0;
    } else {
      this.awakeningProgress = 1.0;
    }

    const nodes = [this.ch1PlanetNode, this.ch2PlanetNode, this.ch3PlanetNode];
    for (const node of nodes) {
      if (!node?.material?.uniforms) continue;
      const u = node.material.uniforms;
      if (u.uVisualStage) u.uVisualStage.value = this.visualStage;
      if (u.uAwakeningProgress) u.uAwakeningProgress.value = this.awakeningProgress;
      if (typeof params.transformationProgress === 'number' && u.uTransformationProgress) {
        u.uTransformationProgress.value = Math.max(0.0, Math.min(1.0, params.transformationProgress));
      }
      if (typeof params.kintsugiGlow === 'number' && u.uKintsugiGlow) {
        u.uKintsugiGlow.value = Math.max(0.0, Math.min(1.0, params.kintsugiGlow));
      }
      if (typeof params.oceanFill === 'number' && u.uOceanFill) {
        u.uOceanFill.value = Math.max(0.0, Math.min(1.0, params.oceanFill));
      }
      if (typeof params.atmosphereDensity === 'number' && u.uAtmosphereDensity) {
        u.uAtmosphereDensity.value = Math.max(0.0, Math.min(1.0, params.atmosphereDensity));
      }
      if (typeof params.shieldCharge === 'number' && u.uShieldCharge) {
        u.uShieldCharge.value = Math.max(0.0, Math.min(1.0, params.shieldCharge));
      }
      if (typeof params.goldIgnited !== 'undefined' && u.uGoldIgnited) {
        u.uGoldIgnited.value = params.goldIgnited ? 1.0 : 0.0;
      }
    }
    return true;
  }

  /**
   * Returns current visual stage rendered on Chapter 1 planet.
   * @returns {number}
   */
  getVisualStage() {
    return this.visualStage ?? 1.0;
  }

  /**
   * Returns current awakening progress rendered on Chapter 1 planet.
   * @returns {number}
   */
  getAwakeningProgress() {
    return this.awakeningProgress ?? 0.0;
  }

  /**
   * Returns active orbital state string from NarrativeDirector/OrreryState.
   * @returns {string}
   */
  getActiveOrbitalState() {
    return this.narrativeDirector?.getOrbitalState?.() || OrbitalState.HYPERBOLIC;
  }

  /**
   * Returns active maneuver status string from NarrativeDirector/OrreryState.
   * @returns {string}
   */
  getManeuverStatus() {
    return this.narrativeDirector?.getManeuverStatus?.() || ManeuverStatus.CALIBRATING;
  }

  /**
   * Returns current anchor position as a copy.
   * @returns {Vector3}
   */
  getAnchorPosition() {
    return this.anchorPosition.clone();
  }

  /**
   * Dynamically repositions the Orrery anchor in celestial space.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setAnchorPosition(x, y, z) {
    this.anchorPosition.set(x, y, z);
    this.group.position.copy(this.anchorPosition);
  }

  /**
   * Triggers or refreshes the Phase 2A catch cosmic synchronization response.
   * If already active, refreshes the envelope without stacking or allocating timers.
   * @param {any} [payload=null] - ScoreEvent or EventBus payload
   * @returns {number} resolved catch response intensity
   */
  triggerCatchResponse(payload = null) {
    const intensity = resolveCatchIntensity(payload);
    if (this._catchResponseActive) {
      this._catchResponseIntensity = Math.max(this._catchResponseIntensity, intensity);
      this._catchResponseTime = 0.0;
    } else {
      this._catchResponseActive = true;
      this._catchResponseTime = 0.0;
      this._catchResponseIntensity = intensity;
    }
    return this._catchResponseIntensity;
  }

  /**
   * Returns whether the catch response is currently active.
   * @returns {boolean}
   */
  isCatchResponseActive() {
    return this._catchResponseActive;
  }

  /**
   * Returns current catch response normalized progress [0.0 .. 1.0].
   * @returns {number}
   */
  getCatchResponseProgress() {
    if (!this._catchResponseActive) return 0.0;
    return Math.min(1.0, this._catchResponseTime / CATCH_RESPONSE_DURATION);
  }

  /**
   * Returns current catch response scalar surge value [0.0 .. 1.0].
   * @returns {number}
   */
  getCatchResponseSurge() {
    return this._catchResponseSurge;
  }

  /**
   * Returns current catch response peak intensity [0.0 .. 1.0].
   * @returns {number}
   */
  getCatchResponseIntensity() {
    return this._catchResponseIntensity;
  }

  // ==========================================================================
  // PHASE 2B: THREE-BODY ALIGNMENT & CONVERGENCE CINEMATIC APIS
  // ==========================================================================

  /**
   * Triggers the Phase 2B Three-Body convergence, syzygy alignment, and cosmic pulse sequence.
   * Allocation-free execution across 4 distinct phases:
   *   0.00 - 0.45s: CONVERGING
   *   0.45 - 0.70s: ALIGNED
   *   0.70 - 1.05s: PULSE
   *   1.05 - 1.55s: RETURNING
   *
   * @param {any} [payload=null] - ScoreEvent payload or options object
   * @returns {Object} alignment state snapshot
   */
  triggerThreeBodyAlignment(payload = null) {
    // Phase 3A Step 1: Guard against triggers when not in Chapter 1
    if (this.activeChapter !== 1) {
      return this.getAlignmentState();
    }

    // Phase 2C Step 1: Guard against re-entrant triggers while alignment is active
    if (this._alignmentActive) {
      return this.getAlignmentState();
    }

    const intensity = resolveCatchIntensity(payload);
    this._alignmentActive = true;
    this._alignmentTime = 0.0;
    this._alignmentPhase = AlignmentPhase.CONVERGING;
    this._alignmentIntensity = intensity;
    this._alignmentProgress = 0.0;
    this._alignmentPulse = 0.0;

    // Snapshot current orbital positions at initiation
    if (this.ch1PlanetNode) {
      this._orbitPosPlanet.copy(this.ch1PlanetNode.position);
    }
    if (this.ch1Perturber) {
      this._orbitPosPerturber.copy(this.ch1Perturber.position);
    }

    if (this.ch1SyncWave) {
      this.ch1SyncWave.visible = false;
      this.ch1SyncWave.scale.setScalar(0.20);
      if (this.ch1SyncWave.material) {
        this.ch1SyncWave.material.opacity = 0.0;
      }
    }

    return this.getAlignmentState();
  }

  /**
   * Returns current Phase 2B Three-Body alignment cinematic state.
   * @returns {{ active: boolean, phase: string, progress: number, aligned: boolean, pulse: number }}
   */
  getAlignmentState() {
    return {
      active: this._alignmentActive,
      phase: this._alignmentPhase,
      progress: this._alignmentProgress,
      aligned: (this._alignmentPhase === AlignmentPhase.ALIGNED ||
                this._alignmentPhase === AlignmentPhase.PULSE ||
                this._alignmentPhase === AlignmentPhase.REVEAL_HOLD),
      pulse: this._alignmentPulse
    };
  }

  /**
   * Returns whether the Three-Body alignment cinematic is currently active.
   * @returns {boolean}
   */
  isAlignmentActive() {
    return this._alignmentActive;
  }

  /**
   * Returns the dedicated Planet ↔ Star connection arc / beam object.
   * @returns {Line|null}
   */
  getPlanetStarConnection() {
    return this.ch1PlanetStarConnection || null;
  }

  /**
   * Returns the single synchronization wave mesh.
   * @returns {Mesh|null}
   */
  getSynchronizationWave() {
    return this.ch1SyncWave || null;
  }

  /**
   * Returns Our Planet's dedicated atmospheric aura mesh in Chapter 1.
   * @returns {Mesh|null}
   */
  getPlanetAura() {
    return this.ch1PlanetAura || null;
  }

  /**
   * Returns the radial energy rays line segment object in Chapter 1.
   * @returns {LineSegments|null}
   */
  getEnergyRays() {
    return this.ch1EnergyRays || null;
  }

  /**
   * Returns the world-space floating "STABLE STATE" text sprite (Sections 11-15).
   * @returns {Sprite|null}
   */
  getStableStateText() {
    return this.ch1StableStateText || null;
  }

  /**
   * Returns the preallocated cosmic glitter sparkles object around the text (Section 7).
   * @returns {Points|null}
   */
  getStableStateSparkles() {
    return this.ch1StableStateSparkles || null;
  }

  /**
   * Returns the travelling shimmer glint sprite across the text (Section 6).
   * @returns {Sprite|null}
   */
  getTextShimmerGlint() {
    return this.ch1TextShimmerGlint || null;
  }

  /**
   * Returns an inventory of all orbital and decorative line/ring objects and their active visibilities (Section 19).
   * @returns {{ hyperbolic: boolean, planetOrbit: boolean, perturberOrbit: boolean, planetStarConnection: boolean, syncWave: boolean, energyRays: boolean, stableStateText: boolean, stableStateSparkles: boolean, stableStateGlint: boolean }}
   */
  getOrbitalVisualInventory() {
    return {
      hyperbolic: Boolean(this.ch1HyperbolicLine?.visible && this.ch1HyperbolicLine?.material?.opacity > 0.01),
      planetOrbit: Boolean(this.ch1PlanetOrbitLine?.visible && this.ch1PlanetOrbitLine?.material?.opacity > 0.01),
      perturberOrbit: Boolean(this.ch1PerturberOrbitLine?.visible && this.ch1PerturberOrbitLine?.material?.opacity > 0.01),
      planetStarConnection: Boolean(this.ch1PlanetStarConnection?.visible && this.ch1PlanetStarConnection?.material?.opacity > 0.01),
      syncWave: Boolean(this.ch1SyncWave?.visible && this.ch1SyncWave?.material?.opacity > 0.01),
      energyRays: Boolean(this.ch1EnergyRays?.visible && this.ch1EnergyRays?.material?.opacity > 0.01),
      stableStateText: Boolean(this.ch1StableStateText?.visible && this.ch1StableStateText?.material?.opacity > 0.01),
      stableStateSparkles: Boolean(this.ch1StableStateSparkles?.visible && this.ch1StableStateSparkles?.material?.opacity > 0.01),
      stableStateGlint: Boolean(this.ch1TextShimmerGlint?.visible && this.ch1TextShimmerGlint?.material?.opacity > 0.01)
    };
  }

  /**
   * Returns detailed visual state snapshot for inspection, QA, and background quieting (Section 17).
   * @returns {Object}
   */
  getAlignmentVisualState() {
    const alignActive = this._alignmentActive;
    const phase = this._alignmentPhase;
    const progress = this._alignmentProgress;
    const pulse = this._alignmentPulse;

    return {
      active: alignActive,
      phase,
      progress,
      pulse,
      revealHold: (phase === AlignmentPhase.REVEAL_HOLD),
      stableStateVisible: Boolean(this.ch1StableStateText?.visible && this.ch1StableStateText?.material?.opacity > 0.05),
      stableStateOpacity: this.ch1StableStateText?.material?.opacity ?? 0.0,
      planetGlow: this.ch1PlanetAura?.material?.uniforms?.uAuraIntensity?.value ?? 0.0,
      auraScale: this.ch1PlanetAura?.scale?.x ?? 1.0,
      auraOpacity: this.ch1PlanetAura?.material?.uniforms?.uAuraOpacity?.value ?? 0.0,
      starGlow: this.ch1StarGlow?.material?.uniforms?.uBaseOpacity?.value ?? 0.20,
      secondaryGlow: this.ch1PerturberGlow?.material?.opacity ?? 0.12,
      orbitOpacity: this.ch1PlanetOrbitLine?.material?.opacity ?? 0.28,
      connectionOpacity: this.ch1PlanetStarConnection?.material?.opacity ?? 0.22,
      waveOpacity: this.ch1SyncWave?.material?.opacity ?? 0.0,
      waveScale: this.ch1SyncWave?.scale?.x ?? 0.0,
      raysVisible: Boolean(this.ch1EnergyRays?.visible)
    };
  }

  /**
   * Returns an immutable state snapshot for browser debugging and verification.
   * @returns {Readonly<Object>}
   */
  getState() {
    return Object.freeze({
      visible: this.group.visible,
      activeChapter: this.getChapter(),
      simTime: this.simTime,
      anchorPosition: { x: this.anchorPosition.x, y: this.anchorPosition.y, z: this.anchorPosition.z },
      orbitalState: this.getActiveOrbitalState(),
      maneuverStatus: this.getManeuverStatus(),
      rootName: this.group.name,
      parentName: this.group.parent?.name ?? 'none',
      catchResponseActive: this._catchResponseActive,
      catchResponseIntensity: this._catchResponseIntensity,
      catchResponseSurge: this._catchResponseSurge,
      alignmentState: this.getAlignmentState(),
      alignmentVisualState: this.getAlignmentVisualState(),
      orbitalInventory: this.getOrbitalVisualInventory()
    });
  }

  /**
   * Returns array of Chapter 2 concentric astrolabe rings.
   * @returns {LineLoop[]}
   */
  getCh2ConcentricRings() {
    return [this.ch2ConcentricRing1, this.ch2ConcentricRing2, this.ch2ConcentricRing3].filter(Boolean);
  }

  /**
   * Returns Chapter 2 cardinal crosshair axes.
   * @returns {LineSegments|null}
   */
  getCh2CardinalAxes() {
    return this.ch2CardinalAxes || null;
  }

  /**
   * Returns Chapter 2 inter-stellar energy bridge line.
   * @returns {Line|null}
   */
  getCh2StarBridge() {
    return this.ch2StarBridgeLine || null;
  }

  /**
   * Returns Chapter 2 three-body triad energy bridge line.
   * @returns {Line|null}
   */
  getCh2TriadBridge() {
    return this.ch2TriadBridgeLine || null;
  }

  /**
   * Returns Chapter 2 player planet atmospheric aura mesh.
   * @returns {Mesh|null}
   */
  getCh2PlanetAura() {
    return this.ch2PlanetAura || null;
  }

  /**
   * Binds or updates the PlanetoidRenderer reference.
   * @param {any} renderer
   */
  setPlanetoidRenderer(renderer) {
    this._planetoidRenderer = renderer || null;
  }

  /**
   * Returns whether Chapter 2 visual debug showcase mode is active.
   * @returns {boolean}
   */
  isChapter2DebugActive() {
    return Boolean(this._chapter2DebugMode);
  }

  /**
   * Suppresses the competing standalone foreground PlanetoidRenderer during Chapter 2.
   * Preserves PlanetoidRenderer if isDebugMode() is explicitly active.
   * @private
   */
  _suppressForegroundPlanet() {
    if (this._planetoidRenderer?.group) {
      // Respect explicit PlanetoidRenderer debug mode — do not suppress it
      if (!this._planetoidRenderer.isDebugMode?.()) {
        this._planetoidRenderer.group.visible = false;
      }
    }
    if (typeof window !== 'undefined') {
      if (window.planetoidRenderer?.group && !window.planetoidRenderer.isDebugMode?.()) {
        window.planetoidRenderer.group.visible = false;
      }
      if (window.celestialEnvironment?.planetoidRenderer?.group &&
          !window.celestialEnvironment.planetoidRenderer.isDebugMode?.()) {
        window.celestialEnvironment.planetoidRenderer.group.visible = false;
      }
    }
  }

  /**
   * Returns Chapter 2 sacred resonance filaments (4-petal rosette).
   * @returns {LineLoop|null}
   */
  getCh2ResonanceFilaments() {
    return this.ch2ResonanceFilaments || null;
  }

  /**
   * Returns Chapter 2 circumbinary orbital trail line.
   * @returns {LineLoop|null}
   */
  getCh2PlanetTrail() {
    return this.ch2PlanetTrailLine || null;
  }

  /**
   * Returns Chapter 2 traveling resonant highlights.
   * @returns {Points|null}
   */
  getCh2TravelingHighlights() {
    return this.ch2TravelingHighlights || null;
  }

  /**
   * Returns Chapter 2 secondary shockwave echo mesh.
   * @returns {Mesh|null}
   */
  getCh2ShockwaveEcho() {
    return this.ch2ShockwaveEchoMesh || null;
  }

  /**
   * Returns current effective orbital wobble amplitude.
   * @returns {number}
   */
  getCh2EffectiveWobble() {
    return this._ch2EffectiveWobble;
  }

  // ==========================================================================
  // 5. CHAPTER 2 BINARY RESONANCE DEBUG SHOWCASE (VISUAL QA CONTROLS)
  // ==========================================================================

  /**
   * Development-only: Directly sets and previews Chapter 2 Binary Resonance states for visual QA.
   * Preserves the three-body system relationship (Binary Star 1, Binary Star 2, Player Planet,
   * Barycenter, Resonant Geometry, Energy Bridge, Sacred Rosette, Particle Field, Harmonic Nodes, Shield).
   *
   * @param {string} stateKey - 'chaotic' | 'early' | 'mid' | 'near-lock' | 'locked'
   * @param {boolean} [stopPlay=true] - Whether to cancel active automated play sequence
   * @returns {boolean} Whether state was valid and applied
   */
  debugChapter2(stateKey, stopPlay = true) {
    if (stopPlay) {
      this.debugChapter2Stop();
    }

    const key = String(stateKey || '').toLowerCase().trim();

    let targetProgress = 0.0;
    let targetState = Ch2ResonanceState.CHAOTIC_CIRCUMBINARY;
    let isLocked = false;

    switch (key) {
      case 'chaotic':
        targetProgress = 0.0;
        targetState = Ch2ResonanceState.CHAOTIC_CIRCUMBINARY;
        isLocked = false;
        break;

      case 'early':
        targetProgress = 0.20;
        targetState = Ch2ResonanceState.CHAOTIC_CIRCUMBINARY;
        isLocked = false;
        break;

      case 'mid':
        targetProgress = 0.50;
        targetState = Ch2ResonanceState.RESONANCE_STABILIZATION;
        isLocked = false;
        break;

      case 'near-lock':
      case 'nearlock':
      case 'near_lock':
        targetProgress = 0.90;
        targetState = Ch2ResonanceState.RESONANCE_STABILIZATION;
        isLocked = false;
        break;

      case 'locked':
      case 'lock':
        targetProgress = 1.00;
        targetState = Ch2ResonanceState.RESONANCE_2_1;
        isLocked = true;
        break;

      default:
        console.warn(`[OrreryVisualSystem] Unknown Chapter 2 debug state: "${stateKey}". Valid: chaotic, early, mid, near-lock, locked`);
        return false;
    }

    if (!this._chapter2DebugMode) {
      this._chapter2PreDebugChapter = this.activeChapter;
      this._chapter2DebugMode = true;
    }

    // Isolate display to Chapter 2 group
    for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
      if (this.chapterGroups[ch]) {
        this.chapterGroups[ch].visible = (ch === 2);
      }
    }
    this._suppressForegroundPlanet();

    // Set internal resonance state
    this._resonanceProgress = targetProgress;
    this._ch2ResonanceState = targetState;

    if (isLocked) {
      this._resonanceLocked = true;
      this._resonanceLockedTriggered = true;
      this._resonanceLockedTime = 0.0;
      if (this.ch2ResonanceLockedText) {
        this.ch2ResonanceLockedText.visible = true;
      }
      this._ch2ShockwaveActive = true;
      this._ch2ShockwaveTriggered = true;
      this._ch2ShockwaveTime = 0.0;
      if (this.ch2ShockwaveMesh) {
        this.ch2ShockwaveMesh.visible = true;
        this.ch2ShockwaveMesh.scale.setScalar(0.20);
        if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.70;
      }
      if (this.ch2ShockwaveEchoMesh) {
        this.ch2ShockwaveEchoMesh.visible = false;
        if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
      }
    } else {
      this._resonanceLocked = false;
      this._resonanceLockedTriggered = false;
      this._resonanceLockedTime = 0.0;
      this._ch2ShockwaveActive = false;
      this._ch2ShockwaveTriggered = false;
      this._ch2ShockwaveTime = 0.0;
      if (this.ch2ShockwaveMesh) {
        this.ch2ShockwaveMesh.visible = false;
        if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.0;
      }
      if (this.ch2ShockwaveEchoMesh) {
        this.ch2ShockwaveEchoMesh.visible = false;
        if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
      }
      if (this.ch2ResonanceLockedText) {
        this.ch2ResonanceLockedText.visible = false;
        if (this.ch2ResonanceLockedText.material) this.ch2ResonanceLockedText.material.opacity = 0.0;
      }
    }

    // Immediately synchronize visual state (zero-heap)
    this._updateChapter2(0.001, 0, null, null);

    return true;
  }

  /**
   * Development-only: Resets the Chapter 2 Debug Showcase and completely restores baseline behavior.
   * @returns {boolean}
   */
  debugChapter2Reset() {
    this.debugChapter2Stop();
    this._chapter2DebugMode = false;

    // Reset Chapter 2 resonance state to normal baseline
    this._ch2ResonanceState = (this.activeChapter === 2)
      ? Ch2ResonanceState.CHAOTIC_CIRCUMBINARY
      : Ch2ResonanceState.IDLE;
    this._resonanceProgress = 0.0;
    this._resonanceLocked = false;
    this._resonanceLockedTriggered = false;
    this._resonanceLockedTime = 0.0;
    this._resonanceCompletionEmitted = false;
    this._ch2ShockwaveActive = false;
    this._ch2ShockwaveTriggered = false;
    this._ch2ShockwaveTime = 0.0;

    // Reset shockwaves & milestone text
    if (this.ch2ShockwaveMesh) {
      this.ch2ShockwaveMesh.visible = false;
      if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.0;
    }
    if (this.ch2ShockwaveEchoMesh) {
      this.ch2ShockwaveEchoMesh.visible = false;
      if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
    }
    if (this.ch2ResonanceLockedText) {
      this.ch2ResonanceLockedText.visible = false;
      if (this.ch2ResonanceLockedText.material) this.ch2ResonanceLockedText.material.opacity = 0.0;
    }

    // Reset mystical visual pass elements
    if (this.ch2ConcentricRing1?.material) {
      this.ch2ConcentricRing1.material.opacity = 0.0;
      this.ch2ConcentricRing1.visible = false;
    }
    if (this.ch2ConcentricRing2?.material) {
      this.ch2ConcentricRing2.material.opacity = 0.0;
      this.ch2ConcentricRing2.visible = false;
    }
    if (this.ch2ConcentricRing3?.material) {
      this.ch2ConcentricRing3.material.opacity = 0.0;
      this.ch2ConcentricRing3.visible = false;
    }
    if (this.ch2CardinalAxes?.material) {
      this.ch2CardinalAxes.material.opacity = 0.0;
      this.ch2CardinalAxes.visible = false;
    }
    if (this.ch2StarBridgeLine?.material) {
      this.ch2StarBridgeLine.material.opacity = 0.0;
      this.ch2StarBridgeLine.visible = false;
    }
    if (this.ch2TriadBridgeLine?.material) {
      this.ch2TriadBridgeLine.material.opacity = 0.0;
      this.ch2TriadBridgeLine.visible = false;
    }
    if (this.ch2PlanetAura) {
      this.ch2PlanetAura.scale.setScalar(1.25);
      if (this.ch2PlanetAura.material?.uniforms?.uBaseOpacity) {
        this.ch2PlanetAura.material.uniforms.uBaseOpacity.value = 0.20;
      }
    }
    if (this.ch2ResonanceFilaments?.material) {
      this.ch2ResonanceFilaments.material.opacity = 0.0;
      this.ch2ResonanceFilaments.visible = false;
    }
    if (this.ch2TravelingHighlights?.material) {
      this.ch2TravelingHighlights.material.opacity = 0.0;
      this.ch2TravelingHighlights.visible = false;
    }
    if (this.ch2ShieldRing?.material) {
      this.ch2ShieldRing.material.opacity = 0.0;
      this.ch2ShieldRing.visible = false;
    }
    if (this.ch2ParticleField?.material) {
      this.ch2ParticleField.material.opacity = 0.0;
      this.ch2ParticleField.visible = false;
    }
    if (this.ch2HarmonicNodes) {
      for (const node of this.ch2HarmonicNodes) {
        if (node?.material) {
          node.material.opacity = 0.0;
          node.visible = false;
        }
      }
    }
    if (this.ch2PlanetNode?.material?.uniforms?.uKintsugiGlow) {
      this.ch2PlanetNode.material.uniforms.uKintsugiGlow.value = 0.0;
    }

    // Restore chapter groups visibility and sync narrative director state
    this._syncFromDirector();

    if (this.activeChapter === 2) {
      this._updateChapter2(0.001, 0, null, null);
    } else if (this.activeChapter === 1) {
      this._updateChapter1(0.001, 0, null, null);
    }

    return true;
  }

  /**
   * Development-only: Returns the current Chapter 2 Debug Showcase inspection state snapshot.
   * @returns {Object}
   */
  getChapter2DebugState() {
    const ch2GroupVisible = Boolean(this.chapterGroups[2]?.visible);
    return {
      debugMode: Boolean(this._chapter2DebugMode),
      state: this._ch2ResonanceState,
      resonanceProgress: this._resonanceProgress,
      playerPlanetVisible: Boolean(this.ch2PlanetNode?.visible && ch2GroupVisible),
      binaryStarsVisible: Boolean(this.ch2Star1?.visible && this.ch2Star2?.visible && ch2GroupVisible),
      particleFieldVisible: Boolean(this.ch2ParticleField?.visible && ch2GroupVisible),
      harmonicNodesVisible: Boolean(this.ch2HarmonicNodes?.[0]?.visible && ch2GroupVisible),
      shieldVisible: Boolean(this.ch2ShieldRing?.visible && ch2GroupVisible),
      triadBridgeVisible: Boolean(this.ch2TriadBridgeLine?.visible && ch2GroupVisible),
      sacredRosetteVisible: Boolean(this.ch2ResonanceFilaments?.visible && ch2GroupVisible),
      planetAuraVisible: Boolean(this.ch2PlanetAura?.visible && ch2GroupVisible),
      shockwaveVisible: Boolean((this.ch2ShockwaveMesh?.visible || this.ch2ShockwaveEchoMesh?.visible) && ch2GroupVisible),
      resonanceLockedVisible: Boolean(this.ch2ResonanceLockedText?.visible && ch2GroupVisible)
    };
  }

  /**
   * Development-only: Automatically previews the full progression:
   * CHAOTIC (2.0s) -> EARLY (2.0s) -> MID (2.0s) -> NEAR LOCK (2.0s) -> LOCKED (3.5s).
   * Total sequence: ~11.5s. Remains in LOCKED at the end.
   * @returns {OrreryVisualSystem} this
   */
  debugChapter2Play() {
    this.debugChapter2Stop();
    this._chapter2DebugPlayActive = true;
    this._chapter2DebugPlayElapsed = 0.0;
    this._chapter2DebugPlayStep = -1;
    this.debugChapter2('chaotic', false);
    return this;
  }

  /**
   * Development-only: Stops any running automated Chapter 2 showcase sequence.
   * @returns {OrreryVisualSystem} this
   */
  debugChapter2Stop() {
    this._chapter2DebugPlayActive = false;
    this._chapter2DebugPlayElapsed = 0.0;
    this._chapter2DebugPlayStep = -1;
    return this;
  }

  /**
   * @private
   * Internal frame updater for automated showcase sequence.
   * @param {number} dt
   */
  _updateChapter2DebugPlay(dt) {
    if (!this._chapter2DebugPlayActive) return;

    this._chapter2DebugPlayElapsed += dt;
    const t = this._chapter2DebugPlayElapsed;

    if (t < 2.0) {
      if (this._chapter2DebugPlayStep !== 0) {
        this._chapter2DebugPlayStep = 0;
        this.debugChapter2('chaotic', false);
      }
    } else if (t < 4.0) {
      if (this._chapter2DebugPlayStep !== 1) {
        this._chapter2DebugPlayStep = 1;
        this.debugChapter2('early', false);
      }
    } else if (t < 6.0) {
      if (this._chapter2DebugPlayStep !== 2) {
        this._chapter2DebugPlayStep = 2;
        this.debugChapter2('mid', false);
      }
    } else if (t < 8.0) {
      if (this._chapter2DebugPlayStep !== 3) {
        this._chapter2DebugPlayStep = 3;
        this.debugChapter2('near-lock', false);
      }
    } else {
      if (this._chapter2DebugPlayStep !== 4) {
        this._chapter2DebugPlayStep = 4;
        this.debugChapter2('locked', false);
      }
      if (t >= 11.5) {
        this._chapter2DebugPlayActive = false;
      }
    }
  }

  /**
   * Resets simulation time, catch response, alignment state, and aligns to NarrativeDirector state.
   * @returns {OrreryVisualSystem} this
   */
  reset() {
    this.debugChapter2Stop();
    this._chapter2DebugMode = false;
    this.simTime = 0.0;
    this._catchResponseActive = false;
    this._catchResponseTime = 0.0;
    this._catchResponseIntensity = 0.0;
    this._catchResponseSurge = 0.0;

    this._alignmentActive = false;
    this._alignmentTime = 0.0;
    this._alignmentPhase = AlignmentPhase.IDLE;
    this._alignmentIntensity = 1.0;
    this._alignmentProgress = 0.0;
    this._alignmentPulse = 0.0;

    // Phase 3A: Reset chapter transition state
    this._chapterTransitionState = ChapterTransitionState.IDLE;
    this._chapterTransitionTime = 0.0;
    this._chapterTransitionProgress = 0.0;
    this._transitionFromChapter = 1;
    this._transitionToChapter = 2;

    // Restore chapter groups visibility (Chapter 1 visible, 2..5 hidden)
    if (this.chapterGroups[1]) this.chapterGroups[1].visible = true;
    for (let ch = 2; ch <= TOTAL_CHAPTERS; ch++) {
      if (this.chapterGroups[ch]) this.chapterGroups[ch].visible = false;
    }

    // Restore Chapter 1 bodies, positions, and opacities
    if (this.ch1PlanetNode) {
      this.ch1PlanetNode.visible = true;
      this.ch1PlanetNode.scale.setScalar(0.18);
    }
    if (this.ch1PrimaryStar) {
      this.ch1PrimaryStar.visible = true;
      this.ch1PrimaryStar.position.set(0.0, 0.0, 0.0);
      if (this.ch1PrimaryStar.material) this.ch1PrimaryStar.material.opacity = 0.90;
    }
    if (this.ch1StarGlow?.material?.uniforms?.uBaseOpacity) {
      this.ch1StarGlow.material.uniforms.uBaseOpacity.value = 0.20;
    }
    if (this.ch1Perturber) {
      this.ch1Perturber.visible = true;
      if (this.ch1Perturber.material) this.ch1Perturber.material.opacity = 0.90;
    }
    if (this.ch1PerturberGlow?.material?.uniforms?.uBaseOpacity) {
      this.ch1PerturberGlow.material.uniforms.uBaseOpacity.value = 0.18;
    }

    if (this.ch1SyncWave) {
      this.ch1SyncWave.visible = false;
      this.ch1SyncWave.scale.setScalar(0.20);
      if (this.ch1SyncWave.material) {
        this.ch1SyncWave.material.opacity = 0.0;
      }
    }

    if (this.ch1EnergyRays) {
      this.ch1EnergyRays.visible = false;
      this.ch1EnergyRays.scale.setScalar(0.90);
      if (this.ch1EnergyRays.material) {
        this.ch1EnergyRays.material.opacity = 0.0;
      }
    }

    if (this.ch1StableStateText) {
      this.ch1StableStateText.visible = false;
      this.ch1StableStateText.scale.set(0.88, 0.22, 1.0);
      this.ch1StableStateText.position.set(-0.924, 0.62, 0.0);
      if (this.ch1StableStateText.material) {
        this.ch1StableStateText.material.opacity = 0.0;
      }
    }

    if (this.ch1TextShimmerGlint) {
      this.ch1TextShimmerGlint.visible = false;
      this.ch1TextShimmerGlint.position.set(-0.924, 0.62, 0.01);
      this.ch1TextShimmerGlint.scale.set(0.16, 0.16, 1.0);
      if (this.ch1TextShimmerGlint.material) {
        this.ch1TextShimmerGlint.material.opacity = 0.0;
      }
    }

    if (this.ch1StableStateSparkles) {
      this.ch1StableStateSparkles.visible = false;
      this.ch1StableStateSparkles.position.set(-0.924, 0.62, 0.0);
      this.ch1StableStateSparkles.scale.setScalar(1.0);
      if (this.ch1StableStateSparkles.material) {
        this.ch1StableStateSparkles.material.opacity = 0.0;
      }
    }

    if (this.ch1PlanetAura) {
      this.ch1PlanetAura.scale.setScalar(1.08);
      if (this.ch1PlanetAura.material?.uniforms) {
        this.ch1PlanetAura.material.uniforms.uAuraIntensity.value = 1.0;
        this.ch1PlanetAura.material.uniforms.uAuraOpacity.value = 0.22;
      }
    }

    // Restore original bound orbit positions if modified by straight alignment beam
    if (this._boundOrbitPositions && this.ch1BoundOrbitLine?.geometry?.attributes?.position) {
      const posAttr = this.ch1BoundOrbitLine.geometry.attributes.position;
      posAttr.array.set(this._boundOrbitPositions);
      posAttr.needsUpdate = true;
    }

    if (this.ch1HyperbolicLine) {
      this.ch1HyperbolicLine.visible = true;
      if (this.ch1HyperbolicLine.material) this.ch1HyperbolicLine.material.opacity = 0.22;
    }
    if (this.ch1PlanetOrbitLine) {
      this.ch1PlanetOrbitLine.visible = true;
      if (this.ch1PlanetOrbitLine.material) this.ch1PlanetOrbitLine.material.opacity = 0.28;
    }
    if (this.ch1PerturberOrbitLine) {
      this.ch1PerturberOrbitLine.visible = true;
      if (this.ch1PerturberOrbitLine.material) this.ch1PerturberOrbitLine.material.opacity = 0.22;
    }
    if (this.ch1BoundOrbitLine) {
      this.ch1BoundOrbitLine.visible = true;
      if (this.ch1BoundOrbitLine.material) this.ch1BoundOrbitLine.material.opacity = 0.40;
    }

    // Phase 3B: Reset Chapter 2 resonance state machine
    this._ch2ResonanceState = Ch2ResonanceState.IDLE;
    this._resonanceProgress = 0.0;
    this._resonanceLocked = false;
    this._resonanceLockedTriggered = false;
    this._resonanceLockedTime = 0.0;
    this._ch2EffectiveWobble = 0.0;

    if (this.ch2ResonanceLockedText) {
      this.ch2ResonanceLockedText.visible = false;
      if (this.ch2ResonanceLockedText.material) this.ch2ResonanceLockedText.material.opacity = 0.0;
    }

    if (this.ch2HarmonicNodes) {
      for (const nodeM of this.ch2HarmonicNodes) {
        if (nodeM?.material) {
          nodeM.material.opacity = 0.0;
          nodeM.visible = false;
        }
      }
    }

    // Phase 3C: Reset Chapter 2 FX (particles, shockwave, shield)
    this._ch2ShockwaveActive = false;
    this._ch2ShockwaveTriggered = false;
    this._ch2ShockwaveTime = 0.0;

    if (this.ch2ParticleField) {
      this.ch2ParticleField.visible = false;
      if (this.ch2ParticleField.material) this.ch2ParticleField.material.opacity = 0.0;
    }

    if (this.ch2ShockwaveMesh) {
      this.ch2ShockwaveMesh.visible = false;
      this.ch2ShockwaveMesh.scale.setScalar(0.20);
      if (this.ch2ShockwaveMesh.material) this.ch2ShockwaveMesh.material.opacity = 0.0;
    }

    if (this.ch2ShieldRing) {
      this.ch2ShieldRing.visible = false;
      this.ch2ShieldRing.scale.set(1.0, 1.0, 1.0);
      if (this.ch2ShieldRing.material) this.ch2ShieldRing.material.opacity = 0.0;
    }

    // Mystical Visual Pass: Reset Chapter 2 visual pass elements
    if (this.ch2ConcentricRing1?.material) {
      this.ch2ConcentricRing1.material.opacity = 0.0;
      this.ch2ConcentricRing1.visible = false;
    }
    if (this.ch2ConcentricRing2?.material) {
      this.ch2ConcentricRing2.material.opacity = 0.0;
      this.ch2ConcentricRing2.visible = false;
    }
    if (this.ch2ConcentricRing3?.material) {
      this.ch2ConcentricRing3.material.opacity = 0.0;
      this.ch2ConcentricRing3.visible = false;
    }
    if (this.ch2CardinalAxes?.material) {
      this.ch2CardinalAxes.material.opacity = 0.0;
      this.ch2CardinalAxes.visible = false;
    }
    if (this.ch2StarBridgeLine?.material) {
      this.ch2StarBridgeLine.material.opacity = 0.0;
      this.ch2StarBridgeLine.visible = false;
    }
    if (this.ch2TriadBridgeLine?.material) {
      this.ch2TriadBridgeLine.material.opacity = 0.0;
      this.ch2TriadBridgeLine.visible = false;
    }
    if (this.ch2PlanetAura) {
      this.ch2PlanetAura.scale.setScalar(1.25);
      if (this.ch2PlanetAura.material?.uniforms?.uBaseOpacity) {
        this.ch2PlanetAura.material.uniforms.uBaseOpacity.value = 0.20;
      }
    }
    if (this.ch2ResonanceFilaments?.material) {
      this.ch2ResonanceFilaments.material.opacity = 0.0;
      this.ch2ResonanceFilaments.visible = false;
    }
    if (this.ch2PlanetTrailLine?.material) {
      this.ch2PlanetTrailLine.material.opacity = 0.25;
      this.ch2PlanetTrailLine.visible = false;
    }
    if (this.ch2TravelingHighlights?.material) {
      this.ch2TravelingHighlights.material.opacity = 0.0;
      this.ch2TravelingHighlights.visible = false;
    }
    if (this.ch2ShockwaveEchoMesh) {
      this.ch2ShockwaveEchoMesh.visible = false;
      this.ch2ShockwaveEchoMesh.scale.setScalar(0.20);
      if (this.ch2ShockwaveEchoMesh.material) this.ch2ShockwaveEchoMesh.material.opacity = 0.0;
    }

    // Restore Chapter 2 visual baseline
    if (this.ch2PlanetNode) {
      this.ch2PlanetNode.visible = false;
      this.ch2PlanetNode.scale.setScalar(0.18);
      if (this.ch2PlanetNode.material?.uniforms) {
        this.ch2PlanetNode.material.uniforms.uVisualStage.value = 2.0;
        this.ch2PlanetNode.material.uniforms.uAwakeningProgress.value = 1.0;
        this.ch2PlanetNode.material.uniforms.uTransformationProgress.value = 0.0;
        this.ch2PlanetNode.material.uniforms.uKintsugiGlow.value = 0.0;
        this.ch2PlanetNode.material.uniforms.uOceanFill.value = 0.0;
        this.ch2PlanetNode.material.uniforms.uAtmosphereDensity.value = 0.0;
        this.ch2PlanetNode.material.uniforms.uShieldCharge.value = 0.0;
        this.ch2PlanetNode.material.uniforms.uGoldIgnited.value = 0.0;
      }
    }
    if (this.ch2ResonantRing?.material) this.ch2ResonantRing.material.opacity = 0.70;
    if (this.ch2InnerOrbitLine?.material) this.ch2InnerOrbitLine.material.opacity = 0.35;
    if (this.ch2Star1?.material) this.ch2Star1.material.opacity = 0.95;
    if (this.ch2Star2?.material) this.ch2Star2.material.opacity = 0.95;
    if (this.ch2Star1Glow?.material?.uniforms?.uBaseOpacity) this.ch2Star1Glow.material.uniforms.uBaseOpacity.value = 0.22;
    if (this.ch2Star2Glow?.material?.uniforms?.uBaseOpacity) this.ch2Star2Glow.material.uniforms.uBaseOpacity.value = 0.22;

    // Phase 4A: Reset Chapter 2 completion and Chapter 3 visual baseline
    this._resonanceCompletionEmitted = false;
    if (this.ch3PlanetNode) {
      this.ch3PlanetNode.visible = false;
      this.ch3PlanetNode.scale.setScalar(0.18);
      if (this.ch3PlanetNode.material?.uniforms) {
        this.ch3PlanetNode.material.uniforms.uVisualStage.value = 3.0;
        this.ch3PlanetNode.material.uniforms.uAwakeningProgress.value = 1.0;
        this.ch3PlanetNode.material.uniforms.uTransformationProgress.value = 0.0;
        this.ch3PlanetNode.material.uniforms.uKintsugiGlow.value = 0.0;
        this.ch3PlanetNode.material.uniforms.uOceanFill.value = 1.0;
        this.ch3PlanetNode.material.uniforms.uAtmosphereDensity.value = 0.0;
        this.ch3PlanetNode.material.uniforms.uShieldCharge.value = 0.0;
        this.ch3PlanetNode.material.uniforms.uGoldIgnited.value = 0.0;
      }
    }
    if (this.ch3Primary?.material) this.ch3Primary.material.opacity = 0.92;
    if (this.ch3FlybyWorld?.material) this.ch3FlybyWorld.material.opacity = 0.90;
    if (this.ch3TransferLine?.material) this.ch3TransferLine.material.opacity = 0.75;
    if (this.ch3OuterOrbitLine?.material) this.ch3OuterOrbitLine.material.opacity = 0.45;

    // Reset visual stage back to Stage 1 baseline
    this.visualStage = 1.0;
    this.awakeningProgress = 0.0;
    if (this.ch1PlanetNode?.material?.uniforms) {
      this.ch1PlanetNode.material.uniforms.uVisualStage.value = 1.0;
      this.ch1PlanetNode.material.uniforms.uAwakeningProgress.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uTransformationProgress.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uKintsugiGlow.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uOceanFill.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uAtmosphereDensity.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uShieldCharge.value = 0.0;
      this.ch1PlanetNode.material.uniforms.uGoldIgnited.value = 0.0;
    }

    this._syncFromDirector();
    return this;
  }

  /**
   * Disposes all owned geometries, materials, event listeners, and removes root from parent.
   */
  destroy() {
    this.debugChapter2Stop();
    this._chapter2DebugMode = false;

    if (typeof window !== 'undefined' && window.orreryVisualSystem === this) {
      window.orreryVisualSystem = null;
    }

    // Unsubscribe from EventBus
    if (Array.isArray(this._unsubs)) {
      for (const unsub of this._unsubs) {
        if (typeof unsub === 'function') {
          try {
            unsub();
          } catch {
            // Safe teardown
          }
        }
      }
      this._unsubs = [];
    }

    // Remove root from parent scene graph
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }

    // Dispose owned geometries
    for (const geom of this._geometries) {
      geom?.dispose?.();
    }
    this._geometries = [];

    // Dispose owned materials
    for (const mat of this._materials) {
      mat?.dispose?.();
    }
    this._materials = [];

    // Dispose owned textures
    if (Array.isArray(this._textures)) {
      for (const tex of this._textures) {
        tex?.dispose?.();
      }
      this._textures = [];
    }

    this.ch1PlanetGeom = null;
    this.ch1PlanetMaterial = null;
    this.ch1PlanetNode = null;
    this.ch1PlanetAura = null;
    this.ch1StarGeom = null;
    this.ch1PrimaryStar = null;
    this.ch1StarGlow = null;
    this.ch1PerturberGeom = null;
    this.ch1Perturber = null;
    this.ch1PerturberGlow = null;
    this.ch1PlanetOrbitLine = null;
    this.ch1PerturberOrbitLine = null;
    this.ch1PlanetStarConnection = null;
    this.ch1BoundOrbitLine = null;
    this.ch1SyncWave = null;
    this.ch1EnergyRays = null;
    this.ch1StableStateText = null;
    this.ch1TextShimmerGlint = null;
    this.ch1StableStateSparkles = null;
    this._boundOrbitPositions = null;

    // Chapter 2 teardown references
    this.ch2PlanetGeom = null;
    this.ch2PlanetMaterial = null;
    this.ch2PlanetNode = null;
    this.ch2Barycenter = null;
    this.ch2Star1 = null;
    this.ch2Star1Glow = null;
    this.ch2Star2 = null;
    this.ch2Star2Glow = null;
    this.ch2InnerOrbitLine = null;
    this.ch2ResonantRing = null;

    // Phase 3B teardown
    this.ch2HarmonicNodes = null;
    this.ch2ResonanceLockedText = null;

    // Phase 3C teardown
    this.ch2ParticleField = null;
    this.ch2ShockwaveMesh = null;
    this.ch2ShieldRing = null;
    this._ch2ParticleData = null;
    this._tempMatrix = null;

    // Mystical Visual Pass teardown
    this.ch2ConcentricRing1 = null;
    this.ch2ConcentricRing2 = null;
    this.ch2ConcentricRing3 = null;
    this.ch2CardinalAxes = null;
    this.ch2StarBridgeLine = null;
    this.ch2TriadBridgeLine = null;
    this.ch2PlanetAura = null;
    this.ch2ResonanceFilaments = null;
    this.ch2PlanetTrailLine = null;
    this.ch2TravelingHighlights = null;
    this.ch2ShockwaveEchoMesh = null;
    this._ch2StarBridgePositions = null;
    this._ch2TriadBridgePositions = null;
    this._ch2FilamentPositions = null;
    this._planetoidRenderer = null;
    this._ch2TrailPositions = null;
    this._ch2HighlightPositions = null;

    // Phase 4A: Chapter 3 teardown references
    this.ch3PlanetGeom = null;
    this.ch3PlanetMaterial = null;
    this.ch3PlanetNode = null;
    this.ch3Primary = null;
    this.ch3FlybyWorld = null;
    this.ch3TransferLine = null;
    this.ch3OuterOrbitLine = null;
  }

  /**
   * Alias for destroy().
   */
  dispose() {
    this.destroy();
  }
}

export default OrreryVisualSystem;
