/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Deterministic Main Pipeline & Physics Accumulator
 * Role: Person B (Physics & Mission Lead / Owner of main.js)
 * ============================================================================
 *
 * Enforces the strict 6-stage frame execution order agreed across Persons A, B, and C:
 *
 *   [1. Hand / Fake Input]
 *             │
 *   [2. Trajectory & Catch Detection (Person A)]  --> Emits BALL, CATCH
 *             │
 *   [3. Scoring / Multipliers (Person A)]         --> Emits SCORE or MISS
 *             │
 *   [4. Mission Logic & State Easing (Person B)]  --> Flushes events, advances energy/chapter, emits TARGET, PLANET
 *             │
 *   [5. Physics Accumulator (Fixed Timestep - B)] --> 120 Hz fixed RK4 steps (multiples of 1/120s)
 *             │
 *   [6. Render & Audio (Person C)]                --> Read-only snapshot consumption
 *
 * Operational & Timing Invariants:
 * - Variable render dt clamped to MAX_DELTA_TIME (0.05s).
 * - Fixed physics timestep accumulator: steps orbitalEngine in exact 1/120s (8.33ms) increments.
 * - Accumulator spiral protection: capped at MAX_ACCUMULATED_FRAMES (5 steps).
 * - Intra-frame synchronous event dispatch: CATCH is always evaluated before SCORE within the same tick.
 * - Person C receives strictly read-only snapshots of all state contracts.
 */

import {
  Events,
  CupKey,
  TrickType,
  CatchType,
  BallMode,
  TargetState,
  BallState,
  ScoreEvent,
  MissionState,
  PlanetState,
  PhysicsState,
  CatchResult
} from './contracts/Interfaces.js';

import { EventBus, eventBus as defaultEventBus } from './contracts/EventBus.js';

import {
  PHYSICS_TIMESTEP,
  MAX_ACCUMULATED_FRAMES,
  MAX_DELTA_TIME,
  MISSION_THRESHOLDS,
  CHAPTER_CONFIG,
  CADENCE_CONFIG,
  getChapterConfig
} from './mission/missionConfig.js';

import { KendamaXRSystem } from './game/KendamaXRSystem.js';

// Safe dynamic Three.js loading supporting both browser/bundler and Node headless test runtimes
let THREE = globalThis.THREE;
if (!THREE) {
  try {
    const core = await import('@iwsdk/core');
    THREE = core.THREE || core;
  } catch {
    try {
      THREE = await import('three');
    } catch {
      // Fallback handled by MockGroup below
    }
  }
}

/**
 * Lightweight Three.js Group fallback for pure Node.js headless testing.
 */
export class MockGroup {
  constructor() {
    this.position = {
      x: 0, y: 0, z: 0,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
      copy(p) { this.x = p.x ?? 0; this.y = p.y ?? 0; this.z = p.z ?? 0; return this; }
    };
    this.quaternion = {
      x: 0, y: 0, z: 0, w: 1,
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; },
      copy(q) { this.x = q.x ?? 0; this.y = q.y ?? 0; this.z = q.z ?? 0; this.w = q.w ?? 1; return this; }
    };
    this.matrixWorld = { elements: new Float32Array(16) };
  }

  updateMatrixWorld(_force = true) {
    return this;
  }
}

/**
 * Creates a canonical gameplayKenGroup instance.
 * @returns {any} THREE.Group or MockGroup
 */
export function createGameplayKenGroup() {
  if (THREE && typeof THREE.Group === 'function') {
    return new THREE.Group();
  }
  return new MockGroup();
}

/**
 * Canonical global gameplayKenGroup instance owned and exposed by main.js.
 */
export const gameplayKenGroup = createGameplayKenGroup();

// ============================================================================
// DEFAULT SUBSYSTEM STUBS (Safe Fallbacks)
// ============================================================================

/**
 * Default stub for Person A's Input System.
 */
export class DefaultInputSystem {
  constructor() {
    this.gameplayKenGroup = createGameplayKenGroup();
  }

  update(_dt) {
    // Passes through default pose
    return this.gameplayKenGroup;
  }
}

/**
 * Default stub for Person A's Catch Detection & Trajectory Engine.
 */
export class DefaultCatchDetector {
  constructor(bus = defaultEventBus) {
    this.bus = bus;
    this.ballState = new BallState({ x: 0, y: 1.25, z: -0.45 }, { x: 0, y: 0, z: 0 }, BallMode.SEATED);
  }

