/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - FakeInput (Desktop Simulator Hand/Controller Emulation)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Simulates 6DoF hand/controller input using standard mouse and keyboard.
 *
 * Designed to provide a drop-in `gameplayKenGroup` interface that can later
 * be replaced with real Meta Quest VR hand tracking without altering any
 * gameplay, trajectory, or catch detection logic.
 *
 * Controls:
 * - Mouse X: Horizontal Ken position (clamped to [-0.25, 0.25] meters).
 * - Mouse Y: Vertical Ken position (clamped to reach range [0.95, 1.55] meters).
 * - Z axis:  Fixed at -0.45 meters (natural reach distance in front of player).
 * - Space:   Request ball launch (edge-triggered, single trigger per press).
 * - Q:       Roll wrist counter-clockwise.
 * - E:       Roll wrist clockwise.
 *
 * Reach Range Selection:
 * - Player head / eye level in IWSDK VR is 1.60m (iwsdk.config.json camera).
 * - Plinth / table surface height is 0.92m (studio.scene-asset.js).
 * - Natural kendama play in VR occurs between waist level (0.95m) and chest/eye
 *   level (1.55m), with a comfortable neutral default at 1.25m.
 *
 * Performance:
 * - In-place updates on pre-allocated position, rotation, and quaternion objects.
 * - Zero heap allocations during `update(dt)` cycles.
 */

/**
 * Reach and safety boundaries for the simulated Ken hand position [meters].
 */
export const REACH_BOUNDS = Object.freeze({
    xMin: -0.25,
    xMax: 0.25,
    yMin: 0.95,
    yMax: 1.55,
    zFixed: -0.45,
});

/**
 * Default neutral starting position for the Ken in front of the player [meters].
 */
export const DEFAULT_KEN_POSITION = Object.freeze({
    x: 0.0,
    y: 1.25,
    z: -0.45,
});

/**
 * Target wrist roll angles around Z (in radians) to make each cup face world UP (0, 1, 0).
 */
export const CUP_TARGET_ROLL_ANGLES = Object.freeze({
    big: Math.PI / 2,
    bigCup: Math.PI / 2,
    small: -Math.PI / 2,
    smallCup: -Math.PI / 2,
    base: Math.PI,
    baseCup: Math.PI,
    spike: 0.0,
});

/**
 * Clamps a numerical value between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Simulates VR controller/hand input from mouse and keyboard.
 */
