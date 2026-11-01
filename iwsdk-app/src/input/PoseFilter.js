/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PoseFilter (One Euro Filter for 3D Positions)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * An adaptive 1st-order low-pass filter specifically designed for noisy,
 * real-time VR tracking signals (controllers and hand joints).
 *
 * Reference:
 *   Géry Casiez, Nicolas Roussel, Daniel Vogel.
 *   "1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems."
 *   ACM CHI 2012 (Conference on Human Factors in Computing Systems), Austin, TX, USA.
 *
 * The Core Problem in VR Tracking:
 * - A standard low-pass filter has a static cutoff frequency (fc).
 * - If fc is LOW:  tracking jitter is eliminated when resting, but there is noticeable
 *                  LAG when moving quickly (swinging the Kendama).
 * - If fc is HIGH: tracking is ultra-responsive, but your virtual hand shakes/jitters
 *                  when you hold it still.
 *
 * The One Euro Filter Solution:
 * It dynamically adapts its cutoff frequency (fc) based on instantaneous movement speed:
 *
 *   1) When the hand is STILL (speed ~ 0):
 *      Cutoff frequency drops towards `minCutoff` (fc_min, e.g. 1.0 Hz).
 *      Heavy smoothing is applied, eliminating jitter and tremor.
 *
 *   2) When the hand SWINGS FAST (speed > 0):
 *      Cutoff frequency increases proportionally to speed: fc = fc_min + beta * speed.
 *      Filtering softens, eliminating latency so the virtual kendama tracks the
 *      physical controller during quick flicks and whips.
 *
 * Mathematical Formulation:
 *
 * 1. Exponential Smoothing Factor Alpha:
 *    Given a cutoff frequency fc (Hz) and sample period dt (seconds):
 *      tau = 1 / (2 * PI * fc)
 *      alpha = 1 / (1 + tau / dt) = (2 * PI * fc * dt) / (1 + 2 * PI * fc * dt)
 *    When alpha -> 1: No filtering (raw value passed directly).
 *    When alpha -> 0: Maximum filtering (output stays at previous value).
 *
 * 2. Filtered Velocity (Derivative):
 *    Raw velocity vector:
 *      v_raw = (x_current - x_prev_filtered) / dt
 *    The velocity estimate is smoothed using a fixed cutoff frequency `dCutoff` (fc_d, e.g. 1.0 Hz):
 *      v_filtered = alpha_d * v_raw + (1 - alpha_d) * v_prev_filtered
 *
 * 3. Speed & Adaptive Cutoff:
 *    Speed is the 3D magnitude of filtered velocity:
 *      speed = sqrt(vx^2 + vy^2 + vz^2)
 *    Adaptive cutoff:
 *      fc = minCutoff + beta * speed
 *
 * 4. Filtered Position:
 *    Using adaptive alpha computed from fc:
 *      x_filtered = alpha_pos * x_current + (1 - alpha_pos) * x_prev_filtered
 *
 * Note on VR Metric Units (Meters):
 * In 2D screen interfaces, velocities are measured in hundreds of pixels per second,
 * so beta is often ~0.007. In WebXR/VR, positions are in meters and velocities are in
 * meters per second (typically 0.1 to 5.0 m/s). A beta between 0.5 and 5.0 provides
 * the ideal responsiveness in metric VR environments.
 *
 * Memory & Performance Note:
 * All internal state is stored in pre-allocated member variables. No objects
 * or arrays are allocated inside update/filter calls.
 */

const TWO_PI = Math.PI * 2.0;

/**
 * Computes the exponential smoothing factor (alpha) for a 1st-order low-pass filter.
 *
 * @param {number} cutoff - Cutoff frequency in Hertz (Hz)
 * @param {number} dt - Delta time in seconds (s)
 * @returns {number} Smoothing factor alpha in range [0, 1]
 */
