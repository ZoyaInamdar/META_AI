/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - KendamaInputAndDetector (Catch Detection Engine)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Responsible for:
 * 1. Tracking Ken handle velocity from position deltas across frames.
 * 2. Transforming Kendama cup-local positions and normals into world space
 *    using the canonical `gameplayKenGroup` provided by Person B.
 * 3. Evaluating candidate catches for the four scoring targets (Big Cup,
 *    Small Cup, Base Cup, Spike) against physical ball trajectory.
 * 4. Multi-stage catch validation:
 *    - Position within clean or assisted catch radius.
 *    - Relative velocity speed threshold.
 *    - Approach direction into cup opening (dot product < -0.2).
 *    - Cup orientation against world up (30°, 25°, 35°, 18°).
 *    - 2-consecutive-frame temporal hysteresis confirmation.
 *
 * Architectural Restrictions:
 * - Pure JavaScript ES module.
 * - Zero external dependencies (No Three.js, No IWSDK, No DOM).
 * - Avoids unnecessary per-frame heap allocations.
 * - Works with real Three.js Object3D groups in VR and lightweight mock
 *   objects in Node.js unit tests.
 */

import { BALL_RADIUS, CUP_IDS, getCupConfig } from './cupConfigs.js';

/**
 * Re-export BALL_RADIUS for consumers of this detector.
 */
export { BALL_RADIUS };

/**
 * Standard catch radii thresholds for each target [meters].
 */
export const CATCH_RADII = Object.freeze({
    [CUP_IDS.BIG_CUP]: Object.freeze({ clean: 0.035, assisted: 0.075 }),
    [CUP_IDS.SMALL_CUP]: Object.freeze({ clean: 0.030, assisted: 0.065 }),
    [CUP_IDS.BASE_CUP]: Object.freeze({ clean: 0.040, assisted: 0.080 }),
    [CUP_IDS.SPIKE]: Object.freeze({ clean: 0.020, assisted: 0.045 }),
});

/**
 * Maximum acceptable misalignment angle with world up (0, 1, 0) in degrees.
 *
 * Note: Base Cup requires the Ken to be held in an inverted orientation
 * so the bottom cup faces upward.
 */
export const ORIENTATION_THRESHOLDS = Object.freeze({
    [CUP_IDS.BIG_CUP]: Object.freeze({
        maxAngleDeg: 30.0,
        maxAngleRad: 30.0 * (Math.PI / 180),
        minCos: Math.cos(30.0 * (Math.PI / 180)),
    }),
    [CUP_IDS.SMALL_CUP]: Object.freeze({
        maxAngleDeg: 25.0,
        maxAngleRad: 25.0 * (Math.PI / 180),
        minCos: Math.cos(25.0 * (Math.PI / 180)),
    }),
    [CUP_IDS.BASE_CUP]: Object.freeze({
        maxAngleDeg: 35.0,
        maxAngleRad: 35.0 * (Math.PI / 180),
        minCos: Math.cos(35.0 * (Math.PI / 180)),
    }),
    [CUP_IDS.SPIKE]: Object.freeze({
        maxAngleDeg: 18.0,
        maxAngleRad: 18.0 * (Math.PI / 180),
        minCos: Math.cos(18.0 * (Math.PI / 180)),
    }),
});

/**
 * Maximum allowed dot product between relative velocity and cup world normal.
 * Negative value ensures ball is approaching INTO the cup opening.
 */
export const APPROACH_DIRECTION_MAX_DOT = -0.2;

/**
 * Required consecutive valid evaluation frames before a catch is confirmed.
 */
export const REQUIRED_CONFIRMATION_FRAMES = 2;

/**
 * UNRESOLVED CONFIGURATION VALUE:
 * Maximum relative speed threshold (m/s) between ball and Ken.
 * No agreed value exists in the starter project. Configurable via constructor options.
 * A sensible default of 2.5 m/s is provided as a fallback.
 */
export const UNRESOLVED_DEFAULT_MAX_RELATIVE_SPEED = 2.5;

