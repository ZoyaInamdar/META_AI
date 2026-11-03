/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for Chapter 3 Deterministic Slingshot Assist (Step 2.2)
 * Role: Person B (The Physics & Mission Lead)
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';
import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import { SLINGSHOT_PRESET } from '../src/mission/missionConfig.js';
import { calculateEccentricity, calculateSpecificEnergy, calculateSemiMajorAxis } from '../src/physics/orbits.js';

describe('Chapter 3 Gravitational Slingshot Determinism & Metrics (Step 2.2)', () => {
  const dt = 1 / 120; // 120 Hz fixed accumulator
  const totalSteps = Math.round(SLINGSHOT_PRESET.TIMINGS.TOTAL_DURATION / dt); // 2400 steps
  const periapsisStep = Math.round(SLINGSHOT_PRESET.TIMINGS.PERIAPSIS_TIME / dt);

  function executeSimulation() {
    const engine = new OrbitalEngine({ maxBodies: 2, G: 1.0, softening: 0.0 });
    engine.setSoftening(0.0);
    engine.setG(1.0);

    // Setup Star 3 and Planet from frozen preset
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

    let periapsisRecorded = null;
    let minSeparation = Infinity;

    for (let s = 0; s < totalSteps; s++) {
      const p3 = engine.getBodyPosition(0);
      const pp = engine.getBodyPosition(1);
      const dist = Math.hypot(pp.x - p3.x, pp.y - p3.y, pp.z - p3.z);

      if (dist < minSeparation) {
        minSeparation = dist;
      }

      if (s === periapsisStep) {
        periapsisRecorded = {
          starPos: { ...p3 },
          planetPos: { ...pp },
          separation: dist
        };
      }

      engine.stepRK4(dt);
    }

    const finalStarPos = engine.getBodyPosition(0);
    const finalPlanetPos = engine.getBodyPosition(1);
    const finalStarVel = engine.getBodyVelocity(0);
    const finalPlanetVel = engine.getBodyVelocity(1);

    const rRel = {
      x: finalPlanetPos.x - finalStarPos.x,
      y: finalPlanetPos.y - finalStarPos.y,
      z: finalPlanetPos.z - finalStarPos.z
    };
    const vRel = {
      x: finalPlanetVel.x - finalStarVel.x,
      y: finalPlanetVel.y - finalStarVel.y,
      z: finalPlanetVel.z - finalStarVel.z
    };

    const finalEnergy = calculateSpecificEnergy(rRel, vRel, 1.0);
    const finalEccentricity = calculateEccentricity(rRel, vRel, 1.0);
    const finalSemiMajorAxis = calculateSemiMajorAxis(rRel, vRel, 1.0);

    return {
      periapsisRecorded,
      minSeparation,
      finalStarPos,
      finalPlanetPos,
      finalEnergy,
      finalEccentricity,
      finalSemiMajorAxis
    };
  }

  it('preserves bitwise determinism (< 10^-12) across consecutive simulation executions', () => {
    const runA = executeSimulation();
    const runB = executeSimulation();

    // Check periapsis timestamp coordinates
    expect(Math.abs(runA.periapsisRecorded.planetPos.x - runB.periapsisRecorded.planetPos.x)).toBeLessThan(1e-12);
    expect(Math.abs(runA.periapsisRecorded.planetPos.y - runB.periapsisRecorded.planetPos.y)).toBeLessThan(1e-12);
    expect(Math.abs(runA.periapsisRecorded.planetPos.z - runB.periapsisRecorded.planetPos.z)).toBeLessThan(1e-12);

    // Check final coordinates at t = 20.0s
    expect(Math.abs(runA.finalPlanetPos.x - runB.finalPlanetPos.x)).toBeLessThan(1e-12);
    expect(Math.abs(runA.finalPlanetPos.y - runB.finalPlanetPos.y)).toBeLessThan(1e-12);
    expect(Math.abs(runA.finalPlanetPos.z - runB.finalPlanetPos.z)).toBeLessThan(1e-12);

    // Check metrics
    expect(runA.finalEnergy).toBe(runB.finalEnergy);
    expect(runA.finalEccentricity).toBe(runB.finalEccentricity);
  });

  it('guarantees near-circular bound orbit (e < 0.20, eps < 0) without collision (r_min > 0.25)', () => {
    const result = executeSimulation();

    // 1. Bound specific energy
    expect(result.finalEnergy).toBeLessThan(0.0);
    expect(result.finalEnergy).toBeCloseTo(SLINGSHOT_PRESET.METRICS.ENERGY, 2);

    // 2. Near-circular eccentricity (e < 0.20)
    expect(result.finalEccentricity).toBeLessThan(0.20);
    expect(result.finalEccentricity).toBeCloseTo(SLINGSHOT_PRESET.METRICS.ECCENTRICITY, 2);

    // 3. Collision avoidance
    expect(result.minSeparation).toBeGreaterThan(0.25);
    expect(result.minSeparation).toBeCloseTo(SLINGSHOT_PRESET.METRICS.PERIAPSIS_DISTANCE, 2);

    // 4. Bounded semi-major axis
    expect(result.finalSemiMajorAxis).toBeGreaterThan(0.5);
    expect(result.finalSemiMajorAxis).toBeLessThan(2.0);
  });
});

