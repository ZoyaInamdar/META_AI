/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Resilient Finale Sequence & Chaos Cycle (Step 3.1)
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Verifies:
 * 1. Milestone Trigger: Energy reaching 2200 flips isGoldIgnited and emits one-shot triggers
 * 2. Chaos Timing Windows: Smooth cubic Hermite bell-curve peaking between 3.0s–4.5s and tapering to 0.0 at t >= 7.5s
 * 3. Collision Avoidance Invariant: Pairwise star distances remain strictly > 0.25 sim units
 * 4. Figure-Eight Convergence: Exact Chenciner & Montgomery initial states (tolerance < 10^-3, E ≈ -1.287)
 * 5. Zero Heap Allocations: 1,080 frames (9.0s at 120Hz) without runtime GC allocations
 * 6. Decoupled Gameplay Invariants: Spike target and cadence remain untouched during chaos
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinaleManager } from '../src/physics/FinaleManager.js';
import { MissionController } from '../src/mission/MissionController.js';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { Events, CupKey, TrickType } from '../src/contracts/Interfaces.js';
import { MISSION_THRESHOLDS } from '../src/mission/missionConfig.js';

describe('Resilient Finale Sequence & 9-Second Chaos Perturbation (Step 3.1)', () => {
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };
  });

  describe('Test 1: Milestone Trigger & One-Shot Gold Ignition Audio Contract', () => {
    it('flips isGoldIgnited to true and emits one-shot FINALE_TRIGGER and AUDIO_TRIGGER at 2200 energy', () => {
      const controller = new MissionController(mockEventBus);

      expect(controller.getPlanetState().isGoldIgnited).toBe(false);
      expect(controller.isGoldIgnited).toBe(false);

      // Advance energy to 2200 (Finale Milestone)
      controller.handleScore(MISSION_THRESHOLDS.FINALE);

      expect(controller.getPlanetState().isGoldIgnited).toBe(true);
      expect(controller.isGoldIgnited).toBe(true);

      // Verify one-shot Events.AUDIO_TRIGGER with cue: 'gold_ignition_chime'
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.AUDIO_TRIGGER,
        expect.objectContaining({ cue: 'gold_ignition_chime' })
      );

      // Verify one-shot Events.FINALE_TRIGGER
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.FINALE_TRIGGER,
        expect.objectContaining({ isGoldIgnited: true })
      );

      // Verify audio chime is NOT re-emitted on subsequent score events
      const audioCallCountBefore = mockEventBus.emit.mock.calls.filter(
        call => call[0] === Events.AUDIO_TRIGGER && call[1]?.cue === 'gold_ignition_chime'
      ).length;
      expect(audioCallCountBefore).toBe(1);

      controller.handleScore(50);
      const audioCallCountAfter = mockEventBus.emit.mock.calls.filter(
        call => call[0] === Events.AUDIO_TRIGGER && call[1]?.cue === 'gold_ignition_chime'
      ).length;
      expect(audioCallCountAfter).toBe(1);
    });
  });

  describe('Test 2: Chaos Timing Windows & Smooth Bell-Curve Intensity', () => {
    it('advances through 3.0s, 4.5s, 7.5s, and 9.0s with peak intensity between 3.0s–4.5s and 0.0 at t >= 7.5s', () => {
      const finale = new FinaleManager(mockEventBus);
      finale.startChaosCycle();

      expect(finale.isChaosActive()).toBe(true);
      expect(finale.getFinaleProgress()).toBe(0.0);
      expect(finale.getChaosIntensity()).toBe(0.0);

      // Advance to t = 3.0s (30 steps of 0.1s)
      for (let i = 0; i < 30; i++) {
        finale.update(0.1);
      }
      expect(finale.getChaosIntensity()).toBeGreaterThan(0.85);
      expect(finale.getChaosIntensity()).toBeLessThan(1.0);

      // Advance to t = 3.75s (midpoint peak of Phase 2 instability)
      finale.update(0.75);
      expect(finale.getChaosIntensity()).toBeCloseTo(1.0, 4);

      // Advance to t = 4.5s (end of peak instability window)
      finale.update(0.75);
      expect(finale.getChaosIntensity()).toBeGreaterThan(0.85);
      expect(finale.getChaosIntensity()).toBeLessThan(1.0);

      // Advance to t = 7.5s (end of Phase 3 damping)
      for (let i = 0; i < 30; i++) {
        finale.update(0.1);
      }
      expect(finale.getChaosIntensity()).toBeCloseTo(0.0, 5);
      expect(finale.getChaosIntensity()).toBe(0.0);

      // Advance to t = 9.0s (Phase 4 resonant lock completion)
      for (let i = 0; i < 15; i++) {
        finale.update(0.1);
      }
      expect(finale.getChaosIntensity()).toBe(0.0);
      expect(finale.getFinaleProgress()).toBe(1.0);
      expect(finale.isChaosActive()).toBe(false);
    });
  });

  describe('Test 3: Collision Avoidance Invariant (r_min > 0.25 sim units)', () => {
    it('maintains pairwise star separation strictly > 0.25 across all 1,080 frames of the 9-second cycle', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
      const finale = new FinaleManager();
      finale.startChaosCycle(engine);

      const dt = 1 / 120; // 120 Hz fixed timestep
      let minSeparation = Infinity;

      for (let s = 0; s < 1080; s++) {
        finale.update(dt, engine);

        const rMin = engine.computeMinSeparation();
        if (rMin < minSeparation) {
          minSeparation = rMin;
        }

        expect(rMin).toBeGreaterThan(0.25);
      }

      // Confirms global minimum separation stays well clear of collision boundary
      expect(minSeparation).toBeGreaterThan(0.5);
    });
  });

  describe('Test 4: Figure-Eight Convergence at t = 9.0s', () => {
    it('achieves exact Chenciner & Montgomery state vector lock within 10^-3 and conserves energy E ≈ -1.287', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
      const finale = new FinaleManager();
      finale.startChaosCycle(engine);

      const dt = 1 / 120;
      for (let s = 0; s < 1080; s++) {
        finale.update(dt, engine);
      }

      // Analytical reference values
      const x1 = 0.97000436;
      const y1 = -0.24308753;
      const vx3 = -0.93240737;
      const vy3 = -0.86473146;
      const vx1 = -0.5 * vx3;
      const vy1 = -0.5 * vy3;

      // Body 0 (Star 1)
      const p1 = engine.getBodyPosition(0);
      const v1 = engine.getBodyVelocity(0);
      expect(Math.hypot(p1.x - x1, p1.y - y1, p1.z)).toBeLessThan(1e-3);
      expect(Math.hypot(v1.x - vx1, v1.y - vy1, v1.z)).toBeLessThan(1e-3);

      // Body 1 (Star 2)
      const p2 = engine.getBodyPosition(1);
      const v2 = engine.getBodyVelocity(1);
      expect(Math.hypot(p2.x - (-x1), p2.y - (-y1), p2.z)).toBeLessThan(1e-3);
      expect(Math.hypot(v2.x - vx1, v2.y - vy1, v2.z)).toBeLessThan(1e-3);

      // Body 2 (Star 3)
      const p3 = engine.getBodyPosition(2);
      const v3 = engine.getBodyVelocity(2);
      expect(Math.hypot(p3.x, p3.y, p3.z)).toBeLessThan(1e-3);
      expect(Math.hypot(v3.x - vx3, v3.y - vy3, v3.z)).toBeLessThan(1e-3);

      // Analytical total energy conservation
      const totalE = engine.getTotalEnergy();
      expect(totalE).toBeCloseTo(-1.287, 2);
      expect(Math.abs(totalE - (-1.287))).toBeLessThan(0.01);
    });
  });

  describe('Test 5: Zero Heap Allocations in Update Loop', () => {
    it('executes 1,080 frames of update(dt) with zero runtime object or array allocations', () => {
      const engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
      const finale = new FinaleManager();
      finale.startChaosCycle(engine);

      const initialPosBuffer = engine.positions.buffer;
      const initialVelBuffer = engine.velocities.buffer;

      const originalPush = Array.prototype.push;
      const originalSlice = Array.prototype.slice;
      const originalSplice = Array.prototype.splice;
      const originalAssign = Object.assign;

      let pushCount = 0;
      let sliceCount = 0;
      let spliceCount = 0;
      let assignCount = 0;

      Array.prototype.push = function (...args) {
        pushCount++;
        return originalPush.apply(this, args);
      };
      Array.prototype.slice = function (...args) {
        sliceCount++;
        return originalSlice.apply(this, args);
      };
      Array.prototype.splice = function (...args) {
        spliceCount++;
        return originalSplice.apply(this, args);
      };
      Object.assign = function (...args) {
        assignCount++;
        return originalAssign.apply(this, args);
      };

      try {
        const dt = 1 / 120;
        for (let s = 0; s < 1080; s++) {
          finale.update(dt, engine);
        }

        expect(pushCount).toBe(0);
        expect(sliceCount).toBe(0);
        expect(spliceCount).toBe(0);
        expect(assignCount).toBe(0);

        expect(engine.positions.buffer).toBe(initialPosBuffer);
        expect(engine.velocities.buffer).toBe(initialVelBuffer);
      } finally {
        Array.prototype.push = originalPush;
        Array.prototype.slice = originalSlice;
        Array.prototype.splice = originalSplice;
        Object.assign = originalAssign;
      }
    });
  });

  describe('Test 6: Gameplay & Scoring Decoupling Invariants (Person A)', () => {
    it('preserves Spike target cup and normal scoring during active chaos cycle', () => {
      const controller = new MissionController(mockEventBus);
      // Unlock Chapter 4
      controller.setChapter(4);

      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.SPIKE);
      expect(controller.getCurrentTarget().trick).toBe(TrickType.SPIKE);

      // Trigger chaos cycle
      controller.startChaosCycle();
      expect(controller.isChaosActive()).toBe(true);

      // Verify target state remains CupKey.SPIKE
      expect(controller.getCurrentTarget().cupKey).toBe(CupKey.SPIKE);

      // Simulate catch during active chaos
      const targetAfterCatch = controller.handleCatch(CupKey.SPIKE);
      expect(targetAfterCatch).not.toBeNull();
      expect(targetAfterCatch.cupKey).toBe(CupKey.SPIKE);

      // Verify normal score awarding without penalty
      const energyBefore = controller.getMissionState().cosmicEnergy;
      controller.handleScore(35);
      expect(controller.getMissionState().cosmicEnergy).toBe(energyBefore + 35);
    });
  });
});

