// tests/frameOrder.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  tick,
  setSubsystems,
  gameplayKenGroup,
  resetAccumulator,
  getAccumulator,
  registerFrameListeners,
  currentMissionState,
  currentPlanetState
} from '../src/main.js';
import { Events, CatchType } from '../src/contracts/Interfaces.js';
import { eventBus } from '../src/contracts/EventBus.js';
import { PHYSICS_TIMESTEP, MAX_ACCUMULATED_FRAMES, MAX_DELTA_TIME } from '../src/mission/missionConfig.js';

describe('Deterministic Frame Execution Pipeline (Step 0.3)', () => {
  beforeEach(() => {
    resetAccumulator();
    currentMissionState.cosmicEnergy = 0;
    currentPlanetState.scarsCount = 0;
    eventBus.clear();
    registerFrameListeners();
  });

  describe('Physics Timestep Accumulator', () => {
    it('executes physics steps in exact multiples of 1/120s at 60 FPS', () => {
      let stepCount = 0;
      let totalSteppedTime = 0;

      setSubsystems({
        inputSystem: null,
        catchDetector: null,
        scoreManager: null,
        missionController: null,
        worldRenderer: null,
        orbitalEngine: {
          step(fixedDt) {
            stepCount++;
            totalSteppedTime += fixedDt;
          }
        }
      });

      // At 60 FPS: frame delta = 1/60s = 2 * (1/120s)
      const delta60fps = 1.0 / 60.0;
      const result = tick(1000, null, delta60fps);

      assert.equal(result.physicsSubSteps, 2);
      assert.equal(stepCount, 2);
      assert.ok(Math.abs(totalSteppedTime - delta60fps) < 1e-6);
      assert.ok(getAccumulator() < 1e-6);
    });

    it('executes exactly 1 physics step at 120 FPS', () => {
      let stepCount = 0;

      setSubsystems({
        orbitalEngine: {
          step(_fixedDt) {
            stepCount++;
          }
        }
      });

      const delta120fps = PHYSICS_TIMESTEP;
      const result = tick(1000, null, delta120fps);

      assert.equal(result.physicsSubSteps, 1);
      assert.equal(stepCount, 1);
      assert.ok(getAccumulator() < 1e-6);
    });

    it('clamps frame delta when rawDelta > 0.05s to prevent explosion', () => {
      let stepCount = 0;

      setSubsystems({
        orbitalEngine: {
          step(_fixedDt) {
            stepCount++;
          }
        }
      });

      // Simulate a 500ms tab freeze
      const largeDelta = 0.500;
      const result = tick(1000, null, largeDelta);

      // Delta must be clamped to MAX_DELTA_TIME (0.05s)
      assert.equal(result.dtClamped, MAX_DELTA_TIME);
      // Substeps must be capped to MAX_ACCUMULATED_FRAMES (5)
      assert.equal(result.physicsSubSteps, MAX_ACCUMULATED_FRAMES);
      assert.equal(stepCount, MAX_ACCUMULATED_FRAMES);
      // Accumulator is reset to 0 after reaching limit to avoid death spiral
      assert.equal(getAccumulator(), 0);
    });
  });

  describe('Intra-Frame Event Sequencing (CATCH before SCORE)', () => {
    it('guarantees CATCH is evaluated before SCORE in Stage 4 of the exact same frame', () => {
      const executionLog = [];

      setSubsystems({
        inputSystem: {
          update() {
            executionLog.push('STAGE_1_INPUT');
          }
        },
        catchDetector: {
          update() {
            executionLog.push('STAGE_2_CATCH_DETECTOR');
            // Person A emits CATCH
            eventBus.emit(Events.CATCH, {
              cupKey: 'big',
              type: CatchType.CLEAN,
              timestamp: 1000
            });
          }
        },
        scoreManager: {
          update() {
            executionLog.push('STAGE_3_SCORE_MANAGER');
            // Person A emits SCORE after CATCH
            eventBus.emit(Events.SCORE, {
              eventId: 'big_1',
              awardedEnergy: 32,
              totalEnergy: 32
            });
          }
        },
        missionController: {
          onCatch(evt) {
            executionLog.push(`STAGE_4_ON_CATCH:${evt.cupKey}`);
          },
          onScore(evt) {
            executionLog.push(`STAGE_4_ON_SCORE:${evt.awardedEnergy}`);
          },
          update() {
            executionLog.push('STAGE_4_MISSION_UPDATE');
          }
        },
        orbitalEngine: {
          step() {
            executionLog.push('STAGE_5_PHYSICS_STEP');
          }
        },
        worldRenderer: {
          render() {
            executionLog.push('STAGE_6_RENDER');
          }
        }
      });

      // Execute single frame
      tick(1000, null, PHYSICS_TIMESTEP);

      // Verify strict intra-frame ordering
      assert.deepEqual(executionLog, [
        'STAGE_1_INPUT',
        'STAGE_2_CATCH_DETECTOR',
        'STAGE_3_SCORE_MANAGER',
        'STAGE_4_ON_CATCH:big',
        'STAGE_4_ON_SCORE:32',
        'STAGE_4_MISSION_UPDATE',
        'STAGE_5_PHYSICS_STEP',
        'STAGE_6_RENDER'
      ]);

      // Energy state must be updated during Stage 4
      assert.equal(currentMissionState.cosmicEnergy, 32);
    });

    it('handles MISS events by incrementing scars in Stage 4', () => {
      const order = [];

      setSubsystems({
        catchDetector: null,
        scoreManager: {
          update() {
            eventBus.emit(Events.MISS, { timestamp: 1000 });
          }
        },
        missionController: {
          onMiss() {
            order.push('ON_MISS');
          },
          update() {}
        },
        orbitalEngine: null,
        worldRenderer: null
      });

      tick(1000, null, 0.016);
      assert.equal(currentPlanetState.scarsCount, 1);
      assert.ok(order.includes('ON_MISS'));
    });
  });

  describe('Integration Bridge (Canonical gameplayKenGroup sync)', () => {
    it('synchronizes input position/quaternion to canonical gameplayKenGroup and updates matrixWorld', () => {
      const mockFakeInput = {
        gameplayKenGroup: new THREE.Group(),
        update() {
          this.gameplayKenGroup.position.set(0.15, 1.45, -0.35);
          this.gameplayKenGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
        }
      };

      setSubsystems({
        inputSystem: mockFakeInput,
        catchDetector: null,
        scoreManager: null,
        missionController: null,
        orbitalEngine: null,
        worldRenderer: null
      });

      tick(1000, null, 0.016);

      // Verify canonical gameplayKenGroup matches fakeInput transform
      assert.ok(gameplayKenGroup.position.distanceTo(new THREE.Vector3(0.15, 1.45, -0.35)) < 1e-5);
      // Verify matrixWorld was updated
      const worldPos = new THREE.Vector3();
      gameplayKenGroup.getWorldPosition(worldPos);
      assert.ok(worldPos.distanceTo(new THREE.Vector3(0.15, 1.45, -0.35)) < 1e-5);
    });
  });
});
