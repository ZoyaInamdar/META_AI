/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PinchDetector, PINCH_CLOSE_THRESHOLD, PINCH_OPEN_THRESHOLD } from './PinchDetector.js';

describe('PinchDetector Module', () => {
  let detector;

  beforeEach(() => {
    detector = new PinchDetector();
  });

  it('1. First valid frame sets baseline and must NOT fire even if distance < closeThreshold', () => {
    // Starts already close (e.g. 0.015 m < 0.020 m)
    const pinched = detector.update(true, 0.015);
    expect(pinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(false);
  });

  it('2. First valid frame starting open does not fire', () => {
    const pinched = detector.update(true, 0.050);
    expect(pinched).toBe(false);
    expect(detector.consumeLaunchRequest()).toBe(false);
  });

  it('3. One pinch gives exactly one launch (rising-edge trigger)', () => {
    // Frame 1: baseline open
    detector.update(true, 0.040);
    expect(detector.consumeLaunchRequest()).toBe(false);

    // Frame 2: pinch closed (< 0.020 m)
    detector.update(true, 0.018);
    expect(detector.isPinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(true);

    // Immediate second consume returns false
    expect(detector.consumeLaunchRequest()).toBe(false);
  });

  it('4. Holding pinch does not relaunch', () => {
    // Frame 1: baseline open
    detector.update(true, 0.050);

    // Frame 2: pinch closed -> fires
    detector.update(true, 0.015);
    expect(detector.consumeLaunchRequest()).toBe(true);

    // Frames 3..10: remaining held pinched
    for (let i = 0; i < 8; i++) {
      detector.update(true, 0.014);
      expect(detector.consumeLaunchRequest()).toBe(false);
      expect(detector.isPinched).toBe(true);
    }
  });

  it('5. Deadband [0.020 .. 0.035 m] holds state', () => {
    // Establish baseline open
    detector.update(true, 0.050);

    // Move into deadband from open (0.025 m): should remain open
    detector.update(true, 0.025);
    expect(detector.isPinched).toBe(false);
    expect(detector.consumeLaunchRequest()).toBe(false);

    // Pinch closed (0.015 m): transitions to pinched
    detector.update(true, 0.015);
    expect(detector.isPinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(true);

    // Move back into deadband (0.030 m): should remain pinched!
    detector.update(true, 0.030);
    expect(detector.isPinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(false);

    // Release past open threshold (0.036 m): transitions to open
    detector.update(true, 0.036);
    expect(detector.isPinched).toBe(false);

    // Move back into deadband (0.030 m): should remain open!
    detector.update(true, 0.030);
    expect(detector.isPinched).toBe(false);
  });

  it('6. Release then pinch again launches again', () => {
    // Frame 1: baseline open
    detector.update(true, 0.050);

    // First pinch
    detector.update(true, 0.015);
    expect(detector.consumeLaunchRequest()).toBe(true);

    // Release
    detector.update(true, 0.040);
    expect(detector.isPinched).toBe(false);
    expect(detector.consumeLaunchRequest()).toBe(false);

    // Second pinch
    detector.update(true, 0.018);
    expect(detector.isPinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(true);
  });

  it('7. Tracking loss while pinched does not launch on reacquire', () => {
    // Frame 1: baseline open
    detector.update(true, 0.050);

    // Frame 2: pinch closed -> fires
    detector.update(true, 0.015);
    expect(detector.consumeLaunchRequest()).toBe(true);

    // Tracking lost (e.g. hand moved behind back / camera occlusion)
    detector.update(false, null);
    expect(detector.isValid).toBe(false);
    expect(detector.isPinched).toBe(false);
    expect(detector.consumeLaunchRequest()).toBe(false);

    // Tracking reacquired while STILL pinched (0.012 m)
    // Must act as new baseline and NOT fire!
    detector.update(true, 0.012);
    expect(detector.isPinched).toBe(true);
    expect(detector.consumeLaunchRequest()).toBe(false);
  });

  it('8. reset() clears all state and latched requests', () => {
    detector.update(true, 0.050);
    detector.update(true, 0.015);
    expect(detector.launchRequested).toBe(true);

    detector.reset();
    expect(detector.isPinched).toBe(false);
    expect(detector.launchRequested).toBe(false);
    expect(detector.consumeLaunchRequest()).toBe(false);
  });
});
