/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Chapter 2 Binary Star System & Resonance Controller
 * Role: Person B (The Physics & Mission Lead / BinarySystem.js)
 * ============================================================================
 *
 * Manages:
 * 1. Barycentric circular orbit setup for binary stars Star 1 and Star 2
 *    (masses m1 = m2 = 1.0, separation d = 0.8, zero net linear momentum).
 * 2. Stable circumbinary placement of the planet at r = 2.4 (> 2.5d).
 * 3. Cadence-synchronized prograde impulse application: deltaV = +0.05 * v_p / ||v_p||
 *    to expand the orbit toward the resonant radius r_res = 3.2.
 * 4. Zero-allocation per frame execution.
 */

import { BINARY_CONFIG } from '../mission/missionConfig.js';

/**
 * Sets up Star 1, Star 2, and the circumbinary planet in OrbitalEngine for Chapter 2.
 *
 * @param {Object} orbitalEngine - OrbitalEngine instance
 * @param {Object} [options={}]
 * @param {number} [options.separation=0.8] - Mutual star separation d
 * @param {number} [options.starMass1=1.0] - Mass of primary star
 * @param {number} [options.starMass2=1.0] - Mass of companion star
 * @param {number} [options.planetRadius=2.4] - Initial orbital radius of planet
 * @param {number} [options.planetMass=1e-6] - Mass of planet
 * @param {boolean} [options.resetEngine=false] - Whether to call engine.reset()
 * @returns {{ vStar: number, vPlanet: number, d: number, rPlanet: number }}
 */
export function setupChapter2Binary(orbitalEngine, options = {}) {
  if (!orbitalEngine) {
    throw new TypeError('orbitalEngine is required');
  }

  const d = Number.isFinite(options.separation) ? options.separation : BINARY_CONFIG.SEPARATION; // 0.8
  const m1 = Number.isFinite(options.starMass1) ? options.starMass1 : BINARY_CONFIG.STAR_MASS_1; // 1.0
  const m2 = Number.isFinite(options.starMass2) ? options.starMass2 : BINARY_CONFIG.STAR_MASS_2; // 1.0
  const mTot = m1 + m2;
  const G = orbitalEngine.G ?? 1.0;

  if (options.resetEngine) {
    orbitalEngine.reset();
  }

  // Circular barycentric orbital speed:
  // v_star = sqrt((G * m2^2) / (mTot * d)) for Star 1
  // For equal masses m1 = m2 = 1.0, vStar = sqrt(1.0 / (2.0 * 0.8)) = sqrt(1.0 / 1.6) ≈ 0.7905694
  const vStar1 = Math.sqrt((G * m2 * m2) / (mTot * d));
  const vStar2 = Math.sqrt((G * m1 * m1) / (mTot * d));

  const halfD = d * 0.5;

  // Star 1: index 0 at (+halfD, 0, 0), moving along +Y
  orbitalEngine.setBody(0, 'star_1', m1, halfD, 0.0, 0.0, 0.0, vStar1, 0.0, false);

  // Star 2: index 1 at (-halfD, 0, 0), moving along -Y
  orbitalEngine.setBody(1, 'star_2', m2, -halfD, 0.0, 0.0, 0.0, -vStar2, 0.0, false);

  // Circumbinary Planet: index 2 at r = 2.4 (> 2.5d)
  const rPlanet = Number.isFinite(options.planetRadius) ? options.planetRadius : BINARY_CONFIG.PLANET_ORBIT_RADIUS; // 2.4
  const planetMass = Number.isFinite(options.planetMass) ? options.planetMass : 1e-6;

  // Approximated Keplerian orbital speed around barycenter:
  // v_planet = sqrt(G * mTot / rPlanet) = sqrt(2.0 / 2.4) ≈ 0.9128709
  const vPlanet = Math.sqrt((G * mTot) / rPlanet);

  // Planet: index 2 at (0, rPlanet, 0), moving along -X (counter-clockwise)
  orbitalEngine.setBody(2, 'planet', planetMass, 0.0, rPlanet, 0.0, -vPlanet, 0.0, 0.0, false);

  return {
    vStar: vStar1,
    vPlanet,
    d,
    rPlanet
  };
}

