// src/contracts/Interfaces.js

/**
 * Shared event symbols used across the EventBus.
 */
export const Events = Object.freeze({
  SCORE: 'score',
  MISS: 'miss',
  CATCH: 'catch',
  BALL: 'ball',
  CADENCE: 'cadence',
  TARGET: 'target',
  MISSION: 'mission',
  PHYSICS: 'physics',
  PLANET: 'planet'
});

/**
 * Canonical cup keys for kendama target identification.
 */
export const CupKey = Object.freeze({
  BIG: 'big',
  SMALL: 'small',
  BASE: 'base',
  SPIKE: 'spike'
});

// Backward-compatibility alias
export const TargetCup = CupKey;

/**
 * Canonical trick types used in progression sequences.
 */
export const TrickType = Object.freeze({
  SINGLE: 'single',
  ALTERNATE: 'alternate',
  AROUND: 'around',
  SPIKE: 'spike'
});

/**
 * Spatial evaluation contact outcomes.
 */
export const CatchType = Object.freeze({
  CLEAN: 'CLEAN',
  ASSISTED: 'ASSISTED',
  MISS: 'MISS',
  NONE: 'NONE'
});

/**
 * TargetState
 * Owned & emitted by: Person B (TrickSequencer.js / MissionController.js)
 * Consumed by: Person A (evaluates catch against target cup only)
 *              and Person C (renders glowing halo indicator on target cup)
 */
export class TargetState {
  /**
   * @param {string} [cupKey=CupKey.BIG] - 'big' | 'small' | 'base' | 'spike'
   * @param {string} [trick=TrickType.SINGLE] - 'single' | 'alternate' | 'around' | 'spike'
   * @param {number} [sequenceIndex=0] - integer counter from 0
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

/**
 * BallState
 * Owned & emitted by: Person A (Hands / BallTrajectory)
 * Consumed by: Person C (visual kendama ball)
 */
export class BallState {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.mode = 'seated'; // 'seated' | 'air' | 'catching'
  }
}

/**
 * ScoreEvent
 * Owned & emitted by: Person A (ScoreManager.js)
 * Consumed by: Person B (MissionController.js) and Person C (HUD / Audio)
 */
export class ScoreEvent {
  constructor(eventId, catchType, awardedEnergy = 0, streak = 0) {
    this.eventId = eventId;
    this.catchType = catchType;
    this.awardedEnergy = awardedEnergy;
    this.streak = streak;
  }
}

/**
 * PhysicsState
 * Owned & emitted by: Person B (OrbitalEngine.js)
 * Consumed by: Person C (celestial skyward world renderer)
 */
export class PhysicsState {
  constructor() {
    this.simTime = 0.0;
    this.substeps = 1;
    this.bodies = [];
  }
}

/**
 * MissionState
 * Owned & emitted by: Person B (MissionController.js)
 * Consumed by: Person C (HUD banner, chapter progression)
 */
export class MissionState {
  constructor() {
    this.chapter = 1;
    this.cosmicEnergy = 0;
    this.targetEnergy = 100;
    this.milestoneReached = false;
  }
}

/**
 * PlanetState
 * Owned & emitted by: Person B (MissionController.js)
 * Consumed by: Person C (shader materials, dual planet visuals)
 */
export class PlanetState {
  constructor() {
    this.kintsugiGlow = 0.0;
    this.atmosphereDensity = 0.0;
    this.oceanFill = 0.0;
    this.ringAlpha = 0.0;
    this.shieldCharge = 0.0;
    this.scarsCount = 0;
    this.goldIgnited = false;
  }
}