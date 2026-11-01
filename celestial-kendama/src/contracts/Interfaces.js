// src/contracts/Interfaces.js

/**
 * Shared event symbols used across the EventBus.
 */
export const Events = {
  SCORE: 'score',
  MISS: 'miss',
  CATCH: 'catch',
  CADENCE: 'cadence',
  TARGET: 'target',
  MISSION: 'mission',
  PHYSICS: 'physics',
  PLANET: 'planet'
};

export const CatchType = {
  CLEAN: 'CLEAN',
  ASSISTED: 'ASSISTED',
  MISS: 'MISS',
  NONE: 'NONE'
};

export const TargetCup = {
  BIG: 'big',
  SMALL: 'small',
  BASE: 'base',
  SPIKE: 'spike'
};

/**
 * TargetState
 * Owned & emitted by: Person B (TrickSequencer.js / MissionController.js)
 * Consumed by: Person A (trick sequence matching) and Person C (glowing cup ring renderer)
 */
export class TargetState {
  /**
   * @param {string} [cupKey='big'] - 'big' | 'small' | 'base' | 'spike'
   * @param {string} [trick='single'] - 'single' | 'alternate' | 'around' | 'spike'
   * @param {number} [sequenceIndex=0] - Integer counter
   */
  constructor(cupKey = 'big', trick = 'single', sequenceIndex = 0) {
    this.cupKey = cupKey;
    this.trick = trick;
    this.sequenceIndex = sequenceIndex;
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
 * Owned & emitted by: Person A
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
 * Owned & emitted by: Person A
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
 * Owned & emitted by: Person B
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
 * Owned & emitted by: Person B
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
 * Owned & emitted by: Person B to Person C
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