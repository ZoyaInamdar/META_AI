/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - HandPoseAdapter (Thin XR Hand/Wrist Tracking Adapter)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * A pure-logic, zero-dependency adapter that bridges WebXR / IWSDK hand tracking
 * joint data into the canonical Kendama pose format consumed by Person A's catch
 * detector (KendamaInputAndDetector) and catch flow (CatchFlow).
 *
 * Architectural & Separation of Concerns Notes:
 * - PURE LOGIC: Contains NO Three.js or IWSDK runtime imports so it can be tested
 *   deterministically in unit test runners (e.g., Vitest).
 * - NO MUTATION: Never modifies input joint objects passed to update().
 * - NO SMOOTHING: Smoothing and jitter elimination are handled downstream by
 *   PoseFilter (adaptive One Euro filter in src/input/PoseFilter.js).
 * - NO 2x ROLL: Roll scaling or auto-alignment belongs to FakeInput / gameplay
 *   helpers, not the raw hardware tracking adapter.
 * - NO BOUNDING BOX: Reach boundaries (e.g. REACH_BOUNDS) are enforced by
 *   FakeInput / game boundary rules, not raw physical tracking.
 */

/**
 * Default neutral Ken position in front of player (meters), matching FakeInput.
 */
export const DEFAULT_KEN_POSITION = Object.freeze({
    x: 0.0,
    y: 1.25,
    z: -0.45,
});

/**
 * Default neutral orientation (identity quaternion).
 */
export const DEFAULT_KEN_QUATERNION = Object.freeze({
    x: 0.0,
    y: 0.0,
    z: 0.0,
    w: 1.0,
});

/**
 * Converts a unit quaternion to Euler angles in XYZ order (radians).
 * Pure math implementation to eliminate Three.js dependency.
 *
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @returns {{ x: number, y: number, z: number }}
 */
function quatToEulerXYZ(q) {
    const x = q.x ?? 0.0;
    const y = q.y ?? 0.0;
    const z = q.z ?? 0.0;
    const w = q.w ?? 1.0;

    // Pitch (X-axis rotation)
    const sinr_cosp = 2.0 * (w * x + y * z);
    const cosr_cosp = 1.0 - 2.0 * (x * x + y * y);
    const ex = Math.atan2(sinr_cosp, cosr_cosp);

    // Yaw (Y-axis rotation)
    const sinp = 2.0 * (w * y - z * x);
    let ey = 0.0;
    if (Math.abs(sinp) >= 1.0) {
        ey = (Math.PI / 2.0) * Math.sign(sinp);
    } else {
        ey = Math.asin(sinp);
    }

    // Roll (Z-axis rotation)
    const siny_cosp = 2.0 * (w * z + x * y);
    const cosy_cosp = 1.0 - 2.0 * (y * y + z * z);
    const ez = Math.atan2(siny_cosp, cosy_cosp);

    return { x: ex, y: ey, z: ez };
}

/**
 * Normalizes a quaternion into a unit quaternion (length 1.0).
 * Safe against zero-length or undefined fields.
 *
 * @param {{ x?: number, y?: number, z?: number, w?: number }} q
 * @returns {{ x: number, y: number, z: number, w: number }}
 */
function normalizeQuaternion(q) {
    const x = Number.isFinite(q?.x) ? q.x : 0.0;
    const y = Number.isFinite(q?.y) ? q.y : 0.0;
    const z = Number.isFinite(q?.z) ? q.z : 0.0;
    const w = Number.isFinite(q?.w) ? q.w : 1.0;

    const len = Math.hypot(x, y, z, w);
    if (len > 0.0 && Number.isFinite(len)) {
        return {
            x: x / len,
            y: y / len,
            z: z / len,
            w: w / len,
        };
    }
    return { x: 0.0, y: 0.0, z: 0.0, w: 1.0 };
}

/**
 * Validates that an object contains finite x, y, z coordinates.
 *
 * @param {any} pos
 * @returns {boolean}
 */