/**
 * Rotates a 3D vector by a quaternion (qx, qy, qz, qw) using Rodrigues formula.
 * Pure math implementation to avoid Three.js dependency.
 *
 * @param {{ x: number, y: number, z: number }} v
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @param {{ x: number, y: number, z: number }} out
 * @returns {{ x: number, y: number, z: number }}
 */
function rotateVectorByQuat(v, q, out) {
    const qx = q?.x ?? 0.0;
    const qy = q?.y ?? 0.0;
    const qz = q?.z ?? 0.0;
    const qw = q?.w ?? 1.0;

    const vx = v.x;
    const vy = v.y;
    const vz = v.z;

    // t = 2 * cross(q.xyz, v)
    const tx = 2.0 * (qy * vz - qz * vy);
    const ty = 2.0 * (qz * vx - qx * vz);
    const tz = 2.0 * (qx * vy - qy * vx);

    // v' = v + qw * t + cross(q.xyz, t)
    out.x = vx + qw * tx + (qy * tz - qz * ty);
    out.y = vy + qw * ty + (qz * tx - qx * tz);
    out.z = vz + qw * tz + (qx * ty - qy * tx);

    return out;
}

/**
 * Validates that an object is a finite 3D vector across all 3 coordinates.
 *
 * @param {any} v
 * @returns {boolean}
 */
function isValidVec3(v) {
    return v !== null &&
        typeof v === 'object' &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.z);
}

/**
 * Extracts world origin position of the Ken group.
 * Uses matrixWorld translation elements [12, 13, 14] if available to remain
 * consistent with transformPointToWorld, falling back to .position.
 *
 * NOTE: The integration layer must update the canonical Ken group's world matrix
 * (e.g. gameplayKenGroup.updateMatrixWorld()) before calling the detector.
 *
 * @param {any} kenGroup
 * @param {{ x: number, y: number, z: number }} out
 * @returns {{ x: number, y: number, z: number }}
 */
function getKenWorldPosition(kenGroup, out) {
    const mw = kenGroup?.matrixWorld;
    const elements = mw?.elements || (Array.isArray(mw) ? mw : null);

    if (elements && elements.length >= 16) {
        out.x = elements[12];
        out.y = elements[13];
        out.z = elements[14];
        return out;
    }

    const pos = kenGroup?.position;
    out.x = Number.isFinite(pos?.x) ? pos.x : 0.0;
    out.y = Number.isFinite(pos?.y) ? pos.y : 0.0;
    out.z = Number.isFinite(pos?.z) ? pos.z : 0.0;
    return out;
}

/**
 * Transforms a local point into world space using matrixWorld or position/quaternion.
 *
 * NOTE: The integration layer must update the canonical Ken group's world matrix
 * before calling the detector so that matrixWorld is synchronized.
 *
 * @param {{ x: number, y: number, z: number }} localPoint
 * @param {any} kenGroup
 * @param {{ x: number, y: number, z: number }} out
 * @returns {{ x: number, y: number, z: number }}
 */
function transformPointToWorld(localPoint, kenGroup, out) {
    const mw = kenGroup?.matrixWorld;
    const elements = mw?.elements || (Array.isArray(mw) ? mw : null);

    if (elements && elements.length >= 16) {
        // Standard column-major 4x4 matrix multiplication
        const x = localPoint.x;
        const y = localPoint.y;
        const z = localPoint.z;

        out.x = elements[0] * x + elements[4] * y + elements[8] * z + elements[12];
        out.y = elements[1] * x + elements[5] * y + elements[9] * z + elements[13];
        out.z = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
        return out;
    }

    // Fallback using position and quaternion
    const pos = kenGroup?.position || { x: 0, y: 0, z: 0 };
    const quat = kenGroup?.quaternion || { x: 0, y: 0, z: 0, w: 1 };

    rotateVectorByQuat(localPoint, quat, out);
    out.x += pos.x ?? 0.0;
    out.y += pos.y ?? 0.0;
    out.z += pos.z ?? 0.0;

    return out;
}

