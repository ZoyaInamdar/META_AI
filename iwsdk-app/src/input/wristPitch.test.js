/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PITCH_GAIN,
  PITCH_DEADZONE_DEG,
  MAX_PITCH_DEG,
  decomposePitchTwist,
  amplifyWristPitch,
  amplifyWristOrientation,
  replaceWristPitchRoll,
  rotateVectorByQuat,
  normalizeQuat,
} from './wristPitch.js';

describe('wristPitch Module', () => {
  it('1. gain 1.0 returns the input quaternion unchanged for arbitrary mixed orientations', () => {
    const testQuats = [
      { x: 0, y: 0, z: 0, w: 1 },
      { x: Math.sin(Math.PI / 8), y: 0, z: 0, w: Math.cos(Math.PI / 8) },
      { x: 0, y: Math.sin(Math.PI / 6), z: 0, w: Math.cos(Math.PI / 6) },
      { x: 0, y: 0, z: Math.sin(Math.PI / 10), w: Math.cos(Math.PI / 10) },
      normalizeQuat({ x: 0.2, y: 0.3, z: 0.4, w: 0.8 }),
      normalizeQuat({ x: -0.5, y: 0.2, z: -0.1, w: 0.83 }),
    ];

    for (const q of testQuats) {
      const out = amplifyWristOrientation(q, { rollGain: 1.0, pitchGain: 1.0 });
      expect(out.x).toBeCloseTo(q.x, 5);
      expect(out.y).toBeCloseTo(q.y, 5);
      expect(out.z).toBeCloseTo(q.z, 5);
      expect(out.w).toBeCloseTo(q.w, 5);
    }
  });

  it('2. pure 45 deg pitch about local X with gain 2.0 outputs 90 deg pitch', () => {
    const angleIn = (45.0 * Math.PI) / 180.0;
    const qIn = {
      x: Math.sin(angleIn / 2),
      y: 0,
      z: 0,
      w: Math.cos(angleIn / 2),
    };

    const details = {};
    const qOut = amplifyWristOrientation(qIn, { rollGain: 1.0, pitchGain: 2.0 }, details);

    expect(details.rawPitchDeg).toBeCloseTo(45.0, 3);
    expect(details.amplifiedPitchDeg).toBeCloseTo(90.0, 3);

    const expectedAngle = (90.0 * Math.PI) / 180.0;
    expect(qOut.x).toBeCloseTo(Math.sin(expectedAngle / 2), 5);
    expect(qOut.y).toBeCloseTo(0, 5);
    expect(qOut.z).toBeCloseTo(0, 5);
    expect(qOut.w).toBeCloseTo(Math.cos(expectedAngle / 2), 5);
  });

  it('3. margin test: 75 deg real pitch (150 deg amplified) gives Base Cup normal Y >= 0.85, and 70 deg gives normal Y >= 0.76', () => {
    const baseLocalNormal = { x: 0.0, y: -1.0, z: 0.0 };

    // Part A: 75 deg real pitch -> 150 deg amplified
    const angle75 = (75.0 * Math.PI) / 180.0;
    const q75In = {
      x: Math.sin(angle75 / 2),
      y: 0,
      z: 0,
      w: Math.cos(angle75 / 2),
    };
    const details75 = {};
    const q75Out = amplifyWristOrientation(q75In, { rollGain: 1.0, pitchGain: 2.0 }, details75);
    expect(details75.rawPitchDeg).toBeCloseTo(75.0, 3);
    expect(details75.amplifiedPitchDeg).toBeCloseTo(150.0, 3);

    const rotatedNormal75 = rotateVectorByQuat(baseLocalNormal, q75Out);
    // Rotating (0, -1, 0) by 150 deg around X gives y = -cos(150°) = cos(30°) = 0.8660
    expect(rotatedNormal75.y).toBeGreaterThanOrEqual(0.85);
    expect(rotatedNormal75.y).toBeCloseTo(Math.cos((30.0 * Math.PI) / 180.0), 3);

    // Part B: 70 deg real pitch -> 140 deg amplified
    const angle70 = (70.0 * Math.PI) / 180.0;
    const q70In = {
      x: Math.sin(angle70 / 2),
      y: 0,
      z: 0,
      w: Math.cos(angle70 / 2),
    };
    const details70 = {};
    const q70Out = amplifyWristOrientation(q70In, { rollGain: 1.0, pitchGain: 2.0 }, details70);
    expect(details70.rawPitchDeg).toBeCloseTo(70.0, 3);
    expect(details70.amplifiedPitchDeg).toBeCloseTo(140.0, 3);

    const rotatedNormal70 = rotateVectorByQuat(baseLocalNormal, q70Out);
    // Rotating (0, -1, 0) by 140 deg around X gives y = -cos(140°) = cos(40°) = 0.7660
    expect(rotatedNormal70.y).toBeGreaterThanOrEqual(0.76);
    expect(rotatedNormal70.y).toBeCloseTo(Math.cos((40.0 * Math.PI) / 180.0), 3);
  });

  it('4. roll behavior for Big/Small is unchanged when pitch is unpitched', () => {
    const angle30 = (30.0 * Math.PI) / 180.0;
    const qRollIn = {
      x: 0,
      y: 0,
      z: Math.sin(angle30 / 2),
      w: Math.cos(angle30 / 2),
    };
    const details = {};
    const qOut = amplifyWristOrientation(qRollIn, { rollGain: 2.0, pitchGain: 2.0 }, details);

    expect(details.rawTwistDeg).toBeCloseTo(30.0, 3);
    expect(details.amplifiedTwistDeg).toBeCloseTo(60.0, 3);
    expect(details.rawPitchDeg).toBeCloseTo(0.0, 3);
    expect(details.amplifiedPitchDeg).toBeCloseTo(0.0, 3);

    const expectedRoll = (60.0 * Math.PI) / 180.0;
    expect(qOut.z).toBeCloseTo(Math.sin(expectedRoll / 2), 5);
    expect(qOut.w).toBeCloseTo(Math.cos(expectedRoll / 2), 5);
  });

  it('5. continuity near +/-180 deg and clamping at 180 deg', () => {
    // 89.9 deg real pitch -> 179.8 deg amplified
    const anglePos = (89.9 * Math.PI) / 180.0;
    const qPosIn = { x: Math.sin(anglePos / 2), y: 0, z: 0, w: Math.cos(anglePos / 2) };
    const detailsPos = {};
    const qPosOut = amplifyWristOrientation(qPosIn, { rollGain: 1.0, pitchGain: 2.0 }, detailsPos);
    expect(detailsPos.amplifiedPitchDeg).toBeCloseTo(179.8, 2);

    // -89.9 deg real pitch -> -179.8 deg amplified
    const angleNeg = (-89.9 * Math.PI) / 180.0;
    const qNegIn = { x: Math.sin(angleNeg / 2), y: 0, z: 0, w: Math.cos(angleNeg / 2) };
    const detailsNeg = {};
    const qNegOut = amplifyWristOrientation(qNegIn, { rollGain: 1.0, pitchGain: 2.0 }, detailsNeg);
    expect(detailsNeg.amplifiedPitchDeg).toBeCloseTo(-179.8, 2);

    // Both transform Base Cup normal (0, -1, 0) nearly to (0, +1, 0) continuously
    const vPos = rotateVectorByQuat({ x: 0, y: -1, z: 0 }, qPosOut);
    const vNeg = rotateVectorByQuat({ x: 0, y: -1, z: 0 }, qNegOut);
    expect(vPos.y).toBeCloseTo(1.0, 2);
    expect(vNeg.y).toBeCloseTo(1.0, 2);

    // 100 deg real pitch (200 deg amplified) is clamped to 180 deg
    const angle100 = (100.0 * Math.PI) / 180.0;
    const q100In = { x: Math.sin(angle100 / 2), y: 0, z: 0, w: Math.cos(angle100 / 2) };
    const details100 = {};
    const q100Out = amplifyWristOrientation(q100In, { rollGain: 1.0, pitchGain: 2.0 }, details100);
    expect(details100.amplifiedPitchDeg).toBeCloseTo(180.0, 2);
    expect(q100Out.x).toBeCloseTo(1.0, 4);
    expect(q100Out.w).toBeCloseTo(0.0, 4);
  });

  it('6. input deadzone of 2 deg leaves pitch unamplified', () => {
    // 1.5 deg pitch inside deadzone
    const angleDead = (1.5 * Math.PI) / 180.0;
    const qDeadIn = { x: Math.sin(angleDead / 2), y: 0, z: 0, w: Math.cos(angleDead / 2) };
    const detailsDead = {};
    amplifyWristOrientation(qDeadIn, { rollGain: 1.0, pitchGain: 2.0 }, detailsDead);
    expect(detailsDead.rawPitchDeg).toBeCloseTo(1.5, 3);
    expect(detailsDead.amplifiedPitchDeg).toBeCloseTo(1.5, 3); // Unamplified

    // 10 deg pitch outside deadzone
    const angleActive = (10.0 * Math.PI) / 180.0;
    const qActiveIn = { x: Math.sin(angleActive / 2), y: 0, z: 0, w: Math.cos(angleActive / 2) };
    const detailsActive = {};
    amplifyWristOrientation(qActiveIn, { rollGain: 1.0, pitchGain: 2.0 }, detailsActive);
    expect(detailsActive.rawPitchDeg).toBeCloseTo(10.0, 3);
    expect(detailsActive.amplifiedPitchDeg).toBeCloseTo(20.0, 3); // Amplified
  });

  it('7. output quaternion is strictly unit length across all test cases', () => {
    const angles = [0, 10, 45, 75, 90, 110, -30, -75, -120];
    for (const a of angles) {
      const rad = (a * Math.PI) / 180.0;
      const q = normalizeQuat({
        x: Math.sin(rad / 2),
        y: Math.sin(rad / 4),
        z: Math.sin(rad / 3),
        w: Math.cos(rad / 2),
      });
      const out = amplifyWristOrientation(q, { rollGain: 2.0, pitchGain: 2.0 });
      const len = Math.hypot(out.x, out.y, out.z, out.w);
      expect(len).toBeCloseTo(1.0, 6);
    }
  });

  it('8. yaw (horizontal azimuth) remains unchanged by roll and pitch amplification', () => {
    // Pure 30 deg yaw about Y
    const yawAngle = (30.0 * Math.PI) / 180.0;
    const qYaw = { x: 0, y: Math.sin(yawAngle / 2), z: 0, w: Math.cos(yawAngle / 2) };

    const out = amplifyWristOrientation(qYaw, { rollGain: 2.0, pitchGain: 2.0 });
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(Math.sin(yawAngle / 2), 5);
    expect(out.z).toBeCloseTo(0, 5);
    expect(out.w).toBeCloseTo(Math.cos(yawAngle / 2), 5);
  });

  it('9. replaceWristPitchRoll replaces measured pitch and roll twist angles independently', () => {
    const qNeutral = { x: 0, y: 0, z: 0, w: 1 };

    // A. Replace pitch with 70 deg
    const qPitched = replaceWristPitchRoll(qNeutral, { pitchDeg: 70.0 });
    const { theta: thetaX1 } = decomposePitchTwist(qPitched);
    expect((thetaX1 * 180) / Math.PI).toBeCloseTo(70.0, 3);
    expect(qPitched.x).toBeCloseTo(Math.sin((35.0 * Math.PI) / 180.0), 5);

    // B. Replace roll with 30 deg
    const qRolled = replaceWristPitchRoll(qNeutral, { rollDeg: 30.0 });
    const { theta: thetaZ2 } = decomposePitchTwist(qRolled);
    expect(qRolled.z).toBeCloseTo(Math.sin((15.0 * Math.PI) / 180.0), 5);

    // C. Replace both pitch (70 deg) and roll (30 deg)
    const qBoth = replaceWristPitchRoll(qNeutral, { pitchDeg: 70.0, rollDeg: 30.0 });
    const details = {};
    amplifyWristOrientation(qBoth, { rollGain: 1.0, pitchGain: 1.0 }, details);
    expect(details.rawPitchDeg).toBeCloseTo(70.0, 3);
    expect(details.rawTwistDeg).toBeCloseTo(30.0, 3);

    // D. No options or null/undefined returns input unchanged
    const qUnchanged = replaceWristPitchRoll(qPitched);
    expect(qUnchanged).toBe(qPitched);

    const qNull = replaceWristPitchRoll(null);
    expect(qNull).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});