  update(_dt, _kenGroup) {
    this.bus.emit(Events.BALL, this.ballState);
    return null;
  }

  getBallState() {
    return this.ballState;
  }
}

/**
 * Default stub for Person A's ScoreManager.
 */
export class DefaultScoreManager {
  constructor(bus = defaultEventBus) {
    this.bus = bus;
  }

  update() {
    // Driven by catch events
  }
}

/**
 * Default stub for Person B's Mission Controller.
 */
export class DefaultMissionController {
  constructor(bus = defaultEventBus) {
    this.bus = bus;
    this.missionState = new MissionState({
      chapter: 1,
      cosmicEnergy: 0,
      chapterTargetEnergy: MISSION_THRESHOLDS.CHAPTER_1,
      milestoneUnlocked: false
    });
    this.planetState = new PlanetState();
    this.targetState = new TargetState(CupKey.BIG, TrickType.SINGLE, 0);

    this.pendingEvents = [];

    // Subscribe to intra-frame events from Person A
    this.bus.on(Events.CATCH, (result) => {
      this.pendingEvents.push({ type: Events.CATCH, payload: result });
    });
    this.bus.on(Events.SCORE, (score) => {
      this.pendingEvents.push({ type: Events.SCORE, payload: score });
    });
    this.bus.on(Events.MISS, (miss) => {
      this.pendingEvents.push({ type: Events.MISS, payload: miss });
    });
  }

  update(dt) {
    // Flush intra-frame events synchronously
    const events = this.pendingEvents.splice(0, this.pendingEvents.length);
    for (const evt of events) {
      if (evt.type === Events.SCORE) {
        this.missionState.cosmicEnergy += evt.payload.awardedEnergy ?? 0;
      }
      if (evt.type === Events.MISS) {
        this.planetState.scars++;
      }
    }

    // Ease visual parameters towards active chapter goals
    const cfg = getChapterConfig(this.missionState.chapter);
    if (cfg?.planetEvolution) {
      const p = cfg.planetEvolution;
      const easeSpeed = 2.0 * dt;
      this.planetState.kintsugiGlow += (p.kintsugiGlow - this.planetState.kintsugiGlow) * Math.min(1.0, easeSpeed);
      this.planetState.atmosphereDensity += (p.atmosphereDensity - this.planetState.atmosphereDensity) * Math.min(1.0, easeSpeed);
      this.planetState.oceanFill += (p.oceanFill - this.planetState.oceanFill) * Math.min(1.0, easeSpeed);
      this.planetState.ringAlpha += (p.ringAlpha - this.planetState.ringAlpha) * Math.min(1.0, easeSpeed);
      this.planetState.shieldCharge += (p.shieldCharge - this.planetState.shieldCharge) * Math.min(1.0, easeSpeed);
      this.planetState.goldIgnited = p.goldIgnited;
    }

    this.bus.emit(Events.PLANET, this.planetState);
    this.bus.emit(Events.MISSION, this.missionState);
  }

  getMissionState() { return this.missionState; }
  getPlanetState() { return this.planetState; }
  getTargetState() { return this.targetState; }
}

/**
 * Default stub for Person B's Orbital Engine.
 */
export class DefaultOrbitalEngine {
  constructor(bus = defaultEventBus) {
    this.bus = bus;
    this.physicsState = new PhysicsState({
      simulationTime: 0.0,
      substepCount: 1,
      bodies: []
    });
    this.stepCount = 0;
    this.lastStepDt = 0.0;
  }

  step(fixedDt) {
    this.physicsState.simulationTime += fixedDt;
    this.physicsState.simTime = this.physicsState.simulationTime;
    this.stepCount++;
    this.lastStepDt = fixedDt;
  }

  getPhysicsState() {
    return this.physicsState;
  }
}

/**
 * Default stub for Person C's World Renderer.
 */
export class DefaultWorldRenderer {
  constructor(options = {}) {
    this.renderedFrameCount = 0;
    this.lastSnapshot = null;
    this.planetoidRenderer = options.planetoidRenderer || null;
  }

  setPlanetoidRenderer(renderer) {
    this.planetoidRenderer = renderer;
  }

