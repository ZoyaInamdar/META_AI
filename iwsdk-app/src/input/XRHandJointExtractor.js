/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - XRHandJointExtractor
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Pure extraction logic bridging WebXR XRFrame & XRHand joint spaces
 * into the normalized joint dictionary expected by HandPoseAdapter.
 */

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
 * Extracts a normalized joint dictionary from an XRFrame and reference space.
 *
 * @param {any} xrFrameOrContext - WebXR XRFrame, context object, or pre-resolved joints
 * @param {Object} [options={}]
 * @param {any} [options.referenceSpace=null] - XRReferenceSpace
 * @param {any} [options.inputSource=null] - XRInputSource
 * @param {'left'|'right'} [options.hand='right'] - Handedness filter
 * @param {'wrist'|'palm'} [options.gripSource='wrist'] - Grip joint source
 * @param {any} [options.world=null] - Optional IWSDK World
 * @returns {{
 *   wrist?: { position: { x: number, y: number, z: number }, quaternion: { x: number, y: number, z: number, w: number }, valid: boolean, radius?: number },
 *   palm?: { position: { x: number, y: number, z: number }, quaternion: { x: number, y: number, z: number, w: number }, valid: boolean, radius?: number }
 * } | null}
 */
export function extractWristJoint(xrFrameOrContext, options = {}) {
  if (!xrFrameOrContext) {
    return null;
  }

  // Fast path: already a resolved joint dictionary
  if (typeof xrFrameOrContext === 'object' && xrFrameOrContext.wrist !== undefined) {
    return xrFrameOrContext;
  }

  let frame = xrFrameOrContext;
  let refSpace = options.referenceSpace || null;
  let inputSource = options.inputSource || null;
  let hand = options.hand || 'right';
  let gripSource = options.gripSource || 'wrist';
  const world = options.world || null;

  // Check if xrFrameOrContext is a context wrapper object { frame, referenceSpace, inputSource, ... }
  if (typeof xrFrameOrContext === 'object' && typeof xrFrameOrContext.getJointPose !== 'function') {
    if (xrFrameOrContext.frame && typeof xrFrameOrContext.frame.getJointPose === 'function') {
      frame = xrFrameOrContext.frame;
      if (!refSpace && xrFrameOrContext.referenceSpace) refSpace = xrFrameOrContext.referenceSpace;
      if (!inputSource && xrFrameOrContext.inputSource) inputSource = xrFrameOrContext.inputSource;
      if (xrFrameOrContext.hand) hand = xrFrameOrContext.hand;
      if (xrFrameOrContext.gripSource) gripSource = xrFrameOrContext.gripSource;
    } else if (xrFrameOrContext.xrFrame && typeof xrFrameOrContext.xrFrame.getJointPose === 'function') {
      frame = xrFrameOrContext.xrFrame;
      if (!refSpace && xrFrameOrContext.referenceSpace) refSpace = xrFrameOrContext.referenceSpace;
      if (!inputSource && xrFrameOrContext.inputSource) inputSource = xrFrameOrContext.inputSource;
      if (xrFrameOrContext.hand) hand = xrFrameOrContext.hand;
      if (xrFrameOrContext.gripSource) gripSource = xrFrameOrContext.gripSource;
    } else {
      return null;
    }
  }

  if (!frame || typeof frame.getJointPose !== 'function') {
    return null;
  }

  // Resolve reference space
  if (!refSpace) {
    refSpace = frame.referenceSpace ||
      frame.session?.referenceSpace ||
      world?.xrReferenceSpace ||
      null;
  }
  if (!refSpace) {
    return null;
  }

  // Resolve hand input source
  if (!inputSource) {
    if (world?.input?.xr?.getPrimaryInputSource) {
      inputSource = world.input.xr.getPrimaryInputSource(hand);
    } else if (frame.session?.inputSources) {
      for (const src of frame.session.inputSources) {
        if (src && src.hand && (src.handedness === hand || src.handedness === 'none')) {
          inputSource = src;
          break;
        }
      }
      if (!inputSource) {
        for (const src of frame.session.inputSources) {
          if (src && src.hand) {
            inputSource = src;
            break;
          }
        }
      }
    }
  }

  if (!inputSource || !inputSource.hand) {
    return null;
  }

  const xrHand = inputSource.hand;
  const wristJoint = typeof xrHand.get === 'function'
    ? xrHand.get('wrist')
    : xrHand['wrist'];

  if (!wristJoint) {
    return null;
  }

  let wristPose = null;
  try {
    wristPose = frame.getJointPose(wristJoint, refSpace);
  } catch {
    return null;
  }

  if (!wristPose || !wristPose.transform) {
    return null;
  }

  const pos = wristPose.transform.position;
  const rot = wristPose.transform.orientation;

  if (!isFiniteVec3(pos)) {
    return null;
  }

  const joints = {
    wrist: {
      position: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
      quaternion: {
        x: Number.isFinite(rot?.x) ? rot.x : 0.0,
        y: Number.isFinite(rot?.y) ? rot.y : 0.0,
        z: Number.isFinite(rot?.z) ? rot.z : 0.0,
        w: Number.isFinite(rot?.w) ? rot.w : 1.0,
      },
      valid: true,
      radius: Number.isFinite(wristPose.radius) ? wristPose.radius : 0.01,
    },
  };

  // Optional palm joint extraction if available and requested
  if (gripSource === 'palm') {
    const palmJoint = typeof xrHand.get === 'function'
      ? xrHand.get('palm')
      : xrHand['palm'];
    if (palmJoint) {
      try {
        const palmPose = frame.getJointPose(palmJoint, refSpace);
        if (palmPose && palmPose.transform?.position) {
          const pPos = palmPose.transform.position;
          const pRot = palmPose.transform.orientation;
          if (isFiniteVec3(pPos)) {
            joints.palm = {
              position: { x: pPos.x, y: pPos.y, z: pPos.z },
              quaternion: {
                x: Number.isFinite(pRot?.x) ? pRot.x : 0.0,
                y: Number.isFinite(pRot?.y) ? pRot.y : 0.0,
                z: Number.isFinite(pRot?.z) ? pRot.z : 0.0,
                w: Number.isFinite(pRot?.w) ? pRot.w : 1.0,
              },
              valid: true,
              radius: Number.isFinite(palmPose.radius) ? palmPose.radius : 0.01,
            };
          }
        }
      } catch {
        // Fall back gracefully to wrist
      }
    }
  }

  return joints;
}