/**
 * Transforms a local direction vector (normal) into world space.
 *
 * NOTE: This direction transformation assumes uniform scaling (or no scaling)
 * on the Ken group. It does not compute the inverse-transpose normal matrix
 * required for non-uniform scaling.
 *
 * @param {{ x: number, y: number, z: number }} localNormal
 * @param {any} kenGroup
 * @param {{ x: number, y: number, z: number }} out
 * @returns {{ x: number, y: number, z: number }} Normalized world vector
 */
function transformNormalToWorld(localNormal, kenGroup, out) {
    const mw = kenGroup?.matrixWorld;
    const elements = mw?.elements || (Array.isArray(mw) ? mw : null);

    if (elements && elements.length >= 16) {
        const x = localNormal.x;
        const y = localNormal.y;
        const z = localNormal.z;

        out.x = elements[0] * x + elements[4] * y + elements[8] * z;
        out.y = elements[1] * x + elements[5] * y + elements[9] * z;
        out.z = elements[2] * x + elements[6] * y + elements[10] * z;
    } else {
        const quat = kenGroup?.quaternion || { x: 0, y: 0, z: 0, w: 1 };
        rotateVectorByQuat(localNormal, quat, out);
    }

    const len = Math.hypot(out.x, out.y, out.z) || 1.0;
    out.x /= len;
    out.y /= len;
    out.z /= len;

    return out;
}

/**
 * Catch detector engine for Celestial Kendama.
 */
export class KendamaInputAndDetector {
    /**
     * @param {Object} [gameplayKenGroup=null] - Canonical Ken Object3D provided by Person B
     * @param {Object} [options={}]
     * @param {number|null} [options.maxRelativeSpeed=UNRESOLVED_DEFAULT_MAX_RELATIVE_SPEED] - Speed threshold
     * @param {typeof CATCH_RADII} [options.catchRadii=CATCH_RADII]
     * @param {typeof ORIENTATION_THRESHOLDS} [options.orientationThresholds=ORIENTATION_THRESHOLDS]
     */
    constructor(gameplayKenGroup = null, options = {}) {
        this.gameplayKenGroup = gameplayKenGroup;

        // Configuration
        this.maxRelativeSpeed = options.maxRelativeSpeed !== undefined
            ? options.maxRelativeSpeed
            : UNRESOLVED_DEFAULT_MAX_RELATIVE_SPEED;

        this.catchRadii = options.catchRadii || CATCH_RADII;
        this.orientationThresholds = options.orientationThresholds || ORIENTATION_THRESHOLDS;

        // Ken velocity tracking state
        this._hasPrevKenPos = false;
        this._prevKenPos = { x: 0.0, y: 0.0, z: 0.0 };
        this._kenVelocity = { x: 0.0, y: 0.0, z: 0.0 };
        this._lastFrameTime = null;

        // Catch confirmation hysteresis state
        this._confirmationCount = 0;
        this._candidateCup = null;
        this._catchConfirmedFired = false;
        this._lastConfirmationTime = null;

        // Pre-allocated reusable objects for zero-allocation updates
        this._tempKenWorldPos = { x: 0.0, y: 0.0, z: 0.0 };
        this._tempCupWorldPos = { x: 0.0, y: 0.0, z: 0.0 };
        this._tempCupWorldNormal = { x: 0.0, y: 0.0, z: 0.0 };
        this._tempRelativeVel = { x: 0.0, y: 0.0, z: 0.0 };
        this._tempKenVelocityOut = { x: 0.0, y: 0.0, z: 0.0 };
    }

    /**
     * Updates the canonical Ken scene group reference.
     *
     * @param {Object} group
     */
    setKenGroup(group) {
        this.gameplayKenGroup = group;
        this._hasPrevKenPos = false;
        this._lastFrameTime = null;
        this._lastConfirmationTime = null;
    }

    /**
     * Resets velocity tracking and catch confirmation history.
     */
    reset() {
        this._hasPrevKenPos = false;
        this._prevKenPos.x = 0.0;
        this._prevKenPos.y = 0.0;
        this._prevKenPos.z = 0.0;
        this._kenVelocity.x = 0.0;
        this._kenVelocity.y = 0.0;
        this._kenVelocity.z = 0.0;
        this._lastFrameTime = null;
        this._confirmationCount = 0;
        this._candidateCup = null;
        this._catchConfirmedFired = false;
        this._lastConfirmationTime = null;
    }