  render(snapshot) {
    this.lastSnapshot = snapshot;
    this.renderedFrameCount++;
    if (this.planetoidRenderer && snapshot) {
      this.planetoidRenderer.update({
        ballState: snapshot.ballState,
        planetState: snapshot.planetState,
        deltaTime: snapshot.dtClamped,
        elapsedTime: snapshot.timestamp ? snapshot.timestamp / 1000 : null
      });
    }
  }
}

// ============================================================================
// STANDALONE ACCUMULATOR STEPPER
// ============================================================================

/**
 * Standalone fixed accumulator stepper helper.
 * Advances physics in fixed delta increments without drift.
 *
 * @param {any} orbitalEngine - Engine implementing .step(fixedDelta)
 * @param {number} accumulator - Current accumulated time in seconds
 * @param {number} [fixedDelta=PHYSICS_TIMESTEP.FIXED_DELTA] - Substep delta in seconds
 * @param {number} [maxFrames=PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES] - Max substeps to execute
 * @returns {{ remainingAccumulator: number, stepsExecuted: number }}
 */
export function fixedAccumulatorStep(
  orbitalEngine,
  accumulator,
  fixedDelta = PHYSICS_TIMESTEP.FIXED_DELTA ?? (1 / 120),
  maxFrames = PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES ?? 5
) {
  let acc = accumulator;
  let steps = 0;
  while (acc >= fixedDelta && steps < maxFrames) {
    if (orbitalEngine && typeof orbitalEngine.step === 'function') {
      orbitalEngine.step(fixedDelta);
    }
    acc -= fixedDelta;
    steps++;
  }
  if (steps >= maxFrames) {
    acc = 0.0;
  }
  return { remainingAccumulator: acc, stepsExecuted: steps };
}

// ============================================================================
// GAME PIPELINE ENGINE
// ============================================================================

/**
 * GamePipeline: Implements the 6-stage deterministic execution order
 * and fixed-timestep accumulator.
 */
