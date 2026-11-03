/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Analytical Astrodynamics & Orbital Mechanics (Step 1.4)
 * Role: Person B (The Physics Lead / Analytical Keplerian Validation)
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSpecificEnergy,
  calculateAngularMomentum,
  calculateAngularMomentumMagnitude,
  calculateEccentricityVector,
  calculateEccentricity,
  calculateSemiMajorAxis,
  calculateOrbitalPeriod,
  calculateApsides,
  calculateEscapeVelocity,
  calculateCircularVelocity,
  calculateOrbitalSpeed,
  classifyOrbit
} from '../src/physics/orbits.js';

describe('Analytical Astrodynamics Library (Step 1.4)', () => {
  const MU = 1.0;

  describe('Standard Circular Orbit Test (e = 0.0)', () => {
    // Standard circular orbit at r = 1.0, v = 1.0
    const r = { x: 1.0, y: 0.0, z: 0.0 };
    const v = { x: 0.0, y: 1.0, z: 0.0 };

    it('calculates specific orbital energy eps = -0.5', () => {
      const eps = calculateSpecificEnergy(r, v, MU);
      expect(eps).toBeCloseTo(-0.5, 10);
    });

    it('calculates angular momentum vector h = (0, 0, 1.0) and magnitude 1.0', () => {
      const h = calculateAngularMomentum(r, v);
      expect(h.x).toBeCloseTo(0.0, 10);
      expect(h.y).toBeCloseTo(0.0, 10);
      expect(h.z).toBeCloseTo(1.0, 10);

      const hMag = calculateAngularMomentumMagnitude(r, v);
      expect(hMag).toBeCloseTo(1.0, 10);
    });

    it('calculates eccentricity vector ||e|| < 10^-10 and scalar eccentricity e = 0', () => {
      const eVec = calculateEccentricityVector(r, v, MU);
      const eMag = Math.hypot(eVec.x, eVec.y, eVec.z);
      expect(eMag).toBeLessThan(1e-10);

      const eScalar = calculateEccentricity(r, v, MU);
      expect(eScalar).toBeLessThan(1e-10);
      expect(classifyOrbit(r, v, MU)).toBe('circular');
    });

    it('calculates semi-major axis a = 1.0', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      expect(a).toBeCloseTo(1.0, 10);
    });

    it('calculates orbital period T = 2*pi ≈ 6.2831853', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      const T = calculateOrbitalPeriod(a, MU);
      expect(T).toBeCloseTo(2 * Math.PI, 6);
      expect(T).toBeCloseTo(6.2831853, 5);
    });

    it('calculates apsides: rp = 1.0 and ra = 1.0', () => {
      const { periapsis, apoapsis } = calculateApsides(r, v, MU);
      expect(periapsis).toBeCloseTo(1.0, 10);
      expect(apoapsis).toBeCloseTo(1.0, 10);
    });
  });

  describe('Elliptical Orbit Test (e = 0.5, a = 1.0)', () => {
    // At periapsis rp = 0.5 with a = 1.0:
    // vp = sqrt(MU * (2/0.5 - 1/1.0)) = sqrt(4 - 1) = sqrt(3) ≈ 1.7320508
    const r = { x: 0.5, y: 0.0, z: 0.0 };
    const v = { x: 0.0, y: Math.sqrt(3.0), z: 0.0 };

    it('calculates specific orbital energy eps = -0.5', () => {
      const eps = calculateSpecificEnergy(r, v, MU);
      expect(eps).toBeCloseTo(-0.5, 10);
    });

    it('calculates semi-major axis a = 1.0', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      expect(a).toBeCloseTo(1.0, 10);
    });

    it('calculates eccentricity e ≈ 0.5 within ±10^-6', () => {
      const eScalar = calculateEccentricity(r, v, MU);
      expect(eScalar).toBeCloseTo(0.5, 6);

      const eVec = calculateEccentricityVector(r, v, MU);
      expect(eVec.x).toBeCloseTo(0.5, 6);
      expect(eVec.y).toBeCloseTo(0.0, 6);
      expect(eVec.z).toBeCloseTo(0.0, 6);

      expect(classifyOrbit(r, v, MU)).toBe('elliptic');
    });

    it('calculates periapsis rp ≈ 0.5 and apoapsis ra ≈ 1.5', () => {
      const { periapsis, apoapsis } = calculateApsides(r, v, MU);
      expect(periapsis).toBeCloseTo(0.5, 6);
      expect(apoapsis).toBeCloseTo(1.5, 6);
    });

    it('calculates orbital period identical to circular orbit of equal semi-major axis', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      const T = calculateOrbitalPeriod(a, MU);
      expect(T).toBeCloseTo(2 * Math.PI, 6);
    });
  });

  describe('Hyperbolic Orbit Test (e > 1, eps > 0)', () => {
    // r = (1.0, 0, 0), v = (0, 2.0, 0)
    const r = { x: 1.0, y: 0.0, z: 0.0 };
    const v = { x: 0.0, y: 2.0, z: 0.0 };

    it('calculates strictly positive specific energy eps = +1.0', () => {
      const eps = calculateSpecificEnergy(r, v, MU);
      expect(eps).toBeGreaterThan(0.0);
      expect(eps).toBeCloseTo(1.0, 10);
    });

    it('calculates negative semi-major axis a = -0.5 for hyperbola', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      expect(a).toBeCloseTo(-0.5, 10);
    });

    it('calculates eccentricity e = 3.0 > 1.0', () => {
      const eScalar = calculateEccentricity(r, v, MU);
      expect(eScalar).toBeGreaterThan(1.0);
      expect(eScalar).toBeCloseTo(3.0, 10);

      const eVec = calculateEccentricityVector(r, v, MU);
      expect(eVec.x).toBeCloseTo(3.0, 10);
      expect(eVec.y).toBeCloseTo(0.0, 10);
      expect(eVec.z).toBeCloseTo(0.0, 10);

      expect(classifyOrbit(r, v, MU)).toBe('hyperbolic');
    });

    it('returns Infinity for orbital period on unbounded hyperbolic orbit', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      const T = calculateOrbitalPeriod(a, MU);
      expect(T).toBe(Infinity);
    });

    it('calculates periapsis rp = |a|*(e-1) = 0.5 * 2 = 1.0 and apoapsis Infinity', () => {
      const { periapsis, apoapsis } = calculateApsides(r, v, MU);
      expect(periapsis).toBeCloseTo(1.0, 10);
      expect(apoapsis).toBe(Infinity);
    });
  });

  describe('Parabolic Escape Velocity Threshold', () => {
    // v_esc = sqrt(2 * MU / r) = sqrt(2) ≈ 1.41421356
    const r = [1.0, 0.0, 0.0];
    const v = [0.0, Math.SQRT2, 0.0];

    it('calculates specific energy eps ≈ 0.0 and eccentricity e ≈ 1.0', () => {
      const eps = calculateSpecificEnergy(r, v, MU);
      expect(Math.abs(eps)).toBeLessThan(1e-7);

      const e = calculateEccentricity(r, v, MU);
      expect(e).toBeCloseTo(1.0, 6);
      expect(classifyOrbit(r, v, MU)).toBe('parabolic');
    });

    it('calculates semi-major axis Infinity for parabolic orbit', () => {
      const a = calculateSemiMajorAxis(r, v, MU);
      expect(a).toBe(Infinity);
    });
  });

  describe('Zero-Allocation Target Vector Reusability & Array Format Flexibility', () => {
    it('writes in-place to outTarget without generating new objects', () => {
      const r = [1.0, 0.0, 0.0];
      const v = [0.0, 1.0, 0.0];
      const outH = { x: 0, y: 0, z: 0 };
      const outE = { x: 0, y: 0, z: 0 };
      const outApsides = { periapsis: 0, apoapsis: 0 };

      const resH = calculateAngularMomentum(r, v, outH);
      expect(resH).toBe(outH);
      expect(outH.z).toBeCloseTo(1.0, 10);

      const resE = calculateEccentricityVector(r, v, MU, outE);
      expect(resE).toBe(outE);
      expect(Math.hypot(outE.x, outE.y, outE.z)).toBeLessThan(1e-10);

      const resAps = calculateApsides(r, v, MU, outApsides);
      expect(resAps).toBe(outApsides);
      expect(outApsides.periapsis).toBeCloseTo(1.0, 10);
    });

    it('supports Float64Array vectors accurately', () => {
      const r = new Float64Array([1.0, 0.0, 0.0]);
      const v = new Float64Array([0.0, 1.0, 0.0]);
      const eps = calculateSpecificEnergy(r, v, MU);
      expect(eps).toBeCloseTo(-0.5, 10);
    });
  });

  describe('Astrodynamics Velocity Helpers', () => {
    it('calculates circular and escape velocities correctly', () => {
      expect(calculateCircularVelocity(1.0, 1.0)).toBeCloseTo(1.0, 10);
      expect(calculateEscapeVelocity(1.0, 1.0)).toBeCloseTo(Math.SQRT2, 10);
      expect(calculateOrbitalSpeed(0.5, 1.0, 1.0)).toBeCloseTo(Math.sqrt(3.0), 10);
    });
  });
});

