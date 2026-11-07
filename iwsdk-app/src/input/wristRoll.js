/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Wrist-roll amplification module.
 *
 * Decomposes orientation quaternion via swing-twist decomposition about the Ken's
 * local Z-axis (the axis rolling the Big Cup normal (1,0,0) to (0,1,0)),
 * applies an amplification gain with a deadzone and [-150°, +150°] clamping,
 * and recomposes the output quaternion: normalize(swing * twist_amp).
 */

export const DEFAULT_ROLL_GAIN = 2.0;
export const DEADZONE_DEG = 2.0;
export const MAX_TWIST_DEG = 150.0;
export const DEADZONE_RAD = (DEADZONE_DEG * Math.PI) / 180.0;
export const MAX_TWIST_RAD = (MAX_TWIST_DEG * Math.PI) / 180.0;
export const SINGULARITY_EPS = 1e-8;

/**
 * Normalizes a quaternion to unit length.
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function normalizeQuat(q) {
  const x = Number(q?.x ?? 0);
  const y = Number(q?.y ?? 0);
  const z = Number(q?.z ?? 0);
  const w = Number(q?.w ?? 1);
  const len = Math.hypot(x, y, z, w);
  if (len < 1e-12) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  return {
    x: x / len,
    y: y / len,
    z: z / len,
    w: w / len,
  };
}

/**
 * Canonicalizes a quaternion to ensure qw >= 0 (or deterministic sign when qw == 0).
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function canonicalizeQuat(q) {
  const norm = normalizeQuat(q);
  if (
    norm.w < 0 ||
    (norm.w === 0 && (norm.z < 0 || (norm.z === 0 && (norm.y < 0 || (norm.y === 0 && norm.x < 0)))))
  ) {
    return {
      x: -norm.x,
      y: -norm.y,
      z: -norm.z,
      w: -norm.w,
    };
  }
  return norm;
}

/**
 * Multiplies quaternion a by quaternion b (Hamilton product: a * b).
 *
 * @param {{x: number, y: number, z: number, w: number}} a
 * @param {{x: number, y: number, z: number, w: number}} b
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function multiplyQuat(a, b) {
  const ax = a.x ?? 0, ay = a.y ?? 0, az = a.z ?? 0, aw = a.w ?? 1;
  const bx = b.x ?? 0, by = b.y ?? 0, bz = b.z ?? 0, bw = b.w ?? 1;
  return {
    x: aw * bx + ax * bw + ay * bz - az * by,
    y: aw * by - ax * bz + ay * bw + az * bx,
    z: aw * bz + ax * by - ay * bx + az * bw,
    w: aw * bw - ax * bx - ay * by - az * bz,
  };
}

/**
 * Computes conjugate (inverse for unit quaternion) of q.
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{x: number, y: number, z: number, w: number}}
 */
export function conjugateQuat(q) {
  return {
    x: -(q.x ?? 0),
    y: -(q.y ?? 0),
    z: -(q.z ?? 0),
    w: q.w ?? 1,
  };
}

/**
 * Rotates vector v by unit quaternion q: v' = q * v * q^-1.
 *
 * @param {{x: number, y: number, z: number}} v
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{x: number, y: number, z: number}}
 */
export function rotateVectorByQuat(v, q) {
  const qv = { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0, w: 0 };
  const qNorm = normalizeQuat(q);
  const qInv = conjugateQuat(qNorm);
  const res = multiplyQuat(multiplyQuat(qNorm, qv), qInv);
  return { x: res.x, y: res.y, z: res.z };
}

/**
 * Swing-twist decomposition about the Ken's LOCAL Z-axis (0, 0, 1).
 * Decomposes canonicalized q into q = swing * twist, where twist is purely around local Z.
 *
 * @param {{x: number, y: number, z: number, w: number}} q
 * @returns {{
 *   swing: {x: number, y: number, z: number, w: number},
 *   twist: {x: number, y: number, z: number, w: number},
 *   theta: number
 * }}
 */
export function decomposeSwingTwist(q) {
  const c = canonicalizeQuat(q);
  const z = c.z;
  const w = c.w;
  const lenSq = z * z + w * w;

  let twist;
  let theta;

  if (lenSq < SINGULARITY_EPS) {
    twist = { x: 0, y: 0, z: 0, w: 1 };
    theta = 0;
  } else {
    const d = Math.sqrt(lenSq);
    twist = { x: 0, y: 0, z: z / d, w: w / d };
    theta = 2 * Math.atan2(twist.z, twist.w);
  }

  // q = swing * twist  =>  swing = q * twist^-1
  const twistInv = { x: 0, y: 0, z: -twist.z, w: twist.w };
  const swing = normalizeQuat(multiplyQuat(c, twistInv));

  return { swing, twist, theta };
}

/**
 * Decomposes quaternion q into swing and twist about local Z-axis (0, 0, 1),
 * applies roll amplification gain with deadzone and [-150°, +150°] clamping,
 * and recomposes the output orientation as normalize(swing * twist_amp).
 *
 * @param {{x: number, y: number, z: number, w: number}} q - Input orientation quaternion
 * @param {number} [gain=DEFAULT_ROLL_GAIN] - Amplification multiplier
 * @param {object} [details=null] - Optional diagnostic details collector
 * @returns {{x: number, y: number, z: number, w: number}} Amplified unit quaternion
 */
export function amplifyWristRoll(q, gain = DEFAULT_ROLL_GAIN, details = null) {
  if (!q) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  const { swing, twist, theta } = decomposeSwingTwist(q);

  let thetaAmp;
  const absTheta = Math.abs(theta);

  // Deadzone applied to INPUT angle only: if |theta| <= 2 deg, theta_amp = theta (no amplification)
  if (absTheta <= DEADZONE_RAD) {
    thetaAmp = theta;
  } else if (Math.abs(gain - 1.0) < 1e-9) {
    // Gain 1.0 identity preserves input theta exactly
    thetaAmp = theta;
  } else {
    // Otherwise clamp(gain * theta, -150 deg, +150 deg)
    const scaled = gain * theta;
    thetaAmp = Math.max(-MAX_TWIST_RAD, Math.min(MAX_TWIST_RAD, scaled));
  }

  const halfAmp = thetaAmp / 2;
  const twistAmp = {
    x: 0,
    y: 0,
    z: Math.sin(halfAmp),
    w: Math.cos(halfAmp),
  };

  let out = normalizeQuat(multiplyQuat(swing, twistAmp));

  // Preserve input hemisphere convention if input had negative w
  if ((q.w ?? 1) < 0) {
    out = { x: -out.x, y: -out.y, z: -out.z, w: -out.w };
  }

  if (details && typeof details === 'object') {
    details.rawTwistRad = theta;
    details.rawTwistDeg = (theta * 180) / Math.PI;
    details.amplifiedTwistRad = thetaAmp;
    details.amplifiedTwistDeg = (thetaAmp * 180) / Math.PI;
    details.gain = gain;
    details.swing = swing;
    details.twist = twist;
    details.twistAmp = twistAmp;
  }

  return out;
}