/**
 * Applies a prograde delta-V impulse to the planet along its instantaneous velocity vector.
 * Completely zero-allocation: performs in-place scalar arithmetic on flat typed arrays.
 *
 * @param {Object} orbitalEngine - OrbitalEngine instance
 * @param {number|string} [planetIndex=2] - Body index or ID of the planet
 * @param {number} [boostMagnitude=0.05] - Delta-V boost magnitude (m/s in sim units)
 * @returns {number} Effective applied delta-V magnitude
 */
export function applyProgradeImpulse(orbitalEngine, planetIndex = 2, boostMagnitude = 0.05) {
  if (!orbitalEngine || !Number.isFinite(boostMagnitude) || boostMagnitude <= 0.0) {
    return 0.0;
  }

  let bIdx = planetIndex;
  if (typeof bIdx === 'string') {
    for (let i = 0; i < orbitalEngine.bodyCount; i++) {
      if (orbitalEngine.active[i] && orbitalEngine.ids[i] === bIdx) {
        bIdx = i;
        break;
      }
    }
  }

  if (typeof bIdx !== 'number' || bIdx < 0 || bIdx >= orbitalEngine.maxBodies || !orbitalEngine.active[bIdx]) {
    return 0.0;
  }

  const i3 = bIdx * 3;
  const vx = orbitalEngine.velocities[i3];
  const vy = orbitalEngine.velocities[i3 + 1];
  const vz = orbitalEngine.velocities[i3 + 2];
  const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);

  if (vMag <= 1e-12) {
    return 0.0;
  }

  // Unit tangent vector in direction of motion (prograde)
  const invV = 1.0 / vMag;
  const dirX = vx * invV;
  const dirY = vy * invV;
  const dirZ = vz * invV;

  orbitalEngine.velocities[i3] += dirX * boostMagnitude;
  orbitalEngine.velocities[i3 + 1] += dirY * boostMagnitude;
  orbitalEngine.velocities[i3 + 2] += dirZ * boostMagnitude;

  return boostMagnitude;
}

/**
 * BinarySystem Class Controller encapsulating Chapter 2 setup and orbital boosts.
 */
export class BinarySystem {
  /**
   * @param {Object} orbitalEngine - OrbitalEngine instance
   * @param {Object} [options={}]
   */
  constructor(orbitalEngine, options = {}) {
    this.orbitalEngine = orbitalEngine;
    this.planetIndex = options.planetIndex ?? 2;
    this.boostDeltaV = options.boostDeltaV ?? BINARY_CONFIG.BOOST_DELTA_V;
    this.isConfigured = false;
  }

  /**
   * Configures the binary star system and planet in the engine.
   * @param {Object} [options={}]
   */
  setup(options = {}) {
    const res = setupChapter2Binary(this.orbitalEngine, options);
    this.isConfigured = true;
    return res;
  }

  /**
   * Applies an on-cadence prograde boost to the planet.
   * @param {number} [boostDeltaV]
   * @returns {number}
   */
  applyProgradeImpulse(boostDeltaV = this.boostDeltaV) {
    return applyProgradeImpulse(this.orbitalEngine, this.planetIndex, boostDeltaV);
  }

  /**
   * Computes instantaneous three-body collinear alignment angle and flag.
   * @param {Object} [options={}]
   * @returns {{ isAligned: boolean, angleDegrees: number }}
   */
  getThreeBodyAlignment(options = {}) {
    return computeThreeBodyAlignment(this.orbitalEngine, {
      star1: 0,
      star2: 1,
      planet: this.planetIndex,
      ...options
    });
  }
}

// Reusable static cache to ensure zero dynamic heap allocations in frame loop
const _alignmentResult = {
  isAligned: false,
  angleDegrees: 180.0
};

/**
 * Computes collinear three-body alignment between Star 1, Star 2, and the Planet.
 * Completely zero-allocation: writes directly to a reusable cached result.
 *
 * @param {Object} orbitalEngine - OrbitalEngine instance
 * @param {Object} [options={}]
 * @param {number|string} [options.star1='star_1'] - Star 1 index or ID
 * @param {number|string} [options.star2='star_2'] - Star 2 index or ID
 * @param {number|string} [options.planet='planet'] - Planet index or ID
 * @param {number} [options.thresholdDegrees=5.0] - Alignment threshold in degrees
 * @returns {{ isAligned: boolean, angleDegrees: number }}
 */