function isFiniteVec3(pos) {
    return pos !== null &&
        typeof pos === 'object' &&
        Number.isFinite(pos.x) &&
        Number.isFinite(pos.y) &&
        Number.isFinite(pos.z);
}

/**
 * Thin tested adapter translating XR hand tracking joints into canonical Kendama poses.
 */
export class HandPoseAdapter {
    /**
     * @param {Object} [options={}]
     * @param {'left' | 'right'} [options.hand='right'] - Which hand to track
     * @param {'wrist' | 'palm'} [options.gripSource='wrist'] - Primary joint for position anchor
     * @param {number} [options.lostFrameLimit=6] - Number of frames before tracking confidence reaches 0
     */
    constructor(options = {}) {
        const {
            hand = 'right',
            gripSource = 'wrist',
            lostFrameLimit = 6,
        } = options;

        this._hand = hand;
        this._gripSource = gripSource;
        this._lostFrameLimit = Number.isFinite(lostFrameLimit) && lostFrameLimit > 0
            ? lostFrameLimit
            : 6;

        // Tracking lifecycle state
        this._hasEverTracked = false;
        this._wasTrackedLastFrame = false;
        this._lostFrames = 0;
        this._isTrackingValid = false;
        this._trackingConfidence = 0.0;

        // Retained valid pose coordinates
        this._lastValidPosition = { ...DEFAULT_KEN_POSITION };
        this._lastValidQuaternion = { ...DEFAULT_KEN_QUATERNION };

        // Velocity tracking state
        this._prevPosition = { ...DEFAULT_KEN_POSITION };
        this._linearVelocity = { x: 0.0, y: 0.0, z: 0.0 };
    }

    /**
     * Handedness of this adapter ('left' or 'right').
     * @returns {'left' | 'right'}
     */
    get hand() {
        return this._hand;
    }

    /**
     * Active grip position source ('wrist' or 'palm').
     * @returns {'wrist' | 'palm'}
     */
    get gripSource() {
        return this._gripSource;
    }

    /**
     * Number of lost frames before confidence hits zero.
     * @returns {number}
     */
    get lostFrameLimit() {
        return this._lostFrameLimit;
    }

    /**
     * Current count of consecutive frames where tracking was lost.
     * @returns {number}
     */
    get lostFrames() {
        return this._lostFrames;
    }

    /**
     * Whether tracking data in the most recent update was valid.
     * @returns {boolean}
     */
    get isTrackingValid() {
        return this._isTrackingValid;
    }

    /**
     * Confidence metric [0.0 .. 1.0] representing tracking validity.
     * @returns {number}
     */
    get trackingConfidence() {
        return this._trackingConfidence;
    }

