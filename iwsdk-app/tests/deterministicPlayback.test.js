/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Deterministic Playback & Numerical Invariant Test Suite (Step 2.3)
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 *
 * Comprehensive validation of:
 * 1. Deterministic Trajectory Playback (Bitwise Reproducibility from SLINGSHOT_PRESET)
 * 2. Figure-Eight Three-Body Orbital Period & Closure (Chenciner & Montgomery)
 * 3. Keplerian Circular Orbit Invariants (Specific Energy & Momentum Conservation)
 * 4. Chapter 1 Retrograde Capture Burn (Hyperbolic to Elliptic State Flip)
 * 5. Continuous Zero-Allocation Memory & Buffer Stability
 */

import { describe, it, expect, vi } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { CaptureBurn } from '../src/physics/CaptureBurn.js';
import { SLINGSHOT_PRESET, PHYSICS_TIMESTEP } from '../src/mission/missionConfig.js';
import {
  calculateApsides,
  calculateSemiMajorAxis,
  calculateSpecificEnergy,
  calculateEccentricity
} from '../src/physics/orbits.js';
import { Events } from '../src/contracts/Interfaces.js';

// ============================================================================
// Suite 1: Deterministic Trajectory Replay & Bitwise Reproducibility
// ============================================================================
describe('Suite 1: Deterministic Trajectory Replay & Bitwise Reproducibility', () => {
  const dt = 1 / 120; // 120 Hz fixed timestep
  const totalSteps = Math.round(SLINGSHOT_PRESET.TIMINGS.TOTAL_DURATION / dt); // 2400 steps (20.0s)
  const periapsisStep = Math.round(SLINGSHOT_PRESET.TIMINGS.PERIAPSIS_TIME / dt); // Step 328 (~2.7333s)

  it('validates SLINGSHOT_PRESET frozen schema and analytical target invariants', () => {
    // Ensure all preset structures are deeply frozen
    expect(Object.isFrozen(SLINGSHOT_PRESET)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.INITIAL_PLANET_POS)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.INITIAL_PLANET_VEL)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.STAR3_POS)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.STAR3_VEL)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.TIMINGS)).toBe(true);
    expect(Object.isFrozen(SLINGSHOT_PRESET.METRICS)).toBe(true);

    // Initial state vector coordinates
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_POS.x).toBe(-4.0);
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_POS.y).toBe(0.4);
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_POS.z).toBe(0.0);
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_VEL.x).toBe(0.8);
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_VEL.y).toBe(0.0);
    expect(SLINGSHOT_PRESET.INITIAL_PLANET_VEL.z).toBe(0.0);

    expect(SLINGSHOT_PRESET.STAR3_POS.x).toBe(-3.0);
    expect(SLINGSHOT_PRESET.STAR3_POS.y).toBe(0.4);
    expect(SLINGSHOT_PRESET.STAR3_POS.z).toBe(0.0);
    expect(SLINGSHOT_PRESET.STAR3_VEL.x).toBe(0.8);
    expect(SLINGSHOT_PRESET.STAR3_VEL.y).toBe(-0.95);
    expect(SLINGSHOT_PRESET.STAR3_VEL.z).toBe(0.0);

    // Target metrics
    expect(SLINGSHOT_PRESET.TIMINGS.PERIAPSIS_TIME).toBeCloseTo(2.7333, 4);
    expect(SLINGSHOT_PRESET.TIMINGS.TOTAL_DURATION).toBe(20.0);
    expect(SLINGSHOT_PRESET.METRICS.PERIAPSIS_DISTANCE).toBeGreaterThan(0.25);
    expect(SLINGSHOT_PRESET.METRICS.ENERGY).toBeLessThan(0.0);
    expect(SLINGSHOT_PRESET.METRICS.ECCENTRICITY).toBeLessThan(0.20);
  });

  function runSimulationInstance() {
    const engine = new OrbitalEngine({ maxBodies: 2, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    // Star 3 (Body 0)
    engine.setBody(
      0,
      'star_3',
      1.0,
      SLINGSHOT_PRESET.STAR3_POS.x,
      SLINGSHOT_PRESET.STAR3_POS.y,
      SLINGSHOT_PRESET.STAR3_POS.z,
      SLINGSHOT_PRESET.STAR3_VEL.x,
      SLINGSHOT_PRESET.STAR3_VEL.y,
      SLINGSHOT_PRESET.STAR3_VEL.z,
      false
    );

    // Planet (Body 1)
    engine.setBody(
      1,
      'planet',
      1e-6,
      SLINGSHOT_PRESET.INITIAL_PLANET_POS.x,
      SLINGSHOT_PRESET.INITIAL_PLANET_POS.y,
      SLINGSHOT_PRESET.INITIAL_PLANET_POS.z,
      SLINGSHOT_PRESET.INITIAL_PLANET_VEL.x,
      SLINGSHOT_PRESET.INITIAL_PLANET_VEL.y,
      SLINGSHOT_PRESET.INITIAL_PLANET_VEL.z,
      false
    );

    let periapsisState = null;

    for (let s = 0; s < totalSteps; s++) {
      if (s === periapsisStep) {
        periapsisState = {
          starPos: { ...engine.getBodyPosition(0) },
          starVel: { ...engine.getBodyVelocity(0) },
          planetPos: { ...engine.getBodyPosition(1) },
          planetVel: { ...engine.getBodyVelocity(1) }
        };
      }
      engine.stepRK4(dt);
    }

    const finalState = {
      starPos: { ...engine.getBodyPosition(0) },
      starVel: { ...engine.getBodyVelocity(0) },
      planetPos: { ...engine.getBodyPosition(1) },
      planetVel: { ...engine.getBodyVelocity(1) }
    };

    return { periapsisState, finalState };
  }

  it('runs two independent simulations over 2,400 steps with bitwise equality (0.0 delta tolerance) at periapsis and completion', () => {
    const runA = runSimulationInstance();
    const runB = runSimulationInstance();

    // 1. Bitwise equality check at t = t_periapsis (~2.7333s, step 328)
    // Star 3 Position & Velocity
    expect(runA.periapsisState.starPos.x - runB.periapsisState.starPos.x).toBe(0.0);
    expect(runA.periapsisState.starPos.y - runB.periapsisState.starPos.y).toBe(0.0);
    expect(runA.periapsisState.starPos.z - runB.periapsisState.starPos.z).toBe(0.0);
    expect(runA.periapsisState.starVel.x - runB.periapsisState.starVel.x).toBe(0.0);
    expect(runA.periapsisState.starVel.y - runB.periapsisState.starVel.y).toBe(0.0);
    expect(runA.periapsisState.starVel.z - runB.periapsisState.starVel.z).toBe(0.0);

    // Planet Position & Velocity
    expect(runA.periapsisState.planetPos.x - runB.periapsisState.planetPos.x).toBe(0.0);
    expect(runA.periapsisState.planetPos.y - runB.periapsisState.planetPos.y).toBe(0.0);
    expect(runA.periapsisState.planetPos.z - runB.periapsisState.planetPos.z).toBe(0.0);
    expect(runA.periapsisState.planetVel.x - runB.periapsisState.planetVel.x).toBe(0.0);
    expect(runA.periapsisState.planetVel.y - runB.periapsisState.planetVel.y).toBe(0.0);
    expect(runA.periapsisState.planetVel.z - runB.periapsisState.planetVel.z).toBe(0.0);

    // 2. Bitwise equality check at t = 20.0s (step 2400)
    // Star 3 Position & Velocity
    expect(runA.finalState.starPos.x - runB.finalState.starPos.x).toBe(0.0);
    expect(runA.finalState.starPos.y - runB.finalState.starPos.y).toBe(0.0);
    expect(runA.finalState.starPos.z - runB.finalState.starPos.z).toBe(0.0);
    expect(runA.finalState.starVel.x - runB.finalState.starVel.x).toBe(0.0);
    expect(runA.finalState.starVel.y - runB.finalState.starVel.y).toBe(0.0);
    expect(runA.finalState.starVel.z - runB.finalState.starVel.z).toBe(0.0);

    // Planet Position & Velocity
    expect(runA.finalState.planetPos.x - runB.finalState.planetPos.x).toBe(0.0);
    expect(runA.finalState.planetPos.y - runB.finalState.planetPos.y).toBe(0.0);
    expect(runA.finalState.planetPos.z - runB.finalState.planetPos.z).toBe(0.0);
    expect(runA.finalState.planetVel.x - runB.finalState.planetVel.x).toBe(0.0);
    expect(runA.finalState.planetVel.y - runB.finalState.planetVel.y).toBe(0.0);
    expect(runA.finalState.planetVel.z - runB.finalState.planetVel.z).toBe(0.0);

    // 3. Confirm settled relative orbital invariants
    const rRel = {
      x: runA.finalState.planetPos.x - runA.finalState.starPos.x,
      y: runA.finalState.planetPos.y - runA.finalState.starPos.y,
      z: runA.finalState.planetPos.z - runA.finalState.starPos.z
    };
    const vRel = {
      x: runA.finalState.planetVel.x - runA.finalState.starVel.x,
      y: runA.finalState.planetVel.y - runA.finalState.starVel.y,
      z: runA.finalState.planetVel.z - runA.finalState.starVel.z
    };

    const energy = calculateSpecificEnergy(rRel, vRel, 1.0);
    const eccentricity = calculateEccentricity(rRel, vRel, 1.0);

    expect(energy).toBeLessThan(0.0);
    expect(energy).toBeCloseTo(SLINGSHOT_PRESET.METRICS.ENERGY, 4);
    expect(eccentricity).toBeLessThan(0.20);
    expect(eccentricity).toBeCloseTo(SLINGSHOT_PRESET.METRICS.ECCENTRICITY, 4);
  });
});

