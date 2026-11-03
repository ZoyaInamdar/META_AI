/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for OrbitalEngine (RK4 Gravitational Integrator)
 * Role: Person B (The Physics Lead)
 * Verification for Step 1.1: High-Performance, Zero-Allocation Integrator
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';

describe('OrbitalEngine: Zero-Allocation RK4 Integrator (Step 1.1)', () => {
  let engine;

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 16, G: 1.0, softening: 0.05 });
  });

  describe('Zero Runtime Allocations', () => {
    it('executes 200 consecutive stepRK4 iterations without invoking heap object or array allocations', () => {
      // Set up a standard 3-body system
      engine.setBody(0, 'star_primary', 1.0, 0.0, 0.0, 0.0, 0.0, -0.05, 0.0);
      engine.setBody(1, 'star_companion', 0.5, 1.2, 0.0, 0.0, 0.0, 0.06, 0.0);
      engine.setBody(2, 'planet', 0.01, 2.5, 0.0, 0.0, 0.0, 0.63, 0.0);

      // Spy on common heap allocation methods
      const pushSpy = vi.spyOn(Array.prototype, 'push');
      const sliceSpy = vi.spyOn(Array.prototype, 'slice');
      const spliceSpy = vi.spyOn(Array.prototype, 'splice');
      const concatSpy = vi.spyOn(Array.prototype, 'concat');
      const assignSpy = vi.spyOn(Object, 'assign');
      const createSpy = vi.spyOn(Object, 'create');

      const dt = 1 / 120;
      for (let step = 0; step < 200; step++) {
        engine.stepRK4(dt);
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

    it('getBodyPosition and getBodyVelocity write directly to target vector without allocation', () => {
      engine.setBody(0, 'planet', 0.01, 1.5, 2.5, -3.5, 0.1, 0.2, 0.3);

      const targetPos = { x: 0, y: 0, z: 0 };
      const targetVel = { x: 0, y: 0, z: 0 };

      const returnedPos = engine.getBodyPosition(0, targetPos);
      const returnedVel = engine.getBodyVelocity(0, targetVel);

      expect(returnedPos).toBe(targetPos);
      expect(targetPos.x).toBeCloseTo(1.5, 9);
      expect(targetPos.y).toBeCloseTo(2.5, 9);
      expect(targetPos.z).toBeCloseTo(-3.5, 9);

      expect(returnedVel).toBe(targetVel);
      expect(targetVel.x).toBeCloseTo(0.1, 9);
      expect(targetVel.y).toBeCloseTo(0.2, 9);
      expect(targetVel.z).toBeCloseTo(0.3, 9);
    });

    it('getTotalMomentum writes directly to target Float64Array without allocation', () => {
      engine.setBody(0, 'star_a', 1.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0);
      engine.setBody(1, 'star_b', 1.0, 1.0, 0.0, 0.0, 0.0, -0.5, 0.0);

      const targetOut = new Float64Array(3);
      const res = engine.getTotalMomentum(targetOut);

      expect(res).toBe(targetOut);
      expect(targetOut[0]).toBe(0.0);
      expect(targetOut[1]).toBe(0.0);
      expect(targetOut[2]).toBe(0.0);
    });
  });

  describe('Conservation of Linear Momentum', () => {
    it('conserves total linear momentum within 10^-12 across 1000 steps in an isolated multi-body system', () => {
      // Set up isolated 3-body system with net momentum P = 0
      // P_y = 1.0*(-0.05) + 0.5*(0.06) + 0.5*(0.04) = -0.05 + 0.03 + 0.02 = 0.0
      engine.setBody(0, 'body_0', 1.0, 0.0, 0.0, 0.0, 0.0, -0.05, 0.0);
      engine.setBody(1, 'body_1', 0.5, 1.5, 0.0, 0.0, 0.0, 0.06, 0.0);
      engine.setBody(2, 'body_2', 0.5, -1.5, 0.0, 0.0, 0.0, 0.04, 0.0);

      const initialP = engine.getTotalMomentum();
      expect(Math.abs(initialP[0])).toBeLessThan(1e-15);
      expect(Math.abs(initialP[1])).toBeLessThan(1e-15);
      expect(Math.abs(initialP[2])).toBeLessThan(1e-15);

      const dt = 1 / 120;
      for (let s = 0; s < 1000; s++) {
        engine.stepRK4(dt);
      }

      const finalP = engine.getTotalMomentum();
      const pMagnitude = Math.sqrt(
        finalP[0] * finalP[0] +
        finalP[1] * finalP[1] +
        finalP[2] * finalP[2]
      );

      expect(pMagnitude).toBeLessThan(1e-12);
    });
  });

  describe('Energy Stability & Keplerian Orbit', () => {
    it('conserves total mechanical energy within relative error of 10^-5 across multiple orbits (m1=1, m2=0.001, r=1, v=1)', () => {
      // Benchmark setup: G = 1.0, softening = 0.0 for pure Newtonian central potential test
      engine.setG(1.0);
      engine.setSoftening(0.0);

      // Body 1 is central primary of mass 1.0 (fixed at origin)
      // Body 2 is small planetoid of mass 0.001 at r = 1.0 with circular speed v = 1.0
      engine.setBody(0, 'star_primary', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 0.001, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, false);

      const initialEnergy = engine.getTotalEnergy();
      // Theoretical: T = 0.5 * 0.001 * 1.0^2 = 0.0005, V = -1.0 * (1.0 * 0.001) / 1.0 = -0.001 -> E = -0.0005
      expect(initialEnergy).toBeCloseTo(-0.0005, 9);

      // Period T = 2 * pi * r / v = 2 * pi * 1.0 / 1.0 ≈ 6.283185s
      // At dt = 1/120s (~0.008333s), 2 full orbits is ~1508 steps
      const dt = 1 / 120;
      const stepsForTwoOrbits = Math.round((4 * Math.PI) / dt); // ~1508 steps

      for (let s = 0; s < stepsForTwoOrbits; s++) {
        engine.stepRK4(dt);
      }

      const finalEnergy = engine.getTotalEnergy();
      const relativeEnergyError = Math.abs((finalEnergy - initialEnergy) / initialEnergy);

      expect(relativeEnergyError).toBeLessThan(1e-5);

      // Planet radius after 2 full orbits should remain near r = 1.0
      const pos = engine.getBodyPosition(1);
      const finalR = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
      expect(Math.abs(finalR - 1.0)).toBeLessThan(1e-4);
    });

    it('conserves total energy in dynamic 2-body barycentric system', () => {
      engine.setG(1.0);
      engine.setSoftening(0.0);

      // True 2-body orbit in center-of-mass frame
      const m1 = 1.0;
      const m2 = 0.001;
      const M = m1 + m2;
      const r = 1.0;
      const vRel = Math.sqrt((engine.G * M) / r);

      // Barycentric positions and velocities
      const r1 = -(m2 / M) * r;
      const r2 = (m1 / M) * r;
      const v1 = -(m2 / M) * vRel;
      const v2 = (m1 / M) * vRel;

      engine.setBody(0, 'star', m1, r1, 0, 0, 0, v1, 0, false);
      engine.setBody(1, 'planet', m2, r2, 0, 0, 0, v2, 0, false);

      const initialE = engine.getTotalEnergy();
      const dt = 1 / 120;
      const totalSteps = 1000;

      for (let s = 0; s < totalSteps; s++) {
        engine.stepRK4(dt);
      }

      const finalE = engine.getTotalEnergy();
      const relError = Math.abs((finalE - initialE) / initialE);
      expect(relError).toBeLessThan(1e-5);
    });
  });

  describe('Plummer Softening & Impulse Navigation Interventions', () => {
    it('Plummer softening prevents infinite forces when two bodies collide (r -> 0)', () => {
      engine.setSoftening(0.05);
      // Place two bodies at identical positions
      engine.setBody(0, 'body_a', 1.0, 0.0, 0.0, 0.0, 0, 0, 0);
      engine.setBody(1, 'body_b', 1.0, 0.0, 0.0, 0.0, 0, 0, 0);

      const accBuffer = new Float64Array(6);
      engine.computeAccelerations(engine.positions, accBuffer);

      // With softening eps = 0.05, force = G * m / eps^3 = 1.0 / (0.05^3) = 8000
      // But dx = dy = dz = 0, so acceleration must be cleanly 0 without NaN or Infinity
      expect(Number.isFinite(accBuffer[0])).toBe(true);
      expect(Number.isFinite(accBuffer[1])).toBe(true);
      expect(Number.isFinite(accBuffer[2])).toBe(true);
      expect(accBuffer[0]).toBe(0.0);
      expect(accBuffer[1]).toBe(0.0);
      expect(accBuffer[2]).toBe(0.0);
    });

    it('applyInterventionImpulse modifies target body velocity cleanly', () => {
      engine.setBody(0, 'planet', 0.01, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0);

      const applied = engine.applyInterventionImpulse('planet', { x: 0.0, y: -0.22, z: 0.05 });
      expect(applied).toBe(true);

      const vel = engine.getBodyVelocity(0);
      expect(vel.x).toBeCloseTo(0.0, 9);
      expect(vel.y).toBeCloseTo(0.78, 9); // 1.0 - 0.22 = 0.78
      expect(vel.z).toBeCloseTo(0.05, 9);
    });

    it('getPhysicsState returns populated snapshot adhering to PhysicsState contract', () => {
      engine.setBody(0, 'star_gold', 1.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 0.01, 1.0, 2.0, 3.0, 0.1, 0.2, 0.3, false);

      const state = engine.getPhysicsState();
      expect(state.bodies.length).toBe(2);
      expect(state.bodies[0].id).toBe('star_gold');
      expect(state.bodies[0].fixed).toBe(true);
      expect(state.bodies[1].id).toBe('planet');
      expect(state.bodies[1].pos.x).toBe(1.0);
      expect(state.bodies[1].vel.z).toBe(0.3);
    });
  });
});

