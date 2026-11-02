/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Mission & Physics Configuration
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Centralized, immutable configuration parameters governing:
 * 1. Mission Chapter Energy Thresholds & Pacing (Agreed with Person A)
 * 2. Cadence Timing Targets & Tolerances (Agreed with Person A)
 * 3. Normalized Astronomical Coordinate Scales & Sky Frustum Offsets (Agreed with Person C)
 * 4. Fixed Physics Accumulator & Adaptive RK4 Substepping Limits
 * 5. Persistent Planet Visual Evolution Target States across the 5 cosmic epochs
 *
 * ZERO dependencies on Three.js, WebXR, or DOM APIs. Pure, deterministic, and testable.
 */

import { CupKey, TrickType } from '../contracts/Interfaces.js';

// ============================================================================
// 1. MISSION CHAPTER THRESHOLDS
// ============================================================================

/**
 * Agreed chapter energy thresholds targeting a 3–4 minute run.
 * Each catch yields between 20 (base assisted) and 50 (max clean streak + cadence) energy.
 * Average catch yields ~35 energy.
 */
export const MISSION_THRESHOLDS = Object.freeze({
  CHAPTER_1: 400,   // Gravitational Capture (~11-13 catches)
  CHAPTER_2: 1000,  // Binary Resonance (~17-20 catches)
  CHAPTER_3: 1700,  // The Slingshot (~20 catches)
  FINALE: 2200      // Calibration Climax & Kintsugi Gold Ignition (~14-16 catches)
});

// ============================================================================
// 2. CADENCE CONFIGURATION (Shared between Persons A & B)
// ============================================================================

/**
 * Rhythm cadence timing targets and tolerance window.
 * Base cadence per trick: 1.5s to 2.0s, with a +/-0.35s tolerance window.
 */
export const CADENCE_CONFIG = Object.freeze({
  TARGET_INTERVAL: 1.75, // Midpoint of 1.5s - 2.0s
  WINDOW_TOLERANCE: 0.35,
  MIN_CADENCE: 1.5,
  MAX_CADENCE: 2.0
});

/**
 * Detailed scoring balance parameters confirmed with Person A (ScoreManager).
 * Strictly bounds energy to 20 - 50 per catch.
 */
export const SCORING_CONFIG = Object.freeze({
  BASE_ENERGY: 20,
  CLEAN_MULTIPLIER: 1.4,
  ASSISTED_MULTIPLIER: 1.0,
  STREAK_BONUS_PER_STEP: 0.15,
  MAX_STREAK_STEPS: 5,
  CADENCE_BONUS_MULTIPLIER: 1.25,
  MAX_TOTAL_MULTIPLIER: 2.5,
  CADENCE_TOLERANCE_SEC: CADENCE_CONFIG.WINDOW_TOLERANCE,
  FLIGHT_CYCLE_SEC: 0.84,
  EXPECTED_CATCH_INTERVAL_MIN_SEC: CADENCE_CONFIG.MIN_CADENCE,
  EXPECTED_CATCH_INTERVAL_MAX_SEC: CADENCE_CONFIG.MAX_CADENCE
});

// ============================================================================
// 3. WORLD SCALE & SKY FRUSTUM (Confirmed with Person C)
// ============================================================================

/**
 * Cosmic rendering scale and sky view origin offset.
 * Physics runs in normalized astronomical simulation units (G = 1, unit masses M ≈ 1, separation r ≈ 1 to 2).
 * WORLD_SCALE: 10.0 (1.0 sim unit = 10.0 VR meters in the sky view) as a rendering-only scalar.
 */
export const COSMIC_SCALE = Object.freeze({
  WORLD_SCALE: 10.0, // 1 sim unit = 10.0 visual meters in VR sky
  SKY_ORIGIN: Object.freeze({ x: 0.0, y: 1.2, z: -3.5 })
});

/**
 * Backward-compatible alias for world rendering configuration.
 */
export const WORLD_CONFIG = Object.freeze({
  SIM_GRAVITATIONAL_CONSTANT: 1.0,
  SOFTENING_PARAM_SQ: 0.04,
  WORLD_SCALE: COSMIC_SCALE.WORLD_SCALE,
  SKY_VIEW_OFFSET: COSMIC_SCALE.SKY_ORIGIN
});

// ============================================================================
// 4. PHYSICS TIMESTEP & INTEGRATION
// ============================================================================

/**
 * Fixed physics timestep parameters for 120 Hz fixed accumulator stability on Quest.
 */
export const PHYSICS_TIMESTEP = Object.freeze({
  FIXED_DELTA: 1 / 120, // 120 Hz fixed accumulator for Quest stability (~8.33ms)
  MAX_ACCUMULATED_FRAMES: 5,
  DEFAULT_SOFTENING: 0.05,
  valueOf() { return this.FIXED_DELTA; }
});

export const MAX_ACCUMULATED_FRAMES = 5;
export const MAX_DELTA_TIME = 0.05;

/**
 * Adaptive substepping limits for RK4 numerical integration.
 */
export const INTEGRATION_CONFIG = Object.freeze({
  PHYSICS_TIMESTEP: PHYSICS_TIMESTEP.FIXED_DELTA,
  MAX_ACCUMULATED_FRAMES: PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES,
  MAX_DELTA_TIME,
  DEFAULT_SUBSTEPS: 1,
  CLOSE_APPROACH_SUBSTEPS: 4,
  EXTREME_PROXIMITY_SUBSTEPS: 12,
  CLOSE_APPROACH_DIST_SQ: 1.0,
  EXTREME_PROXIMITY_DIST_SQ: 0.25
});