function computeAlpha(cutoff, dt) {
    if (cutoff <= 0.0 || dt <= 0.0) {
        return 1.0;
    }
    const tau = 1.0 / (TWO_PI * cutoff);
    const alpha = 1.0 / (1.0 + tau / dt);
    // Clamp to valid range [0, 1] for numerical stability
    return Math.max(0.0, Math.min(1.0, alpha));
}

/**
 * Reusable 3D One Euro Filter for controller and hand position data.
 */
export class PoseFilter {
    /**
     * @param {Object} [options={}] - Filter tuning parameters
     * @param {number} [options.minCutoff=1.0] - Minimum cutoff frequency in Hz when stationary.
     *                                           Lower values remove more jitter but introduce slight lag at rest.
     * @param {number} [options.beta=1.0] - Speed coefficient for metric VR (m/s). Higher values aggressively
     *                                      drop lag during fast movements.
     * @param {number} [options.dCutoff=1.0] - Cutoff frequency in Hz for filtering the velocity derivative.
     */
    constructor({ minCutoff = 1.0, beta = 1.0, dCutoff = 1.0 } = {}) {
        // Tuning parameters
        this.minCutoff = Number.isFinite(minCutoff) && minCutoff > 0 ? minCutoff : 1.0;
        this.beta = Number.isFinite(beta) && beta >= 0 ? beta : 1.0;
        this.dCutoff = Number.isFinite(dCutoff) && dCutoff > 0 ? dCutoff : 1.0;

        // Initialization flags
        this._hasPosition = false;
        this._hasVelocity = false;

        // Filtered position state
        this._x = 0.0;
        this._y = 0.0;
        this._z = 0.0;

        // Filtered velocity state (m/s)
        this._dx = 0.0;
        this._dy = 0.0;
        this._dz = 0.0;

        // Reusable internal output objects (avoids heap allocations)
        this._output = { x: 0.0, y: 0.0, z: 0.0 };
        this._velocityOutput = { x: 0.0, y: 0.0, z: 0.0 };
    }

    /**
     * Resets filter history. Call this on tracking loss, teleport, or when snapping to a new position.
     */
    reset() {
        this._hasPosition = false;
        this._hasVelocity = false;
        this._x = 0.0;
        this._y = 0.0;
        this._z = 0.0;
        this._dx = 0.0;
        this._dy = 0.0;
        this._dz = 0.0;
        this._output.x = 0.0;
        this._output.y = 0.0;
        this._output.z = 0.0;
        this._velocityOutput.x = 0.0;
        this._velocityOutput.y = 0.0;
        this._velocityOutput.z = 0.0;
    }

    /**
     * Filters a 3D position vector using the One Euro algorithm.
     *
     * @param {{ x: number, y: number, z: number }} pos - Raw input position object
     * @param {number} dt - Time elapsed since last sample in seconds
     * @param {{ x: number, y: number, z: number }} [out] - Optional target object to write results into.
     *                                                     If omitted, internal reusable output is returned.
     * @returns {{ x: number, y: number, z: number }} Filtered position
     */
    filter(pos, dt, out) {
        if (!pos) {
            return this._writeOutput(this._x, this._y, this._z, out);
        }
        return this.filterXYZ(pos.x, pos.y, pos.z, dt, out);
    }

    /**
     * Filters raw X, Y, Z coordinate values directly (zero object creation).
     *
     * @param {number} x - Raw X position in meters
     * @param {number} y - Raw Y position in meters
     * @param {number} z - Raw Z position in meters
     * @param {number} dt - Time elapsed in seconds (e.g. 0.0138 for 72Hz)
     * @param {{ x: number, y: number, z: number }} [out] - Optional output object to receive result
     * @returns {{ x: number, y: number, z: number }} Filtered position
     */
    filterXYZ(x, y, z, dt, out) {
        // Fallback for non-finite raw coordinates
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            return this._writeOutput(this._x, this._y, this._z, out);
        }