    /**
     * Updates Ken velocity based on movement across dt seconds.
     * Safe against invalid dt, first-frame calls, and multiple calls per frame.
     *
     * @param {number} dt - Time delta in seconds
     * @param {number} [now] - Current timestamp in seconds (optional, enables frame deduplication)
     */
    updateKenVelocity(dt, now) {
        if (!this.gameplayKenGroup) {
            return;
        }

        // Same-frame deduplication and chronological progression guard:
        // Stale (now < _lastFrameTime) or repeated (now === _lastFrameTime) timestamps are ignored.
        if (Number.isFinite(now)) {
            if (this._lastFrameTime !== null && now <= this._lastFrameTime) {
                return;
            }
            this._lastFrameTime = now;
        }

        getKenWorldPosition(this.gameplayKenGroup, this._tempKenWorldPos);
        const px = this._tempKenWorldPos.x;
        const py = this._tempKenWorldPos.y;
        const pz = this._tempKenWorldPos.z;

        // First frame: initialize previous position, velocity remains zero
        if (!this._hasPrevKenPos) {
            this._hasPrevKenPos = true;
            this._prevKenPos.x = px;
            this._prevKenPos.y = py;
            this._prevKenPos.z = pz;
            this._kenVelocity.x = 0.0;
            this._kenVelocity.y = 0.0;
            this._kenVelocity.z = 0.0;
            return;
        }

        // Invalid, zero, or negative dt: snap prevKenPos to current position to prevent
        // accumulated delta from producing a false velocity spike on the next valid update.
        if (!Number.isFinite(dt) || dt <= 0.0) {
            this._prevKenPos.x = px;
            this._prevKenPos.y = py;
            this._prevKenPos.z = pz;
            this._kenVelocity.x = 0.0;
            this._kenVelocity.y = 0.0;
            this._kenVelocity.z = 0.0;
            return;
        }

        // Large elapsed time guard (tab blur or pause)
        if (dt > 1.0) {
            this._prevKenPos.x = px;
            this._prevKenPos.y = py;
            this._prevKenPos.z = pz;
            this._kenVelocity.x = 0.0;
            this._kenVelocity.y = 0.0;
            this._kenVelocity.z = 0.0;
            return;
        }

        // Velocity = delta position / dt
        this._kenVelocity.x = (px - this._prevKenPos.x) / dt;
        this._kenVelocity.y = (py - this._prevKenPos.y) / dt;
        this._kenVelocity.z = (pz - this._prevKenPos.z) / dt;

        this._prevKenPos.x = px;
        this._prevKenPos.y = py;
        this._prevKenPos.z = pz;
    }

    /**
     * Returns the current Ken velocity vector [m/s].
     *
     * @param {{ x: number, y: number, z: number }} [out] - Optional destination object
     * @returns {{ x: number, y: number, z: number }}
     */
    getKenVelocity(out) {
        const target = out || this._tempKenVelocityOut;
        target.x = this._kenVelocity.x;
        target.y = this._kenVelocity.y;
        target.z = this._kenVelocity.z;
        return target;
    }