export class FakeInput {
    /**
     * @param {Object} [options={}]
     * @param {EventTarget} [options.domElement=null] - DOM element for mouse events (e.g. canvas or container)
     * @param {EventTarget} [options.windowObj=null] - Window or global object for keyboard events
     * @param {{ x: number, y: number, z: number }} [options.initialPosition=DEFAULT_KEN_POSITION]
     * @param {typeof REACH_BOUNDS} [options.reachBounds=REACH_BOUNDS]
     * @param {number} [options.lerpSpeed=15.0] - Smoothing speed factor
     * @param {number} [options.rollSpeed=2.5] - Wrist roll speed in radians/second (~143 deg/s)
     * @param {number} [options.mouseSensitivity=0.001] - Meters of Ken motion per pixel of mouse delta
     */
    constructor(options = {}) {
        const {
            domElement = null,
            target = null,
            windowObj = typeof window !== 'undefined' ? window : null,
            initialPosition = DEFAULT_KEN_POSITION,
            reachBounds = REACH_BOUNDS,
            lerpSpeed = 15.0,
            rollSpeed = 2.5,
            mouseSensitivity = 0.001,
            autoRoll = true,
            autoRollSpeed = 16.0,
        } = options;

        this._reachBounds = reachBounds;
        this._lerpSpeed = Number.isFinite(lerpSpeed) && lerpSpeed > 0 ? lerpSpeed : 15.0;
        this._rollSpeed = Number.isFinite(rollSpeed) && rollSpeed > 0 ? rollSpeed : 2.5;
        this._mouseSensitivity = Number.isFinite(mouseSensitivity) && mouseSensitivity > 0 ? mouseSensitivity : 0.001;

        // Auto-roll configuration
        this._autoRoll = autoRoll !== false;
        this._autoRollSpeed = Number.isFinite(autoRollSpeed) && autoRollSpeed > 0 ? autoRollSpeed : 16.0;
        this._targetCup = null;
        this._targetRollAngle = null;

        // Current smoothed position
        this._currentX = clamp(initialPosition.x, this._reachBounds.xMin, this._reachBounds.xMax);
        this._currentY = clamp(initialPosition.y, this._reachBounds.yMin, this._reachBounds.yMax);
        this._currentZ = this._reachBounds.zFixed;

        // Target position set by mouse
        this._targetX = this._currentX;
        this._targetY = this._currentY;

        // Wrist roll angle around Z axis in radians
        this._rollAngle = 0.0;

        // Key states
        this._spaceHeld = false;
        this._qHeld = false;
        this._eHeld = false;

        // Single-trigger launch request flag
        this._launchRequested = false;

        // Lifecycle flag
        this._disposed = false;

        // Pre-allocated gameplay interface group matching Three.js / IWSDK Object3D shape
        this.gameplayKenGroup = {
            position: {
                x: this._currentX,
                y: this._currentY,
                z: this._currentZ,
                set: (x, y, z) => {
                    this.gameplayKenGroup.position.x = x;
                    this.gameplayKenGroup.position.y = y;
                    this.gameplayKenGroup.position.z = z;
                },
            },
            rotation: {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                set: (x, y, z) => {
                    this.gameplayKenGroup.rotation.x = x;
                    this.gameplayKenGroup.rotation.y = y;
                    this.gameplayKenGroup.rotation.z = z;
                },
            },
            quaternion: {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                w: 1.0,
                set: (x, y, z, w) => {
                    this.gameplayKenGroup.quaternion.x = x;
                    this.gameplayKenGroup.quaternion.y = y;
                    this.gameplayKenGroup.quaternion.z = z;
                    this.gameplayKenGroup.quaternion.w = w;
                },
            },
        };

        // Cache listener targets
        this._domElement = domElement || target;
        this._windowObj = windowObj;

        // Bound event listener references for cleanup
        this._onMouseMove = (e) => this.handleMouseMove(e);
        this._onKeyDown = (e) => this.handleKeyDown(e);
        this._onKeyUp = (e) => this.handleKeyUp(e);

        // Attach listeners safely if elements are available
        if (this._domElement && typeof this._domElement.addEventListener === 'function') {
            this._domElement.addEventListener('mousemove', this._onMouseMove);
        }

        if (this._windowObj && typeof this._windowObj.addEventListener === 'function') {
            this._windowObj.addEventListener('keydown', this._onKeyDown);
            this._windowObj.addEventListener('keyup', this._onKeyUp);
        }
    }

    /**
     * Handles mouse movement to update target Ken position.
     *
     * @param {{ movementX?: number, movementY?: number }} event
     */
    handleMouseMove(event) {
        if (this._disposed || !event) {
            return;
        }

        const dx = Number.isFinite(event.movementX) ? event.movementX : 0.0;
        const dy = Number.isFinite(event.movementY) ? event.movementY : 0.0;

        // Mouse moving right (+dx) moves Ken right (+X)
        // Mouse moving up (-dy in screen space) moves Ken up (+Y in world space)
        this._targetX = clamp(
            this._targetX + dx * this._mouseSensitivity,
            this._reachBounds.xMin,
            this._reachBounds.xMax
        );

        this._targetY = clamp(
            this._targetY - dy * this._mouseSensitivity,
            this._reachBounds.yMin,
            this._reachBounds.yMax
        );
    }

