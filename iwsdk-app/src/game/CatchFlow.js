/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - CatchFlow (Seated / Air / Catching State Machine)
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { getCupConfig, CUP_IDS } from '../input/cupConfigs.js';

/**
 * Vertical distance below the Ken (in meters) at which a descending ball
 * is registered as a miss.
 */
export const MISS_DEPTH = 0.45;

/**
 * Duration in seconds for the ball to lerp into the seated cup position
 * after a catch is confirmed.
 */
export const CATCH_LERP_DURATION = 0.15;

/**
 * Rotates a 3D vector by a quaternion (qx, qy, qz, qw) using pure math.
 *
 * @param {{ x: number, y: number, z: number }} v
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @returns {{ x: number, y: number, z: number }}
 */
function rotateVectorByQuat(v, q) {
    const qx = q?.x ?? 0.0;
    const qy = q?.y ?? 0.0;
    const qz = q?.z ?? 0.0;
    const qw = q?.w ?? 1.0;

    const vx = v.x ?? 0.0;
    const vy = v.y ?? 0.0;
    const vz = v.z ?? 0.0;

    // t = 2 * cross(q.xyz, v)
    const tx = 2.0 * (qy * vz - qz * vy);
    const ty = 2.0 * (qz * vx - qx * vz);
    const tz = 2.0 * (qx * vy - qy * vx);

    // v' = v + qw * t + cross(q.xyz, t)
    return {
        x: vx + qw * tx + (qy * tz - qz * ty),
        y: vy + qw * ty + (qz * tx - qx * tz),
        z: vz + qw * tz + (qx * ty - qy * tx),
    };
}

/**
 * Transforms a 3D point by a 4x4 column-major matrix elements array.
 *
 * @param {{ x: number, y: number, z: number }} p
 * @param {Array<number>} el
 * @returns {{ x: number, y: number, z: number }}
 */
function transformPointByMatrix(p, el) {
    const px = p.x ?? 0.0;
    const py = p.y ?? 0.0;
    const pz = p.z ?? 0.0;
    return {
        x: el[0] * px + el[4] * py + el[8] * pz + el[12],
        y: el[1] * px + el[5] * py + el[9] * pz + el[13],
        z: el[2] * px + el[6] * py + el[10] * pz + el[14],
    };
}

/**
 * Extracts world origin coordinates from a Ken pose object.
 *
 * @param {any} kenPose
 * @returns {{ x: number, y: number, z: number }}
 */
function getKenWorldPosition(kenPose) {
    if (!kenPose) {
        return { x: 0.0, y: 0.0, z: 0.0 };
    }
    const mw = kenPose.matrixWorld;
    const el = mw?.elements || (Array.isArray(mw) ? mw : null);
    if (el && el.length >= 16) {
        return { x: el[12], y: el[13], z: el[14] };
    }
    const pos = kenPose.position || kenPose;
    return {
        x: pos.x ?? 0.0,
        y: pos.y ?? 0.0,
        z: pos.z ?? 0.0,
    };
}

/**
 * Computes the authoritative world-space seat point for a cup given the Ken pose.
 * Formula: cupWorldPos + cupWorldNormal * seatOffset.
 *
 * @param {string} cupKey - Identifier (e.g. 'big', 'small', 'base', 'spike', 'bigCup')
 * @param {any} kenPose - Object representing Ken pose (with matrixWorld or position/quaternion)
 * @returns {{ x: number, y: number, z: number }}
 */
export function computeCupWorldSeatPoint(cupKey, kenPose) {
    const config = getCupConfig(cupKey);
    if (!config) {
        return { x: 0.0, y: 0.0, z: 0.0 };
    }

    const localPos = config.localPos || config.position || { x: 0.0, y: 0.0, z: 0.0 };
    const localNormal = config.localNormal || config.normal || { x: 0.0, y: 1.0, z: 0.0 };
    const seatOffset = config.seatOffset ?? 0.0;

    // Seated ball center in Ken local space
    const localSeat = {
        x: localPos.x + localNormal.x * seatOffset,
        y: localPos.y + localNormal.y * seatOffset,
        z: localPos.z + localNormal.z * seatOffset,
    };

    const mw = kenPose?.matrixWorld;
    const el = mw?.elements || (Array.isArray(mw) ? mw : null);
    if (el && el.length >= 16) {
        return transformPointByMatrix(localSeat, el);
    }

    const quat = kenPose?.quaternion;
    const rotated = quat ? rotateVectorByQuat(localSeat, quat) : localSeat;
    const kenPos = getKenWorldPosition(kenPose);

    return {
        x: rotated.x + kenPos.x,
        y: rotated.y + kenPos.y,
        z: rotated.z + kenPos.z,
    };
}

/**
 * Manages the high-level catch flow states ('seated', 'air', 'catching'),
 * smooth ball seating interpolation, and miss boundary detection.
 */
export class CatchFlow {
    /**
     * @param {Object} [options={}]
     * @param {string} [options.initialCup=CUP_IDS.SPIKE] - Cup on which the ball is initially seated
     * @param {any} [options.kenPose=null] - Initial Ken pose for computing initial ball position
     */
    constructor(options = {}) {
        const { initialCup = CUP_IDS.SPIKE, kenPose = null } = options;

        this._state = 'seated'; // 'seated' | 'air' | 'catching'
        this._seatCupKey = initialCup;
        this._previousSeatCupKey = initialCup;
        this._targetCupKey = null;

        this._catchDuration = CATCH_LERP_DURATION;
        this._catchElapsed = 0.0;
        this._catchStartPos = { x: 0.0, y: 0.0, z: 0.0 };

        this._missReportedForFlight = false;

        const initialSeat = computeCupWorldSeatPoint(this._seatCupKey, kenPose);
        this._ballPosition = { ...initialSeat };
    }