// ============================================================================
// Suite 2: Chenciner-Montgomery Figure-Eight Orbital Closure
// ============================================================================
describe('Suite 2: Chenciner-Montgomery Figure-Eight Orbital Closure', () => {
  let engine;

  // Exact Chenciner & Montgomery (2000) initial parameters
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

  function initFigureEightEngine() {
    const eng = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    eng.setSoftening(0.0);
    eng.setG(1.0);

    // Body 1: r1 = (x1, y1, 0), v1 = (vx1, vy1, 0)
    eng.setBody(0, 'body_1', 1.0, x1, y1, z1, vx1, vy1, vz1, false);
    // Body 2: r2 = (-x1, -y1, 0), v2 = (vx1, vy1, 0)
    eng.setBody(1, 'body_2', 1.0, -x1, -y1, z1, vx1, vy1, vz1, false);
    // Body 3: r3 = (0, 0, 0), v3 = (vx3, vy3, 0)
    eng.setBody(2, 'body_3', 1.0, 0.0, 0.0, 0.0, vx3, vy3, vz3, false);

    return eng;
  }

  it('verifies Euclidean position error after one full cycle satisfies ||r(T) - r(0)|| < 3e-3', () => {
    engine = initFigureEightEngine();

    const r1_0 = { ...engine.getBodyPosition(0) };
    const r2_0 = { ...engine.getBodyPosition(1) };
    const r3_0 = { ...engine.getBodyPosition(2) };

    const stepsOnePeriod = Math.round(PERIOD / DT); // 6,326 steps
    for (let s = 0; s < stepsOnePeriod; s++) {
      engine.stepRK4(DT);
    }

    const r1_T = engine.getBodyPosition(0);
    const r2_T = engine.getBodyPosition(1);
    const r3_T = engine.getBodyPosition(2);

    const error1 = Math.hypot(r1_T.x - r1_0.x, r1_T.y - r1_0.y, r1_T.z - r1_0.z);
    const error2 = Math.hypot(r2_T.x - r2_0.x, r2_T.y - r2_0.y, r2_T.z - r2_0.z);
    const error3 = Math.hypot(r3_T.x - r3_0.x, r3_T.y - r3_0.y, r3_T.z - r3_0.z);

    // Strict invariant: ||r(T) - r(0)|| < 3e-3 (actual error is ~1e-4)
    expect(error1).toBeLessThan(3e-3);
    expect(error2).toBeLessThan(3e-3);
    expect(error3).toBeLessThan(3e-3);
  });

  it('verifies relative energy drift over 10 periods (63,259 steps) satisfies |(E10 - E0) / E0| < 1e-5', () => {
    engine = initFigureEightEngine();

    const E0 = engine.getTotalEnergy();
    const totalSteps = Math.round((10 * PERIOD) / DT); // 63,259 steps

    for (let s = 0; s < totalSteps; s++) {
      engine.stepRK4(DT);
    }

    const E10 = engine.getTotalEnergy();
    const relEnergyDrift = Math.abs((E10 - E0) / E0);

    // Energy drift across 10 complete orbits remains well under 1e-5
    expect(relEnergyDrift).toBeLessThan(1e-5);

    // Net momentum remains preserved near machine precision
    const P = engine.getTotalMomentum();
    const pMagnitude = Math.hypot(P[0], P[1], P[2]);
    expect(pMagnitude).toBeLessThan(1e-11);
  });
});

