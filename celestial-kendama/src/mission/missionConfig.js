/**
 * ============================================================================
 * Celestial Kendama - Mission & Physics Configuration
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Centralized, immutable configuration parameters governing:
 * 1. Mission Chapter Energy Thresholds & Pacing (Agreed with Person A)
 * 2. Trick Sequences & Cadence Windows (Agreed with Person A)
 * 3. Normalized Astronomical Coordinate Scales & Sky Frustum Offsets (Agreed with Person C)
 * 4. Adaptive RK4 Integrator Substepping Thresholds
 * 5. Persistent Planet Visual Evolution Target States
 *
 * ZERO dependencies on Three.js, WebXR, or DOM APIs. Pure and deterministic.
 */

import { CupKey, TrickType } from '../contracts/Interfaces.js';

/**
 * Agreed chapter energy thresholds targeting a 3–4 minute run.
 * Each catch yields between 20 (base assisted) and 50 (max clean streak + cadence) energy.
 * Average catch yields ~35 energy.
 */
export const MISSION_THRESHOLDS = Object.freeze({
  CHAPTER_1: 400,   // Gravitational Capture (~11-13 catches)
  CHAPTER_2: 1000,  // The Three-Body Dance (~17-20 catches)
  CHAPTER_3: 1700,  // Gravitational Slingshot (~20 catches)
  FINALE: 2200      // Supernova Climax & Kintsugi Gold Ignition (~14-16 catches)
});

/**
 * Scoring and Cadence configuration shared with Person A (ScoreManager).
 */
export const SCORING_CONFIG = Object.freeze({
  BASE_ENERGY: 20,
  CLEAN_MULTIPLIER: 1.4,
  ASSISTED_MULTIPLIER: 1.0,
  STREAK_BONUS_PER_STEP: 0.15,
  MAX_STREAK_STEPS: 5,
  CADENCE_BONUS_MULTIPLIER: 1.25,
  MAX_TOTAL_MULTIPLIER: 2.5,
  CADENCE_TOLERANCE_SEC: 0.35,
  FLIGHT_CYCLE_SEC: 0.84,
  EXPECTED_CATCH_INTERVAL_MIN_SEC: 1.5,
  EXPECTED_CATCH_INTERVAL_MAX_SEC: 2.0
});

/**
 * World coordinate transformation and astronomical scale scalars shared with Person C.
 * Normalized sim units: G = 1.0, unit stellar masses ~ 1.0, separation ~ 1.0 to 2.0.
 */
export const WORLD_CONFIG = Object.freeze({
  /** Gravitational constant for the normalized N-body simulation */
  SIM_GRAVITATIONAL_CONSTANT: 1.0,
  
  /** Softening parameter squared (epsilon^2) to prevent singularity / infinite force */
  SOFTENING_PARAM_SQ: 0.04,
  
  /** Rendering scalar: 1.0 simulation unit = 10.0 VR meters in the celestial skybox */
  WORLD_SCALE: 10.0,
  
  /** Center offset of celestial sky view in player's upper forward viewing frustum */
  SKY_VIEW_OFFSET: Object.freeze({
    x: 0.0,
    y: 1.2,
    z: -3.5
  })
});

/**
 * Fixed physics integration timestep: 1/120s = 0.008333s (~8.33ms)
 */
export const PHYSICS_TIMESTEP = 1 / 120;

/**
 * Maximum accumulated frames processed in a single render tick to prevent spiral of death.
 */
export const MAX_ACCUMULATED_FRAMES = 5;

/**
 * Maximum delta time per frame to prevent simulation explosion after pauses.
 */
export const MAX_DELTA_TIME = 0.05;

/**
 * Adaptive substepping limits for RK4 numerical integration.
 * Prevents numerical instability and energy drift during close stellar encounters.
 */
