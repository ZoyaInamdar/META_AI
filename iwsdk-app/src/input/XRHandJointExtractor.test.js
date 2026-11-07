/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for XRHandJointExtractor (Person A)
 * ============================================================================
 */

import { describe, it, expect, vi } from 'vitest';
import { extractWristJoint, extractPinchJoints } from './XRHandJointExtractor.js';

describe('XRHandJointExtractor (Person A)', () => {
  // Helper to build a mock XRJointSpace
  const createMockJointSpace = (name) => ({ name, _isJointSpace: true });

  // Helper to build a mock XRHand
  const createMockHand = (joints = {}) => {
    const map = new Map(Object.entries(joints));
    return map;
  };

  // Helper to build a mock XRInputSource
  const createMockInputSource = ({ handedness = 'right', joints = {} } = {}) => {
    const hand = createMockHand(joints);
    return {
      handedness,
      hand,
      targetRayMode: 'tracked-pointer',
    };
  };

  // Helper to build a mock XRFrame
  const createMockFrame = ({ poses = {}, session = null, referenceSpace = null } = {}) => {
    const refSpace = referenceSpace || { _isRefSpace: true };
    return {
      referenceSpace: refSpace,
      session,
      getJointPose: vi.fn((jointSpace, space) => {
        if (!jointSpace || space !== refSpace) return null;
        return poses[jointSpace.name] || null;
      }),
    };
  };

  it('1. extracts valid wrist position, orientation, and radius from an XRFrame', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const mockPose = {
      transform: {
        position: { x: 0.12, y: 1.25, z: -0.45 },
        orientation: { x: 0.0, y: 0.7071, z: 0.0, w: 0.7071 },
      },
      radius: 0.015,
    };

    const frame = createMockFrame({
      poses: { wrist: mockPose },
    });

    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      inputSource,
    });

    expect(result).toBeDefined();
    expect(result.wrist).toBeDefined();
    expect(result.wrist.valid).toBe(true);
    expect(result.wrist.position).toEqual({ x: 0.12, y: 1.25, z: -0.45 });
    expect(result.wrist.quaternion).toEqual({ x: 0.0, y: 0.7071, z: 0.0, w: 0.7071 });
    expect(result.wrist.radius).toBe(0.015);
  });

  it('2. returns null when xrFrame is null or undefined', () => {
    expect(extractWristJoint(null)).toBeNull();
    expect(extractWristJoint(undefined)).toBeNull();
  });

  it('3. returns null when xrFrame does not implement getJointPose', () => {
    expect(extractWristJoint({})).toBeNull();
    expect(extractWristJoint({ someOtherMethod: () => {} })).toBeNull();
  });

  it('4. returns null when referenceSpace is missing and cannot be resolved', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const frameWithoutRefSpace = {
      getJointPose: vi.fn(),
    };

    const result = extractWristJoint(frameWithoutRefSpace, {
      referenceSpace: null,
      inputSource,
    });

    expect(result).toBeNull();
    expect(frameWithoutRefSpace.getJointPose).not.toHaveBeenCalled();
  });

  it('5. returns null when inputSource is missing or has no hand object', () => {
    const frame = createMockFrame();

    expect(extractWristJoint(frame, { inputSource: null })).toBeNull();
    expect(extractWristJoint(frame, { inputSource: { handedness: 'right' } })).toBeNull();
  });

  it('6. returns null when hand has no wrist joint space', () => {
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: {}, // No wrist joint
    });
    const frame = createMockFrame();

    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      inputSource,
    });

    expect(result).toBeNull();
  });

  it('7. returns null when getJointPose returns null (tracking lost)', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const frame = createMockFrame({
      poses: { wrist: null }, // Tracking lost
    });

    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      inputSource,
    });

    expect(result).toBeNull();
  });

  it('8. returns null when position coordinates contain NaN or non-finite values', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const frame = createMockFrame({
      poses: {
        wrist: {
          transform: {
            position: { x: NaN, y: 1.25, z: -0.45 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      },
    });

    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      inputSource,
    });

    expect(result).toBeNull();
  });

  it('9. catches and handles errors thrown by getJointPose safely', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const throwingFrame = {
      referenceSpace: { _isRefSpace: true },
      getJointPose: vi.fn(() => {
        throw new Error('WebXR internal session error');
      }),
    };

    const result = extractWristJoint(throwingFrame, {
      referenceSpace: throwingFrame.referenceSpace,
      inputSource,
    });

    expect(result).toBeNull();
  });

  it('10. resolves inputSource from frame.session.inputSources automatically', () => {
    const wristSpace = createMockJointSpace('wrist');
    const rightHandSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });
    const leftControllerSource = { handedness: 'left', targetRayMode: 'tracked-pointer' };

    const mockPose = {
      transform: {
        position: { x: 0.2, y: 1.1, z: -0.4 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    };

    const frame = createMockFrame({
      poses: { wrist: mockPose },
      session: {
        inputSources: [leftControllerSource, rightHandSource],
      },
    });

    // Notice inputSource is NOT provided in options
    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      hand: 'right',
    });

    expect(result).toBeDefined();
    expect(result.wrist.valid).toBe(true);
    expect(result.wrist.position).toEqual({ x: 0.2, y: 1.1, z: -0.4 });
  });

  it('11. passes pre-resolved joint dictionary through unchanged', () => {
    const preResolved = {
      wrist: {
        position: { x: 0.05, y: 1.2, z: -0.5 },
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
        valid: true,
      },
    };

    const result = extractWristJoint(preResolved);
    expect(result).toBe(preResolved);
  });

  it('12. supports context wrapper object { frame, referenceSpace, inputSource }', () => {
    const wristSpace = createMockJointSpace('wrist');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace },
    });

    const mockPose = {
      transform: {
        position: { x: 0.15, y: 1.3, z: -0.42 },
        orientation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
      },
    };

    const frame = createMockFrame({ poses: { wrist: mockPose } });

    const contextWrapper = {
      frame,
      referenceSpace: frame.referenceSpace,
      inputSource,
    };

    const result = extractWristJoint(contextWrapper);

    expect(result).toBeDefined();
    expect(result.wrist.position).toEqual({ x: 0.15, y: 1.3, z: -0.42 });
  });

  it('13. extracts palm joint when gripSource is palm and palm is available', () => {
    const wristSpace = createMockJointSpace('wrist');
    const palmSpace = createMockJointSpace('palm');
    const inputSource = createMockInputSource({
      handedness: 'right',
      joints: { wrist: wristSpace, palm: palmSpace },
    });

    const wristPose = {
      transform: {
        position: { x: 0.1, y: 1.2, z: -0.4 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    };
    const palmPose = {
      transform: {
        position: { x: 0.12, y: 1.26, z: -0.42 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    };

    const frame = createMockFrame({
      poses: { wrist: wristPose, palm: palmPose },
    });

    const result = extractWristJoint(frame, {
      referenceSpace: frame.referenceSpace,
      inputSource,
      gripSource: 'palm',
    });

    expect(result).toBeDefined();
    expect(result.wrist).toBeDefined();
    expect(result.palm).toBeDefined();
    expect(result.palm.position).toEqual({ x: 0.12, y: 1.26, z: -0.42 });
  });

  describe('extractPinchJoints', () => {
    it('14. extracts valid thumbTip and indexTip and calculates 3D Euclidean distance', () => {
      const thumbSpace = createMockJointSpace('thumb-tip');
      const indexSpace = createMockJointSpace('index-finger-tip');
      const inputSource = createMockInputSource({
        handedness: 'left',
        joints: { 'thumb-tip': thumbSpace, 'index-finger-tip': indexSpace },
      });

      const thumbPose = {
        transform: {
          position: { x: 0.0, y: 1.0, z: 0.0 },
        },
      };
      const indexPose = {
        transform: {
          position: { x: 0.03, y: 1.04, z: 0.0 }, // 3-4-5 triangle -> distance 0.05 m
        },
      };

      const frame = createMockFrame({
        poses: { 'thumb-tip': thumbPose, 'index-finger-tip': indexPose },
      });

      const result = extractPinchJoints(frame, inputSource, frame.referenceSpace);
      expect(result.valid).toBe(true);
      expect(result.thumbTip.position).toEqual({ x: 0, y: 1, z: 0 });
      expect(result.indexTip.position).toEqual({ x: 0.03, y: 1.04, z: 0 });
      expect(result.distance).toBeCloseTo(0.05, 5);
    });

    it('15. returns valid: false when input source or joints are missing', () => {
      const frame = createMockFrame();
      const emptySource = createMockInputSource({ joints: {} });

      const res1 = extractPinchJoints(null, emptySource, frame.referenceSpace);
      expect(res1.valid).toBe(false);

      const res2 = extractPinchJoints(frame, null, frame.referenceSpace);
      expect(res2.valid).toBe(false);

      const res3 = extractPinchJoints(frame, emptySource, frame.referenceSpace);
      expect(res3.valid).toBe(false);
    });

    it('16. returns valid: false when getJointPose returns null or NaN', () => {
      const thumbSpace = createMockJointSpace('thumb-tip');
      const indexSpace = createMockJointSpace('index-finger-tip');
      const inputSource = createMockInputSource({
        handedness: 'left',
        joints: { 'thumb-tip': thumbSpace, 'index-finger-tip': indexSpace },
      });

      const frame = createMockFrame({
        poses: { 'thumb-tip': null, 'index-finger-tip': null },
      });

      const result = extractPinchJoints(frame, inputSource, frame.referenceSpace);
      expect(result.valid).toBe(false);
      expect(result.distance).toBeNull();
    });
  });
});