export function computeThreeBodyAlignment(orbitalEngine, options = {}) {
  if (!orbitalEngine) {
    _alignmentResult.isAligned = false;
    _alignmentResult.angleDegrees = 180.0;
    return _alignmentResult;
  }

  const thresholdDeg = Number.isFinite(options.thresholdDegrees) ? options.thresholdDegrees : 5.0;

  // Resolve Star 1
  let s1Idx = options.star1 ?? 0;
  if (typeof s1Idx === 'string') {
    for (let i = 0; i < orbitalEngine.bodyCount; i++) {
      if (orbitalEngine.active[i] && orbitalEngine.ids[i] === s1Idx) {
        s1Idx = i;
        break;
      }
    }
  }

  // Resolve Star 2
  let s2Idx = options.star2 ?? 1;
  if (typeof s2Idx === 'string') {
    for (let i = 0; i < orbitalEngine.bodyCount; i++) {
      if (orbitalEngine.active[i] && orbitalEngine.ids[i] === s2Idx) {
        s2Idx = i;
        break;
      }
    }
  }

  // Resolve Planet
  let pIdx = options.planet ?? 2;
  if (typeof pIdx === 'string') {
    for (let i = 0; i < orbitalEngine.bodyCount; i++) {
      if (orbitalEngine.active[i] && orbitalEngine.ids[i] === pIdx) {
        pIdx = i;
        break;
      }
    }
  }

  if (
    typeof s1Idx !== 'number' || s1Idx < 0 || s1Idx >= orbitalEngine.maxBodies || !orbitalEngine.active[s1Idx] ||
    typeof s2Idx !== 'number' || s2Idx < 0 || s2Idx >= orbitalEngine.maxBodies || !orbitalEngine.active[s2Idx] ||
    typeof pIdx !== 'number' || pIdx < 0 || pIdx >= orbitalEngine.maxBodies || !orbitalEngine.active[pIdx]
  ) {
    _alignmentResult.isAligned = false;
    _alignmentResult.angleDegrees = 180.0;
    return _alignmentResult;
  }

  const s1 = s1Idx * 3;
  const s2 = s2Idx * 3;
  const pp = pIdx * 3;

  // Vector between stars: u = Star 1 - Star 2
  const ux = orbitalEngine.positions[s1] - orbitalEngine.positions[s2];
  const uy = orbitalEngine.positions[s1 + 1] - orbitalEngine.positions[s2 + 1];
  const uz = orbitalEngine.positions[s1 + 2] - orbitalEngine.positions[s2 + 2];
  const uMag = Math.sqrt(ux * ux + uy * uy + uz * uz);

  if (uMag < 1e-12) {
    _alignmentResult.isAligned = false;
    _alignmentResult.angleDegrees = 180.0;
    return _alignmentResult;
  }

  // Midpoint of stars (barycenter): m = (Star 1 + Star 2) / 2
  const mx = (orbitalEngine.positions[s1] + orbitalEngine.positions[s2]) * 0.5;
  const my = (orbitalEngine.positions[s1 + 1] + orbitalEngine.positions[s2 + 1]) * 0.5;
  const mz = (orbitalEngine.positions[s1 + 2] + orbitalEngine.positions[s2 + 2]) * 0.5;

  // Vector from midpoint to planet: w = Planet - Midpoint
  const wx = orbitalEngine.positions[pp] - mx;
  const wy = orbitalEngine.positions[pp + 1] - my;
  const wz = orbitalEngine.positions[pp + 2] - mz;
  const wMag = Math.sqrt(wx * wx + wy * wy + wz * wz);

  if (wMag < 1e-12) {
    _alignmentResult.isAligned = false;
    _alignmentResult.angleDegrees = 180.0;
    return _alignmentResult;
  }

  // Absolute dot product to measure collinearity
  const dot = (ux * wx + uy * wy + uz * wz) / (uMag * wMag);
  const cosTheta = Math.min(1.0, Math.max(0.0, Math.abs(dot)));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = angleRad * (180.0 / Math.PI);

  _alignmentResult.angleDegrees = angleDeg;
  _alignmentResult.isAligned = angleDeg < thresholdDeg;

  return _alignmentResult;
}