    /**
     * Evaluates a ball against a specified cup target.
     *
     * @param {{ x: number, y: number, z: number }} ballPos - Ball position in world space
     * @param {{ x: number, y: number, z: number }} ballVel - Ball velocity in world space
     * @param {string} cupKey - Identifier from CUP_IDS (e.g. 'bigCup', 'spike')
     * @param {number} [now] - Current timestamp in seconds (optional). Providing `now` enables
     *   same-frame deduplication for Ken velocity and catch confirmation. When omitted, if a frame
     *   timestamp was previously recorded via `updateKenVelocity(dt, now)`, that timestamp is reused
     *   to avoid duplicate velocity calculation and duplicate confirmation within the same frame.
     *   If neither `now` nor a recorded timestamp exists (fallback mode), each call is treated as
     *   a discrete frame step.
     * @param {number} [dt] - Frame delta time in seconds (optional)
     * @returns {{
     *   confirmed: boolean,
     *   valid: boolean,
     *   cupKey: string,
     *   catchType: 'clean' | 'assisted' | null,
     *   confirmationCount: number,
     *   reason: string | null,
     *   details: {
     *     distance: number,
     *     surfaceDistance: number,
     *     cleanRadius: number,
     *     assistedRadius: number,
     *     relativeSpeed: number,
     *     approachDot: number,
     *     orientationAngleDeg: number,
     *     cupWorldPosition: { x: number, y: number, z: number },
     *     cupWorldNormal: { x: number, y: number, z: number },
     *     kenVelocity: { x: number, y: number, z: number },
     *   }
     * }}
     */
    evaluateCatch(ballPos, ballVel, cupKey, now, dt) {
        // Effective timestamp: use explicitly passed `now` or reuse previously recorded frame timestamp.
        const effectiveNow = Number.isFinite(now) ? now : this._lastFrameTime;

        // Determine if evaluation timestamp is stale relative to existing frame or confirmation timestamps.
        const isStale = Number.isFinite(now) && (
            (this._lastFrameTime !== null && now < this._lastFrameTime) ||
            (this._lastConfirmationTime !== null && now < this._lastConfirmationTime)
        );

        // Automatic dt derivation and Ken velocity update with frame deduplication.
        // If a timestamped update has already happened for this frame (effectiveNow === this._lastFrameTime)
        // or a stale timestamp is received (effectiveNow < this._lastFrameTime), recalculation is skipped.
        // Only strictly newer timestamps advance Ken velocity tracking.
        if (Number.isFinite(effectiveNow)) {
            if (this._lastFrameTime === null || effectiveNow > this._lastFrameTime) {
                const effectiveDt = Number.isFinite(dt) && dt > 0.0
                    ? dt
                    : (this._lastFrameTime !== null && effectiveNow > this._lastFrameTime ? effectiveNow - this._lastFrameTime : 0.0);
                this.updateKenVelocity(effectiveDt, effectiveNow);
            }
        } else if (Number.isFinite(dt) && dt > 0.0) {
            // Fallback mode when neither `now` nor a recorded timestamp exists
            this.updateKenVelocity(dt);
        }

        // Validate basic inputs across all 6 coordinates (ballPos.x, y, z and ballVel.x, y, z)
        if (!isValidVec3(ballPos) || !isValidVec3(ballVel)) {
            return this._fail(cupKey, 'invalid_input', {}, isStale);
        }

        if (!this.gameplayKenGroup) {
            return this._fail(cupKey, 'missing_ken_group', {}, isStale);
        }

        const cupConfig = getCupConfig(cupKey);
        if (!cupConfig) {
            return this._fail(cupKey, 'unknown_cup', {}, isStale);
        }

        const radii = this.catchRadii[cupKey];
        if (!radii) {
            return this._fail(cupKey, 'unknown_cup_radii', {}, isStale);
        }

        const orientationThresh = this.orientationThresholds[cupKey];

        // 1. Transform cup local position and normal to world space
        transformPointToWorld(cupConfig.position, this.gameplayKenGroup, this._tempCupWorldPos);
        transformNormalToWorld(cupConfig.normal, this.gameplayKenGroup, this._tempCupWorldNormal);

        const cupWorldPos = this._tempCupWorldPos;
        const cupWorldNormal = this._tempCupWorldNormal;

        // --------------------------------------------------------------------
        // Check 1: Position (within clean or assisted catch radius)
        // --------------------------------------------------------------------
        // Catch acceptance uses centre-to-centre distance compared against the
        // existing clean and assisted catch radii.
        // BALL_RADIUS (0.03m) is used only to calculate surfaceDistance.
        // surfaceDistance is diagnostic information only in this module.
        // No snapping behaviour is implemented here.
        const dx = ballPos.x - cupWorldPos.x;
        const dy = ballPos.y - cupWorldPos.y;
        const dz = ballPos.z - cupWorldPos.z;
        const distance = Math.hypot(dx, dy, dz);
        const surfaceDistance = Math.max(0.0, distance - BALL_RADIUS);

        let catchType = null;
        if (distance <= radii.clean) {
            catchType = 'clean';
        } else if (distance <= radii.assisted) {
            catchType = 'assisted';
        } else {
            return this._fail(cupKey, 'out_of_range', {
                distance,
                surfaceDistance,
                cleanRadius: radii.clean,
                assistedRadius: radii.assisted,
                cupWorldPosition: { ...cupWorldPos },
                cupWorldNormal: { ...cupWorldNormal },
            }, isStale);
        }

        // --------------------------------------------------------------------
        // Check 2: Relative Velocity (ballVel - kenVel)
        // --------------------------------------------------------------------
        const vRelX = ballVel.x - this._kenVelocity.x;
        const vRelY = ballVel.y - this._kenVelocity.y;
        const vRelZ = ballVel.z - this._kenVelocity.z;
        const relativeSpeed = Math.hypot(vRelX, vRelY, vRelZ);

        if (this.maxRelativeSpeed !== null && Number.isFinite(this.maxRelativeSpeed)) {
            if (relativeSpeed > this.maxRelativeSpeed) {
                return this._fail(cupKey, 'relative_speed_exceeded', {
                    distance,
                    surfaceDistance,
                    cleanRadius: radii.clean,
                    assistedRadius: radii.assisted,
                    relativeSpeed,
                    cupWorldPosition: { ...cupWorldPos },
                    cupWorldNormal: { ...cupWorldNormal },
                }, isStale);
            }
        }

        // --------------------------------------------------------------------
        // Check 3: Approach Direction (dot product < -0.2)
        // --------------------------------------------------------------------
        const approachDot = vRelX * cupWorldNormal.x + vRelY * cupWorldNormal.y + vRelZ * cupWorldNormal.z;

        if (approachDot >= APPROACH_DIRECTION_MAX_DOT) {
            return this._fail(cupKey, 'approach_direction_invalid', {
                distance,
                surfaceDistance,
                cleanRadius: radii.clean,
                assistedRadius: radii.assisted,
                relativeSpeed,
                approachDot,
                cupWorldPosition: { ...cupWorldPos },
                cupWorldNormal: { ...cupWorldNormal },
            }, isStale);
        }

        // --------------------------------------------------------------------
        // Check 4: Cup Orientation against World Up (0, 1, 0)
        // --------------------------------------------------------------------
        // World up dot product is simply normal.y
        const dotUp = cupWorldNormal.y;
        const orientationAngleRad = Math.acos(Math.max(-1.0, Math.min(1.0, dotUp)));
        const orientationAngleDeg = orientationAngleRad * (180.0 / Math.PI);

        if (orientationThresh) {
            if (orientationAngleDeg > orientationThresh.maxAngleDeg) {
                return this._fail(cupKey, 'cup_orientation_invalid', {
                    distance,
                    surfaceDistance,
                    cleanRadius: radii.clean,
                    assistedRadius: radii.assisted,
                    relativeSpeed,
                    approachDot,
                    orientationAngleDeg,
                    cupWorldPosition: { ...cupWorldPos },
                    cupWorldNormal: { ...cupWorldNormal },
                }, isStale);
            }
        }

        // --------------------------------------------------------------------
        // Check 5 & 6: Consecutive-frame confirmation hysteresis (One-Shot Trigger)
        // --------------------------------------------------------------------
        // Frame-deduplication and stale timestamp rejection for confirmation:
        // A stale evaluation relative to _lastFrameTime or _lastConfirmationTime must NOT modify
        // any catch-confirmation state: it must not start a new candidate, increment or reset
        // the count, or trigger confirmation.
        const hasTimestamp = Number.isFinite(effectiveNow);
        let isStrictlyNewer = false;

        if (!isStale) {
            if (this._candidateCup !== cupKey) {
                this._candidateCup = cupKey;
                this._confirmationCount = 1;
                this._catchConfirmedFired = false;
                this._lastConfirmationTime = hasTimestamp ? effectiveNow : null;
                isStrictlyNewer = true;
            } else {
                isStrictlyNewer = !hasTimestamp ||
                    this._lastConfirmationTime === null ||
                    effectiveNow > this._lastConfirmationTime;

                if (isStrictlyNewer) {
                    this._confirmationCount++;
                    this._lastConfirmationTime = hasTimestamp ? effectiveNow : null;
                }
            }
        }

        // One-shot edge trigger: fires `confirmed: true` only on the initial transition
        // to REQUIRED_CONFIRMATION_FRAMES. Subsequent valid frames in the same catch hold
        // return confirmed: false (with valid: true) to prevent multi-scoring per catch.
        // Stale or repeated timestamps can never trigger confirmation.
        let confirmed = false;
        if (!isStale && this._confirmationCount >= REQUIRED_CONFIRMATION_FRAMES) {
            if (!this._catchConfirmedFired && isStrictlyNewer) {
                confirmed = true;
                this._catchConfirmedFired = true;
            }
        }

        return {
            confirmed,
            valid: true,
            cupKey,
            catchType,
            confirmationCount: this._confirmationCount,
            reason: null,
            details: {
                distance,
                surfaceDistance,
                cleanRadius: radii.clean,
                assistedRadius: radii.assisted,
                relativeSpeed,
                approachDot,
                orientationAngleDeg,
                cupWorldPosition: { x: cupWorldPos.x, y: cupWorldPos.y, z: cupWorldPos.z },
                cupWorldNormal: { x: cupWorldNormal.x, y: cupWorldNormal.y, z: cupWorldNormal.z },
                kenVelocity: { x: this._kenVelocity.x, y: this._kenVelocity.y, z: this._kenVelocity.z },
            },
        };
    }

