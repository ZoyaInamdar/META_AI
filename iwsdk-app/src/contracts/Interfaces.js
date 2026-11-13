/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Authoritative Data Contracts & Architectural Interfaces
 * Single Source of Truth for Cross-Subsystem Communication
 * ============================================================================
 *
 * Ownership & Governance:
 * - /src/contracts/ is co-owned by @PERSON_A, @PERSON_B, and @PERSON_C.
 * - Contract changes require sign-off from all subsystem leads.
 * - Any modification requires notifying all three developers on the same day.
 */

// ============================================================================
// 1. CANONICAL ENUMS & CONSTANTS
// ============================================================================

/**
 * Shared event symbols used across the EventBus.
 * Facilitates decoupled communication between Person A, Person B, and Person C.
 */
export const Events = Object.freeze({
  SCORE: 'score',     // Emitted by Person A on valid scored catch
  MISS: 'miss',       // Emitted by Person A on drop/miss
  CATCH: 'catch',     // Emitted by Person A on raw spatial contact
  BALL: 'ball',       // Emitted by Person A on ball trajectory update (BallState)
  CADENCE: 'cadence', // Emitted by Person B to notify Person A of rhythm target
  TARGET: 'target',   // Emitted by Person B to notify Person A & C of active target
  MISSION: 'mission', // Emitted by Person B on mission/chapter progression
  PHYSICS: 'physics', // Emitted by Person B on N-body orbital step
  PLANET: 'planet',   // Emitted by Person B on planetary evolution state change
  BURN_START: 'burn_start', // Emitted by Person B on capture burn initiation
  BURN_END: 'burn_end',     // Emitted by Person B on capture burn completion
  EVOLUTION_PROGRESS: 'planet:evolution-progress', // Emitted on planet evolution progression update
  STAGE_READY: 'planet:stage-ready',               // Emitted when stage evolution reaches 100% (ready to transform)
  STAGE_COMPLETED: 'planet:stage-completed',       // Emitted when stage transformation commits
  TRANSFORMATION_STARTED: 'planet:transformation-started',   // Emitted when cinematic transformation begins
  TRANSFORMATION_PHASE: 'planet:transformation-phase',       // Emitted when cinematic phase transitions
  TRANSFORMATION_COMPLETED: 'planet:transformation-completed', // Emitted when cinematic transformation completes
  ORRERY_CHAPTER_CHANGED: 'orrery:chapter-changed',           // Emitted on cosmic narrative chapter advancement
  ORRERY_ALIGNMENT_COMPLETED: 'orrery:alignment-completed',   // Emitted when Chapter 1 Three-Body syzygy alignment cinematic completes
  ORRERY_RESONANCE_COMPLETED: 'orrery:resonance-completed'    // Emitted when Chapter 2 Binary Resonance locks and milestone finishes
});

/**
 * Canonical cup keys for Kendama target identification.
 * Standardized across input detection (Person A), sequence logic (Person B),
 * and 3D visual rendering (Person C).
 */
export const CupKey = Object.freeze({
  BIG: 'big',
  SMALL: 'small',
  BASE: 'base',
  SPIKE: 'spike'
});

/**
 * Backward-compatibility alias for CupKey
 */
export const TargetCup = CupKey;

/**
 * Canonical trick classification types spanning the 5 cosmic epochs.
 * Owned & emitted by Person B (TrickSequencer).
 */
export const TrickType = Object.freeze({
  SINGLE: 'single',       // Ch 1: Big Cup rhythm
  ALTERNATE: 'alternate', // Ch 2: Ozara <-> Kozara transfers
  AROUND: 'around',       // Ch 3/4: Around the World multi-axis sequence
  SPIKE: 'spike'          // Ch 5: Tomeken precision alignment catch
});

/**
 * Strict spatial contact classification outcomes.
 */
export const CatchType = Object.freeze({
  CLEAN: 'CLEAN',
  ASSISTED: 'ASSISTED',
  MISS: 'MISS',
  NONE: 'NONE'
});

/**
 * Ball flight state modes.
 */
export const BallMode = Object.freeze({
  SEATED: 'seated',
  AIR: 'air',
  CATCHING: 'catching'
});

// ============================================================================
// 2. TARGET STATE CONTRACT
// ============================================================================

