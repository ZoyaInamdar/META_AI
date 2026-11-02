/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Deterministic Frame Execution Order & Physics Accumulator
 * Role: Person B (The Physics & Mission Lead / main.js)
 * Verification for Step 0.3 under Vitest
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GamePipeline,
  initGame,
  tick,
  fixedAccumulatorStep,
  gameplayKenGroup,
  createGameplayKenGroup,
  DefaultOrbitalEngine,
  DefaultMissionController
} from '../src/main.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { Events, CatchType, TargetState, BallMode } from '../src/contracts/Interfaces.js';
import { PHYSICS_TIMESTEP, MAX_ACCUMULATED_FRAMES, MAX_DELTA_TIME } from '../src/mission/missionConfig.js';

describe('Deterministic Frame Pipeline & Physics Accumulator (Step 0.3)', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('Standalone fixedAccumulatorStep Helper', () => {
    it('advances physics in fixed 1/120s increments without drift', () => {
      let stepCount = 0;
      const stepDts = [];
      const mockEngine = {
        step(dt) {
          stepCount++;
          stepDts.push(dt);
        }
      };

      const fixedDelta = 1 / 120;
      // Provide accumulator = 0.025s (approx 3 steps of 1/120s = 0.025s)
      const res = fixedAccumulatorStep(mockEngine, 0.025, fixedDelta, 5);

      expect(stepCount).toBe(3);
      expect(res.stepsExecuted).toBe(3);
      expect(stepDts.every((d) => Math.abs(d - fixedDelta) < 1e-9)).toBe(true);
      expect(res.remainingAccumulator).toBeCloseTo(0.025 - 3 * (1 / 120), 6);
    });

    it('caps execution at maxFrames and resets residual on overflow', () => {
      let stepCount = 0;
      const mockEngine = {
        step() { stepCount++; }
      };

      // 1.0s accumulator with maxFrames = 5
      const res = fixedAccumulatorStep(mockEngine, 1.0, 1 / 120, 5);
      expect(stepCount).toBe(5);
      expect(res.stepsExecuted).toBe(5);
      expect(res.remainingAccumulator).toBe(0.0);
    });
  });

  describe('Fixed Timestep Accumulator (120 Hz Physics)', () => {
    it('runs physics steps in exact multiples of 1/120s regardless of variable frame rate', () => {
      const fixedDt = 1 / 120;
      let orbitalSteps = 0;
      const stepDts = [];

      const mockOrbitalEngine = {
        step(dt) {
          orbitalSteps++;
          stepDts.push(dt);
        },
        getPhysicsState() {
          return { simulationTime: orbitalSteps * fixedDt, substepCount: 1, bodies: [] };
        }
      };

      const pipeline = new GamePipeline({
        eventBus,
        orbitalEngine: mockOrbitalEngine,
        fixedDelta: fixedDt
      });

      // Frame 1: Exactly 1/60s (approx 0.016667s) -> 2 steps of 1/120s
      pipeline.tick(16.6667, null, 1 / 60);
      expect(orbitalSteps).toBe(2);
      expect(stepDts[0]).toBe(fixedDt);
      expect(stepDts[1]).toBe(fixedDt);

      // Frame 2: Exactly 1/120s (approx 0.008333s) -> 1 step of 1/120s
      pipeline.tick(25.0, null, 1 / 120);
      expect(orbitalSteps).toBe(3);
      expect(stepDts[2]).toBe(fixedDt);

      // Frame 3: 0.005s (faster than 120 Hz) -> 0 steps, remainder stays in accumulator
      pipeline.tick(30.0, null, 0.005);
      expect(orbitalSteps).toBe(3);
      expect(pipeline.accumulator > 0).toBe(true);

      // Frame 4: Another 0.005s -> Total 0.010s >= 1/120s (0.00833s) -> 1 step executed, ~0.00167s remains
      pipeline.tick(35.0, null, 0.005);
      expect(orbitalSteps).toBe(4);
      expect(stepDts[3]).toBe(fixedDt);
    });

    it('frame delta clamping prevents explosion when rawDelta > 0.05s', () => {
      let orbitalSteps = 0;
      const mockOrbitalEngine = {
        step(_dt) { orbitalSteps++; },
        getPhysicsState() { return { simulationTime: 0, substepCount: 1, bodies: [] }; }
      };

      const pipeline = new GamePipeline({
        eventBus,
        orbitalEngine: mockOrbitalEngine,
        fixedDelta: 1 / 120,
        maxAccumulatedFrames: 5,
        maxDeltaTime: 0.05
      });

      // Simulate a massive 1.5-second lag spike / tab pause
      pipeline.tick(1500, null, 1.5);

      // Clamped to 0.05s (which is 6 steps of 1/120s, but capped by maxAccumulatedFrames = 5)
      expect(orbitalSteps).toBeLessThanOrEqual(5);
      expect(orbitalSteps).toBe(5);
      expect(pipeline.accumulator).toBe(0.0);
    });
  });

  describe('Deterministic 6-Stage Execution Sequencing', () => {
    it('executes the 6 stages in strict sequential order (Input -> Catch -> Score -> Mission -> Physics -> Render)', () => {
      const orderLog = [];

      const mockInput = {
        update() {
          orderLog.push('STAGE_1_INPUT');
          return null;
        }
      };

      const mockCatchDetector = {
        update() {
          orderLog.push('STAGE_2_CATCH');
        },
        getBallState() { return { mode: 'seated' }; }
      };

      const mockScoreManager = {
        update() {
          orderLog.push('STAGE_3_SCORE');
        }
      };

      const mockMissionController = {
        update() {
          orderLog.push('STAGE_4_MISSION');
        },
        getMissionState() { return { chapter: 1 }; },
        getPlanetState() { return { scars: 0 }; },
        getTargetState() { return { cupKey: 'big' }; }
      };

      const mockOrbitalEngine = {
        step() {
          orderLog.push('STAGE_5_PHYSICS_SUBSTEP');
        },
        getPhysicsState() { return { bodies: [] }; }
      };

      const mockWorldRenderer = {
        render() {
          orderLog.push('STAGE_6_RENDER');
        }
      };

      const pipeline = new GamePipeline({
        eventBus,
        inputSystem: mockInput,
        catchDetector: mockCatchDetector,
        scoreManager: mockScoreManager,
        missionController: mockMissionController,
        orbitalEngine: mockOrbitalEngine,
        worldRenderer: mockWorldRenderer,
        fixedDelta: 1 / 120
      });

      pipeline.tick(16.6667, null, 1 / 120);

      expect(orderLog).toEqual([
        'STAGE_1_INPUT',
        'STAGE_2_CATCH',
        'STAGE_3_SCORE',
        'STAGE_4_MISSION',
        'STAGE_5_PHYSICS_SUBSTEP',
        'STAGE_6_RENDER'
      ]);
    });

    it('intra-frame event sequencing guarantees CATCH is evaluated before SCORE in the exact same frame', () => {
      const eventSequence = [];

      // Person A Catch Detection emits CATCH
      const mockCatchDetector = {
        update() {
          eventSequence.push('DETECTOR_UPDATE');
          eventBus.emit(Events.CATCH, { type: CatchType.CLEAN, cupKey: 'big', distance: 0.01 });
        },
        getBallState() { return null; }
      };

      // Person A Scoring emits SCORE after catch evaluation
      const mockScoreManager = {
        update() {
          eventSequence.push('SCORE_UPDATE');
          eventBus.emit(Events.SCORE, { eventId: 'evt_1', catchType: CatchType.CLEAN, awardedEnergy: 32 });
        }
      };

      // Person B MissionController receives both intra-frame events in order
      const handledEvents = [];
      const mockMissionController = {
        update() {
          eventSequence.push('MISSION_UPDATE');
        },
        getMissionState() { return { cosmicEnergy: 32 }; },
        getPlanetState() { return {}; },
        getTargetState() { return { cupKey: 'big' }; }
      };

      eventBus.on(Events.CATCH, (payload) => {
        handledEvents.push({ type: 'CATCH', payload });
      });
      eventBus.on(Events.SCORE, (payload) => {
        handledEvents.push({ type: 'SCORE', payload });
      });

      const pipeline = new GamePipeline({
        eventBus,
        catchDetector: mockCatchDetector,
        scoreManager: mockScoreManager,
        missionController: mockMissionController,
        fixedDelta: 1 / 120
      });

      pipeline.tick(16.6667, null, 1 / 120);

      expect(eventSequence).toEqual(['DETECTOR_UPDATE', 'SCORE_UPDATE', 'MISSION_UPDATE']);
      expect(handledEvents.length).toBe(2);
      expect(handledEvents[0].type).toBe('CATCH');
      expect(handledEvents[1].type).toBe('SCORE');
    });

    it('Stage 6 delivers frozen / read-only snapshots to WorldRenderer', () => {
      let receivedSnapshot = null;
      const mockRenderer = {
        render(snapshot) {
          receivedSnapshot = snapshot;
        }
      };

      const pipeline = new GamePipeline({
        eventBus,
        worldRenderer: mockRenderer,
        fixedDelta: 1 / 120
      });

      pipeline.tick(16.6667, null, 1 / 120);

      expect(receivedSnapshot).toBeTruthy();
      expect(Object.isFrozen(receivedSnapshot)).toBe(true);
      expect(Object.isFrozen(receivedSnapshot.physicsState)).toBe(true);
      expect(Object.isFrozen(receivedSnapshot.missionState)).toBe(true);
      expect(Object.isFrozen(receivedSnapshot.planetState)).toBe(true);
      expect(Object.isFrozen(receivedSnapshot.targetState)).toBe(true);
    });
  });

  describe('Integration & Bootloader (initGame & tick)', () => {
    it('initGame() returns pipeline, canonical gameplayKenGroup, eventBus, tick, and stop controls', () => {
      const game = initGame({ eventBus, manualTick: true });

      expect(game.pipeline instanceof GamePipeline).toBe(true);
      expect(game.gameplayKenGroup).toBeTruthy();
      expect(game.eventBus).toBe(eventBus);
      expect(typeof game.tick).toBe('function');
      expect(typeof game.stop).toBe('function');

      // Manual frame stepping
      game.tick(16.6667, null, 1 / 120);
      expect(game.pipeline.totalRenderTicks).toBe(1);
      expect(game.pipeline.totalPhysicsSteps).toBe(1);

      game.stop();
    });

    it('standalone tick export executes without crashing', () => {
      expect(typeof tick).toBe('function');
      tick(16.6667, null, 1 / 120);
    });
  });
});
