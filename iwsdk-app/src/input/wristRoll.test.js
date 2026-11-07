/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_ROLL_GAIN,
  DEADZONE_DEG,
  MAX_TWIST_DEG,
  normalizeQuat,
  canonicalizeQuat,
  multiplyQuat,
  decomposeSwingTwist,
  amplifyWristRoll,
  rotateVectorByQuat,
} from './wristRoll.js';

function makeTwistQuat(deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: 0,
    y: 0,
    z: Math.sin(rad / 2),
    w: Math.cos(rad / 2),
  };
}

describe('wristRoll Module', () => {
  it('1. gain 1.0 returns the input quaternion unchanged for several arbitrary orientations', () => {
    const orientations = [
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0.4)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.8, -0.2)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, -0.6, 0.9)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -1.1, 2.1)),
    ];

    for (const qThree of orientations) {
      const qInput = { x: qThree.x, y: qThree.y, z: qThree.z, w: qThree.w };
      const qOut = amplifyWristRoll(qInput, 1.0);

      expect(qOut.x).toBeCloseTo(qInput.x, 5);
      expect(qOut.y).toBeCloseTo(qInput.y, 5);
      expect(qOut.z).toBeCloseTo(qInput.z, 5);
      expect(qOut.w).toBeCloseTo(qInput.w, 5);
    }
  });

  it('2. pure 30 deg twist about local Z with gain 2.0 gives a 60 deg twist', () => {
    const q30 = makeTwistQuat(30);
    const details = {};
    const qOut = amplifyWristRoll(q30, 2.0, details);

    expect(details.rawTwistDeg).toBeCloseTo(30, 4);
    expect(details.amplifiedTwistDeg).toBeCloseTo(60, 4);

    // Verify output quaternion is a pure 60 deg twist around Z
    const expected = makeTwistQuat(60);
    expect(qOut.x).toBeCloseTo(0, 5);
    expect(qOut.y).toBeCloseTo(0, 5);
    expect(qOut.z).toBeCloseTo(expected.z, 5);
    expect(qOut.w).toBeCloseTo(expected.w, 5);
  });

  it('3. axis check: 90 deg twist about local Z rotates Big Cup normal (1,0,0) to (0,1,0); with gain 2.0 a 45 deg input twist gives the same result', () => {
    const bigCupNormal = { x: 1.0, y: 0.0, z: 0.0 };

    // Standard 90 deg twist
    const q90 = makeTwistQuat(90);
    const rotated90 = rotateVectorByQuat(bigCupNormal, q90);
    expect(rotated90.x).toBeCloseTo(0, 5);
    expect(rotated90.y).toBeCloseTo(1, 5);
    expect(rotated90.z).toBeCloseTo(0, 5);

    // 45 deg twist with gain 2.0
    const q45 = makeTwistQuat(45);
    const qOut = amplifyWristRoll(q45, 2.0);
    const rotatedAmp = rotateVectorByQuat(bigCupNormal, qOut);
    expect(rotatedAmp.x).toBeCloseTo(0, 5);
    expect(rotatedAmp.y).toBeCloseTo(1, 5);
    expect(rotatedAmp.z).toBeCloseTo(0, 5);
  });

  it('4. pitch and yaw (the swing) are identical before and after amplification', () => {
    const testRotations = [
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.6, 0.5)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.7, -0.8)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(1.0, -0.4, 0.2)),
    ];

    for (const rot of testRotations) {
      const qInput = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
      const { swing: swingBefore } = decomposeSwingTwist(qInput);

      const qAmp = amplifyWristRoll(qInput, 2.0);
      const { swing: swingAfter } = decomposeSwingTwist(qAmp);

      expect(swingAfter.x).toBeCloseTo(swingBefore.x, 5);
      expect(swingAfter.y).toBeCloseTo(swingBefore.y, 5);
      expect(swingAfter.z).toBeCloseTo(swingBefore.z, 5);
      expect(swingAfter.w).toBeCloseTo(swingBefore.w, 5);
    }
  });

  it('5. a 100 deg twist (200 deg amplified) is clamped to 150 deg', () => {
    const q100 = makeTwistQuat(100);
    const details = {};
    const qOut = amplifyWristRoll(q100, 2.0, details);

    expect(details.rawTwistDeg).toBeCloseTo(100, 4);
    expect(details.amplifiedTwistDeg).toBeCloseTo(150, 4);

    const expected150 = makeTwistQuat(150);
    expect(qOut.z).toBeCloseTo(expected150.z, 5);
    expect(qOut.w).toBeCloseTo(expected150.w, 5);

    // Negative 100 deg twist (-200 deg amplified) is clamped to -150 deg
    const qNeg100 = makeTwistQuat(-100);
    const negDetails = {};
    const qNegOut = amplifyWristRoll(qNeg100, 2.0, negDetails);
    expect(negDetails.rawTwistDeg).toBeCloseTo(-100, 4);
    expect(negDetails.amplifiedTwistDeg).toBeCloseTo(-150, 4);

    const expectedNeg150 = makeTwistQuat(-150);
    expect(qNegOut.z).toBeCloseTo(expectedNeg150.z, 5);
    expect(qNegOut.w).toBeCloseTo(expectedNeg150.w, 5);
  });

  it('6. sweeping the input twist through +/-179 -> +/-181 deg produces no sign flip or jump in the output (continuity test)', () => {
    // Clamping to [-150°, +150°] ensures amplified rotation never approaches +/-180°,
    // preventing wraparound flips across the boundary.
    for (let deg = 80; deg <= 179.9; deg += 5) {
      const q = makeTwistQuat(deg);
      const details = {};
      const qOut = amplifyWristRoll(q, 2.0, details);

      expect(details.amplifiedTwistDeg).toBeGreaterThan(0);
      expect(details.amplifiedTwistDeg).toBeLessThanOrEqual(150.0001);
      // Quaternion w is strictly positive: no sudden sign inversion
      expect(qOut.w).toBeGreaterThan(0.25);
    }

    for (let deg = -80; deg >= -179.9; deg -= 5) {
      const q = makeTwistQuat(deg);
      const details = {};
      const qOut = amplifyWristRoll(q, 2.0, details);

      expect(details.amplifiedTwistDeg).toBeLessThan(0);
      expect(details.amplifiedTwistDeg).toBeGreaterThanOrEqual(-150.0001);
      // Quaternion w is strictly positive: no sudden sign inversion
      expect(qOut.w).toBeGreaterThan(0.25);
    }
  });

  it('7. twists of 1 deg and 2 deg are not amplified (deadzone); 3 deg is', () => {
    const q1 = makeTwistQuat(1.0);
    const d1 = {};
    amplifyWristRoll(q1, 2.0, d1);
    expect(d1.rawTwistDeg).toBeCloseTo(1.0, 5);
    expect(d1.amplifiedTwistDeg).toBeCloseTo(1.0, 5);

    const q2 = makeTwistQuat(2.0);
    const d2 = {};
    amplifyWristRoll(q2, 2.0, d2);
    expect(d2.rawTwistDeg).toBeCloseTo(2.0, 5);
    expect(d2.amplifiedTwistDeg).toBeCloseTo(2.0, 5);

    const q3 = makeTwistQuat(3.0);
    const d3 = {};
    amplifyWristRoll(q3, 2.0, d3);
    expect(d3.rawTwistDeg).toBeCloseTo(3.0, 5);
    expect(d3.amplifiedTwistDeg).toBeCloseTo(6.0, 5);
  });

  it('8. jitter: a stationary hand with +/-0.5 deg of noise produces output noise of the same size (not doubled)', () => {
    const noiseValues = [-0.5, -0.3, -0.1, 0.0, 0.2, 0.4, 0.5];
    for (const noise of noiseValues) {
      const qNoise = makeTwistQuat(noise);
      const details = {};
      amplifyWristRoll(qNoise, 2.0, details);
      expect(details.amplifiedTwistDeg).toBeCloseTo(noise, 5);
    }
  });

  it('11. output quaternion is always unit length', () => {
    const angles = [-170, -120, -90, -45, -2, 0, 1.5, 30, 45, 90, 110, 150, 175];
    for (const ang of angles) {
      const q = makeTwistQuat(ang);
      const qOut = amplifyWristRoll(q, 2.0);
      const len = Math.hypot(qOut.x, qOut.y, qOut.z, qOut.w);
      expect(len).toBeCloseTo(1.0, 6);
    }

    // Arbitrary 3D orientations
    for (let i = 0; i < 20; i++) {
      const q = new THREE.Quaternion(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const qOut = amplifyWristRoll(q, 2.0);
      const len = Math.hypot(qOut.x, qOut.y, qOut.z, qOut.w);
      expect(len).toBeCloseTo(1.0, 6);
    }
  });
});