/**
 * Extracts thumb-tip and index-finger-tip poses from a given input source and computes pinch distance.
 *
 * @param {any} frame - WebXR XRFrame
 * @param {any} inputSource - WebXR XRInputSource
 * @param {any} referenceSpace - XRReferenceSpace
 * @returns {{
 *   thumbTip: { position: { x: number, y: number, z: number }, valid: boolean } | null,
 *   indexTip: { position: { x: number, y: number, z: number }, valid: boolean } | null,
 *   distance: number | null,
 *   valid: boolean
 * }}
 */
export function extractPinchJoints(frame, inputSource, referenceSpace) {
  const invalidResult = {
    thumbTip: null,
    indexTip: null,
    distance: null,
    valid: false,
  };

  if (!frame || typeof frame.getJointPose !== 'function' || !referenceSpace) {
    return invalidResult;
  }

  if (!inputSource || !inputSource.hand) {
    return invalidResult;
  }

  const xrHand = inputSource.hand;
  const thumbJoint = typeof xrHand.get === 'function'
    ? xrHand.get('thumb-tip')
    : xrHand['thumb-tip'];

  const indexJoint = typeof xrHand.get === 'function'
    ? xrHand.get('index-finger-tip')
    : xrHand['index-finger-tip'];

  if (!thumbJoint || !indexJoint) {
    return invalidResult;
  }

  let thumbPose = null;
  let indexPose = null;
  try {
    thumbPose = frame.getJointPose(thumbJoint, referenceSpace);
    indexPose = frame.getJointPose(indexJoint, referenceSpace);
  } catch {
    return invalidResult;
  }

  if (!thumbPose || !thumbPose.transform || !indexPose || !indexPose.transform) {
    return invalidResult;
  }

  const tPos = thumbPose.transform.position;
  const iPos = indexPose.transform.position;

  if (!isFiniteVec3(tPos) || !isFiniteVec3(iPos)) {
    return invalidResult;
  }

  const dx = tPos.x - iPos.x;
  const dy = tPos.y - iPos.y;
  const dz = tPos.z - iPos.z;
  const distance = Math.hypot(dx, dy, dz);

  return {
    thumbTip: {
      position: { x: tPos.x, y: tPos.y, z: tPos.z },
      valid: true,
    },
    indexTip: {
      position: { x: iPos.x, y: iPos.y, z: iPos.z },
      valid: true,
    },
    distance,
    valid: true,
  };
}

export default extractWristJoint;