/**
 * TargetState Contract
 *
 * Ownership & Usage:
 * - Owned & Emitted by: Person B (`TrickSequencer` / `MissionController`)
 * - Consumed by Person A: Evaluates catches against active target cup only;
 *   catches in non-target cups fall through to MISS.
 * - Consumed by Person C: Positions the glowing halo indicator on the active cup mesh
 *   (using rimRadius from cupConfigs.js, or cleanRadius * 1.5 for spike).
 */
export class TargetState {
  /**
   * @param {'big' | 'small' | 'base' | 'spike'} [cupKey=CupKey.BIG] - Canonical cup target key
   * @param {'single' | 'alternate' | 'around' | 'spike'} [trick=TrickType.SINGLE] - Active trick type
   * @param {number} [sequenceIndex=0] - Monotonically increasing sequence step counter
   */
  constructor(cupKey = CupKey.BIG, trick = TrickType.SINGLE, sequenceIndex = 0) {
    this.cupKey = cupKey;               // 'big' | 'small' | 'base' | 'spike'
    this.trick = trick;                 // 'single' | 'alternate' | 'around' | 'spike'
    this.sequenceIndex = sequenceIndex; // integer counter from 0
  }

  /**
   * Backward-compatible alias for targetCup
   */
  get targetCup() {
    return this.cupKey;
  }
}

// ============================================================================
// 3. BALL STATE CONTRACT
// ============================================================================

/**
 * BallState Contract
 *
 * Ownership & Usage:
 * - Owned & Emitted by: Person A (`BallTrajectory` / `CatchFlow`)
 * - Consumed by Person B & C: Reads position and velocity for simulation feedback
 *   and rendering the handheld world.
 */
export class BallState {
  /**
   * @param {{x: number, y: number, z: number}|Array<number>} [position={ x: 0, y: 0, z: 0 }]
   * @param {{x: number, y: number, z: number}|Array<number>} [velocity={ x: 0, y: 0, z: 0 }]
   * @param {'seated'|'air'|'catching'} [mode='seated']
   */
  constructor(
    position = { x: 0, y: 0, z: 0 },
    velocity = { x: 0, y: 0, z: 0 },
    mode = 'seated'
  ) {
    this.position = position;
    this.velocity = velocity;
    this.mode = mode;
  }
}

// ============================================================================
// 4. INPUT & CATCH RESULT CONTRACTS
// ============================================================================

/**
 * KendamaInputState: Decouples raw tracking from amplified gameplay rotation.
 * Owned by Person A.
 */
export class KendamaInputState {
  constructor({
    rawWristPose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    gameplayKenPose = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    linearVelocity = [0, 0, 0],
    isTrackingValid = false,
    trackingConfidence = 1.0
  } = {}) {
    this.rawWristPose = rawWristPose;
    this.gameplayKenPose = gameplayKenPose;
    this.linearVelocity = linearVelocity;
    this.isTrackingValid = isTrackingValid;
    this.trackingConfidence = trackingConfidence;
  }
}

/**
 * CatchResult: Strict spatial evaluation of contact event.
 * Owned by Person A.
 */
export class CatchResult {
  constructor({
    type = CatchType.NONE,
    cupKey = 'none',
    distance = 0.0,
    relativeSpeed = 0.0,
    alignmentDot = 0.0,
    timestamp = 0.0
  } = {}) {
    this.type = type;
    this.cupKey = cupKey;
    this.distance = distance;
    this.relativeSpeed = relativeSpeed;
    this.alignmentDot = alignmentDot;
    this.timestamp = timestamp;
  }
}

// ============================================================================
// 5. SCORE EVENT CONTRACT
// ============================================================================

/**
 * ScoreEvent: Unique event ID preventing race-condition multi-awards.
 * Owned & Emitted by Person A (`ScoreManager`). Consumed by Person B & Person C.
 */
