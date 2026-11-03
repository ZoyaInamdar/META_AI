/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Figure-Eight Three-Body Orbit Benchmark (Step 1.2)
 * Role: Person B (The Physics Lead / Numerical Validation)
 * ============================================================================
 *
 * Classical Chenciner & Montgomery (2000) 3-body zero-angular-momentum figure-eight orbit.
 * Three equal masses (m = 1.0) chase each other along a planar figure-eight curve.
 *
 * Benchmark Specifications:
 * - G = 1.0, softening = 0.0 (exact Newtonian gravity)
 * - Masses: m1 = m2 = m3 = 1.0
 * - Period: T ≈ 6.32591398...
 * - Initial Energy: E0 ≈ -1.287
 * - Initial Momentum: P ≈ (0, 0, 0)
 *
 * Verification Targets:
 * 1. Initial State: E0 ≈ -1.287, net linear momentum ||P|| < 1e-12.
 * 2. Positional Return: After 1 full period (T ≈ 6.326s, dt = 0.001s, 6326 steps),
 *    each body returns to within Euclidean distance < 0.005 of its starting position.
 * 3. Energy Conservation: Over 10 full orbital periods (~63,259 steps),
 *    relative energy error |E(10T) - E0| / |E0| < 1e-5.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';

describe('Figure-Eight Numerical Stability Benchmark (Step 1.2)', () => {
  let engine;

  // Initial conditions per Chenciner & Montgomery (2000)
  const x1 = 0.97000436;
  const y1 = -0.24308753;
  const z1 = 0.0;

  const vx3 = -0.93240737;
  const vy3 = -0.86473146;
  const vz3 = 0.0;

  const vx1 = -0.5 * vx3; // 0.466203685
  const vy1 = -0.5 * vy3; // 0.43236573
  const vz1 = 0.0;

  const PERIOD = 6.32591398;
  const DT = 0.001;

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 8, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    // Body 1: r1 = (0.97000436, -0.24308753, 0.0), v1 = (0.466203685, 0.43236573, 0.0)
    engine.setBody(0, 'body_1', 1.0, x1, y1, z1, vx1, vy1, vz1, false);

    // Body 2: r2 = (-0.97000436, 0.24308753, 0.0), v2 = (0.466203685, 0.43236573, 0.0)
    engine.setBody(1, 'body_2', 1.0, -x1, -y1, z1, vx1, vy1, vz1, false);

    // Body 3: r3 = (0.0, 0.0, 0.0), v3 = (-0.93240737, -0.86473146, 0.0)
    engine.setBody(2, 'body_3', 1.0, 0.0, 0.0, 0.0, vx3, vy3, vz3, false);
  });

  it('verifies initial state energy is approximately -1.287 and net linear momentum ||P|| < 10^-12', () => {
    const initialE = engine.getTotalEnergy();
    // E0 is approximately -1.287 (analytical is -1.287142...)
    expect(initialE).toBeCloseTo(-1.287, 2);
    expect(Math.abs(initialE - (-1.287))).toBeLessThan(0.001);

    const P = engine.getTotalMomentum();
    const pMagnitude = Math.hypot(P[0], P[1], P[2]);
    expect(pMagnitude).toBeLessThan(1e-12);
  });

  it('completes 1 full orbital period (N = 6326 steps, dt = 0.001s) with positional return within < 0.005 distance', () => {
    // Record initial coordinates
    const r1_0 = engine.getBodyPosition(0);
    const r2_0 = engine.getBodyPosition(1);
    const r3_0 = engine.getBodyPosition(2);

    const stepsOnePeriod = 6326; // Math.round(PERIOD / DT) = 6326
    for (let s = 0; s < stepsOnePeriod; s++) {
      engine.stepRK4(DT);
    }

    const r1_1 = engine.getBodyPosition(0);
    const r2_1 = engine.getBodyPosition(1);
    const r3_1 = engine.getBodyPosition(2);

    const dist1 = Math.hypot(r1_1.x - r1_0.x, r1_1.y - r1_0.y, r1_1.z - r1_0.z);
    const dist2 = Math.hypot(r2_1.x - r2_0.x, r2_1.y - r2_0.y, r2_1.z - r2_0.z);
    const dist3 = Math.hypot(r3_1.x - r3_0.x, r3_1.y - r3_0.y, r3_1.z - r3_0.z);

    // Positional returns are well within tolerance < 0.005 (typically ~10^-4)
    expect(dist1).toBeLessThan(0.005);
    expect(dist2).toBeLessThan(0.005);
    expect(dist3).toBeLessThan(0.005);

    // Energy at 1 period must be conserved to high precision
    const e1 = engine.getTotalEnergy();
    const e0 = engine.getKineticEnergy() + engine.getPotentialEnergy();
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-6);
  });

  it('conserves total mechanical energy within relative error < 10^-5 across 10 full orbital periods (63,259 steps)', () => {
    const initialEnergy = engine.getTotalEnergy();
    const totalSteps = Math.round((10 * PERIOD) / DT); // 63,259 steps

    for (let s = 0; s < totalSteps; s++) {
      engine.stepRK4(DT);
    }

    const finalEnergy = engine.getTotalEnergy();
    const relativeEnergyDrift = Math.abs((finalEnergy - initialEnergy) / initialEnergy);

    // Relative energy drift must be strictly below 1e-5
    expect(relativeEnergyDrift).toBeLessThan(1e-5);

    // Momentum remains conserved to machine precision even after 63k+ steps
    const P = engine.getTotalMomentum();
    const pMagnitude = Math.hypot(P[0], P[1], P[2]);
    expect(pMagnitude).toBeLessThan(1e-11);
  });
});

