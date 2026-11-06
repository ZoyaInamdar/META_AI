/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PinchDetector (Pure Geometric Pinch Gesture Detector)
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * A pure-logic, zero-dependency gesture detector that tracks the distance
 * between thumb tip and index finger tip.
 *
 * Key Behaviors:
 * - Hysteresis thresholds:
 *     * PINCH_CLOSE_THRESHOLD = 0.020 m (2.0 cm): transitions to PINCHED
 *     * PINCH_OPEN_THRESHOLD  = 0.035 m (3.5 cm): transitions to OPEN
 *     * Deadband [0.020 .. 0.035 m]: preserves prior state
 * - Rising-edge latch:
 *     * Exactly one launch request emitted per pinch transition (OPEN -> PINCHED)
 *     * Consumed via consumeLaunchRequest()
 * - Baseline safety:
 *     * The first valid tracking frame establishes a baseline and NEVER triggers a launch.
 * - Tracking loss handling:
 *     * If tracking is invalid, reset() is invoked immediately.
 *     * Reacquiring tracking resets the baseline, so holding a pinch through a tracking
 *       loss will never accidentally launch upon reacquisition.
 */

export const PINCH_CLOSE_THRESHOLD = 0.020; // 2.0 cm
export const PINCH_OPEN_THRESHOLD = 0.035;  // 3.5 cm

export class PinchDetector {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.closeThreshold=PINCH_CLOSE_THRESHOLD]
   * @param {number} [options.openThreshold=PINCH_OPEN_THRESHOLD]
   */
  constructor(options = {}) {
    this.closeThreshold = options.closeThreshold ?? PINCH_CLOSE_THRESHOLD;
    this.openThreshold = options.openThreshold ?? PINCH_OPEN_THRESHOLD;

    this._isPinched = false;
    this._launchRequested = false;
    this._hasBaseline = false;
    this._lastDistance = null;
    this._isValid = false;
  }

  /**
   * Resets internal gesture state and clears any latched launch requests.
   */
  reset() {
    this._isPinched = false;
    this._launchRequested = false;
    this._hasBaseline = false;
    this._lastDistance = null;
    this._isValid = false;
  }

  /**
   * Updates detector state with a new frame distance measurement.
   *
   * @param {boolean} valid - Whether tracking for both finger tips is currently valid
   * @param {number|null} distance - Euclidean distance between thumb tip and index tip in meters
   * @returns {boolean} Current pinch state
   */
  update(valid, distance) {
    if (!valid || distance === null || distance === undefined || !Number.isFinite(distance) || distance < 0) {
      this.reset();
      return false;
    }

    this._isValid = true;
    this._lastDistance = distance;

    // First valid frame sets baseline and must NOT fire a rising edge
    if (!this._hasBaseline) {
      this._hasBaseline = true;
      this._isPinched = distance < this.closeThreshold;
      return this._isPinched;
    }

    const wasPinched = this._isPinched;

    if (distance < this.closeThreshold) {
      this._isPinched = true;
      if (!wasPinched) {
        // Rising edge: transition from open to pinched
        this._launchRequested = true;
      }
    } else if (distance > this.openThreshold) {
      this._isPinched = false;
    }
    // In deadband [closeThreshold .. openThreshold], retain this._isPinched

    return this._isPinched;
  }

  /**
   * Consumes any pending launch request (edge-triggered).
   *
   * @returns {boolean} True if a rising edge occurred since the last consume call.
   */
  consumeLaunchRequest() {
    const requested = this._launchRequested;
    this._launchRequested = false;
    return requested;
  }

  /**
   * Current binary pinch state.
   * @returns {boolean}
   */
  get isPinched() {
    return this._isPinched;
  }

  /**
   * Whether a launch request is currently latched.
   * @returns {boolean}
   */
  get launchRequested() {
    return this._launchRequested;
  }

  /**
   * Most recently evaluated distance in meters.
   * @returns {number|null}
   */
  get lastDistance() {
    return this._lastDistance;
  }

  /**
   * Whether tracking data was valid on the most recent update.
   * @returns {boolean}
   */
  get isValid() {
    return this._isValid;
  }
}

export default PinchDetector;