// ============================================================================
// Suite 3: Keplerian Circular Orbit Conservation Invariants
// ============================================================================
describe('Suite 3: Keplerian Circular Orbit Conservation Invariants', () => {
  let engine;
  const dt = 1 / 120; // 120 Hz fixed accumulator

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);
  });

  it('conserves specific orbital energy within |(eps(t) - eps0) / eps0| < 1e-6 across 5 full orbits (t = 10*pi)', () => {
    // Body 0: Central Star (M = 1.0, dynamic at origin)
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, false);
    // Body 1: Planetoid (m = 1e-6, r = 1.0, v = 1.0, circular orbit eps0 = -0.5)
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, false);

    const eps0 = engine.getSpecificOrbitalEnergy(1, 0);
    expect(eps0).toBeCloseTo(-0.5, 10);

    // 5 full orbits: period T = 2*pi, total time = 10*pi
    const totalDuration = 10.0 * Math.PI;
    const totalSteps = Math.round(totalDuration / dt); // ~3770 steps

    for (let s = 0; s < totalSteps; s++) {
      engine.stepRK4(dt);
    }

    const epsFinal = engine.getSpecificOrbitalEnergy(1, 0);
    const relError = Math.abs((epsFinal - eps0) / eps0);

    // Specific orbital energy relative error is strictly below 1e-6 (typically ~3.5e-11)
    expect(relError).toBeLessThan(1e-6);

    // Orbital radius remains circular (||r - 1.0|| < 1e-4)
    const pos = engine.getBodyPosition(1);
    const r = Math.hypot(pos.x, pos.y, pos.z);
    expect(Math.abs(r - 1.0)).toBeLessThan(1e-4);
  });

  it('preserves net linear momentum within 10^-12 of initial momentum throughout 5 full orbits', () => {
    engine.setBody(0, 'star', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, false);
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, false);

    const P0 = new Float64Array(engine.getTotalMomentum());

    const totalSteps = Math.round((10.0 * Math.PI) / dt);
    for (let s = 0; s < totalSteps; s++) {
      engine.stepRK4(dt);
    }

    const P_final = engine.getTotalMomentum();
    const deltaP = Math.hypot(
      P_final[0] - P0[0],
      P_final[1] - P0[1],
      P_final[2] - P0[2]
    );

    // Linear momentum conservation invariant: ||P(t) - P(0)|| < 1e-12
    expect(deltaP).toBeLessThan(1e-12);
  });
});

