/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Wrist-pitch amplification module.
 *
 * Decomposes orientation quaternion via two-tier intrinsic swing-twist decomposition:
 * Tier 1: Extracts roll about local Z (0, 0, 1).
 * Tier 2: On the remaining swing, extracts pitch about local X (1, 0, 0) (crossbar axis).
 *
 * Amplifies pitch by pitchGain with deadzone and [-180°, +180°] clamping,
 * while leaving yaw (horizontal azimuth) completely untouched.
 *
 * Recomposes the output quaternion: normalize(yaw * pitch_amp * roll_amp).
 */

import {
  normalizeQuat,
  canonicalizeQuat,
  multiplyQuat,
  conjugateQuat,
  rotateVectorByQuat,
  decomposeSwingTwist,
  DEFAULT_ROLL_GAIN,
  DEADZONE_RAD as ROLL_DEADZONE_RAD,
  MAX_TWIST_RAD as MAX_ROLL_RAD,
} from './wristRoll.js';

export const DEFAULT_PITCH_GAIN = 2.0;
export const PITCH_DEADZONE_DEG = 2.0;
export const MAX_PITCH_DEG = 180.0;
export const PITCH_DEADZONE_RAD = (PITCH_DEADZONE_DEG * Math.PI) / 180.0;
export const MAX_PITCH_RAD = Math.PI;
export const PITCH_BLEND_DURATION = 0.2; // 200ms blend duration
export const SINGULARITY_EPS = 1e-8;

/**
 * Decomposes quaternion q about local X-axis (1, 0, 0).
 * Projects canonicalized quaternion onto X-W subspace: q = swing * twist_X.
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{
 *   swing: {x: number, y: number, z: number, w: number},
 *   twist: {x: number, y: number, z: number, w: number},
 *   theta: number
 * }}
 */
export function decomposePitchTwist(q) {
  const c = canonicalizeQuat(q);
  const x = c.x;
  const w = c.w;
  const lenSq = x * x + w * w;

  let twist;
  let theta;

  if (lenSq < SINGULARITY_EPS) {
    twist = { x: 0, y: 0, z: 0, w: 1 };
    theta = 0;
  } else {
    const d = Math.sqrt(lenSq);
    twist = { x: x / d, y: 0, z: 0, w: w / d };
    theta = 2 * Math.atan2(twist.x, twist.w);
  }

  // q = swing * twist  =>  swing = q * twist^-1
  const twistInv = { x: -twist.x, y: 0, z: 0, w: twist.w };
  const swing = normalizeQuat(multiplyQuat(c, twistInv));

  return { swing, twist, theta };
}

/**
 * Amplifies pitch about local X-axis with deadzone and [-180°, +180°] clamping.
 *
 * @param {{x: number, y: number, z: number, w: number}} q - Input orientation quaternion
 * @param {number} [gain=DEFAULT_PITCH_GAIN] - Pitch gain multiplier
 * @param {object} [details=null] - Optional diagnostic details collector
 * @returns {{x: number, y: number, z: number, w: number}} Output unit quaternion
 */
export function amplifyWristPitch(q, gain = DEFAULT_PITCH_GAIN, details = null) {
  if (!q) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  const { swing, twist, theta } = decomposePitchTwist(q);

  let thetaAmp;
  const absTheta = Math.abs(theta);

  if (absTheta <= PITCH_DEADZONE_RAD) {
    thetaAmp = theta;
  } else if (Math.abs(gain - 1.0) < 1e-9) {
    thetaAmp = theta;
  } else {
    thetaAmp = Math.max(-MAX_PITCH_RAD, Math.min(MAX_PITCH_RAD, gain * theta));
  }

  const halfAmp = thetaAmp / 2;
  const twistAmp = {
    x: Math.sin(halfAmp),
    y: 0,
    z: 0,
    w: Math.cos(halfAmp),
  };

  const out = normalizeQuat(multiplyQuat(swing, twistAmp));

  if (details && typeof details === 'object') {
    details.rawPitchDeg = (theta * 180) / Math.PI;
    details.amplifiedPitchDeg = (thetaAmp * 180) / Math.PI;
    details.pitchGain = gain;
  }

  return out;
}

/**
 * Combined orientation amplification pipeline decomposing Roll (local Z) and Pitch (local X).
 *
 * Factorization: q = yaw * pitch_X * roll_Z.
 * - Extracts roll about local Z.
 * - On the remaining swing, extracts pitch about local X.
 * - Amplifies roll (gainZ, [-150°, +150°]) and pitch (gainX, [-180°, +180°]).
 * - Leaves yaw (horizontal azimuth) untouched.
 * - Recomposes: normalize(yaw * pitch_amp * roll_amp).
 *
 * @param {{x: number, y: number, z: number, w: number}} q - Input orientation quaternion
 * @param {Object} [options={}]
 * @param {number} [options.rollGain=DEFAULT_ROLL_GAIN]
 * @param {number} [options.pitchGain=DEFAULT_PITCH_GAIN]
 * @param {Object} [details=null] - Optional diagnostic details collector
 * @returns {{x: number, y: number, z: number, w: number}} Unit quaternion
 */
