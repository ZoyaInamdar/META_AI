/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Chapter 1 Retrograde Capture Burn (Step 1.8)
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { CaptureBurn, BurnState } from '../src/physics/CaptureBurn.js';
import { Events } from '../src/contracts/Interfaces.js';
import { calculateApsides, calculateSemiMajorAxis } from '../src/physics/orbits.js';

describe('Chapter 1 Retrograde Capture Burn (Step 1.8)', () => {
  let engine;
  let burn;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn()
    };

    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    burn = new CaptureBurn(mockEventBus);
  });

  describe('Test 1: Hyperbolic Approach Verification (No Burn)', () => {
    it('verifies the unbraked planetoid is unbound (eps > 0) and escapes along a hyperbolic path', () => {
      // Body 0: Central Star (M = 1.0, fixed at origin)
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      // Body 1: Planetoid approaching periapsis r = 1.0 with speed v = 1.55 > v_esc = sqrt(2) ≈ 1.414
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

      const initialEps = engine.getSpecificOrbitalEnergy(1, 0);
      expect(initialEps).toBeGreaterThan(0.0);
      expect(initialEps).toBeCloseTo(0.20125, 4);

      // Step forward without burn for 5.0 seconds
      let prevR = 1.0;
      let isMonotonic = true;
      const dt = 0.01;

      for (let s = 0; s < 500; s++) {
        engine.step(dt);
        const pos = engine.getBodyPosition(1);
        const r = Math.hypot(pos.x, pos.y, pos.z);
        if (r < prevR - 1e-12) {
          isMonotonic = false;
          break;
        }
        prevR = r;
      }

      // Confirms indefinite escape trajectory
      expect(isMonotonic).toBe(true);
      expect(prevR).toBeGreaterThan(4.0);
      expect(engine.getSpecificOrbitalEnergy(1, 0)).toBeGreaterThan(0.0);
    });
  });

  describe('Test 2: Capture Burn Transition to Bound Orbit', () => {
    it('bleeds orbital energy into a bound elliptical orbit (eps < 0) with apoapsis < 4.0', () => {
      // Setup identical initial hyperbolic state
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

      expect(engine.getSpecificOrbitalEnergy(1, 0)).toBeGreaterThan(0.0);

      // Trigger 1.0-second retrograde capture burn with DeltaV = 0.5
      burn.triggerBurn(1, 0.5, 1.0);
      expect(burn.getBurnState().isActive).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.BURN_START,
        expect.objectContaining({ duration: 1.0, totalDeltaV: 0.5 })
      );

      // Execute burn over 1.0 second (100 steps of 0.01s)
      const dt = 0.01;
      for (let s = 0; s < 100; s++) {
        burn.update(dt, engine);
        engine.stepRK4(dt);
      }

      // Verify burn is completed
      expect(burn.getBurnState().isActive).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        Events.BURN_END,
        expect.objectContaining({ duration: 1.0, totalDeltaV: 0.5 })
      );

      // Verify specific orbital energy transitioned from positive to strictly negative
      const postBurnEps = engine.getSpecificOrbitalEnergy(1, 0);
      expect(postBurnEps).toBeLessThan(0.0);
      expect(postBurnEps).toBeCloseTo(-0.405, 2);

      // Verify orbital elements of captured orbit
      const postBurnPos = engine.getBodyPosition(1);
      const postBurnVel = engine.getBodyVelocity(1);
      const a = calculateSemiMajorAxis(postBurnPos, postBurnVel, 1.0);
      const apsides = calculateApsides(postBurnPos, postBurnVel, 1.0);

      expect(a).toBeGreaterThan(1.0);
      expect(a).toBeLessThan(2.0);
      expect(apsides.apoapsis).toBeLessThan(4.0);
      expect(apsides.periapsis).toBeGreaterThan(0.5);

      // Step for 1 full orbital period (~10.0 seconds) to verify closed, bound orbit
      let maxDist = 0;
      let minDist = Infinity;
      for (let s = 0; s < 1000; s++) {
        engine.step(0.01);
        const pos = engine.getBodyPosition(1);
        const r = Math.hypot(pos.x, pos.y, pos.z);
        if (r > maxDist) maxDist = r;
        if (r < minDist) minDist = r;
      }

      // Planet remains cleanly bound around Star 1 between periapsis and apoapsis
      expect(minDist).toBeGreaterThan(0.5);
      expect(maxDist).toBeLessThan(3.5);
    });
  });

  describe('Test 3: Burn Timing and Duration Invariant', () => {
    it('maintains isActive for exactly 1.0 second and ramps progress linearly from 0.0 to 1.0', () => {
      burn.triggerBurn(1, 0.5, 1.0);
      expect(burn.getBurnState().isActive).toBe(true);
      expect(burn.getBurnState().progress).toBe(0.0);
      expect(burn.getBurnState().elapsed).toBe(0.0);

      // Step halfway (0.5s)
      burn.update(0.5);
      expect(burn.getBurnState().isActive).toBe(true);
      expect(burn.getBurnState().elapsed).toBeCloseTo(0.5, 6);
      expect(burn.getBurnState().progress).toBeCloseTo(0.5, 6);

      // Step to 0.99s
      burn.update(0.49);
      expect(burn.getBurnState().isActive).toBe(true);
      expect(burn.getBurnState().elapsed).toBeCloseTo(0.99, 6);
      expect(burn.getBurnState().progress).toBeCloseTo(0.99, 6);

      // Step past 1.0s (e.g. +0.05s)
      burn.update(0.05);
      expect(burn.getBurnState().isActive).toBe(false);
      expect(burn.getBurnState().elapsed).toBe(1.0);
      expect(burn.getBurnState().progress).toBe(1.0);
    });

    it('executes zero runtime object allocations during burn update loop', () => {
      engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
      engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

      const zeroAllocBus = { emit: () => {}, on: () => {} };
      const nonAllocatingBurn = new CaptureBurn(zeroAllocBus);
      nonAllocatingBurn.triggerBurn(1, 0.5, 1.0);

      const originalPush = Array.prototype.push;
      const originalSlice = Array.prototype.slice;
      const originalAssign = Object.assign;

      let pushCount = 0;
      let sliceCount = 0;
      let assignCount = 0;

      Array.prototype.push = function (...args) {
        pushCount++;
        return originalPush.apply(this, args);
      };
      Array.prototype.slice = function (...args) {
        sliceCount++;
        return originalSlice.apply(this, args);
      };
      Object.assign = function (...args) {
        assignCount++;
        return originalAssign.apply(this, args);
      };

      try {
        const dt = 1 / 120;
        for (let s = 0; s < 120; s++) {
          nonAllocatingBurn.update(dt, engine);
        }

        expect(pushCount).toBe(0);
        expect(sliceCount).toBe(0);
        expect(assignCount).toBe(0);
      } finally {
        Array.prototype.push = originalPush;
        Array.prototype.slice = originalSlice;
        Object.assign = originalAssign;
      }
    });
  });
});

