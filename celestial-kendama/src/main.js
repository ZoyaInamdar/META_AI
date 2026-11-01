// src/main.js

/**
 * ============================================================================
 * Celestial Kendama - Deterministic Main Pipeline & Integration Bridge
 * Role: Person B (The Physics & Mission Lead, Owner of main.js)
 * ============================================================================
 *
 * Enforces the strict 6-stage frame execution sequence agreed with Person A and Person C:
 *
 *   [Stage 1: Hand / Fake Input]
 *             │
 *   [Stage 2: Trajectory & Catch Detection (Person A)]
 *             │
 *   [Stage 3: Scoring / Multipliers (Person A)]
 *             │
 *   [Stage 4: Mission Logic & State Easing (Person B)]
 *             │
 *   [Stage 5: Physics Accumulator (Fixed Timestep 1/120s - Person B)]
 *             │
 *   [Stage 6: Render & Audio (Person C)]
 *
 * Key Invariants:
 * 1. Synchronous Intra-Frame Flushing: Events emitted in Stages 2 & 3 (BALL -> CATCH -> SCORE)
 *    are consumed and resolved within Stage 4 of the exact same frame.
 * 2. CATCH is always evaluated and applied prior to SCORE in Stage 4.
 * 3. Fixed Timestep Physics: Orbital physics advances strictly in multiples of 1/120s (8.33ms),
 *    clamped against accumulator spiral of death (MAX_ACCUMULATED_FRAMES = 5, MAX_DELTA_TIME = 0.05s).
 * 4. Read-Only Handoff: Person C consumes read-only snapshots in Stage 6 without mutating simulation state.
 */

import * as THREE from 'three';
import {
  Events,
  TargetState,
  PhysicsState,
  MissionState,
  PlanetState,
  BallState
} from './contracts/Interfaces.js';
import { eventBus } from './contracts/EventBus.js';
import {
  PHYSICS_TIMESTEP,
  MAX_ACCUMULATED_FRAMES,
  MAX_DELTA_TIME
} from './mission/missionConfig.js';

// ============================================================================
// 1. CANONICAL SHARED OBJECTS & GLOBAL STATE HOLDERS
// ============================================================================

/** Canonical THREE.Group for the kendama handle (Ken) in world space */
export const gameplayKenGroup = new THREE.Group();
gameplayKenGroup.name = 'CanonicalGameplayKenGroup';

/** Persistent global state instances */
export const currentTargetState = new TargetState();
export const currentPhysicsState = new PhysicsState();
export const currentMissionState = new MissionState();
export const currentPlanetState = new PlanetState();
export const currentBallState = new BallState();

// Intra-frame event queue buffers for guaranteed CATCH -> SCORE processing in Stage 4
const frameEventQueue = {
  catches: [],
  scores: [],
  misses: []
};

const onCatchEvent = (payload) => {
  frameEventQueue.catches.push(payload);
};

const onScoreEvent = (payload) => {
  frameEventQueue.scores.push(payload);
};

const onMissEvent = (payload) => {
  frameEventQueue.misses.push(payload);
};

/**
 * Ensures intra-frame queue listeners are attached to eventBus.
 */
export function registerFrameListeners() {
  eventBus.off(Events.CATCH, onCatchEvent);
  eventBus.off(Events.SCORE, onScoreEvent);
  eventBus.off(Events.MISS, onMissEvent);

  eventBus.on(Events.CATCH, onCatchEvent);
  eventBus.on(Events.SCORE, onScoreEvent);
  eventBus.on(Events.MISS, onMissEvent);
}

// Initial registration
registerFrameListeners();

// ============================================================================
// 2. DEFAULT SUBSYSTEM STUBS (Clean fallbacks before full implementation)
// ============================================================================

export const defaultInputSystem = {
  gameplayKenGroup: new THREE.Group(),
  update(_dt) {
    // Default stub: identity transform
  }
};

export const defaultCatchDetector = {
  update(_dt, _kenGroup) {
    // Default stub: emit seated ball state
    eventBus.emit(Events.BALL, currentBallState);
  }
};