    /**
     * Internal failure handler: resets confirmation count and returns failure payload.
     * Stale evaluations must not reset or modify active catch-confirmation state.
     *
     * @private
     */
    _fail(cupKey, reason, details = {}, isStale = false) {
        if (!isStale) {
            this._confirmationCount = 0;
            this._candidateCup = null;
            this._catchConfirmedFired = false;
            this._lastConfirmationTime = null;
        }

        return {
            confirmed: false,
            valid: false,
            cupKey,
            catchType: null,
            confirmationCount: this._confirmationCount,
            reason,
            details: {
                distance: details.distance ?? Infinity,
                surfaceDistance: details.surfaceDistance ?? Infinity,
                cleanRadius: details.cleanRadius ?? 0.0,
                assistedRadius: details.assistedRadius ?? 0.0,
                relativeSpeed: details.relativeSpeed ?? 0.0,
                approachDot: details.approachDot ?? 0.0,
                orientationAngleDeg: details.orientationAngleDeg ?? 180.0,
                cupWorldPosition: details.cupWorldPosition || { x: 0, y: 0, z: 0 },
                cupWorldNormal: details.cupWorldNormal || { x: 0, y: 0, z: 0 },
                kenVelocity: { x: this._kenVelocity.x, y: this._kenVelocity.y, z: this._kenVelocity.z },
            },
        };
    }

