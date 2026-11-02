/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for HandPoseAdapter
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    HandPoseAdapter,
    DEFAULT_KEN_POSITION,
    DEFAULT_KEN_QUATERNION,
} from './HandPoseAdapter.js';

describe('HandPoseAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new HandPoseAdapter({ hand: 'right', gripSource: 'wrist', lostFrameLimit: 6 });
    });

    it('pose passes through unchanged when valid', () => {
        const rawJoints = {
            wrist: {
                position: { x: 0.12, y: 1.34, z: -0.42 },
                quaternion: { x: 0.0, y: 0.0, z: 0.0, w: 1.0 },
                valid: true,
                radius: 0.012,
            },
        };

        const pose = adapter.update(0.016, rawJoints);

        expect(pose.position.x).toBeCloseTo(0.12, 6);
        expect(pose.position.y).toBeCloseTo(1.34, 6);
        expect(pose.position.z).toBeCloseTo(-0.42, 6);
        expect(pose.quaternion.x).toBeCloseTo(0.0, 6);
        expect(pose.quaternion.y).toBeCloseTo(0.0, 6);
        expect(pose.quaternion.z).toBeCloseTo(0.0, 6);
        expect(pose.quaternion.w).toBeCloseTo(1.0, 6);
        expect(pose.x).toBeCloseTo(0.12, 6);
        expect(pose.y).toBeCloseTo(1.34, 6);
        expect(pose.z).toBeCloseTo(-0.42, 6);

        expect(pose.isTrackingValid).toBe(true);
        expect(pose.trackingConfidence).toBe(1.0);
        expect(pose.lostFrames).toBe(0);
    });

    it('quaternion normalised', () => {
        // Pass unnormalized quaternion: length = sqrt(0^2 + 3^2 + 4^2 + 0^2) = 5.0
        const joints = {
            wrist: {
                position: { x: 0.0, y: 1.0, z: 0.0 },
                quaternion: { x: 0.0, y: 3.0, z: 4.0, w: 0.0 },
                valid: true,
            },
        };

        const pose = adapter.update(0.016, joints);

        // Magnitude should be strictly 1.0
        const mag = Math.hypot(
            pose.quaternion.x,
            pose.quaternion.y,
            pose.quaternion.z,
            pose.quaternion.w
        );
        expect(mag).toBeCloseTo(1.0, 6);
        expect(pose.quaternion.y).toBeCloseTo(0.6, 6);
        expect(pose.quaternion.z).toBeCloseTo(0.8, 6);
    });

    it('first frame velocity is zero', () => {
        const joints = {
            wrist: {
                position: { x: 1.5, y: 2.5, z: -3.5 },
                quaternion: { x: 0, y: 0, z: 0, w: 1 },
                valid: true,
            },
        };

        const pose = adapter.update(0.016, joints);

        expect(pose.linearVelocity).toEqual({ x: 0.0, y: 0.0, z: 0.0 });
    });

    it('velocity equals delta/dt', () => {
        const dt = 0.1; // 100 ms

        // Frame 1
        adapter.update(dt, {
            wrist: {
                position: { x: 0.0, y: 1.0, z: 0.0 },
                valid: true,
            },
        });

        // Frame 2: position shifts by +0.1 in X, +0.2 in Y, -0.3 in Z
        const pose2 = adapter.update(dt, {
            wrist: {
                position: { x: 0.1, y: 1.2, z: -0.3 },
                valid: true,
            },
        });

        // Velocity = delta / dt
        expect(pose2.linearVelocity.x).toBeCloseTo(1.0, 6);  // (0.1 - 0.0) / 0.1 = 1.0
        expect(pose2.linearVelocity.y).toBeCloseTo(2.0, 6);  // (1.2 - 1.0) / 0.1 = 2.0
        expect(pose2.linearVelocity.z).toBeCloseTo(-3.0, 6); // (-0.3 - 0.0) / 0.1 = -3.0
    });

    it('lost tracking holds the last pose and flags isTrackingValid=false', () => {
        // Frame 1: Valid pose
        const lastValid = { x: 0.25, y: 1.45, z: -0.35 };
        adapter.update(0.016, {
            wrist: {
                position: lastValid,
                quaternion: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
                valid: true,
            },
        });

        // Frame 2: Tracking lost (joints is null)
        const lostPose = adapter.update(0.016, null);

        expect(lostPose.isTrackingValid).toBe(false);
        expect(lostPose.lostFrames).toBe(1);
        expect(lostPose.position.x).toBeCloseTo(lastValid.x, 6);
        expect(lostPose.position.y).toBeCloseTo(lastValid.y, 6);
        expect(lostPose.position.z).toBeCloseTo(lastValid.z, 6);
        expect(lostPose.linearVelocity).toEqual({ x: 0.0, y: 0.0, z: 0.0 });

        // Frame 3: Tracking lost via valid=false
        const lostPose2 = adapter.update(0.016, {
            wrist: {
                position: { x: 99.0, y: 99.0, z: 99.0 },
                valid: false,
            },
        });

        expect(lostPose2.isTrackingValid).toBe(false);
        expect(lostPose2.lostFrames).toBe(2);
        // Still retains the original last valid pose, ignoring corrupted (99,99,99)
        expect(lostPose2.position.x).toBeCloseTo(lastValid.x, 6);
        expect(lostPose2.position.y).toBeCloseTo(lastValid.y, 6);
        expect(lostPose2.position.z).toBeCloseTo(lastValid.z, 6);
    });

    it('confidence reaches 0 after lostFrameLimit frames', () => {
        const lostLimit = 4;
        const testAdapter = new HandPoseAdapter({ lostFrameLimit: lostLimit });

        // Establish initial tracking
        testAdapter.update(0.016, {
            wrist: { position: { x: 0, y: 1, z: 0 }, valid: true },
        });
        expect(testAdapter.trackingConfidence).toBe(1.0);

        // Frame 1 lost: 1 - 1/4 = 0.75
        const p1 = testAdapter.update(0.016, null);
        expect(p1.lostFrames).toBe(1);
        expect(p1.trackingConfidence).toBeCloseTo(0.75, 6);

        // Frame 2 lost: 1 - 2/4 = 0.50
        const p2 = testAdapter.update(0.016, null);
        expect(p2.lostFrames).toBe(2);
        expect(p2.trackingConfidence).toBeCloseTo(0.50, 6);

        // Frame 3 lost: 1 - 3/4 = 0.25
        const p3 = testAdapter.update(0.016, null);
        expect(p3.lostFrames).toBe(3);
        expect(p3.trackingConfidence).toBeCloseTo(0.25, 6);

        // Frame 4 lost: reaches 0
        const p4 = testAdapter.update(0.016, null);
        expect(p4.lostFrames).toBe(4);
        expect(p4.trackingConfidence).toBe(0.0);

        // Frame 5 lost: stays clamped at 0
        const p5 = testAdapter.update(0.016, null);
        expect(p5.lostFrames).toBe(5);
        expect(p5.trackingConfidence).toBe(0.0);
    });

    it('recovery clears the velocity spike', () => {
        // Frame 1: Valid at (0, 1, 0)
        adapter.update(0.016, {
            wrist: { position: { x: 0.0, y: 1.0, z: 0.0 }, valid: true },
        });

        // Frame 2-3: Tracking lost
        adapter.update(0.016, null);
        adapter.update(0.016, null);
        expect(adapter.isTrackingValid).toBe(false);

        // Frame 4: Tracking returns far away at (5.0, 5.0, 5.0)
        const recoveredPose = adapter.update(0.016, {
            wrist: { position: { x: 5.0, y: 5.0, z: 5.0 }, valid: true },
        });

        expect(recoveredPose.isTrackingValid).toBe(true);
        expect(recoveredPose.trackingConfidence).toBe(1.0);
        expect(recoveredPose.lostFrames).toBe(0);
        // Velocity must be ZERO to prevent massive velocity spike
        expect(recoveredPose.linearVelocity).toEqual({ x: 0.0, y: 0.0, z: 0.0 });

        // Frame 5: Next normal frame moving +0.1 in X
        const nextPose = adapter.update(0.1, {
            wrist: { position: { x: 5.1, y: 5.0, z: 5.0 }, valid: true },
        });
        expect(nextPose.linearVelocity.x).toBeCloseTo(1.0, 6);
        expect(nextPose.linearVelocity.y).toBeCloseTo(0.0, 6);
    });

    it('gripSource "palm" with and without a palm joint', () => {
        const palmAdapter = new HandPoseAdapter({ gripSource: 'palm' });

        // Case A: Palm joint present -> use palm position
        const jointsWithPalm = {
            wrist: { position: { x: 0.0, y: 1.0, z: 0.0 }, valid: true },
            palm: { position: { x: 0.02, y: 1.05, z: -0.01 }, valid: true },
        };
        const poseA = palmAdapter.update(0.016, jointsWithPalm);
        expect(poseA.position.x).toBeCloseTo(0.02, 6);
        expect(poseA.position.y).toBeCloseTo(1.05, 6);
        expect(poseA.position.z).toBeCloseTo(-0.01, 6);

        // Case B: Palm joint absent -> fallback to wrist position
        const jointsWithoutPalm = {
            wrist: { position: { x: 0.10, y: 1.20, z: -0.30 }, valid: true },
        };
        const poseB = palmAdapter.update(0.016, jointsWithoutPalm);
        expect(poseB.position.x).toBeCloseTo(0.10, 6);
        expect(poseB.position.y).toBeCloseTo(1.20, 6);
        expect(poseB.position.z).toBeCloseTo(-0.30, 6);
    });

    it('null joints on the very first frame returns a safe default pose with isTrackingValid=false and no NaN', () => {
        const freshAdapter = new HandPoseAdapter();

        const pose = freshAdapter.update(0.016, null);

        expect(pose.isTrackingValid).toBe(false);
        expect(pose.trackingConfidence).toBe(0.0);
        expect(pose.lostFrames).toBe(1);

        // Matches safe default Ken position and quaternion
        expect(pose.position.x).toBe(DEFAULT_KEN_POSITION.x);
        expect(pose.position.y).toBe(DEFAULT_KEN_POSITION.y);
        expect(pose.position.z).toBe(DEFAULT_KEN_POSITION.z);
        expect(pose.quaternion.w).toBe(DEFAULT_KEN_QUATERNION.w);

        // Verify zero velocity
        expect(pose.linearVelocity).toEqual({ x: 0.0, y: 0.0, z: 0.0 });

        // Check for NaN anywhere in the output
        expect(Number.isNaN(pose.position.x)).toBe(false);
        expect(Number.isNaN(pose.position.y)).toBe(false);
        expect(Number.isNaN(pose.position.z)).toBe(false);
        expect(Number.isNaN(pose.quaternion.x)).toBe(false);
        expect(Number.isNaN(pose.quaternion.y)).toBe(false);
        expect(Number.isNaN(pose.quaternion.z)).toBe(false);
        expect(Number.isNaN(pose.quaternion.w)).toBe(false);
        expect(Number.isNaN(pose.rotation.x)).toBe(false);
        expect(Number.isNaN(pose.rotation.y)).toBe(false);
        expect(Number.isNaN(pose.rotation.z)).toBe(false);
        expect(Number.isNaN(pose.linearVelocity.x)).toBe(false);
        expect(Number.isNaN(pose.linearVelocity.y)).toBe(false);
        expect(Number.isNaN(pose.linearVelocity.z)).toBe(false);
        expect(Number.isNaN(pose.trackingConfidence)).toBe(false);
    });

    it('inputs are not mutated', () => {
        const inputWristPos = { x: 0.15, y: 1.25, z: -0.45 };
        const inputWristQuat = { x: 0.0, y: 2.0, z: 0.0, w: 0.0 }; // unnormalized
        const inputJoints = {
            wrist: {
                position: inputWristPos,
                quaternion: inputWristQuat,
                valid: true,
            },
        };

        // Freeze input objects to guarantee no mutation occurs
        Object.freeze(inputWristPos);
        Object.freeze(inputWristQuat);
        Object.freeze(inputJoints.wrist);
        Object.freeze(inputJoints);

        expect(() => {
            adapter.update(0.016, inputJoints);
        }).not.toThrow();

        // Verify input quaternion values remained unmutated
        expect(inputWristQuat.y).toBe(2.0);
        expect(inputWristQuat.w).toBe(0.0);
        expect(inputWristPos.x).toBe(0.15);
    });
});
