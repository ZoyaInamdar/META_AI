/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Deterministic Frame Execution Order & Physics Accumulator
 * Role: Person B (The Physics & Mission Lead / main.js)
 * Verification for Step 0.3: src/main.js & Frame Execution Pipeline
 * ============================================================================
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GamePipeline,
  initGame,
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
      assert.equal(orbitalSteps, 2, 'A 60 FPS tick (1/60s) must trigger exactly 2 physics steps (2 * 1/120s)');
      assert.equal(stepDts[0], fixedDt);
      assert.equal(stepDts[1], fixedDt);

      // Frame 2: Exactly 1/120s (approx 0.008333s) -> 1 step of 1/120s
      pipeline.tick(25.0, null, 1 / 120);
      assert.equal(orbitalSteps, 3, 'A 120 FPS tick (1/120s) must trigger exactly 1 additional physics step');
      assert.equal(stepDts[2], fixedDt);

      // Frame 3: 0.005s (faster than 120 Hz) -> 0 steps, remainder stays in accumulator
      pipeline.tick(30.0, null, 0.005);
      assert.equal(orbitalSteps, 3, 'A fast frame below 1/120s must not execute a physics step yet');
      assert.ok(pipeline.accumulator > 0, 'Residual delta must be preserved in accumulator');

      // Frame 4: Another 0.005s -> Total 0.010s >= 1/120s (0.00833s) -> 1 step executed, ~0.00167s remains
      pipeline.tick(35.0, null, 0.005);
      assert.equal(orbitalSteps, 4, 'Accumulated dt exceeding 1/120s triggers the step');
      assert.equal(stepDts[3], fixedDt);
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
      assert.ok(
        orbitalSteps <= 5,
        `Lag spike of 1.5s must be clamped by MAX_ACCUMULATED_FRAMES (got ${orbitalSteps} steps, max 5)`
      );
      assert.equal(orbitalSteps, 5);
      assert.equal(pipeline.accumulator, 0.0, 'Accumulator must be reset after hitting spiral cap');
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

      assert.deepEqual(orderLog, [
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

      // Verify that CATCH was emitted before SCORE and both were handled before Stage 5/6
      assert.deepEqual(eventSequence, ['DETECTOR_UPDATE', 'SCORE_UPDATE', 'MISSION_UPDATE']);
      assert.equal(handledEvents.length, 2);
      assert.equal(handledEvents[0].type, 'CATCH');
      assert.equal(handledEvents[1].type, 'SCORE');
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

      assert.ok(receivedSnapshot, 'Renderer must receive snapshot');
      assert.ok(Object.isFrozen(receivedSnapshot), 'Root snapshot must be frozen');
      assert.ok(Object.isFrozen(receivedSnapshot.physicsState), 'physicsState snapshot must be frozen');
      assert.ok(Object.isFrozen(receivedSnapshot.missionState), 'missionState snapshot must be frozen');
      assert.ok(Object.isFrozen(receivedSnapshot.planetState), 'planetState snapshot must be frozen');
      assert.ok(Object.isFrozen(receivedSnapshot.targetState), 'targetState snapshot must be frozen');
    });
  });

  describe('Integration & Bootloader (initGame)', () => {
    it('initGame() returns pipeline, canonical gameplayKenGroup, eventBus, tick, and stop controls', () => {
      const game = initGame({ eventBus, manualTick: true });

      assert.ok(game.pipeline instanceof GamePipeline);
      assert.ok(game.gameplayKenGroup);
      assert.equal(game.eventBus, eventBus);
      assert.equal(typeof game.tick, 'function');
      assert.equal(typeof game.stop, 'function');

      // Manual frame stepping
      game.tick(16.6667, null, 1 / 120);
      assert.equal(game.pipeline.totalRenderTicks, 1);
      assert.equal(game.pipeline.totalPhysicsSteps, 1);

      game.stop();
    });
  });
});