export const defaultScoreManager = {
  update() {
    // Default stub: no-op
  }
};

export const defaultMissionController = {
  update(_dt) {
    // Default stub: updates milestoneReached if target energy attained
    if (currentMissionState.cosmicEnergy >= currentMissionState.targetEnergy) {
      currentMissionState.milestoneReached = true;
    }
  }
};

export const defaultOrbitalEngine = {
  step(fixedDt) {
    currentPhysicsState.simTime += fixedDt;
  }
};

export const defaultWorldRenderer = {
  render(_physicsState, _missionState, _planetState, _targetState, _ballState) {
    // Default stub: no-op render
  }
};

// Active subsystem instances (can be overridden by setSubsystems or tests)
let activeSubsystems = {
  inputSystem: defaultInputSystem,
  catchDetector: defaultCatchDetector,
  scoreManager: defaultScoreManager,
  missionController: defaultMissionController,
  orbitalEngine: defaultOrbitalEngine,
  worldRenderer: defaultWorldRenderer
};

/**
 * Dependency injection helper to register real subsystems or test mocks.
 * @param {Partial<typeof activeSubsystems>} overrides
 */
export function setSubsystems(overrides) {
  activeSubsystems = { ...activeSubsystems, ...overrides };
}

/**
 * Access currently active subsystems.
 */
export function getSubsystems() {
  return activeSubsystems;
}

// ============================================================================
// 3. FIXED TIMESTEP PHYSICS ACCUMULATOR
// ============================================================================

let physicsAccumulator = 0.0;
let lastFrameTimestamp = null;
let animationFrameId = null;

export function getAccumulator() {
  return physicsAccumulator;
}

export function resetAccumulator() {
  physicsAccumulator = 0.0;
}

// ============================================================================
// 4. DETERMINISTIC 6-STAGE FRAME DISPATCH PIPELINE
// ============================================================================

/**
 * Executes a single deterministic frame through all 6 sequential stages.
 *
 * @param {number} timestamp - Performance timestamp in milliseconds
 * @param {any} [frame=null] - XRFrame if running in WebXR session
 * @param {number} [manualDelta=null] - Optional delta in seconds for headless testing
 * @returns {{ dtClamped: number, physicsSubSteps: number }} Frame execution telemetry
 */
