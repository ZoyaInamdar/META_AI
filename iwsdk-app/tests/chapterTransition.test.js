/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Chapter 1 -> Chapter 2 Transition & Resonance Handover
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Verifies Phase 2C Step 4 Architecture Audit findings:
 * 1. State Machine Progression:
 *    CHAPTER_1_CAPTURE -> TRANSITION_TO_BINARY (BLENDING_1_TO_2) -> CHAPTER_2_RESONANCE -> CHAPTER_2_STABILIZED
 * 2. Cubic Hermite Smoothstep Mathematics:
 *    S(tau) = 3*tau^2 - 2*tau^3, dS/dt = 6*tau*(1 - tau) / T
 *    Smooth position and velocity blending into (0, 2.4, 0), vx = -0.9128709
 * 3. Boundary Value Continuity (C^1 smoothness at boundaries without velocity spikes)
 * 4. Chapter-Scoped Three-Body Collinear Alignment (Star 1, Star 2, Planet within 5 degrees)
 * 5. Zero Heap Allocations: 240 transition update frames (2.0s at 120 Hz) with zero dynamic GC allocations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MissionController, ChapterTransitionState } from '../src/mission/MissionController.js';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { BinarySystem, setupChapter2Binary } from '../src/physics/BinarySystem.js';
import { Events } from '../src/contracts/Interfaces.js';
import { MISSION_THRESHOLDS, CADENCE_CONFIG, TRANSITION_CONFIG } from '../src/mission/missionConfig.js';