    /**
     * Current consecutive confirmation count for active candidate cup.
     * @returns {number}
     */
    get confirmationCount() {
        return this._confirmationCount;
    }

    /**
     * Active candidate cup undergoing confirmation.
     * @returns {string|null}
     */
    get candidateCup() {
        return this._candidateCup;
    }

    /**
     * Helper to retrieve transformed world position and normal for any cup.
     *
     * @param {string} cupKey
     * @param {{ x: number, y: number, z: number }} [outPos]
     * @param {{ x: number, y: number, z: number }} [outNormal]
     * @returns {{ position: { x: number, y: number, z: number }, normal: { x: number, y: number, z: number } }|null}
     */
    getWorldCupTransform(cupKey, outPos, outNormal) {
        if (!this.gameplayKenGroup) {
            return null;
        }

        const cupConfig = getCupConfig(cupKey);
        if (!cupConfig) {
            return null;
        }

        const targetPos = outPos || { x: 0, y: 0, z: 0 };
        const targetNormal = outNormal || { x: 0, y: 0, z: 0 };

        transformPointToWorld(cupConfig.position, this.gameplayKenGroup, targetPos);
        transformNormalToWorld(cupConfig.normal, this.gameplayKenGroup, targetNormal);

        return { position: targetPos, normal: targetNormal };
    }
}

export default KendamaInputAndDetector;
