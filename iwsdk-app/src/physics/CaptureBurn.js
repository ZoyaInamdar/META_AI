/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Chapter 1 Retrograde Capture Burn Controller
 * Role: Person B (The Physics & Mission Lead / CaptureBurn.js)
 * ============================================================================
 *
 * Manages the continuous 1.0-second retrograde orbital capture burn:
 * 1. Executes when Chapter 1 milestone (400 energy) is unlocked.
 * 2. Applies continuous retrograde thrust acceleration: a = -v / ||v|| * (DeltaV / T_burn).
 * 3. Bleeds orbital energy to transition an unbound hyperbolic flyby (eps > 0)
 *    into a bound, stable elliptical orbit (eps < 0).
 * 4. Completely zero-allocation during the update() loop.
 * 5. Emits Events.BURN_START and Events.BURN_END to coordinate Person C's VFX/SFX.
 */

import { Events, BurnState } from '../contracts/Interfaces.js';

export { BurnState };

export class CaptureBurn {
  /**
   * @param {Object} [eventBus=null] - Optional EventBus instance
   */
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.planetIndex = 1;
    this.totalDeltaV = 0.5;
    this.duration = 1.0;
    this.acceleration = 0.5; // totalDeltaV / duration
    this.elapsed = 0.0;
    this.isActive = false;

    // Pre-allocated BurnState instance for zero GC allocation in frame loop
    this.burnState = new BurnState();
  }

  /**
   * Initiates a retrograde capture burn sequence.
   *
   * @param {number|string} [planetBodyIndex=1] - Target body index or ID
   * @param {number} [totalDeltaV=0.5] - Total delta-v magnitude to bleed (m/s in sim units)
   * @param {number} [duration=1.0] - Burn duration in seconds
   * @returns {BurnState} Active BurnState
   */
  triggerBurn(planetBodyIndex = 1, totalDeltaV = 0.5, duration = 1.0) {
    this.planetIndex = planetBodyIndex;
    this.totalDeltaV = Number.isFinite(totalDeltaV) && totalDeltaV > 0.0 ? totalDeltaV : 0.5;
    this.duration = Number.isFinite(duration) && duration > 0.0 ? duration : 1.0;
    this.acceleration = this.totalDeltaV / this.duration;
    this.elapsed = 0.0;
    this.isActive = true;

    this.burnState.isActive = true;
    this.burnState.elapsed = 0.0;
    this.burnState.duration = this.duration;
    this.burnState.progress = 0.0;
    this.burnState.thrustVector.x = 0.0;
    this.burnState.thrustVector.y = 0.0;
    this.burnState.thrustVector.z = 0.0;

    if (this.eventBus && typeof this.eventBus.emit === 'function') {
      this.eventBus.emit(Events.BURN_START || 'burn_start', {
        duration: this.duration,
        totalDeltaV: this.totalDeltaV,
        targetBody: this.planetIndex
      });
    }

    return this.getBurnState();
  }

  /**
   * Updates the burn progress and applies continuous retrograde acceleration
   * directly to the orbitalEngine velocity buffers.
   * Completely zero-allocation.
   *
   * @param {number} dt - Step delta time in seconds
   * @param {Object} [orbitalEngine=null] - OrbitalEngine instance
   * @returns {BurnState} Updated BurnState
   */
  update(dt, orbitalEngine = null) {
    if (!this.isActive || !Number.isFinite(dt) || dt <= 0.0) {
      return this.getBurnState();
    }

    const remainingTime = this.duration - this.elapsed;
    const effectiveDt = Math.min(dt, remainingTime);

    if (effectiveDt > 0.0 && orbitalEngine) {
      // Resolve body slot index
      let bIdx = this.planetIndex;
      if (typeof bIdx === 'string') {
        for (let i = 0; i < orbitalEngine.bodyCount; i++) {
          if (orbitalEngine.active[i] && orbitalEngine.ids[i] === bIdx) {
            bIdx = i;
            break;
          }
        }
      }

      if (typeof bIdx === 'number' && bIdx >= 0 && bIdx < orbitalEngine.maxBodies && orbitalEngine.active[bIdx]) {
        const i3 = bIdx * 3;
        const vx = orbitalEngine.velocities[i3];
        const vy = orbitalEngine.velocities[i3 + 1];
        const vz = orbitalEngine.velocities[i3 + 2];
        const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);

        if (vMag > 1e-12) {
          // Retrograde direction: opposite to velocity vector (-v / ||v||)
          const invV = 1.0 / vMag;
          const dirX = -vx * invV;
          const dirY = -vy * invV;
          const dirZ = -vz * invV;

          // Continuous delta-V slice: dv = a_thrust * effectiveDt
          const dvMag = this.acceleration * effectiveDt;

          orbitalEngine.velocities[i3] += dirX * dvMag;
          orbitalEngine.velocities[i3 + 1] += dirY * dvMag;
          orbitalEngine.velocities[i3 + 2] += dirZ * dvMag;

          // Store normalized thrust direction for VFX particles
          this.burnState.thrustVector.x = dirX;
          this.burnState.thrustVector.y = dirY;
          this.burnState.thrustVector.z = dirZ;
        }
      }
    }

    this.elapsed += effectiveDt;
    if (this.elapsed >= this.duration - 1e-12) {
      this.elapsed = this.duration;
      this.isActive = false;
      this.burnState.isActive = false;
      this.burnState.progress = 1.0;
      this.burnState.elapsed = this.duration;

      if (this.eventBus && typeof this.eventBus.emit === 'function') {
        this.eventBus.emit(Events.BURN_END || 'burn_end', {
          duration: this.duration,
          totalDeltaV: this.totalDeltaV,
          targetBody: this.planetIndex
        });
      }
    } else {
      const progress = Math.min(1.0, this.elapsed / this.duration);
      this.burnState.elapsed = this.elapsed;
      this.burnState.progress = progress;
    }

    return this.getBurnState();
  }

  /**
   * Returns authoritative BurnState snapshot.
   * @returns {BurnState}
   */
  getBurnState() {
    return this.burnState;
  }

  /**
   * Resets the burn controller to inactive defaults.
   */
  reset() {
    this.isActive = false;
    this.elapsed = 0.0;
    this.burnState.isActive = false;
    this.burnState.elapsed = 0.0;
    this.burnState.progress = 0.0;
    this.burnState.thrustVector.x = 0.0;
    this.burnState.thrustVector.y = 0.0;
    this.burnState.thrustVector.z = 0.0;
  }
}