export function tick(timestamp, frame = null, manualDelta = null) {
  // Compute frame delta
  let rawDelta = 0.0;
  if (typeof manualDelta === 'number') {
    rawDelta = manualDelta;
  } else if (lastFrameTimestamp !== null) {
    rawDelta = (timestamp - lastFrameTimestamp) / 1000.0;
  }
  lastFrameTimestamp = timestamp;

  // Clamp delta time to 50ms (0.05s) to prevent simulation explosions on tab switch/pauses
  const dtClamped = Math.min(Math.max(0.0, rawDelta), MAX_DELTA_TIME);

  // --------------------------------------------------------------------------
  // STAGE 1: Hand / Fake Input Update
  // --------------------------------------------------------------------------
  if (activeSubsystems.inputSystem) {
    activeSubsystems.inputSystem.update(dtClamped, frame);

    // Synchronize to the canonical gameplayKenGroup
    if (activeSubsystems.inputSystem.gameplayKenGroup) {
      gameplayKenGroup.position.copy(activeSubsystems.inputSystem.gameplayKenGroup.position);
      gameplayKenGroup.quaternion.copy(activeSubsystems.inputSystem.gameplayKenGroup.quaternion);
    }
  }
  gameplayKenGroup.updateMatrixWorld(true);

  // --------------------------------------------------------------------------
  // STAGE 2: Trajectory & Catch Detection (Person A)
  // --------------------------------------------------------------------------
  if (activeSubsystems.catchDetector) {
    activeSubsystems.catchDetector.update(dtClamped, gameplayKenGroup);
  }

  // --------------------------------------------------------------------------
  // STAGE 3: Scoring & Cadence Multipliers (Person A)
  // --------------------------------------------------------------------------
  if (activeSubsystems.scoreManager) {
    activeSubsystems.scoreManager.update();
  }

  // --------------------------------------------------------------------------
  // STAGE 4: Mission Logic & State Easing (Person B)
  // --------------------------------------------------------------------------
  // Guaranteed Invariant: Process all buffered CATCH events BEFORE SCORE/MISS events
  if (frameEventQueue.catches.length > 0) {
    for (const catchEvt of frameEventQueue.catches) {
      if (activeSubsystems.missionController && typeof activeSubsystems.missionController.onCatch === 'function') {
        activeSubsystems.missionController.onCatch(catchEvt);
      }
    }
    frameEventQueue.catches.length = 0;
  }

  if (frameEventQueue.scores.length > 0) {
    for (const scoreEvt of frameEventQueue.scores) {
      currentMissionState.cosmicEnergy = scoreEvt.totalEnergy ?? (currentMissionState.cosmicEnergy + (scoreEvt.awardedEnergy || 0));
      if (activeSubsystems.missionController && typeof activeSubsystems.missionController.onScore === 'function') {
        activeSubsystems.missionController.onScore(scoreEvt);
      }
    }
    frameEventQueue.scores.length = 0;
  }

  if (frameEventQueue.misses.length > 0) {
    for (const missEvt of frameEventQueue.misses) {
      currentPlanetState.scarsCount += 1;
      if (activeSubsystems.missionController && typeof activeSubsystems.missionController.onMiss === 'function') {
        activeSubsystems.missionController.onMiss(missEvt);
      }
    }
    frameEventQueue.misses.length = 0;
  }

  if (activeSubsystems.missionController) {
    activeSubsystems.missionController.update(dtClamped);
  }

  // --------------------------------------------------------------------------
  // STAGE 5: Physics Accumulator (Fixed Timestep 1/120s - Person B)
  // --------------------------------------------------------------------------
  physicsAccumulator += dtClamped;
  let physicsSubSteps = 0;

  if (activeSubsystems.orbitalEngine) {
    while (physicsAccumulator >= PHYSICS_TIMESTEP && physicsSubSteps < MAX_ACCUMULATED_FRAMES) {
      activeSubsystems.orbitalEngine.step(PHYSICS_TIMESTEP);
      physicsAccumulator -= PHYSICS_TIMESTEP;
      physicsSubSteps++;
    }

    // Accumulator spiral-of-death guard
    if (physicsSubSteps >= MAX_ACCUMULATED_FRAMES) {
      physicsAccumulator = 0.0;
    }
  }

  // --------------------------------------------------------------------------
  // STAGE 6: Render & Audio (Person C)
  // --------------------------------------------------------------------------
  if (activeSubsystems.worldRenderer) {
    // Provide read-only state snapshots to the renderer
    activeSubsystems.worldRenderer.render(
      currentPhysicsState,
      currentMissionState,
      currentPlanetState,
      currentTargetState,
      currentBallState
    );
  }

  return { dtClamped, physicsSubSteps };
}

// ============================================================================
// 5. BOOTLOADER & INITIALIZATION
// ============================================================================

/**
 * Initializes and starts the main application loop.
 *
 * @param {HTMLElement} [container]
 * @returns {{ stop: Function, tick: Function, getSubsystems: Function }}
 */
export function initGame(container = null) {
  console.log("Celestial Kendama — Deterministic Pipeline Initialized");

  resetAccumulator();
  lastFrameTimestamp = null;

  // Run in browser requestAnimationFrame if window is available
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    const loop = (timestamp) => {
      tick(timestamp);
      animationFrameId = window.requestAnimationFrame(loop);
    };
    animationFrameId = window.requestAnimationFrame(loop);
  }

  return {
    stop() {
      if (animationFrameId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    tick,
    getSubsystems
  };
}

// Automatically boot if in browser runtime
if (typeof window !== 'undefined') {
  initGame();
}
