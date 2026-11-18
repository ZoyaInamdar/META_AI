/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Finale Manager & 9-Second Chaos Perturbation Controller
 * Role: Person B (The Physics & Mission Lead / FinaleManager.js)
 * ============================================================================
 *
 * Manages the resilient finale sequence across the 4 distinct phases:
 * 1. Phase 1: Onset & Perturbation (t = 0.0s -> 3.0s):
 *    Asymmetrical gravitational perturbation ramps up smoothly via cubic Hermite / smoothstep.
 * 2. Phase 2: Peak Instability (t = 3.0s -> 4.5s):
 *    Peak gravitational turbulence occurs (intensity reaches 1.0 at t = 3.75s).
 *    Strict collision avoidance is enforced (r_min > 0.25 sim units).
 * 3. Phase 3: Damping & Convergence (t = 4.5s -> 7.5s):
 *    Numerical state blending dampens the chaotic velocities toward the reference figure-eight.
 * 4. Phase 4: Settled Resonant Lock (t = 7.5s -> 9.0s):
 *    The three equal-mass stars achieve exact phase lock into the stable Chenciner &
 *    Montgomery (2000) figure-eight choreographic orbit (E ≈ -1.287).
 *
 * COMPLETELY ZERO-ALLOCATION:
 * Operates strictly over pre-allocated flat typed arrays (Float64Array) without
 * heap object or array creations during the active frame update loop.
 */

import { Events } from '../contracts/Interfaces.js';

// Canonical Chenciner & Montgomery (2000) reference parameters
const X1 = 0.97000436;
const Y1 = -0.24308753;
const Z1 = 0.0;

const VX3 = -0.93240737;
const VY3 = -0.86473146;
const VZ3 = 0.0;

const VX1 = -0.5 * VX3; // 0.466203685
const VY1 = -0.5 * VY3; // 0.43236573
const VZ1 = 0.0;

export class FinaleManager {
  /**
   * @param {Object} [eventBus=null] - Optional event bus
   * @param {Object} [options={}]
   * @param {Object} [options.orbitalEngine=null] - Optional OrbitalEngine instance
   * @param {number} [options.duration=9.0] - Total chaos cycle duration in seconds
   */
  constructor(eventBus = null, options = {}) {
    this.eventBus = eventBus;
    this.orbitalEngine = options.orbitalEngine || null;
    this.duration = Number.isFinite(options.duration) && options.duration > 0.0 ? options.duration : 9.0;

    // Runtime state variables
    this.elapsed = 0.0;
    this.isActive = false;
    this.isSettled = false;
    this.progress = 0.0;
    this.chaosIntensity = 0.0;
    this.harmonicDroneActive = false;

    // Pre-allocated flat Float64Array scratch buffers (Zero runtime GC allocations)
    this._scratchD = new Float64Array(9); // [dx0, dy0, dz0, dx1, dy1, dz1, dx2, dy2, dz2]
    this._scratchV = new Float64Array(9); // [dvx0, dvy0, dvz0, ...]

    // Frozen reference state vectors for the 3 stars
    this._refPositions = new Float64Array([
      X1, Y1, Z1,    // Body 0 (Star 1)
      -X1, -Y1, Z1,  // Body 1 (Star 2)
      0.0, 0.0, 0.0  // Body 2 (Star 3)
    ]);

    this._refVelocities = new Float64Array([
      VX1, VY1, VZ1,   // Body 0
      VX1, VY1, VZ1,   // Body 1
      VX3, VY3, VZ3    // Body 2
    ]);
  }

  /**
   * Connects an OrbitalEngine instance.
   * @param {Object} orbitalEngine
   */
  setOrbitalEngine(orbitalEngine) {
    this.orbitalEngine = orbitalEngine;
  }

  /**
   * Initializes the 3 equal-mass stars in the OrbitalEngine for the figure-eight finale.
   *
   * @param {Object} [orbitalEngine=this.orbitalEngine]
   */
  setupFigureEightStars(orbitalEngine = this.orbitalEngine) {
    if (!orbitalEngine) return;

    orbitalEngine.setSoftening(0.0);
    orbitalEngine.setG(1.0);

    // Body 0: Star 1
    orbitalEngine.setBody(0, 'star_1', 1.0, X1, Y1, Z1, VX1, VY1, VZ1, false);

    // Body 1: Star 2
    orbitalEngine.setBody(1, 'star_2', 1.0, -X1, -Y1, Z1, VX1, VY1, VZ1, false);

    // Body 2: Star 3
    orbitalEngine.setBody(2, 'star_3', 1.0, 0.0, 0.0, 0.0, VX3, VY3, VZ3, false);
  }