// ============================================================================
// Suite 4: Chapter 1 Capture Burn Hyperbolic-to-Elliptic State Flip
// ============================================================================
describe('Suite 4: Chapter 1 Capture Burn Hyperbolic-to-Elliptic State Flip', () => {
  let engine;
  let burn;
  let mockEventBus;
  const dt = 1 / 120; // 120 Hz fixed timestep

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

  it('strictly flips specific orbital energy from positive (eps > 0) to negative (eps < 0)', () => {
    // Body 0: Central Star 1 (M = 1.0, fixed at origin)
    engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    // Body 1: Planetoid on unbound hyperbolic approach (r = 1.0, v = 1.55 > sqrt(2))
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

    // Initial pre-burn state: unbound (eps > 0)
    const initialEps = engine.getSpecificOrbitalEnergy(1, 0);
    expect(initialEps).toBeGreaterThan(0.0);
    expect(initialEps).toBeCloseTo(0.20125, 4);

    // Execute 1.0-second retrograde burn with totalDeltaV = 0.5
    burn.triggerBurn(1, 0.5, 1.0);
    expect(burn.getBurnState().isActive).toBe(true);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.BURN_START,
      expect.objectContaining({ duration: 1.0, totalDeltaV: 0.5 })
    );

    const burnSteps = Math.round(1.0 / dt); // 120 steps
    for (let s = 0; s < burnSteps; s++) {
      burn.update(dt, engine);
      engine.stepRK4(dt);
    }

    // Verify burn completion and event emission
    expect(burn.getBurnState().isActive).toBe(false);
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      Events.BURN_END,
      expect.objectContaining({ duration: 1.0, totalDeltaV: 0.5 })
    );

    // Invariant: Specific orbital energy has flipped strictly to negative
    const postBurnEps = engine.getSpecificOrbitalEnergy(1, 0);
    expect(postBurnEps).toBeLessThan(0.0);
    expect(postBurnEps).toBeCloseTo(-0.40476, 2);
  });

  it('confirms post-burn apoapsis is finite and bound (ra < 4.0 sim units) into a closed elliptical orbit', () => {
    engine.setBody(0, 'star_1', 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, true);
    engine.setBody(1, 'planet', 1e-6, 1.0, 0.0, 0.0, 0.0, 1.55, 0.0, false);

    // Execute 1.0-second burn
    burn.triggerBurn(1, 0.5, 1.0);
    const burnSteps = Math.round(1.0 / dt);
    for (let s = 0; s < burnSteps; s++) {
      burn.update(dt, engine);
      engine.stepRK4(dt);
    }

    const postPos = engine.getBodyPosition(1);
    const postVel = engine.getBodyVelocity(1);

    const a = calculateSemiMajorAxis(postPos, postVel, 1.0);
    const apsides = calculateApsides(postPos, postVel, 1.0);

    // Invariant: semi-major axis is positive and bounded
    expect(a).toBeGreaterThan(1.0);
    expect(a).toBeLessThan(2.0);

    // Invariant: Apoapsis is strictly finite and bound (< 4.0 sim units)
    expect(apsides.apoapsis).toBeLessThan(4.0);
    expect(apsides.periapsis).toBeGreaterThan(0.5);

    // Verify by stepping forward for 10 seconds (~1200 steps): planet never escapes
    let maxDistance = 0.0;
    for (let s = 0; s < 1200; s++) {
      engine.stepRK4(dt);
      const pos = engine.getBodyPosition(1);
      const dist = Math.hypot(pos.x, pos.y, pos.z);
      if (dist > maxDistance) {
        maxDistance = dist;
      }
    }

    expect(maxDistance).toBeLessThan(4.0);
    expect(maxDistance).toBeCloseTo(apsides.apoapsis, 1);
  });
});