    /**
     * Processes per-frame tracking joints and returns a Kendama pose object.
     *
     * @param {number} dt - Frame delta time in seconds
     * @param {{
     *   wrist?: { position: { x: number, y: number, z: number }, quaternion?: { x: number, y: number, z: number, w: number }, valid?: boolean },
     *   palm?: { position: { x: number, y: number, z: number }, quaternion?: { x: number, y: number, z: number, w: number }, valid?: boolean },
     *   middleBase?: { position: { x: number, y: number, z: number }, quaternion?: { x: number, y: number, z: number, w: number }, valid?: boolean }
     * } | null} joints - Joint tracking sample or null when untracked
     * @returns {{
     *   position: { x: number, y: number, z: number, set: Function },
     *   quaternion: { x: number, y: number, z: number, w: number, set: Function },
     *   rotation: { x: number, y: number, z: number, set: Function },
     *   linearVelocity: { x: number, y: number, z: number },
     *   isTrackingValid: boolean,
     *   trackingConfidence: number,
     *   lostFrames: number,
     *   x: number,
     *   y: number,
     *   z: number
     * }}
     */
    update(dt, joints) {
        // 1. Evaluate validity of input joints
        const isUntracked = !joints ||
            typeof joints !== 'object' ||
            !joints.wrist ||
            joints.wrist.valid === false ||
            !isFiniteVec3(joints.wrist.position);

        if (isUntracked) {
            // Tracking lost or not yet acquired:
            // - Keep the last valid pose (or safe default if never tracked)
            // - Increment lostFrames
            // - Set isTrackingValid = false
            // - Lower confidence towards 0 over lostFrames / lostFrameLimit
            // - Velocity is zero (no drift or NaN)
            this._lostFrames += 1;
            this._isTrackingValid = false;
            this._wasTrackedLastFrame = false;

            if (this._hasEverTracked) {
                const fractionLost = Math.min(1.0, this._lostFrames / this._lostFrameLimit);
                this._trackingConfidence = Math.max(0.0, 1.0 - fractionLost);
            } else {
                this._trackingConfidence = 0.0;
            }

            this._linearVelocity = { x: 0.0, y: 0.0, z: 0.0 };

            return this._buildPoseOutput(
                this._lastValidPosition,
                this._lastValidQuaternion,
                this._linearVelocity
            );
        }

        // 2. Resolve grip position based on gripSource
        // Grip source 'palm' uses palm position when present, otherwise falls back to wrist
        let resolvedPos = joints.wrist.position;
        if (this._gripSource === 'palm') {
            if (joints.palm && isFiniteVec3(joints.palm.position)) {
                resolvedPos = joints.palm.position;
            }
        }

        // Defensive copy of position: never mutate input objects
        const currentPos = {
            x: resolvedPos.x,
            y: resolvedPos.y,
            z: resolvedPos.z,
        };

        // 3. Resolve and normalize orientation quaternion
        const rawQuat = joints.wrist.quaternion || joints.palm?.quaternion || DEFAULT_KEN_QUATERNION;
        const currentQuat = normalizeQuaternion(rawQuat);

        // 4. Compute linear velocity
        // Zero on the first valid frame and zero after tracking returns to prevent velocity spikes
        if (!this._hasEverTracked || !this._wasTrackedLastFrame) {
            this._linearVelocity = { x: 0.0, y: 0.0, z: 0.0 };
        } else if (Number.isFinite(dt) && dt > 0.0) {
            this._linearVelocity = {
                x: (currentPos.x - this._prevPosition.x) / dt,
                y: (currentPos.y - this._prevPosition.y) / dt,
                z: (currentPos.z - this._prevPosition.z) / dt,
            };
        } else {
            this._linearVelocity = { x: 0.0, y: 0.0, z: 0.0 };
        }

        // 5. Update state
        this._prevPosition = { ...currentPos };
        this._lastValidPosition = { ...currentPos };
        this._lastValidQuaternion = { ...currentQuat };

        this._hasEverTracked = true;
        this._wasTrackedLastFrame = true;
        this._lostFrames = 0;
        this._isTrackingValid = true;
        this._trackingConfidence = 1.0;

        return this._buildPoseOutput(currentPos, currentQuat, this._linearVelocity);
    }

    /**
     * Constructs the canonical pose interface object matching FakeInput.
     *
     * @private
     * @param {{ x: number, y: number, z: number }} pos
     * @param {{ x: number, y: number, z: number, w: number }} quat
     * @param {{ x: number, y: number, z: number }} vel
     */
    _buildPoseOutput(pos, quat, vel) {
        const euler = quatToEulerXYZ(quat);

        return {
            position: {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                set(x, y, z) {
                    this.x = x;
                    this.y = y;
                    this.z = z;
                },
            },
            quaternion: {
                x: quat.x,
                y: quat.y,
                z: quat.z,
                w: quat.w,
                set(x, y, z, w) {
                    this.x = x;
                    this.y = y;
                    this.z = z;
                    this.w = w;
                },
            },
            rotation: {
                x: euler.x,
                y: euler.y,
                z: euler.z,
                set(x, y, z) {
                    this.x = x;
                    this.y = y;
                    this.z = z;
                },
            },
            linearVelocity: {
                x: vel.x,
                y: vel.y,
                z: vel.z,
            },
            isTrackingValid: this._isTrackingValid,
            trackingConfidence: this._trackingConfidence,
            lostFrames: this._lostFrames,
            x: pos.x,
            y: pos.y,
            z: pos.z,
        };
    }
}

export default HandPoseAdapter;