    /**
     * Handles keydown events.
     *
     * @param {{ key?: string, code?: string, repeat?: boolean }} event
     */
    handleKeyDown(event) {
        if (this._disposed || !event) {
            return;
        }

        const code = event.code;
        const key = event.key;

        // Space: Edge-triggered ball launch request
        if (code === 'Space' || key === ' ') {
            // Ignore key repeat when holding Space down
            if (!this._spaceHeld && !event.repeat) {
                this._spaceHeld = true;
                this._launchRequested = true;
            }
            return;
        }

        // Q: Roll wrist counter-clockwise
        if (code === 'KeyQ' || key === 'q' || key === 'Q') {
            this._qHeld = true;
            return;
        }

        // E: Roll wrist clockwise
        if (code === 'KeyE' || key === 'e' || key === 'E') {
            this._eHeld = true;
            return;
        }
    }

    /**
     * Handles keyup events.
     *
     * @param {{ key?: string, code?: string }} event
     */
    handleKeyUp(event) {
        if (this._disposed || !event) {
            return;
        }

        const code = event.code;
        const key = event.key;

        if (code === 'Space' || key === ' ') {
            this._spaceHeld = false;
            return;
        }

        if (code === 'KeyQ' || key === 'q' || key === 'Q') {
            this._qHeld = false;
            return;
        }

        if (code === 'KeyE' || key === 'e' || key === 'E') {
            this._eHeld = false;
            return;
        }
    }

    /**
     * Directly overrides the target position (useful for programmatic positioning and testing).
     *
     * @param {number} x
     * @param {number} y
     */
    setTargetPosition(x, y) {
        if (this._disposed) {
            return;
        }
        if (Number.isFinite(x)) {
            this._targetX = clamp(x, this._reachBounds.xMin, this._reachBounds.xMax);
        }
        if (Number.isFinite(y)) {
            this._targetY = clamp(y, this._reachBounds.yMin, this._reachBounds.yMax);
        }
    }

    /**
     * Sets target cup for automatic Ken orientation roll.
     * Supported keys: 'big' | 'small' | 'base' | 'spike' (unknown keys are ignored).
     *
     * @param {string} cupKey
     */
    setTargetCup(cupKey) {
        if (this._disposed) {
            return;
        }
        if (typeof cupKey === 'string' && CUP_TARGET_ROLL_ANGLES[cupKey] !== undefined) {
            this._targetCup = cupKey;
            this._targetRollAngle = CUP_TARGET_ROLL_ANGLES[cupKey];
        }
    }

    /**
     * Current target cup key.
     * @returns {string|null}
     */
    get targetCup() {
        return this._targetCup;
    }

    /**
     * Flag indicating whether automatic wrist roll towards target cup is enabled.
     * @returns {boolean}
     */
    get autoRoll() {
        return this._autoRoll;
    }

    set autoRoll(enabled) {
        this._autoRoll = Boolean(enabled);
    }

