/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Adaptive Substepping & Close Encounters (Step 1.5)
 * Role: Person B (The Physics Lead / Numerical Integrator)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';

describe('Adaptive Substepping Logic (Step 1.5)', () => {
  let engine;

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 8, G: 1.0, softening: 0.0, adaptiveSubstepping: true });
    engine.setSoftening(0.0);
    engine.setG(1.0);
  });

  describe('Test 1: Substep Threshold Triggering', () => {
    it('returns 1 substep when minimum body separation r_min > 1.0', () => {
      // Two bodies separated by r = 2.0
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'body_far', 0.1, 2.0, 0.0, 0.0, 0.0, 0.5, 0.0, false);

      const rMin = engine.computeMinSeparation();
      expect(rMin).toBeCloseTo(2.0, 9);
      expect(engine.getMinSeparation()).toBeCloseTo(2.0, 9);

      const substeps = engine.determineSubsteps();
      expect(substeps).toBe(1);
    });

    it('returns 4 substeps when 0.25 < r_min <= 1.0', () => {
      // Two bodies separated by r = 0.5
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'body_mid', 0.1, 0.5, 0.0, 0.0, 0.0, 1.0, 0.0, false);

      const rMin = engine.computeMinSeparation();
      expect(rMin).toBeCloseTo(0.5, 9);
      expect(engine.getMinSeparation()).toBeCloseTo(0.5, 9);

      const substeps = engine.determineSubsteps();
      expect(substeps).toBe(4);
    });

    it('returns 12 substeps when r_min <= 0.25', () => {
      // Two bodies separated by r = 0.15
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'body_close', 0.1, 0.15, 0.0, 0.0, 0.0, 2.0, 0.0, false);

      const rMin = engine.computeMinSeparation();
      expect(rMin).toBeCloseTo(0.15, 9);
      expect(engine.getMinSeparation()).toBeCloseTo(0.15, 9);

      const substeps = engine.determineSubsteps();
      expect(substeps).toBe(12);
    });

    it('handles degenerate cases with fewer than 2 active bodies by returning Infinity and 1 substep', () => {
      engine.setBody(0, 'lone_star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      expect(engine.computeMinSeparation()).toBe(Infinity);
      expect(engine.determineSubsteps()).toBe(1);
    });
  });

  describe('Test 2: Close Encounter Energy Conservation', () => {
    it('conserves total orbital energy with relative error < 10^-4 on highly eccentric close-periapsis encounter (rp <= 0.2)', () => {
      const mu = 1.0;
      const a = 1.0;
      const e = 0.85; // highly eccentric
      const rp = a * (1 - e); // periapsis = 0.15 <= 0.2
      const ra = a * (1 + e); // apoapsis = 1.85
      const va = Math.sqrt(mu * (2 / ra - 1 / a)); // apoapsis speed
      const T = 2 * Math.PI * Math.sqrt((a * a * a) / mu); // orbital period ≈ 6.2831853
      const dt = 0.02; // macroscopic step (50 Hz)

      // 1. Fixed single-stepping baseline (adaptiveSubstepping: false)
      const fixedEngine = new OrbitalEngine({ maxBodies: 2, G: 1.0, softening: 0.0, adaptiveSubstepping: false });
      fixedEngine.setSoftening(0.0);
      fixedEngine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      fixedEngine.setBody(1, 'planet', 1e-6, ra, 0.0, 0.0, 0.0, va, 0.0, false);
      const e0_fixed = fixedEngine.getSpecificOrbitalEnergy(1, 0);

      const steps = Math.floor(T / dt);
      const remainder = T - steps * dt;

      for (let s = 0; s < steps; s++) {
        fixedEngine.step(dt);
      }
      if (remainder > 0) {
        fixedEngine.step(remainder);
      }
      const e1_fixed = fixedEngine.getSpecificOrbitalEnergy(1, 0);
      const fixedDrift = Math.abs((e1_fixed - e0_fixed) / e0_fixed);

      // 2. Adaptive substepping run
      const adaptiveEngine = new OrbitalEngine({ maxBodies: 2, G: 1.0, softening: 0.0, adaptiveSubstepping: true });
      adaptiveEngine.setSoftening(0.0);
      adaptiveEngine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      adaptiveEngine.setBody(1, 'planet', 1e-6, ra, 0.0, 0.0, 0.0, va, 0.0, false);
      const e0_adapt = adaptiveEngine.getSpecificOrbitalEnergy(1, 0);

      let maxSubstepsObserved = 1;

      for (let s = 0; s < steps; s++) {
        adaptiveEngine.step(dt);
        const sub = adaptiveEngine.getLastSubstepCount();
        if (sub > maxSubstepsObserved) {
          maxSubstepsObserved = sub;
        }
      }
      if (remainder > 0) {
        adaptiveEngine.step(remainder);
      }
      const e1_adapt = adaptiveEngine.getSpecificOrbitalEnergy(1, 0);
      const adaptiveDrift = Math.abs((e1_adapt - e0_adapt) / e0_adapt);

      // Verify that 12 substeps were dynamically engaged during close periapsis passage
      expect(maxSubstepsObserved).toBe(12);

      // Verify adaptive drift is strictly below 10^-4
      expect(adaptiveDrift).toBeLessThan(1e-4);

      // Verify adaptive substepping substantially outperforms non-substepped integration
      expect(adaptiveDrift).toBeLessThan(fixedDrift / 100);
    });
  });

  describe('Test 3: Zero-Allocation Assertion', () => {
    it('executes 1,000 consecutive adaptive step iterations without creating heap garbage', () => {
      // Set up a dynamic 3-body system with varying separations
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'inner_planet', 0.01, 0.6, 0.0, 0.0, 0.0, 1.2, 0.0, false);
      engine.setBody(2, 'outer_comet', 0.001, 1.8, 0.0, 0.0, 0.0, 0.7, 0.0, false);

      // Spy on common heap allocation / array mutation methods
      const pushSpy = vi.spyOn(Array.prototype, 'push');
      const sliceSpy = vi.spyOn(Array.prototype, 'slice');
      const spliceSpy = vi.spyOn(Array.prototype, 'splice');
      const concatSpy = vi.spyOn(Array.prototype, 'concat');
      const assignSpy = vi.spyOn(Object, 'assign');
      const createSpy = vi.spyOn(Object, 'create');

      const dt = 1 / 120;
      for (let frame = 0; frame < 1000; frame++) {
        engine.step(dt);
      }

      expect(pushSpy).not.toHaveBeenCalled();
      expect(sliceSpy).not.toHaveBeenCalled();
      expect(spliceSpy).not.toHaveBeenCalled();
      expect(concatSpy).not.toHaveBeenCalled();
      expect(assignSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();

      pushSpy.mockRestore();
      sliceSpy.mockRestore();
      spliceSpy.mockRestore();
      concatSpy.mockRestore();
      assignSpy.mockRestore();
      createSpy.mockRestore();
    });
  });
});