export class ScoreEvent {
  /**
   * Supports both positional signature:
   *   new ScoreEvent(eventId, catchType, awardedEnergy, streak)
   * and options object signature:
   *   new ScoreEvent({ eventId, catchType, baseEnergy, multipliers, awardedEnergy, totalEnergy, currentStreak })
   */
  constructor(eventIdOrOptions = '', catchType = CatchType.NONE, awardedEnergy = 0, streak = 0) {
    if (typeof eventIdOrOptions === 'object' && eventIdOrOptions !== null) {
      const opts = eventIdOrOptions;
      this.eventId = opts.eventId ?? '';
      this.catchType = opts.catchType ?? CatchType.NONE;
      this.baseEnergy = opts.baseEnergy ?? 20;
      this.multipliers = {
        accuracy: opts.multipliers?.accuracy ?? 1.0,
        cadence: opts.multipliers?.cadence ?? 1.0,
        streak: opts.multipliers?.streak ?? 1.0,
        total: opts.multipliers?.total ?? 1.0
      };
      this.awardedEnergy = opts.awardedEnergy ?? 0;
      this.totalEnergy = opts.totalEnergy ?? 0;
      this.currentStreak = opts.currentStreak ?? opts.streak ?? 0;
      this.streak = this.currentStreak;
    } else {
      this.eventId = eventIdOrOptions;
      this.catchType = catchType;
      this.baseEnergy = 20;
      this.multipliers = { accuracy: 1.0, cadence: 1.0, streak: 1.0, total: 1.0 };
      this.awardedEnergy = awardedEnergy;
      this.totalEnergy = awardedEnergy;
      this.currentStreak = streak;
      this.streak = streak;
    }
  }
}

// ============================================================================
// 6. MISSION & PLANET EVOLUTION CONTRACTS
// ============================================================================

/**
 * MissionState: State of the 5-chapter planetary voyage.
 * Owned & Emitted by Person B (`MissionController`). Consumed by Persons A & C.
 */
export class MissionState {
  constructor(options = {}) {
    this.chapter = options.chapter ?? 1;
    this.cosmicEnergy = options.cosmicEnergy ?? 0;
    this.targetEnergy = options.targetEnergy ?? options.chapterTargetEnergy ?? 100;
    this.chapterTargetEnergy = this.targetEnergy;
    this.milestoneReached = options.milestoneReached ?? options.milestoneUnlocked ?? false;
    this.milestoneUnlocked = this.milestoneReached;
    this.activeIntervention = options.activeIntervention ?? null;
  }
}

/**
 * PlanetState: Evolution variables shared by handheld ball and skyward world.
 * Owned & Emitted by Person B (`MissionController`). Consumed by Person C (Rendering)
 * and Person A (Haptic / visual feedback).
 */
export class PlanetState {
  constructor(options = {}) {
    this.kintsugiGlow = options.kintsugiGlow ?? options.kintsugiVeinGlow ?? 0.0;
    this.kintsugiVeinGlow = this.kintsugiGlow;
    this.atmosphereDensity = options.atmosphereDensity ?? 0.0;
    this.oceanFill = options.oceanFill ?? options.oceanFillLevel ?? 0.0;
    this.oceanFillLevel = this.oceanFill;
    this.ringAlpha = options.ringAlpha ?? options.ringFormationAlpha ?? 0.0;
    this.ringFormationAlpha = this.ringAlpha;
    this.shieldCharge = options.shieldCharge ?? 0.0;
    this.scarsCount = options.scarsCount ?? options.scars ?? 0;
    this.scars = this.scarsCount;
    this.goldIgnited = options.goldIgnited ?? options.isGoldIgnited ?? false;
    this.isGoldIgnited = this.goldIgnited;
  }
}

// ============================================================================
// 7. PHYSICS & ORBITAL ENGINE CONTRACTS
// ============================================================================

/**
 * PhysicsState: Internal data of the N-body gravitational simulation.
 * Owned & Emitted by Person B (`OrbitalEngine`). Consumed by Person C.
 */
export class PhysicsState {
  constructor(options = {}) {
    this.simTime = options.simTime ?? options.simulationTime ?? 0.0;
    this.simulationTime = this.simTime;
    this.substeps = options.substeps ?? options.substepCount ?? 1;
    this.substepCount = this.substeps;
    this.bodies = options.bodies ?? [];
  }
}

/**
 * BurnState: Tracks active retrograde capture burn progress and thrust vector.
 * Owned & Emitted by Person B (`CaptureBurn`). Consumed by Person C for VFX/SFX.
 */
export class BurnState {
  constructor(options = {}) {
    this.isActive = options.isActive ?? false;      // true while burn is firing
    this.elapsed = options.elapsed ?? 0.0;        // seconds into burn [0.0, 1.0]
    this.duration = options.duration ?? 1.0;       // fixed 1.0s
    this.progress = options.progress ?? 0.0;       // normalized [0.0, 1.0]
    this.thrustVector = options.thrustVector ?? { x: 0.0, y: 0.0, z: 0.0 }; // normalized direction
  }
}