export class GamePipeline {
  /**
   * @param {Object} [options={}]
   * @param {EventBus} [options.eventBus]
   * @param {any} [options.gameplayKenGroup]
   * @param {any} [options.inputSystem]
   * @param {any} [options.catchDetector]
   * @param {any} [options.scoreManager]
   * @param {any} [options.missionController]
   * @param {any} [options.orbitalEngine]
   * @param {any} [options.worldRenderer]
   * @param {number} [options.fixedDelta=PHYSICS_TIMESTEP.FIXED_DELTA]
   * @param {number} [options.maxAccumulatedFrames=MAX_ACCUMULATED_FRAMES]
   * @param {number} [options.maxDeltaTime=MAX_DELTA_TIME]
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || defaultEventBus;
    this.gameplayKenGroup = options.gameplayKenGroup || gameplayKenGroup;

    // Subsystems
    this.inputSystem = options.inputSystem || new DefaultInputSystem();
    this.catchDetector = options.catchDetector || new DefaultCatchDetector(this.eventBus);
    this.scoreManager = options.scoreManager || new DefaultScoreManager(this.eventBus);
    this.missionController = options.missionController || new DefaultMissionController(this.eventBus);
    this.orbitalEngine = options.orbitalEngine || new DefaultOrbitalEngine(this.eventBus);
    this.worldRenderer = options.worldRenderer || new DefaultWorldRenderer();

    // Timing constants
    this.fixedDelta = options.fixedDelta || (PHYSICS_TIMESTEP.FIXED_DELTA ?? (1 / 120));
    this.maxAccumulatedFrames = options.maxAccumulatedFrames || (PHYSICS_TIMESTEP.MAX_ACCUMULATED_FRAMES ?? 5);
    this.maxDeltaTime = options.maxDeltaTime || MAX_DELTA_TIME;

    // Internal timing accumulator
    this.accumulator = 0.0;
    this.lastTimestamp = null;
    this.totalPhysicsSteps = 0;
    this.totalRenderTicks = 0;

    // Execution trace logger for verification testing
    this.executionLog = [];
    this.enableTracing = false;

    // Pre-allocated frozen snapshot wrappers (Zero per-frame allocation in Stage 6)
    this._currentTimestamp = 0;
    this._currentDtClamped = 0;

    const self = this;

    const frozenPhysicsState = Object.freeze(Object.defineProperties(Object.create(PhysicsState.prototype), {
      simTime: { get: () => self.orbitalEngine.getPhysicsState().simTime, enumerable: true },
      simulationTime: { get: () => self.orbitalEngine.getPhysicsState().simulationTime, enumerable: true },
      substeps: { get: () => self.orbitalEngine.getPhysicsState().substeps, enumerable: true },
      substepCount: { get: () => self.orbitalEngine.getPhysicsState().substepCount, enumerable: true },
      bodies: { get: () => self.orbitalEngine.getPhysicsState().bodies, enumerable: true },
    }));

    const frozenMissionState = Object.freeze(Object.defineProperties(Object.create(MissionState.prototype), {
      chapter: { get: () => self.missionController.getMissionState().chapter, enumerable: true },
      cosmicEnergy: { get: () => self.missionController.getMissionState().cosmicEnergy, enumerable: true },
      targetEnergy: { get: () => self.missionController.getMissionState().targetEnergy, enumerable: true },
      chapterTargetEnergy: { get: () => self.missionController.getMissionState().chapterTargetEnergy, enumerable: true },
      milestoneReached: { get: () => self.missionController.getMissionState().milestoneReached, enumerable: true },
      milestoneUnlocked: { get: () => self.missionController.getMissionState().milestoneUnlocked, enumerable: true },
      activeIntervention: { get: () => self.missionController.getMissionState().activeIntervention, enumerable: true },
    }));

    const frozenPlanetState = Object.freeze(Object.defineProperties(Object.create(PlanetState.prototype), {
      kintsugiGlow: { get: () => self.missionController.getPlanetState().kintsugiGlow, enumerable: true },
      kintsugiVeinGlow: { get: () => self.missionController.getPlanetState().kintsugiVeinGlow, enumerable: true },
      atmosphereDensity: { get: () => self.missionController.getPlanetState().atmosphereDensity, enumerable: true },
      oceanFill: { get: () => self.missionController.getPlanetState().oceanFill, enumerable: true },
      oceanFillLevel: { get: () => self.missionController.getPlanetState().oceanFillLevel, enumerable: true },
      ringAlpha: { get: () => self.missionController.getPlanetState().ringAlpha, enumerable: true },
      ringFormationAlpha: { get: () => self.missionController.getPlanetState().ringFormationAlpha, enumerable: true },
      shieldCharge: { get: () => self.missionController.getPlanetState().shieldCharge, enumerable: true },
      scarsCount: { get: () => self.missionController.getPlanetState().scarsCount, enumerable: true },
      scars: { get: () => self.missionController.getPlanetState().scars, enumerable: true },
      goldIgnited: { get: () => self.missionController.getPlanetState().goldIgnited, enumerable: true },
      isGoldIgnited: { get: () => self.missionController.getPlanetState().isGoldIgnited, enumerable: true },
    }));

    const frozenTargetState = Object.freeze(Object.defineProperties(Object.create(TargetState.prototype), {
      cupKey: { get: () => self.missionController.getTargetState().cupKey, enumerable: true },
      trick: { get: () => self.missionController.getTargetState().trick, enumerable: true },
      sequenceIndex: { get: () => self.missionController.getTargetState().sequenceIndex, enumerable: true },
      targetCup: { get: () => self.missionController.getTargetState().targetCup, enumerable: true },
    }));

    const frozenBallState = Object.freeze(Object.defineProperties(Object.create(BallState.prototype), {
      position: { get: () => self.catchDetector.getBallState?.()?.position, enumerable: true },
      velocity: { get: () => self.catchDetector.getBallState?.()?.velocity, enumerable: true },
      mode: { get: () => self.catchDetector.getBallState?.()?.mode, enumerable: true },
    }));

    this._frozenSnapshot = Object.freeze(Object.defineProperties({}, {
      physicsState: { value: frozenPhysicsState, enumerable: true },
      missionState: { value: frozenMissionState, enumerable: true },
      planetState: { value: frozenPlanetState, enumerable: true },
      targetState: { value: frozenTargetState, enumerable: true },
      ballState: {
        get: () => {
          if (!self.catchDetector?.getBallState) return null;
          const bs = self.catchDetector.getBallState();
          return bs ? frozenBallState : null;
        },
        enumerable: true,
      },
      gameplayKenGroup: { get: () => self.gameplayKenGroup, enumerable: true },
      timestamp: { get: () => self._currentTimestamp, enumerable: true },
      dtClamped: { get: () => self._currentDtClamped, enumerable: true },
    }));
  }

  /**
   * Primary frame dispatch entry point.
   *
   * @param {number} timestamp - Current frame timestamp (in milliseconds or seconds)
   * @param {any} [xrFrame=null] - Optional WebXR frame handle
   * @param {number} [forcedDelta=null] - Optional forced delta time (in seconds) for testing
   */
  tick(timestamp, xrFrame = null, forcedDelta = null) {
    // 0. Delta Time Calculation & Clamping
    let rawDelta = 0.0;
    if (forcedDelta !== null && Number.isFinite(forcedDelta)) {
      rawDelta = forcedDelta;
    } else if (this.lastTimestamp !== null) {
      rawDelta = (timestamp - this.lastTimestamp) / 1000.0;
    } else {
      rawDelta = this.fixedDelta;
    }
    this.lastTimestamp = timestamp;

    // Clamp render dt to prevent simulation explosion after pauses/hitches
    const dtClamped = Math.max(0.0, Math.min(rawDelta, this.maxDeltaTime));

    if (this.enableTracing) {
      this.executionLog.push({ stage: 0, event: 'TICK_START', dtClamped, rawDelta });
    }

    // ------------------------------------------------------------------------
    // STAGE 1: Hand / Fake Input
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 1, event: 'STAGE_1_INPUT' });
    const inputKen = this.inputSystem.update(dtClamped, xrFrame);
    if (inputKen && inputKen !== this.gameplayKenGroup) {
      if (inputKen.position) {
        this.gameplayKenGroup.position.copy(inputKen.position);
      }
      if (inputKen.quaternion) {
        this.gameplayKenGroup.quaternion.copy(inputKen.quaternion);
      }
    }
    this.gameplayKenGroup.updateMatrixWorld(true);

    // ------------------------------------------------------------------------
    // STAGE 2: Trajectory & Catch Detection (Person A)
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 2, event: 'STAGE_2_CATCH_DETECTION' });
    this.catchDetector.update(dtClamped, this.gameplayKenGroup);

    // ------------------------------------------------------------------------
    // STAGE 3: Scoring & Cadence Evaluation (Person A)
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 3, event: 'STAGE_3_SCORING' });
    this.scoreManager.update(dtClamped);

    // ------------------------------------------------------------------------
    // STAGE 4: Mission Logic & State Easing (Person B)
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 4, event: 'STAGE_4_MISSION' });
    this.missionController.update(dtClamped);

    // ------------------------------------------------------------------------
    // STAGE 5: Physics Accumulator (Fixed Timestep - Person B)
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 5, event: 'STAGE_5_PHYSICS_START' });
    this.accumulator += dtClamped;

    let stepsThisTick = 0;
    while (this.accumulator >= this.fixedDelta && stepsThisTick < this.maxAccumulatedFrames) {
      this.orbitalEngine.step(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
      stepsThisTick++;
      this.totalPhysicsSteps++;
      if (this.enableTracing) {
        this.executionLog.push({ stage: 5, event: 'PHYSICS_SUBSTEP', stepIndex: stepsThisTick, stepDt: this.fixedDelta });
      }
    }

    // Spiral-of-death protection: discard residual if accumulated beyond max allowed frames
    if (stepsThisTick >= this.maxAccumulatedFrames) {
      this.accumulator = 0.0;
      if (this.enableTracing) {
        this.executionLog.push({ stage: 5, event: 'ACCUMULATOR_CLAMPED_SPIRAL_GUARD' });
      }
    }

    // Publish physics state update
    const physState = this.orbitalEngine.getPhysicsState();
    this.eventBus.emit(Events.PHYSICS, physState);

    // ------------------------------------------------------------------------
    // STAGE 6: Render & Audio (Person C)
    // ------------------------------------------------------------------------
    if (this.enableTracing) this.executionLog.push({ stage: 6, event: 'STAGE_6_RENDER' });
    this._currentTimestamp = timestamp;
    this._currentDtClamped = dtClamped;

    this.worldRenderer.render(this._frozenSnapshot);
    this.totalRenderTicks++;

    if (this.enableTracing) this.executionLog.push({ stage: 6, event: 'TICK_COMPLETE' });
  }

  /**
   * Resets accumulator and timing states.
   */
  reset() {
    this.accumulator = 0.0;
    this.lastTimestamp = null;
    this._currentTimestamp = 0;
    this._currentDtClamped = 0;
    this.totalPhysicsSteps = 0;
    this.totalRenderTicks = 0;
    this.executionLog = [];
  }
}