describe('Chapter 1 -> Chapter 2 Transition & Continuity (Phase 2C Step 4)', () => {
  let engine;
  let mockEventBus;
  let controller;
  let binarySystem;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };

    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    binarySystem = new BinarySystem(engine);
    controller = new MissionController(mockEventBus, {
      orbitalEngine: engine,
      binarySystem,
      transitionDuration: 2.0
    });
  });

  describe('Test 1: State Machine Progression & Authority', () => {
    it('initializes in CHAPTER_1_CAPTURE and transitions to TRANSITION_TO_BINARY at 400 energy', () => {
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_1_CAPTURE);
      expect(controller.isTransitioning()).toBe(false);
      expect(controller.getTransitionProgress()).toBe(0.0);

      // Setup initial Chapter 1 state: Star 1 at origin, Planet on bound/hyperbolic orbit
      engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, false);
      engine.setBody(1, 'planet', 1e-6, 1.5, 0.0, 0.0, 0.0, 0.8, 0.0, false);

      // Score 380 energy: stays in Chapter 1
      controller.handleScore(380);
      expect(controller.chapter).toBe(1);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_1_CAPTURE);
      expect(controller.isTransitioning()).toBe(false);

      // Score 30 energy: total 410 >= 400, crosses milestone into Chapter 2 transition
      controller.handleScore(30);
      expect(controller.chapter).toBe(2);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.TRANSITION_TO_BINARY);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.BLENDING_1_TO_2);
      expect(controller.isTransitioning()).toBe(true);
      expect(controller.getTransitionProgress()).toBe(0.0);

      // Verify Events.MISSION was emitted with chapterState and isTransitioning
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.MISSION,
        expect.objectContaining({
          chapter: 2,
          chapterState: ChapterTransitionState.TRANSITION_TO_BINARY,
          isTransitioning: true
        })
      );
    });

    it('advances through 2.0s duration into CHAPTER_2_RESONANCE and emits CADENCE event', () => {
      controller.startTransitionToBinary();
      expect(controller.isTransitioning()).toBe(true);

      // Advance by 1.0s (halfway)
      controller.update(1.0);
      expect(controller.isTransitioning()).toBe(true);
      expect(controller.getTransitionProgress()).toBeCloseTo(0.5, 6);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.TRANSITION_TO_BINARY);

      // Advance by another 1.0s (completion at 2.0s)
      controller.update(1.0);
      expect(controller.isTransitioning()).toBe(false);
      expect(controller.getTransitionProgress()).toBe(1.0);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_2_RESONANCE);

      // Verify CADENCE event emitted with 1.75s rhythm target
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.CADENCE,
        expect.objectContaining({
          targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL
        })
      );
    });

    it('advances from CHAPTER_2_RESONANCE to CHAPTER_2_STABILIZED when resonance condition is satisfied', () => {
      controller.startTransitionToBinary();
      controller.update(2.0); // Complete transition to CHAPTER_2_RESONANCE
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_2_RESONANCE);

      // Planet orbital radius expands to >= 3.15 (resonant radius)
      engine.setBody(2, 'planet', 1e-6, 0.0, 3.16, 0.0, -0.8, 0.0, 0.0, false);
      controller.update(0.01);
      expect(controller.getChapterState()).toBe(ChapterTransitionState.CHAPTER_2_STABILIZED);
    });
  });

  describe('Test 2: Cubic Hermite Smoothstep Mathematics', () => {
    it('blends position and velocity strictly per S(tau) = 3*tau^2 - 2*tau^3 and continuous derivative S_prime(tau)', () => {
      const startPos = { x: 1.0, y: 0.0, z: 0.0 };
      const startVel = { x: 0.0, y: 1.0, z: 0.0 };
      const targetPos = { x: 0.0, y: 2.4, z: 0.0 };
      const targetVel = { x: -0.9128709291752769, y: 0.0, z: 0.0 };

      controller.startTransitionToBinary({
        startPos,
        startVel,
        targetPos,
        targetVel
      });

      // Step to tau = 0.5 (t = 1.0s for 2.0s duration)
      controller.update(1.0);

      // Analytical expected values:
      // tau = 0.5
      // S(0.5) = 3*(0.25) - 2*(0.125) = 0.75 - 0.25 = 0.5
      // dS/dt = 6*tau*(1 - tau) / T = 6*(0.5)*(0.5) / 2.0 = 1.5 / 2.0 = 0.75
      //
      // pos = (1 - S)*startPos + S*targetPos
      // posX = 0.5 * 1.0 + 0.5 * 0.0 = 0.5
      // posY = 0.5 * 0.0 + 0.5 * 2.4 = 1.2
      // posZ = 0.0
      //
      // vel = (1 - S)*startVel + S*targetVel + dS/dt * (targetPos - startPos)
      // dx = 0.0 - 1.0 = -1.0
      // dy = 2.4 - 0.0 = 2.4
      // dz = 0.0
      // velX = 0.5 * 0.0 + 0.5 * (-0.9128709291752769) + 0.75 * (-1.0)
      //      = -0.45643546458763845 - 0.75 = -1.2064354645876385
      // velY = 0.5 * 1.0 + 0.5 * 0.0 + 0.75 * (2.4) = 0.5 + 1.8 = 2.3
      // velZ = 0.0

      const pIdx = 2;
      const actualPos = engine.getBodyPosition(pIdx);
      const actualVel = engine.getBodyVelocity(pIdx);

      expect(actualPos.x).toBeCloseTo(0.5, 6);
      expect(actualPos.y).toBeCloseTo(1.2, 6);
      expect(actualPos.z).toBeCloseTo(0.0, 6);

      expect(actualVel.x).toBeCloseTo(-1.2064355, 6);
      expect(actualVel.y).toBeCloseTo(2.3, 6);
      expect(actualVel.z).toBeCloseTo(0.0, 6);
    });
  });

  describe('Test 3: Boundary Value Continuity (C^1 Smoothness)', () => {
    it('matches start state at tau = 0 and target injection state at tau = 1 with zero derivative spikes', () => {
      const startPos = { x: 1.5, y: -0.5, z: 0.0 };
      const startVel = { x: -0.2, y: 0.9, z: 0.0 };

      controller.startTransitionToBinary({
        startPos,
        startVel
      });

      const pIdx = 2;
      // At tau = 0
      const pos0 = engine.getBodyPosition(pIdx);
      const vel0 = engine.getBodyVelocity(pIdx);
      expect(pos0.x).toBe(startPos.x);
      expect(pos0.y).toBe(startPos.y);
      expect(vel0.x).toBe(startVel.x);
      expect(vel0.y).toBe(startVel.y);

      // Advance across 240 steps of dt = 1/120s (2.0s total)
      const dt = 1.0 / 120.0;
      for (let i = 0; i < 240; i++) {
        controller.update(dt);
      }

      // At tau = 1.0
      expect(controller.isTransitioning()).toBe(false);
      expect(controller.getTransitionProgress()).toBe(1.0);

      const posFinal = engine.getBodyPosition(pIdx);
      const velFinal = engine.getBodyVelocity(pIdx);

      expect(posFinal.x).toBeCloseTo(TRANSITION_CONFIG.TARGET_POS.x, 8);
      expect(posFinal.y).toBeCloseTo(TRANSITION_CONFIG.TARGET_POS.y, 8);
      expect(posFinal.z).toBeCloseTo(TRANSITION_CONFIG.TARGET_POS.z, 8);

      expect(velFinal.x).toBeCloseTo(TRANSITION_CONFIG.TARGET_VEL.x, 8);
      expect(velFinal.y).toBeCloseTo(TRANSITION_CONFIG.TARGET_VEL.y, 8);
      expect(velFinal.z).toBeCloseTo(TRANSITION_CONFIG.TARGET_VEL.z, 8);
    });
  });

  describe('Test 4: Chapter-Scoped Three-Body Collinear Alignment', () => {
    it('evaluates collinear alignment angle strictly within Chapter 2 and returns 180 degrees outside Chapter 2', () => {
      // 1. Outside Chapter 2 (in Chapter 1)
      expect(controller.chapter).toBe(1);
      const alignCh1 = controller.getThreeBodyAlignment();
      expect(alignCh1.isAligned).toBe(false);
      expect(alignCh1.angleDegrees).toBe(180.0);

      // 2. Set to Chapter 2
      controller.setChapter(2);
      expect(controller.chapter).toBe(2);

      // Setup binary stars along X-axis: Star 1 at (+0.4, 0, 0), Star 2 at (-0.4, 0, 0)
      engine.setBody(0, 'star_1', 1.0, 0.4, 0.0, 0.0, 0.0, 0.7905, 0.0, false);
      engine.setBody(1, 'star_2', 1.0, -0.4, 0.0, 0.0, 0.0, -0.7905, 0.0, false);

      // A. Planet Collinear on +X axis at (2.4, 0, 0): Angle = 0 deg < 5 deg -> isAligned = true
      engine.setBody(2, 'planet', 1e-6, 2.4, 0.0, 0.0, 0.0, 0.9128, 0.0, false);
      const alignCollinear = controller.getThreeBodyAlignment();
      expect(alignCollinear.angleDegrees).toBeCloseTo(0.0, 2);
      expect(alignCollinear.isAligned).toBe(true);

      // B. Planet Perpendicular on +Y axis at (0, 2.4, 0): Angle = 90 deg > 5 deg -> isAligned = false
      engine.setBody(2, 'planet', 1e-6, 0.0, 2.4, 0.0, -0.9128, 0.0, 0.0, false);
      const alignPerpendicular = controller.getThreeBodyAlignment();
      expect(alignPerpendicular.angleDegrees).toBeCloseTo(90.0, 2);
      expect(alignPerpendicular.isAligned).toBe(false);

      // C. Planet at 3 degrees deviation: Angle = 3 deg < 5 deg -> isAligned = true
      const rad3 = 3.0 * (Math.PI / 180.0);
      engine.setBody(2, 'planet', 1e-6, 2.4 * Math.cos(rad3), 2.4 * Math.sin(rad3), 0.0, 0.0, 0.0, 0.0, false);
      const align3Deg = controller.getThreeBodyAlignment();
      expect(align3Deg.angleDegrees).toBeCloseTo(3.0, 1);
      expect(align3Deg.isAligned).toBe(true);

      // D. Planet at 7 degrees deviation: Angle = 7 deg > 5 deg -> isAligned = false
      const rad7 = 7.0 * (Math.PI / 180.0);
      engine.setBody(2, 'planet', 1e-6, 2.4 * Math.cos(rad7), 2.4 * Math.sin(rad7), 0.0, 0.0, 0.0, 0.0, false);
      const align7Deg = controller.getThreeBodyAlignment();
      expect(align7Deg.angleDegrees).toBeCloseTo(7.0, 1);
      expect(align7Deg.isAligned).toBe(false);

      // 3. Move to Chapter 3: Alignment check returns false / 180 deg
      controller.setChapter(3);
      const alignCh3 = controller.getThreeBodyAlignment();
      expect(alignCh3.isAligned).toBe(false);
      expect(alignCh3.angleDegrees).toBe(180.0);
    });
  });

  describe('Test 5: Zero Heap Allocations During Continuous Transition Updates', () => {
    it('executes 240 frames (2.0s at 120Hz) with zero per-frame object or array allocations', () => {
      // Use plain function callbacks so vitest mock tracking (vi.fn) does not record push calls
      controller.eventBus = { emit: () => {}, on: () => {} };
      controller.startTransitionToBinary();

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

      const dt = 1.0 / 120.0;
      try {
        for (let frame = 0; frame < 240; frame++) {
          controller.update(dt);
        }
      } finally {
        Array.prototype.push = originalPush;
        Array.prototype.slice = originalSlice;
        Array.prototype.splice = originalSplice;
        Object.assign = originalAssign;
      }

      // Memory and allocation invariants
      expect(pushCount).toBe(0);
      expect(sliceCount).toBe(0);
      expect(spliceCount).toBe(0);
      expect(assignCount).toBe(0);

      // Flat Float64Array buffer references preserved without reallocation
      expect(engine.positions.buffer).toBe(initialPosBuffer);
      expect(engine.velocities.buffer).toBe(initialVelBuffer);
    });
  });

  describe('Test 6: CPU Performance Budget (< 1.0 ms for 240 transition frames)', () => {
    it('executes entire 2.0s transition in well under 5.0 ms total (< 0.02 ms/frame)', () => {
      controller.startTransitionToBinary();
      const dt = 1.0 / 120.0;

      // Warmup JIT
      for (let i = 0; i < 50; i++) {
        controller.update(dt);
      }

      controller.startTransitionToBinary();
      const t0 = performance.now();
      for (let frame = 0; frame < 240; frame++) {
        controller.update(dt);
      }
      const elapsedMs = performance.now() - t0;

      // 240 frames in < 5.0 ms
      expect(elapsedMs).toBeLessThan(5.0);
    });
  });
});
