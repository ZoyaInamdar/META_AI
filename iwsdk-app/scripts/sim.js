/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Chapter 3 Gravitational Slingshot Parameter Sweep
 * Role: Person B (The Physics & Mission Lead / scripts/sim.js)
 * ============================================================================
 *
 * Offline parameter grid sweep to identify optimal, 100% deterministic
 * gravitational assist trajectories around Star 3 into a bound near-circular orbit.
 *
 * Run with: node scripts/sim.js
 */

import { OrbitalEngine } from '../src/physics/OrbitalEngine.js';
import {
  calculateEccentricity,
  calculateSpecificEnergy,
  calculateSemiMajorAxis,
  calculateApsides
} from '../src/physics/orbits.js';

export function runSlingshotSweep(options = {}) {
  const verbose = options.verbose ?? true;
  const dt = 1 / 120; // 120 Hz fixed accumulator
  const totalDuration = options.duration ?? 20.0;
  const totalSteps = Math.round(totalDuration / dt); // 2400 steps

  const candidates = [];

  if (verbose) {
    console.log('================================================================');
    console.log('Starting Chapter 3 Gravitational Slingshot Assist Grid Sweep...');
    console.log(`Simulation Duration: ${totalDuration}s (${totalSteps} steps at dt = 1/120s)`);
    console.log('Objective Criteria: r_min > 0.25, eps < 0, eccentricity < 0.20');
    console.log('================================================================\n');
  }

  // Grid ranges per specifications:
  // Planet: x0 = -4.0, y0 in [0.4, 1.8], vx in [0.8, 1.5]
  // Star 3: position & transverse velocity
  const vxValues = [0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2];
  const y0Values = [0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6];
  const star3XValues = [-3.0, -2.5, -2.0, -1.5, -1.0, 0.0];
  const star3YValues = [0.4, 0.5, 0.8, 1.0];
  const star3VxValues = [0.6, 0.7, 0.8, 0.85, 0.9, 1.0];
  const star3VyValues = [-1.1, -1.0, -0.95, -0.9, -0.8, 0.8, 0.9, 0.95, 1.0, 1.1];

  let testedCount = 0;

  for (const vx of vxValues) {
    for (const y0 of y0Values) {
      for (const x3 of star3XValues) {
        for (const y3 of star3YValues) {
          for (const v3x of star3VxValues) {
            for (const v3y of star3VyValues) {
              testedCount++;

              const rRel0 = { x: -4.0 - x3, y: y0 - y3, z: 0.0 };
              const vRel0 = { x: vx - v3x, y: -v3y, z: 0.0 };
              const rMag0 = Math.hypot(rRel0.x, rRel0.y);

              if (rMag0 < 0.3) continue;

              // Analytical pre-filter
              const eps0 = calculateSpecificEnergy(rRel0, vRel0, 1.0);
              if (eps0 >= 0.0) continue;

              const e0 = calculateEccentricity(rRel0, vRel0, 1.0);
              if (e0 >= 0.20) continue;

              // Full 20.0s numerical integration verification
              const engine = new OrbitalEngine({ maxBodies: 2, G: 1.0, softening: 0.0 });
              engine.setSoftening(0.0);
              engine.setG(1.0);

              engine.setBody(0, 'star_3', 1.0, x3, y3, 0.0, v3x, v3y, 0.0, false);
              engine.setBody(1, 'planet', 1e-6, -4.0, y0, 0.0, vx, 0.0, 0.0, false);

              let minR = Infinity;
              let tPeriapsis = 0.0;
              let hasCollided = false;

              for (let s = 0; s < totalSteps; s++) {
                const p3 = engine.getBodyPosition(0);
                const pp = engine.getBodyPosition(1);
                const dist = Math.hypot(pp.x - p3.x, pp.y - p3.y, pp.z - p3.z);

                if (dist < minR) {
                  minR = dist;
                  tPeriapsis = s * dt;
                }

                if (dist < 0.25) {
                  hasCollided = true;
                  break;
                }

                engine.stepRK4(dt);
              }

              if (hasCollided || minR <= 0.25 || tPeriapsis < 0.5) continue;

              // Read final state
              const p3End = engine.getBodyPosition(0);
              const ppEnd = engine.getBodyPosition(1);
              const v3End = engine.getBodyVelocity(0);
              const vpEnd = engine.getBodyVelocity(1);

              const rRelEnd = { x: ppEnd.x - p3End.x, y: ppEnd.y - p3End.y, z: ppEnd.z - p3End.z };
              const vRelEnd = { x: vpEnd.x - v3End.x, y: vpEnd.y - v3End.y, z: vpEnd.z - v3End.z };

              const finalEps = calculateSpecificEnergy(rRelEnd, vRelEnd, 1.0);
              const finalEcc = calculateEccentricity(rRelEnd, vRelEnd, 1.0);
              const finalA = calculateSemiMajorAxis(rRelEnd, vRelEnd, 1.0);

              if (finalEps < 0.0 && finalEcc < 0.20) {
                // Settled timestamp estimation: 1 period after periapsis
                const period = 2 * Math.PI * Math.sqrt((finalA ** 3) / 1.0);
                const tSettled = Math.min(totalDuration, tPeriapsis + period);

                candidates.push({
                  initialPlanetPos: { x: -4.0, y: y0, z: 0.0 },
                  initialPlanetVel: { x: vx, y: 0.0, z: 0.0 },
                  star3Pos: { x: x3, y: y3, z: 0.0 },
                  star3Vel: { x: v3x, y: v3y, z: 0.0 },
                  periapsisDistance: Number(minR.toFixed(6)),
                  periapsisTime: Number(tPeriapsis.toFixed(4)),
                  settledTime: Number(tSettled.toFixed(4)),
                  eccentricity: Number(finalEcc.toFixed(6)),
                  energy: Number(finalEps.toFixed(6)),
                  semiMajorAxis: Number(finalA.toFixed(6))
                });
              }
            }
          }
        }
      }
    }
  }

  // Sort candidates by lowest eccentricity
  candidates.sort((a, b) => a.eccentricity - b.eccentricity);

  if (verbose) {
    console.log(`Evaluated ${testedCount} grid points.`);
    console.log(`Discovered ${candidates.length} valid bound trajectories satisfying all constraints.\n`);

    console.log('----------------------------------------------------------------');
    console.log('TOP 3 CANDIDATE PRESETS:');
    console.log('----------------------------------------------------------------');
    console.log(JSON.stringify(candidates.slice(0, 3), null, 2));
    console.log('----------------------------------------------------------------\n');
  }

  return candidates;
}

// Execute standalone when run via node scripts/sim.js
const isDirectExecution = process.argv[1]?.endsWith('sim.js');
if (isDirectExecution) {
  runSlingshotSweep({ verbose: true });
}