        // First sample: initialize state directly to input position
        if (!this._hasPosition) {
            this._hasPosition = true;
            this._hasVelocity = false;
            this._x = x;
            this._y = y;
            this._z = z;
            this._dx = 0.0;
            this._dy = 0.0;
            this._dz = 0.0;
            return this._writeOutput(x, y, z, out);
        }

        // Safety guard for invalid delta time:
        // If dt is zero, negative, or not a finite number, we cannot divide by dt.
        // Return the current filtered state without corrupting derivatives.
        if (!Number.isFinite(dt) || dt <= 0.0) {
            return this._writeOutput(this._x, this._y, this._z, out);
        }

        // Frame stutter / suspension guard:
        // If dt is excessively large (> 1.0 second), a tab blur or large pause occurred.
        // Snap directly to current input to avoid massive velocity spikes.
        if (dt > 1.0) {
            this._hasPosition = true;
            this._hasVelocity = false;
            this._x = x;
            this._y = y;
            this._z = z;
            this._dx = 0.0;
            this._dy = 0.0;
            this._dz = 0.0;
            return this._writeOutput(x, y, z, out);
        }

        // --------------------------------------------------------------------
        // Step 1: Compute and filter velocity (derivative)
        // --------------------------------------------------------------------
        const rawDx = (x - this._x) / dt;
        const rawDy = (y - this._y) / dt;
        const rawDz = (z - this._z) / dt;

        if (!this._hasVelocity) {
            // First derivative sample initializes velocity directly (standard 1€ behavior)
            this._hasVelocity = true;
            this._dx = rawDx;
            this._dy = rawDy;
            this._dz = rawDz;
        } else {
            // Filter velocity with fixed dCutoff frequency
            const alphaD = computeAlpha(this.dCutoff, dt);
            this._dx = alphaD * rawDx + (1.0 - alphaD) * this._dx;
            this._dy = alphaD * rawDy + (1.0 - alphaD) * this._dy;
            this._dz = alphaD * rawDz + (1.0 - alphaD) * this._dz;
        }

        // --------------------------------------------------------------------
        // Step 2: Compute 3D speed magnitude
        // --------------------------------------------------------------------
        const speed = Math.sqrt(
            this._dx * this._dx +
            this._dy * this._dy +
            this._dz * this._dz
        );

        // --------------------------------------------------------------------
        // Step 3: Compute adaptive cutoff frequency and position alpha
        // --------------------------------------------------------------------
        const cutoff = this.minCutoff + this.beta * speed;
        const alphaPos = computeAlpha(cutoff, dt);

        // --------------------------------------------------------------------
        // Step 4: Filter position
        // --------------------------------------------------------------------
        this._x = alphaPos * x + (1.0 - alphaPos) * this._x;
        this._y = alphaPos * y + (1.0 - alphaPos) * this._y;
        this._z = alphaPos * z + (1.0 - alphaPos) * this._z;

        return this._writeOutput(this._x, this._y, this._z, out);
    }

    /**
     * Returns the current filtered velocity vector (m/s).
     * Useful for calculating ball release velocity when tossing.
     *
     * @param {{ x: number, y: number, z: number }} [out] - Optional destination object
     * @returns {{ x: number, y: number, z: number }} Velocity vector
     */
    getVelocity(out) {
        const target = out || this._velocityOutput;
        target.x = this._dx;
        target.y = this._dy;
        target.z = this._dz;
        return target;
    }

    /**
     * Whether the filter has received at least one valid sample.
     * @returns {boolean}
     */
    isInitialized() {
        return this._hasPosition;
    }

    /**
     * Helper to write x, y, z into output destination without allocation.
     * @private
     */
    _writeOutput(x, y, z, out) {
        const target = out || this._output;
        target.x = x;
        target.y = y;
        target.z = z;
        return target;
    }
}

export default PoseFilter;