export function amplifyWristOrientation(q, options = {}, details = null) {
  if (!q) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  const rollGain = options.rollGain !== undefined ? options.rollGain : DEFAULT_ROLL_GAIN;
  const pitchGain = options.pitchGain !== undefined ? options.pitchGain : DEFAULT_PITCH_GAIN;

  // 1. Tier 1: Extract roll about local Z
  const { swing, twist: rollTwist, theta: thetaZ } = decomposeSwingTwist(q);

  let thetaZAmp;
  const absThetaZ = Math.abs(thetaZ);
  if (absThetaZ <= ROLL_DEADZONE_RAD) {
    thetaZAmp = thetaZ;
  } else if (Math.abs(rollGain - 1.0) < 1e-9) {
    thetaZAmp = thetaZ;
  } else {
    thetaZAmp = Math.max(-MAX_ROLL_RAD, Math.min(MAX_ROLL_RAD, rollGain * thetaZ));
  }

  const halfRoll = thetaZAmp / 2;
  const rollAmp = {
    x: 0,
    y: 0,
    z: Math.sin(halfRoll),
    w: Math.cos(halfRoll),
  };

  // 2. Tier 2: Extract pitch about local X from swing (which has no Z twist)
  const { swing: yawSwing, twist: pitchTwist, theta: thetaX } = decomposePitchTwist(swing);

  let thetaXAmp;
  const absThetaX = Math.abs(thetaX);
  if (absThetaX <= PITCH_DEADZONE_RAD) {
    thetaXAmp = thetaX;
  } else if (Math.abs(pitchGain - 1.0) < 1e-9) {
    thetaXAmp = thetaX;
  } else {
    thetaXAmp = Math.max(-MAX_PITCH_RAD, Math.min(MAX_PITCH_RAD, pitchGain * thetaX));
  }

  const halfPitch = thetaXAmp / 2;
  const pitchAmp = {
    x: Math.sin(halfPitch),
    y: 0,
    z: 0,
    w: Math.cos(halfPitch),
  };

  // 3. Recompose: yawSwing * pitchAmp * rollAmp
  const pitched = multiplyQuat(yawSwing, pitchAmp);
  const out = normalizeQuat(multiplyQuat(pitched, rollAmp));

  if (details && typeof details === 'object') {
    details.rawTwistDeg = (thetaZ * 180) / Math.PI;
    details.amplifiedTwistDeg = (thetaZAmp * 180) / Math.PI;
    details.rollGain = rollGain;
    details.rawPitchDeg = (thetaX * 180) / Math.PI;
    details.amplifiedPitchDeg = (thetaXAmp * 180) / Math.PI;
    details.pitchGain = pitchGain;
  }

  return out;
}

/**
 * Replaces measured pitch (twist about local X) and/or roll (twist about local Z) in quaternion q.
 * Active exclusively when debug mode overrides are applied.
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @param {Object} [options={}]
 * @param {number|null} [options.pitchDeg=null]
 * @param {number|null} [options.rollDeg=null]
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function replaceWristPitchRoll(q, options = {}) {
  if (!q) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  const pitchDeg = options?.pitchDeg;
  const rollDeg = options?.rollDeg;
  const hasPitch = pitchDeg !== undefined && pitchDeg !== null && Number.isFinite(pitchDeg);
  const hasRoll = rollDeg !== undefined && rollDeg !== null && Number.isFinite(rollDeg);

  if (!hasPitch && !hasRoll) {
    return q;
  }

  const { swing, theta: thetaZ } = decomposeSwingTwist(q);
  const { swing: yawSwing, theta: thetaX } = decomposePitchTwist(swing);

  const newThetaZ = hasRoll ? (rollDeg * Math.PI) / 180.0 : thetaZ;
  const newThetaX = hasPitch ? (pitchDeg * Math.PI) / 180.0 : thetaX;

  const halfRoll = newThetaZ / 2;
  const newRollTwist = {
    x: 0,
    y: 0,
    z: Math.sin(halfRoll),
    w: Math.cos(halfRoll),
  };

  const halfPitch = newThetaX / 2;
  const newPitchTwist = {
    x: Math.sin(halfPitch),
    y: 0,
    z: 0,
    w: Math.cos(halfPitch),
  };

  const pitched = multiplyQuat(yawSwing, newPitchTwist);
  return normalizeQuat(multiplyQuat(pitched, newRollTwist));
}

export {
  normalizeQuat,
  canonicalizeQuat,
  multiplyQuat,
  conjugateQuat,
  rotateVectorByQuat,
  decomposeSwingTwist,
};