    /**
     * Advances simulated input by dt seconds.
     *
     * - Interpolates current position towards target position using lerp.
     * - Applies continuous wrist roll while Q or E are held (overrides auto-roll).
     * - Smoothly slerps wrist roll towards target cup orientation when auto-roll is active.
     * - Updates `gameplayKenGroup` in-place (zero allocations).
     *
     * @param {number} dt - Time step in seconds
     */
    update(dt) {
        if (this._disposed) {
            return;
        }

        if (!Number.isFinite(dt) || dt <= 0.0) {
            return;
        }

        // 1. Position smoothing (lerp)
        // t = 1 - exp(-lerpSpeed * dt) or clamped proportional factor
        const t = Math.min(1.0, Math.max(0.0, dt * this._lerpSpeed));
        this._currentX += (this._targetX - this._currentX) * t;
        this._currentY += (this._targetY - this._currentY) * t;

        // Ensure boundaries are strictly enforced
        this._currentX = clamp(this._currentX, this._reachBounds.xMin, this._reachBounds.xMax);
        this._currentY = clamp(this._currentY, this._reachBounds.yMin, this._reachBounds.yMax);

        // 2. Wrist rotation updates
        // Manual roll keys (Q/E) take precedence and temporarily override auto-roll while pressed
        if (this._qHeld || this._eHeld) {
            if (this._qHeld) {
                this._rollAngle -= this._rollSpeed * dt;
            }
            if (this._eHeld) {
                this._rollAngle += this._rollSpeed * dt;
            }
        } else if (this._autoRoll && this._targetRollAngle !== null) {
            // Slerp / smooth roll toward target cup angle, settling in ~0.25s
            const diff = this._targetRollAngle - this._rollAngle;
            const factor = Math.min(1.0, Math.max(0.0, 1.0 - Math.exp(-this._autoRollSpeed * dt)));
            this._rollAngle += diff * factor;
            if (Math.abs(this._targetRollAngle - this._rollAngle) < 1e-4) {
                this._rollAngle = this._targetRollAngle;
            }
        }

        // 3. Update gameplayKenGroup in-place without allocations
        const pos = this.gameplayKenGroup.position;
        pos.x = this._currentX;
        pos.y = this._currentY;
        pos.z = this._reachBounds.zFixed;

        const rot = this.gameplayKenGroup.rotation;
        rot.x = 0.0;
        rot.y = 0.0;
        rot.z = this._rollAngle;

        const quat = this.gameplayKenGroup.quaternion;
        const halfAngle = this._rollAngle * 0.5;
        quat.x = 0.0;
        quat.y = 0.0;
        quat.z = Math.sin(halfAngle);
        quat.w = Math.cos(halfAngle);
    }

    /**
     * Checks if a launch was requested and resets the request flag.
     *
     * @returns {boolean} True if Space was pressed since the last check
     */
    consumeLaunchRequest() {
        const requested = this._launchRequested;
        this._launchRequested = false;
        return requested;
    }

    /**
     * Checks whether a launch is currently requested without clearing the flag.
     * @returns {boolean}
     */
    get launchRequested() {
        return this._launchRequested;
    }

    /**
     * Manually clears the launch request flag.
     */
    clearLaunchRequest() {
        this._launchRequested = false;
    }

    /**
     * Current smoothed X position [meters].
     * @returns {number}
     */
    get x() {
        return this._currentX;
    }

    /**
     * Current smoothed Y position [meters].
     * @returns {number}
     */
    get y() {
        return this._currentY;
    }

    /**
     * Fixed Z position [meters].
     * @returns {number}
     */
    get z() {
        return this._reachBounds.zFixed;
    }

    /**
     * Current target X position [meters].
     * @returns {number}
     */
    get targetX() {
        return this._targetX;
    }

    /**
     * Current target Y position [meters].
     * @returns {number}
     */
    get targetY() {
        return this._targetY;
    }

    /**
     * Current wrist roll angle in radians.
     * @returns {number}
     */
    get rollAngle() {
        return this._rollAngle;
    }

    /**
     * Whether this input instance has been disposed.
     * @returns {boolean}
     */
    get isDisposed() {
        return this._disposed;
    }

    /**
     * Unregisters all event listeners and disables further updates.
     */
    dispose() {
        if (this._disposed) {
            return;
        }

        if (this._domElement && typeof this._domElement.removeEventListener === 'function') {
            this._domElement.removeEventListener('mousemove', this._onMouseMove);
        }

        if (this._windowObj && typeof this._windowObj.removeEventListener === 'function') {
            this._windowObj.removeEventListener('keydown', this._onKeyDown);
            this._windowObj.removeEventListener('keyup', this._onKeyUp);
        }

        this._disposed = true;
        this._launchRequested = false;
        this._spaceHeld = false;
        this._qHeld = false;
        this._eHeld = false;
    }
}

export default FakeInput;