export const INTEGRATION_CONFIG = Object.freeze({
  PHYSICS_TIMESTEP,
  MAX_ACCUMULATED_FRAMES,
  MAX_DELTA_TIME,
  DEFAULT_SUBSTEPS: 1,
  CLOSE_APPROACH_SUBSTEPS: 4,
  EXTREME_PROXIMITY_SUBSTEPS: 12,
  
  /** Squared distance threshold below which substeps increase to 4 */
  CLOSE_APPROACH_DIST_SQ: 1.0,
  
  /** Squared distance threshold below which substeps increase to 12 */
  EXTREME_PROXIMITY_DIST_SQ: 0.25
});

/**
 * Detailed configuration for each chapter in the 5-epoch planetary voyage.
 */
export const CHAPTER_CONFIGS = Object.freeze({
  1: Object.freeze({
    chapter: 1,
    title: "Gravitational Capture",
    subtitle: "The Lost Planet",
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_1,
    cadenceSec: 2.0,
    allowedTricks: Object.freeze([TrickType.SINGLE]),
    defaultCupKey: CupKey.BIG,
    description: "Establish rhythm on the Big Cup (Ozara) to bind the rogue planet.",
    intervention: Object.freeze({
      type: "IMPULSE_BURN",
      targetBodyId: "planet",
      deltaV: Object.freeze({ x: 0.0, y: -0.22, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 0.8,
      atmosphereDensity: 0.0,
      oceanFill: 0.0,
      ringAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false
    })
  }),

  2: Object.freeze({
    chapter: 2,
    title: "The Three-Body Dance",
    subtitle: "A World in Chaos",
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_2,
    cadenceSec: 1.75,
    allowedTricks: Object.freeze([TrickType.ALTERNATE]),
    defaultCupKey: CupKey.BIG,
    description: "Alternate transfers between Big Cup and Small Cup (Kozara).",
    intervention: Object.freeze({
      type: "CIRCUMBINARY_RESONANCE",
      targetBodyId: "planet",
      deltaV: Object.freeze({ x: 0.15, y: 0.05, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      atmosphereDensity: 0.5,
      oceanFill: 0.0,
      ringAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false
    })
  }),

  3: Object.freeze({
    chapter: 3,
    title: "Gravitational Slingshot",
    subtitle: "The Great Migration",
    targetEnergy: MISSION_THRESHOLDS.CHAPTER_3,
    cadenceSec: 1.8,
    allowedTricks: Object.freeze([TrickType.SINGLE, TrickType.ALTERNATE]),
    defaultCupKey: CupKey.BASE,
    description: "Inverted kendama catches on the Base Cup (Chuzara) for slingshot assist.",
    intervention: Object.freeze({
      type: "GRAVITY_ASSIST",
      targetBodyId: "planet",
      deltaV: Object.freeze({ x: -0.12, y: 0.28, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      atmosphereDensity: 0.9,
      oceanFill: 0.85,
      ringAlpha: 0.0,
      shieldCharge: 0.0,
      goldIgnited: false
    })
  }),

  4: Object.freeze({
    chapter: 4,
    title: "The Sanctuary Climax",
    subtitle: "The Protected World",
    targetEnergy: MISSION_THRESHOLDS.FINALE,
    cadenceSec: 1.6,
    allowedTricks: Object.freeze([TrickType.AROUND, TrickType.SPIKE]),
    defaultCupKey: CupKey.SPIKE,
    description: "Execute the Tomeken Spike catch to activate the planetary deflector shield.",
    intervention: Object.freeze({
      type: "DEFLECTOR_IGNITION",
      targetBodyId: "planet",
      deltaV: Object.freeze({ x: 0.0, y: 0.0, z: 0.0 })
    }),
    planetEvolution: Object.freeze({
      kintsugiGlow: 1.0,
      atmosphereDensity: 1.0,
      oceanFill: 1.0,
      ringAlpha: 0.95,
      shieldCharge: 1.0,
      goldIgnited: true
    })
  })
});

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
 * @returns {typeof CHAPTER_CONFIGS[1]}
 */
export function getChapterConfig(chapterNum) {
  const clamped = Math.max(1, Math.min(4, Math.floor(chapterNum)));
  return CHAPTER_CONFIGS[clamped];
}
