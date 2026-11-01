/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - BallTrajectory (Projectile Flight Simulation)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Simulates the vertical ballistic trajectory of the Kendama ball (Tama)
 * during a toss, swing, or drop.
 *
 * Architectural Restrictions:
 * - Pure JavaScript ES module.
 * - Zero external dependencies (No Three.js, No IWSDK, No DOM).
 * - Allocation-free per-frame update loop.
 * - Deterministic and independently unit-testable.
 *
 * Physics Model:
 * In traditional Kendama play, the ball is tossed gently upward from a cup or
 * hanging position. In Celestial Kendama VR, the vertical gravity and flight
 * arc are tuned for satisfying VR gameplay:
 *
 *   GRAVITY = 2.5 m/s² (stylized lunar/celestial float, softer than Earth's 9.8 m/s²)
 *   APEX    = 0.22 m   (target peak height above launch position, ~22 cm)
 *
 * Kinematic Equations:
 * 1. Initial Launch Velocity (v0):
 *    From v² = v0² - 2 * g * h, at the apex v = 0:
 *      v0 = sqrt(2 * GRAVITY * APEX) ≈ 1.0488 m/s
 *
 * 2. Total Flight Duration:
 *    Time to reach apex: t_apex = v0 / GRAVITY ≈ 0.4195 s
 *    Symmetric flight duration (up and down):
 *      flightDuration = 2 * v0 / GRAVITY ≈ 0.8390 s
 *
 * 3. Position and Velocity at time t:
 *      y(t)  = y0 + v0 * t - 0.5 * GRAVITY * t²
 *      vy(t) = v0 - GRAVITY * t
 *      x(t)  = x0
 *      z(t)  = z0
 */

/** Stylized vertical gravitational acceleration in m/s² */
export const GRAVITY = 2.5;

/** Peak flight height above launch position in meters (22 cm) */
export const APEX = 0.22;

/** Initial vertical launch velocity in m/s (sqrt(2 * g * h)) */
export const INITIAL_VELOCITY_Y = Math.sqrt(2 * GRAVITY * APEX);
export const v0 = INITIAL_VELOCITY_Y;

/** Total ballistic flight duration until landing in seconds */
export const FLIGHT_DURATION = (2 * INITIAL_VELOCITY_Y) / GRAVITY;
export const flightDuration = FLIGHT_DURATION;

/**
 * Ball flight modes.
 * @readonly
 * @enum {string}
 */
export const BallTrajectoryMode = Object.freeze({
    SEATED: 'seated',
    AIR: 'air',
});

/**
 * Manages the kinematic trajectory calculations for the Kendama ball.
 */
export class BallTrajectory {
    constructor() {
        // Mode state
        this._mode = BallTrajectoryMode.SEATED;

        // Origin / launch coordinates
        this._startX = 0.0;
        this._startY = 0.0;
        this._startZ = 0.0;

        // Current internal mutable position (reused to avoid allocations)
        this._position = { x: 0.0, y: 0.0, z: 0.0 };

        // Current internal mutable velocity (reused to avoid allocations)
        this._velocity = { x: 0.0, y: 0.0, z: 0.0 };

        // Flight timing
        this._elapsed = 0.0;
    }

    /**
     * Starts a new ball flight from the specified starting position.
     *
     * @param {{ x?: number, y?: number, z?: number }} [startVec3] - Launch position
     */
    launch(startVec3) {
        // Defensive copy of launch position: do not mutate or store reference to input vector
        this._startX = (startVec3 && Number.isFinite(startVec3.x)) ? startVec3.x : 0.0;
        this._startY = (startVec3 && Number.isFinite(startVec3.y)) ? startVec3.y : 0.0;
        this._startZ = (startVec3 && Number.isFinite(startVec3.z)) ? startVec3.z : 0.0;

        // Initialize position to launch origin
        this._position.x = this._startX;
        this._position.y = this._startY;
        this._position.z = this._startZ;

        // Initialize vertical velocity to v0, horizontal velocities to 0
        this._velocity.x = 0.0;
        this._velocity.y = INITIAL_VELOCITY_Y;
        this._velocity.z = 0.0;

        // Reset flight timing and switch to air mode
        this._elapsed = 0.0;
        this._mode = BallTrajectoryMode.AIR;
    }

    /**
     * Advances the trajectory simulation by delta time (dt).
     *
     * Zero-allocation method: mutates internal coordinates directly.
     *
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        // Ignore update if not in air or if dt is invalid/negative
        if (this._mode !== BallTrajectoryMode.AIR) {
            return;
        }

        if (!Number.isFinite(dt) || dt <= 0.0) {
            return;
        }

        // Advance elapsed time
        this._elapsed += dt;

        // Check for landing completion
        if (this._elapsed >= FLIGHT_DURATION) {
            // Clamp elapsed time exactly to flight duration
            this._elapsed = FLIGHT_DURATION;

            // Clamp position exactly to landing point (launch height)
            this._position.x = this._startX;
            this._position.y = this._startY;
            this._position.z = this._startZ;

            // At landing, vertical velocity stops and ball is seated
            this._velocity.x = 0.0;
            this._velocity.y = 0.0;
            this._velocity.z = 0.0;

            this._mode = BallTrajectoryMode.SEATED;
            return;
        }

        const t = this._elapsed;

        // Projectile position: y(t) = y0 + v0 * t - 0.5 * g * t²
        this._position.x = this._startX;
        this._position.y = this._startY + INITIAL_VELOCITY_Y * t - 0.5 * GRAVITY * t * t;
        this._position.z = this._startZ;

        // Vertical velocity: vy(t) = v0 - g * t
        this._velocity.x = 0.0;
        this._velocity.y = INITIAL_VELOCITY_Y - GRAVITY * t;
        this._velocity.z = 0.0;
    }

    /**
     * Helper to compute vertical height above launch position at time t.
     *
     * @param {number} t - Time since launch in seconds
     * @returns {number} Height above launch origin in meters
     */
    heightAt(t) {
        if (!Number.isFinite(t) || t <= 0.0) {
            return 0.0;
        }
        if (t >= FLIGHT_DURATION) {
            return 0.0;
        }
        return INITIAL_VELOCITY_Y * t - 0.5 * GRAVITY * t * t;
    }

    /**
     * Current state snapshot.
     * Returns a new defensive copy to prevent external mutation of internal state.
     *
     * @returns {{
     *   position: { x: number, y: number, z: number },
     *   velocity: { x: number, y: number, z: number },
     *   mode: string
     * }}
     */
    get state() {
        return {
            position: {
                x: this._position.x,
                y: this._position.y,
                z: this._position.z,
            },
            velocity: {
                x: this._velocity.x,
                y: this._velocity.y,
                z: this._velocity.z,
            },
            mode: this._mode,
        };
    }

    /**
     * Current flight mode ('seated' or 'air').
     * @returns {string}
     */
    get mode() {
        return this._mode;
    }

    /**
     * Elapsed flight time in seconds.
     * @returns {number}
     */
    get elapsed() {
        return this._elapsed;
    }

    /**
     * Total expected flight duration in seconds.
     * @returns {number}
     */
    get flightDuration() {
        return FLIGHT_DURATION;
    }
}

export default BallTrajectory;
