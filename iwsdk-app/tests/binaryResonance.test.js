/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Chapter 2 Binary Star System & Circumbinary Resonance (Step 2.1)
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { setupChapter2Binary, applyProgradeImpulse, BinarySystem } from '../src/physics/BinarySystem.js';
import { MissionController } from '../src/mission/MissionController.js';
import { Events } from '../src/contracts/Interfaces.js';
import { calculateSemiMajorAxis } from '../src/physics/orbits.js';
import { CADENCE_CONFIG, BINARY_CONFIG } from '../src/mission/missionConfig.js';

describe('Chapter 2 Binary Resonance & Cadence Impulse (Step 2.1)', () => {
  let engine;
  let mockEventBus;
  let missionController;
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
    missionController = new MissionController(mockEventBus, {
      orbitalEngine: engine,
      binarySystem
    });
  });

  describe('Test 1: Binary Star Stability', () => {
    it('maintains mutual separation 0.8 +/- 10^-3 and zero barycenter drift (< 10^-12) across 5 full revolutions', () => {
      // Setup binary stars only (m1 = m2 = 1.0, d = 0.8)
      const d = BINARY_CONFIG.SEPARATION; // 0.8
      const m1 = BINARY_CONFIG.STAR_MASS_1;
      const m2 = BINARY_CONFIG.STAR_MASS_2;
      const vStar = Math.sqrt((1.0 * m2 * m2) / ((m1 + m2) * d)); // sqrt(1 / 1.6) ≈ 0.7905694

      engine.setBody(0, 'star_1', m1, d / 2, 0.0, 0.0, 0.0, vStar, 0.0, false);
      engine.setBody(1, 'star_2', m2, -d / 2, 0.0, 0.0, 0.0, -vStar, 0.0, false);

      const periodBinary = 2 * Math.PI * Math.sqrt((d * d * d) / (m1 + m2)); // ≈ 3.179s
      const dt = 0.005;
      const totalSteps = Math.round((5 * periodBinary) / dt);

      for (let s = 0; s < totalSteps; s++) {
        engine.stepRK4(dt);
      }

      const p1 = engine.getBodyPosition(0);
      const p2 = engine.getBodyPosition(1);

      // Mutual separation remains 0.8 within strict tolerance
      const currentSeparation = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      expect(Math.abs(currentSeparation - d)).toBeLessThan(1e-3);

      // Barycenter (m1*r1 + m2*r2) / 2 remains strictly centered at (0, 0, 0)
      const baryX = (m1 * p1.x + m2 * p2.x) / (m1 + m2);
      const baryY = (m1 * p1.y + m2 * p2.y) / (m1 + m2);
      const baryZ = (m1 * p1.z + m2 * p2.z) / (m1 + m2);
      const baryDrift = Math.hypot(baryX, baryY, baryZ);
      expect(baryDrift).toBeLessThan(1e-12);

      // Net linear momentum remains zero
      const momentum = engine.getTotalMomentum();
      expect(Math.hypot(momentum[0], momentum[1], momentum[2])).toBeLessThan(1e-12);
    });
  });

  describe('Test 2: Circumbinary Orbit Stability', () => {
    it('keeps planet bound at r ≈ 2.4 without chaotic ejection across 2 full orbits (~33s)', () => {
      // Setup complete 3-body system via setupChapter2Binary
      const setup = setupChapter2Binary(engine);
      expect(setup.d).toBe(0.8);
      expect(setup.rPlanet).toBe(2.4);

      const periodPlanet = 2 * Math.PI * Math.sqrt((setup.rPlanet ** 3) / 2.0); // ≈ 16.52s
      const dt = 0.01;
      const totalSteps = Math.round((2 * periodPlanet) / dt);

      let minR = Infinity;
      let maxR = 0.0;

      for (let s = 0; s < totalSteps; s++) {
        engine.step(dt);
        const p = engine.getBodyPosition(2);
        const r = Math.hypot(p.x, p.y, p.z);
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }

      // Planet remains cleanly in circumbinary orbit outside the chaotic zone (> 2.0)
      expect(minR).toBeGreaterThan(2.0);
      expect(maxR).toBeLessThan(3.0);
    });
  });

  describe('Test 3: On-Cadence Impulse Expansion', () => {
    it('applies prograde impulse along instantaneous motion and increases semi-major axis', () => {
      binarySystem.setup();
      missionController.setChapter(2);

      const posBefore = engine.getBodyPosition(2);
      const velBefore = engine.getBodyVelocity(2);
      const aBefore = calculateSemiMajorAxis(posBefore, velBefore, 2.0);

      // Emit on-cadence catch score event
      missionController.handleScore({
        awardedEnergy: 40,
        isOnCadence: true,
        multipliers: { cadence: 1.25 }
      });

      const posAfter = engine.getBodyPosition(2);
      const velAfter = engine.getBodyVelocity(2);
      const aAfter = calculateSemiMajorAxis(posAfter, velAfter, 2.0);

      // Verify speed increased
      const vMagBefore = Math.hypot(velBefore.x, velBefore.y, velBefore.z);
      const vMagAfter = Math.hypot(velAfter.x, velAfter.y, velAfter.z);
      expect(vMagAfter).toBeGreaterThan(vMagBefore);
      expect(vMagAfter - vMagBefore).toBeCloseTo(0.05, 5);

      // Semi-major axis expanded outward toward resonance
      expect(aAfter).toBeGreaterThan(aBefore);
    });
  });

  describe('Test 4: Off-Cadence Catch No-Impulse Invariant', () => {
    it('awards energy to MissionController while preserving orbital velocity unchanged on off-beat catches', () => {
      binarySystem.setup();
      missionController.setChapter(2);

      const energyBefore = missionController.getMissionState().cosmicEnergy;
      const velBefore = engine.getBodyVelocity(2);

      // Off-cadence catch (isOnCadence: false, cadenceMultiplier: 1.0)
      missionController.handleScore({
        awardedEnergy: 20,
        isOnCadence: false,
        cadenceMultiplier: 1.0,
        multipliers: { cadence: 1.0 }
      });

      // Energy increases normally
      expect(missionController.getMissionState().cosmicEnergy).toBe(energyBefore + 20);

      // Velocity remains strictly identical (zero orbital impulse applied)
      const velAfter = engine.getBodyVelocity(2);
      expect(velAfter.x).toBe(velBefore.x);
      expect(velAfter.y).toBe(velBefore.y);
      expect(velAfter.z).toBe(velBefore.z);
    });

    it('emits Events.CADENCE when entering Chapter 2 with targetCadenceSeconds 1.75', () => {
      // Transition from Chapter 1 (350) into Chapter 2 (400)
      missionController.handleScore(400);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.CADENCE,
        expect.objectContaining({ targetCadenceSeconds: CADENCE_CONFIG.TARGET_INTERVAL })
      );
    });
  });
});