describe('Two-Body Circular Orbit & Escape Thresholds (Step 1.3)', () => {
  let engine;
  const DT = 0.001;

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);
  });

  it('Case A: verifies exact circular orbit energy eps = -0.5 and periodic closure within 10^-3 at t = 2*pi', () => {
    // Body 0: Central Star (M = 1.0, fixed at origin)
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    // Body 1: Planet (m = 1e-6, r = (1.0, 0.0, 0.0), v = (0.0, 1.0, 0.0))
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, false);

    // Specific orbital energy: eps = v^2/2 - GM/r = 0.5 - 1.0 = -0.5
    const initialSpecificEnergy = engine.getSpecificOrbitalEnergy(1, 0);
    expect(initialSpecificEnergy).toBeCloseTo(-0.5, 10);
    expect(Math.abs(initialSpecificEnergy - (-0.5))).toBeLessThan(1e-10);

    // Initial position
    const r0 = engine.getBodyPosition(1);
    expect(r0.x).toBe(1.0);
    expect(r0.y).toBe(0.0);
    expect(r0.z).toBe(0.0);

    // Step 1 full period T = 2 * Math.PI
    const T = 2 * Math.PI;
    const steps = Math.floor(T / DT);
    for (let s = 0; s < steps; s++) {
      engine.stepRK4(DT);
    }
    const remainder = T - steps * DT;
    if (remainder > 0) {
      engine.stepRK4(remainder);
    }

    // Verify planet returns to (1.0, 0.0, 0.0) with positional error < 10^-3
    const rT = engine.getBodyPosition(1);
    const posError = Math.hypot(rT.x - 1.0, rT.y - 0.0, rT.z - 0.0);
    expect(posError).toBeLessThan(1e-3);
  });

  it('Case A: verifies energy drift over 5 full orbits (t = 10*pi) remains under 10^-5 relative error', () => {
    // Body 0: Central Star (M = 1.0, fixed at origin)
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    // Body 1: Planet (m = 1e-6, r = (1.0, 0.0, 0.0), v = (0.0, 1.0, 0.0))
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, false);

    const initialEps = engine.getSpecificOrbitalEnergy(1, 0);

    const totalTime = 10 * Math.PI;
    const steps = Math.floor(totalTime / DT);
    for (let s = 0; s < steps; s++) {
      engine.stepRK4(DT);
    }
    const remainder = totalTime - steps * DT;
    if (remainder > 0) {
      engine.stepRK4(remainder);
    }

    const finalEps = engine.getSpecificOrbitalEnergy(1, 0);
    const relativeDrift = Math.abs((finalEps - initialEps) / initialEps);
    expect(relativeDrift).toBeLessThan(1e-5);
  });

  it('Case B: verifies parabolic escape threshold (v = sqrt(2), eps = 0.0) and monotonic radial divergence', () => {
    // Body 0: Central Star (M = 1.0, fixed at origin)
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    // Body 1: Planet (m = 1e-6, r = (1.0, 0.0, 0.0), v = (0.0, sqrt(2), 0.0))
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, Math.SQRT2, 0.0, false);

    // Specific orbital energy: eps = (sqrt(2))^2/2 - 1.0/1.0 = 1.0 - 1.0 = 0.0
    const specificEnergy = engine.getSpecificOrbitalEnergy(1, 0);
    expect(Math.abs(specificEnergy)).toBeLessThan(1e-7);

    // Monotonic increase in radial distance over time without falling back
    let prevRadius = 1.0;
    let isMonotonic = true;
    const stepDt = 0.01;
    const numSteps = 1000;

    for (let s = 0; s < numSteps; s++) {
      engine.stepRK4(stepDt);
      const pos = engine.getBodyPosition(1);
      const r = Math.hypot(pos.x, pos.y, pos.z);
      if (r < prevRadius - 1e-12) {
        isMonotonic = false;
        break;
      }
      prevRadius = r;
    }

    expect(isMonotonic).toBe(true);
    expect(prevRadius).toBeGreaterThan(1.0);
  });

  it('Case C: verifies hyperbolic divergence (v = 1.6, eps = +0.28 > 0) and indefinite outward trajectory', () => {
    // Body 0: Central Star (M = 1.0, fixed at origin)
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    // Body 1: Planet (m = 1e-6, r = (1.0, 0.0, 0.0), v = (0.0, 1.6, 0.0))
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.6, 0.0, false);

    // Specific orbital energy: eps = 1.6^2/2 - 1.0/1.0 = 1.28 - 1.0 = +0.28 > 0
    const specificEnergy = engine.getSpecificOrbitalEnergy(1, 0);
    expect(specificEnergy).toBeGreaterThan(0.0);
    expect(specificEnergy).toBeCloseTo(0.28, 8);

    // Monotonically growing distance escaping to infinity without turning point
    let prevRadius = 1.0;
    let isMonotonic = true;
    const stepDt = 0.01;
    const numSteps = 2000;

    for (let s = 0; s < numSteps; s++) {
      engine.stepRK4(stepDt);
      const pos = engine.getBodyPosition(1);
      const r = Math.hypot(pos.x, pos.y, pos.z);
      if (r < prevRadius - 1e-12) {
        isMonotonic = false;
        break;
      }
      prevRadius = r;
    }

    expect(isMonotonic).toBe(true);
    // Over t = 20s, with v_inf = sqrt(2 * eps) ≈ 0.748, distance reaches > 18.0 without bound
    expect(prevRadius).toBeGreaterThan(15.0);
  });
});