// ============================================================================
// 5. CHAPTER METADATA CONFIGURATION
// ============================================================================

/**
 * Canonical chapter configurations mapping the 5 cosmic epochs.
 */
export const CHAPTER_CONFIG = Object.freeze({
  1: Object.freeze({
    name: 'Gravitational Capture',
    threshold: MISSION_THRESHOLDS.CHAPTER_1,
    targetCup: 'big',
    trick: 'single',
    metric: 'kintsugiVeinGlow',
    chapter: 1,
    title: 'Gravitational Capture',
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_1,
    cadenceSec: 2.0,
    allowedTricks: Object.freeze([TrickType.SINGLE]),
    defaultCupKey: CupKey.BIG,
    description: 'Establish rhythm on the Big Cup (Ozara) to bind the rogue planet.',
    intervention: Object.freeze({
      type: 'IMPULSE_BURN',
      targetBodyId: 'planet',
      deltaV: Object.freeze({ x: 0.0, y: -0.22, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 0.8,
      kintsugiVeinGlow: 0.8,
      atmosphereDensity: 0.0,
      oceanFill: 0.0,
      oceanFillLevel: 0.0,
      ringAlpha: 0.0,
      ringFormationAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false,
      isGoldIgnited: false
    })
  }),

  2: Object.freeze({
    name: 'Binary Resonance',
    threshold: MISSION_THRESHOLDS.CHAPTER_2,
    targetCup: 'small',
    trick: 'alternate',
    metric: 'atmosphereDensity',
    chapter: 2,
    title: 'The Three-Body Dance',
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_2,
    cadenceSec: 1.75,
    allowedTricks: Object.freeze([TrickType.ALTERNATE]),
    defaultCupKey: CupKey.BIG,
    description: 'Alternate transfers between Big Cup and Small Cup (Kozara).',
    intervention: Object.freeze({
      type: 'CIRCUMBINARY_RESONANCE',
      targetBodyId: 'planet',
      deltaV: Object.freeze({ x: 0.15, y: 0.05, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      kintsugiVeinGlow: 1.0,
      atmosphereDensity: 0.5,
      oceanFill: 0.0,
      oceanFillLevel: 0.0,
      ringAlpha: 0.0,
      ringFormationAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false,
      isGoldIgnited: false
    })
  }),

  3: Object.freeze({
    name: 'The Slingshot',
    threshold: MISSION_THRESHOLDS.CHAPTER_3,
    targetCup: 'base',
    trick: 'around',
    metric: 'oceanFillLevel',
    chapter: 3,
    title: 'Gravitational Slingshot',
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_3,
    cadenceSec: 1.8,
    allowedTricks: Object.freeze([TrickType.SINGLE, TrickType.ALTERNATE, TrickType.AROUND]),
    defaultCupKey: CupKey.BASE,
    description: 'Inverted kendama catches on the Base Cup (Chuzara) for slingshot assist.',
    intervention: Object.freeze({
      type: 'GRAVITY_ASSIST',
      targetBodyId: 'planet',
      deltaV: Object.freeze({ x: -0.12, y: 0.28, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      kintsugiVeinGlow: 1.0,
      atmosphereDensity: 0.9,
      oceanFill: 0.85,
      oceanFillLevel: 0.85,
      ringAlpha: 0.0,
      ringFormationAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false,
      isGoldIgnited: false
    })
  }),

  4: Object.freeze({
    name: 'Calibration Climax',
    threshold: MISSION_THRESHOLDS.FINALE,
    targetCup: 'spike',
    trick: 'spike',
    metric: 'isGoldIgnited',
    chapter: 4,
    title: 'The Sanctuary Climax',
    targetEnergy: MISSION_THRESHOLDS.FINALE,
    cadenceSec: 1.6,
    allowedTricks: Object.freeze([TrickType.AROUND, TrickType.SPIKE]),
    defaultCupKey: CupKey.SPIKE,
    description: 'Execute the Tomeken Spike catch to activate the planetary deflector shield.',
    intervention: Object.freeze({
      type: 'DEFLECTOR_IGNITION',
      targetBodyId: 'planet',
      deltaV: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      kintsugiVeinGlow: 1.0,
      atmosphereDensity: 1.0,
      oceanFill: 1.0,
      oceanFillLevel: 1.0,
      ringAlpha: 0.95,
      ringFormationAlpha: 0.95,
      shieldCharge: 1.0,
      goldIgnited: true,
      isGoldIgnited: true
    })
  })
});

/** Backward-compatibility alias */
export const CHAPTER_CONFIGS = CHAPTER_CONFIG;

// ============================================================================
// 6. HELPER FUNCTIONS
// ============================================================================

/**
 * Returns the active chapter index (1-4) corresponding to a given cosmic energy amount.
 *
 * @param {number} cosmicEnergy
 * @returns {number} Active chapter number (1 to 4)
 */
export function getChapterByEnergy(cosmicEnergy) {
  if (cosmicEnergy >= MISSION_THRESHOLDS.FINALE) return 4;
  if (cosmicEnergy >= MISSION_THRESHOLDS.CHAPTER_3) return 4;
  if (cosmicEnergy >= MISSION_THRESHOLDS.CHAPTER_2) return 3;
  if (cosmicEnergy >= MISSION_THRESHOLDS.CHAPTER_1) return 2;
  return 1;
}

/**
 * Helper to fetch chapter configuration safely.
 *
 * @param {number} chapterNum
 * @returns {typeof CHAPTER_CONFIG[1]}
 */
export function getChapterConfig(chapterNum) {
  const clamped = Math.max(1, Math.min(4, Math.floor(chapterNum)));
  return CHAPTER_CONFIG[clamped];
}