/**
 * Global default GamePipeline singleton.
 */
export const defaultPipeline = new GamePipeline();

/**
 * Standalone tick function delegating to the default pipeline.
 *
 * @param {number} timestamp
 * @param {any} [xrFrame=null]
 * @param {number} [forcedDelta=null]
 */
export function tick(timestamp, xrFrame = null, forcedDelta = null) {
  return defaultPipeline.tick(timestamp, xrFrame, forcedDelta);
}

// ============================================================================
// BOOTLOADER / INIT GAME
// ============================================================================

/**
 * Initializes and starts the Celestial Kendama main execution loop.
 * Hooks into requestAnimationFrame or IWSDK render hooks.
 *
 * @param {Object} [options={}]
 * @returns {{ pipeline: GamePipeline, gameplayKenGroup: any, eventBus: EventBus, stop: Function, tick: Function }}
 */
export function initGame(options = {}) {
  const bus = options.eventBus || defaultEventBus;

  // Convenience resolution when gameLoop is provided directly
  if (options.gameLoop) {
    if (!options.inputSystem) options.inputSystem = options.gameLoop.inputSystem;
    if (!options.catchDetector) options.catchDetector = options.gameLoop.catchDetector;
    if (!options.scoreManager) options.scoreManager = options.gameLoop.scoreManager;
  }

  const pipeline = new GamePipeline({ ...options, eventBus: bus });
  const world = options.world || null;
  const configuredHand = options.hand || options.gameLoop?.hand || 'right';

  let isRunning = true;
  let rafId = null;
  let xrSystem = null;
  let xrCleanup = null;

  if (world) {
    // ECS registration architecture: wire through IWSDK World
    if (typeof world.registerSystem === 'function') {
      if (!world.hasSystem?.(KendamaXRSystem)) {
        world.registerSystem(KendamaXRSystem);
      }
      xrSystem = typeof world.getSystem === 'function'
        ? world.getSystem(KendamaXRSystem)
        : world.getSystems?.().find((s) => s instanceof KendamaXRSystem);

      if (xrSystem) {
        xrSystem.setPipeline(pipeline);
        if (typeof xrSystem.setHand === 'function') {
          xrSystem.setHand(configuredHand);
        } else {
          xrSystem.hand = configuredHand;
        }
        const loopInstance = options.gameLoop || pipeline.inputSystem?.gameLoop;
        if (loopInstance) {
          xrSystem.setGameLoop(loopInstance);
        }
      }
    } else if (typeof world.onXRFrame === 'function') {
      // Callback architecture fallback when world exposes onXRFrame instead of full ECS
      xrCleanup = world.onXRFrame((frame, delta, time) => {
        if (!isRunning) return;
        const refSpace = world.xrReferenceSpace ?? null;
        const inputSource = world.input?.xr?.getPrimaryInputSource?.(configuredHand) ?? null;
        const xrContext = {
          frame,
          referenceSpace: refSpace,
          inputSource,
          hand: configuredHand,
          world,
        };
        const loopInstance = options.gameLoop || pipeline.inputSystem?.gameLoop;
        if (loopInstance && typeof loopInstance.setXRContext === 'function') {
          loopInstance.setXRContext(xrContext);
        }
        pipeline.tick(time * 1000, frame, delta);
      });
    }
  } else if (typeof requestAnimationFrame === 'function' && !options.manualTick) {
    // Non-XR / Desktop / Headless fallback loop
    function loop(time) {
      if (!isRunning) return;
      pipeline.tick(time);
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(loop);
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  return {
    pipeline,
    gameplayKenGroup: pipeline.gameplayKenGroup,
    eventBus: bus,
    xrSystem,
    tick: (time, xrFrame, forcedDt) => pipeline.tick(time, xrFrame, forcedDt),
    stop: () => {
      isRunning = false;
      if (xrSystem) {
        if (typeof world?.unregisterSystem === 'function') {
          world.unregisterSystem(KendamaXRSystem);
        } else {
          xrSystem.stop?.();
          xrSystem.destroy?.();
        }
      }
      if (typeof xrCleanup === 'function') {
        xrCleanup();
        xrCleanup = null;
      }
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}