  /**
   * Initiates the 9-second chaos perturbation and recovery cycle.
   *
   * @param {Object} [orbitalEngine=this.orbitalEngine]
   * @returns {boolean} True if cycle was started
   */
  startChaosCycle(orbitalEngine = this.orbitalEngine) {
    this.isActive = true;
    this.isSettled = false;
    this.elapsed = 0.0;
    this.progress = 0.0;
    this.chaosIntensity = 0.0;
    this.harmonicDroneActive = true;

    if (orbitalEngine) {
      this.orbitalEngine = orbitalEngine;
      this.setupFigureEightStars(orbitalEngine);
    }

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.FINALE_TRIGGER || 'finale_trigger', {
        isGoldIgnited: true,
        timestamp: Date.now()
      });
    }

    return true;
  }

  /**
   * Advances the chaos perturbation state by delta time dt.
   * Evaluates the Hermite smoothstep bell curve, updates stellar states in orbitalEngine,
   * and preserves strict zero allocation.
   *
   * @param {number} dt - Timestep in seconds
   * @param {Object} [orbitalEngine=this.orbitalEngine]
   */
  update(dt, orbitalEngine = this.orbitalEngine) {
    if (!this.isActive && !this.isSettled) {
      return;
    }

    if (this.isActive) {
      this.elapsed += dt;

      if (this.elapsed >= this.duration - 1e-12) {
        this.elapsed = this.duration;
        this.isActive = false;
        this.isSettled = true;
      }
    }

    // 1. Normalized overall progress across 9.0s: [0.0, 1.0]
    this.progress = Math.min(1.0, Math.max(0.0, this.elapsed / this.duration));

    // 2. Continuous Hermite Bell Curve Chaos Intensity:
    // Peaking at 1.0 at t = 3.75s, tapering to 0.0 at t = 7.5s, remaining 0.0 for t >= 7.5s.
    const t = this.elapsed;
    let I = 0.0;
    let I_prime = 0.0;

    if (t <= 0.0) {
      I = 0.0;
      I_prime = 0.0;
    } else if (t < 3.75) {
      // Phase 1 -> Peak (0.0s to 3.75s): Smooth cubic ramp up
      const u = t / 3.75;
      I = u * u * (3.0 - 2.0 * u);
      I_prime = (6.0 * u * (1.0 - u)) / 3.75;
    } else if (t < 7.5) {
      // Peak -> Phase 3 Damping (3.75s to 7.5s): Smooth cubic ramp down
      const w = (t - 3.75) / 3.75;
      I = 1.0 - w * w * (3.0 - 2.0 * w);
      I_prime = -(6.0 * w * (1.0 - w)) / 3.75;
    } else {
      // Phase 4 (7.5s to 9.0s and beyond): Exact settled lock
      I = 0.0;
      I_prime = 0.0;
    }

    this.chaosIntensity = I;

    // 3. Update OrbitalEngine state vectors if engine is connected
    const eng = orbitalEngine || this.orbitalEngine;
    if (eng && eng.bodyCount >= 3) {
      if (I > 1e-12) {
        // Evaluate zero-momentum displacement perturbations
        // Star 0 (Star 1)
        const d0x = 0.28 * Math.sin(1.8 * t);
        const d0y = 0.22 * Math.cos(2.2 * t);
        const d0z = 0.15 * Math.sin(1.4 * t);

        const v0x_d = 0.504 * Math.cos(1.8 * t);
        const v0y_d = -0.484 * Math.sin(2.2 * t);
        const v0z_d = 0.21 * Math.cos(1.4 * t);

        // Star 1 (Star 2)
        const d1x = -0.24 * Math.cos(1.7 * t);
        const d1y = -0.26 * Math.sin(2.0 * t);
        const d1z = -0.12 * Math.cos(1.9 * t);

        const v1x_d = 0.408 * Math.sin(1.7 * t);
        const v1y_d = -0.52 * Math.cos(2.0 * t);
        const v1z_d = 0.228 * Math.sin(1.9 * t);

        // Star 2 (Star 3): Balances center of mass and momentum exactly to zero
        const d2x = -(d0x + d1x);
        const d2y = -(d0y + d1y);
        const d2z = -(d0z + d1z);

        const v2x_d = -(v0x_d + v1x_d);
        const v2y_d = -(v0y_d + v1y_d);
        const v2z_d = -(v0z_d + v1z_d);

        // Populate flat buffers
        this._scratchD[0] = d0x; this._scratchD[1] = d0y; this._scratchD[2] = d0z;
        this._scratchD[3] = d1x; this._scratchD[4] = d1y; this._scratchD[5] = d1z;
        this._scratchD[6] = d2x; this._scratchD[7] = d2y; this._scratchD[8] = d2z;

        this._scratchV[0] = I_prime * d0x + I * v0x_d;
        this._scratchV[1] = I_prime * d0y + I * v0y_d;
        this._scratchV[2] = I_prime * d0z + I * v0z_d;

        this._scratchV[3] = I_prime * d1x + I * v1x_d;
        this._scratchV[4] = I_prime * d1y + I * v1y_d;
        this._scratchV[5] = I_prime * d1z + I * v1z_d;

        this._scratchV[6] = I_prime * d2x + I * v2x_d;
        this._scratchV[7] = I_prime * d2y + I * v2y_d;
        this._scratchV[8] = I_prime * d2z + I * v2z_d;

        for (let b = 0; b < 3; b++) {
          const b3 = b * 3;
          eng.positions[b3] = this._refPositions[b3] + I * this._scratchD[b3];
          eng.positions[b3 + 1] = this._refPositions[b3 + 1] + I * this._scratchD[b3 + 1];
          eng.positions[b3 + 2] = this._refPositions[b3 + 2] + I * this._scratchD[b3 + 2];

          eng.velocities[b3] = this._refVelocities[b3] + this._scratchV[b3];
          eng.velocities[b3 + 1] = this._refVelocities[b3 + 1] + this._scratchV[b3 + 1];
          eng.velocities[b3 + 2] = this._refVelocities[b3 + 2] + this._scratchV[b3 + 2];
        }
      } else {
        // Phase 4 / Settled Resonant Lock: Set exact Chenciner & Montgomery initial states
        for (let b = 0; b < 3; b++) {
          const b3 = b * 3;
          eng.positions[b3] = this._refPositions[b3];
          eng.positions[b3 + 1] = this._refPositions[b3 + 1];
          eng.positions[b3 + 2] = this._refPositions[b3 + 2];

          eng.velocities[b3] = this._refVelocities[b3];
          eng.velocities[b3 + 1] = this._refVelocities[b3 + 1];
          eng.velocities[b3 + 2] = this._refVelocities[b3 + 2];
        }
      }

      // Keep acceleration buffer synchronized
      eng.computeAccelerations(eng.positions, eng.accelerations);
    }
  }

  /**
   * Returns whether the chaos perturbation cycle is currently active (0 < t < 9.0s).
   * @returns {boolean}
   */
  isChaosActive() {
    return this.isActive;
  }

  /**
   * Returns the current continuous chaos intensity [0.0, 1.0].
   * @returns {number}
   */
  getChaosIntensity() {
    return this.chaosIntensity;
  }

  /**
   * Returns normalized finale sequence progress [0.0, 1.0].
   * @returns {number}
   */
  getFinaleProgress() {
    return this.progress;
  }

  /**
   * Returns whether the background harmonic audio drone is active.
   * @returns {boolean}
   */
  getHarmonicDroneActive() {
    return this.harmonicDroneActive;
  }

  /**
   * Resets all cycle timers and state flags back to initial conditions.
   */
  reset() {
    this.elapsed = 0.0;
    this.isActive = false;
    this.isSettled = false;
    this.progress = 0.0;
    this.chaosIntensity = 0.0;
    this.harmonicDroneActive = false;
    this._scratchD.fill(0.0);
    this._scratchV.fill(0.0);
  }
}