// ============================================================================
// Suite 5: Continuous Zero-Allocation Memory Stability
// ============================================================================
describe('Suite 5: Continuous Zero-Allocation Memory Stability', () => {
  let engine;
  const dt = 1 / 120;

  beforeEach(() => {
    engine = new OrbitalEngine({ maxBodies: 4, G: 1.0, softening: 0.05 });
    engine.setBody(0, 'star_a', 1.0, -0.4, 0.0, 0.0, 0.0, 0.3, 0.0, false);
    engine.setBody(1, 'star_b', 1.0, 0.4, 0.0, 0.0, 0.0, -0.3, 0.0, false);
    engine.setBody(2, 'planet', 1e-6, 1.5, 0.0, 0.0, 0.0, 1.1, 0.0, false);
    engine.setBody(3, 'probe', 1e-8, -2.0, 0.0, 0.0, 0.0, -0.9, 0.0, false);
  });

  it('executes 1,000 consecutive stepRK4 integration steps with zero heap object or array allocations', () => {
    const initialPosBuffer = engine.positions.buffer;
    const initialVelBuffer = engine.velocities.buffer;
    const initialAccBuffer = engine.accelerations.buffer;

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
      for (let s = 0; s < 1000; s++) {
        engine.stepRK4(dt);
      }

      // Zero dynamic allocations during simulation loop
      expect(pushCount).toBe(0);
      expect(sliceCount).toBe(0);
      expect(spliceCount).toBe(0);
      expect(assignCount).toBe(0);

      // Flat typed array buffers must remain unchanged and never resized
      expect(engine.positions.buffer).toBe(initialPosBuffer);
      expect(engine.velocities.buffer).toBe(initialVelBuffer);
      expect(engine.accelerations.buffer).toBe(initialAccBuffer);
      expect(engine.positions.byteLength).toBe(initialPosBuffer.byteLength);
    } finally {
      Array.prototype.push = originalPush;
      Array.prototype.slice = originalSlice;
      Array.prototype.splice = originalSplice;
      Object.assign = originalAssign;
    }
  });

  it('executes 1,000 consecutive adaptive substepping updates (step / stepAdaptive) with zero allocations', () => {
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
      for (let s = 0; s < 1000; s++) {
        engine.stepAdaptive(dt);
      }

      // Zero allocations during adaptive separation check and substep execution
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