    /**
     * Current catch flow state ('seated' | 'air' | 'catching').
     * @returns {'seated' | 'air' | 'catching'}
     */
    get state() {
        return this._state;
    }

    /**
     * Active or previously seated cup identifier.
     * @returns {string}
     */
    get seatCupKey() {
        return this._seatCupKey;
    }

    /**
     * Defensive copy of current ball position in world space.
     * @returns {{ x: number, y: number, z: number }}
     */
    get ballPosition() {
        return { ...this._ballPosition };
    }

    /**
     * Launches the ball into flight.
     * Transitions from 'seated' to 'air'. Ignored if not seated.
     */
    onLaunch() {
        if (this._state !== 'seated') {
            return;
        }
        this._state = 'air';
        this._previousSeatCupKey = this._seatCupKey;
        this._missReportedForFlight = false;
    }

    /**
     * Begins the smooth snapping/catching animation into a cup.
     * Transitions from 'air' to 'catching'. Ignored if not in air.
     *
     * @param {string} cupKey - The cup that confirmed the catch
     * @param {{ x: number, y: number, z: number }} [ballPos] - Ball position at confirmation
     */
    onCatchConfirmed(cupKey, ballPos) {
        if (this._state !== 'air') {
            return;
        }
        this._state = 'catching';
        this._targetCupKey = cupKey;
        this._catchStartPos = ballPos && Number.isFinite(ballPos.x)
            ? { x: ballPos.x, y: ballPos.y, z: ballPos.z }
            : { ...this._ballPosition };
        this._catchElapsed = 0.0;
    }

    /**
     * Updates the catch flow simulation state.
     *
     * @param {number} dt - Frame delta time in seconds
     * @param {any} kenPose - Ken pose object (position and orientation)
     * @param {any} [ballPositionOrState] - Ball position or trajectory state
     * @param {{ x?: number, y?: number, z?: number }} [ballVelocity] - Ball velocity vector
     * @returns {null | { type: 'SEATED', cupKey: string } | { type: 'MISS' }}
     */
    update(dt, kenPose, ballPositionOrState = null, ballVelocity = null) {
        const kenPos = getKenWorldPosition(kenPose);

        // Resolve external ball position and velocity if provided
        let extPos = null;
        let extVel = null;

        if (ballPositionOrState) {
            if (ballPositionOrState.position && ballPositionOrState.velocity) {
                extPos = ballPositionOrState.position;
                extVel = ballPositionOrState.velocity;
            } else if (Number.isFinite(ballPositionOrState.x)) {
                extPos = ballPositionOrState;
                if (ballVelocity && Number.isFinite(ballVelocity.x)) {
                    extVel = ballVelocity;
                }
            }
        }

        if (this._state === 'seated') {
            const seatPoint = computeCupWorldSeatPoint(this._seatCupKey, kenPose);
            this._ballPosition = { ...seatPoint };
            return null;
        }

        if (this._state === 'air') {
            if (extPos) {
                this._ballPosition.x = extPos.x;
                this._ballPosition.y = extPos.y;
                this._ballPosition.z = extPos.z;
            }

            // Miss detection:
            // In 'air', when ball is descending (vy < 0) and ball.y < ken.y - MISS_DEPTH
            const vy = extVel?.y ?? 0.0;
            const isDescending = vy < 0.0;
            const isBelowMissDepth = this._ballPosition.y < (kenPos.y - MISS_DEPTH);

            if (!this._missReportedForFlight && isDescending && isBelowMissDepth) {
                this._missReportedForFlight = true;
                this._state = 'seated';
                this._seatCupKey = this._previousSeatCupKey;
                const seatPoint = computeCupWorldSeatPoint(this._seatCupKey, kenPose);
                this._ballPosition = { ...seatPoint };
                return { type: 'MISS' };
            }

            return null;
        }

        if (this._state === 'catching') {
            this._catchElapsed += dt;
            const currentSeat = computeCupWorldSeatPoint(this._targetCupKey, kenPose);

            if (this._catchElapsed >= this._catchDuration) {
                // Snap to current seat point and transition to seated
                this._ballPosition = { ...currentSeat };
                this._state = 'seated';
                this._seatCupKey = this._targetCupKey;
                const completedCup = this._seatCupKey;
                this._targetCupKey = null;
                return { type: 'SEATED', cupKey: completedCup };
            }

            // S-curve or linear interpolation towards current moving seat point
            const progress = Math.min(1.0, Math.max(0.0, this._catchElapsed / this._catchDuration));
            this._ballPosition.x = this._catchStartPos.x + (currentSeat.x - this._catchStartPos.x) * progress;
            this._ballPosition.y = this._catchStartPos.y + (currentSeat.y - this._catchStartPos.y) * progress;
            this._ballPosition.z = this._catchStartPos.z + (currentSeat.z - this._catchStartPos.z) * progress;
            return null;
        }

        return null;
    }
}

export default CatchFlow;
