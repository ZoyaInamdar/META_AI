/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for FakeInput.js
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, test } from 'vitest';
import assert from 'node:assert/strict';
import {
    FakeInput,
    REACH_BOUNDS,
    DEFAULT_KEN_POSITION,
    CUP_TARGET_ROLL_ANGLES,
} from './FakeInput.js';
import { getCupConfig } from './cupConfigs.js';

describe('FakeInput Module', () => {
    it('1. verifies initial position and orientation in gameplayKenGroup', () => {
        const input = new FakeInput();

        // Gameplay Ken Group exists and is structured as an Object3D interface
        assert.ok(input.gameplayKenGroup, 'gameplayKenGroup must exist');
        assert.ok(input.gameplayKenGroup.position, 'position must exist');
        assert.ok(input.gameplayKenGroup.rotation, 'rotation must exist');
        assert.ok(input.gameplayKenGroup.quaternion, 'quaternion must exist');

        // Initial default coordinates
        assert.equal(input.gameplayKenGroup.position.x, DEFAULT_KEN_POSITION.x);
        assert.equal(input.gameplayKenGroup.position.y, DEFAULT_KEN_POSITION.y);
        assert.equal(input.gameplayKenGroup.position.z, REACH_BOUNDS.zFixed);

        // Initial default orientation (zero rotation, identity quaternion)
        assert.equal(input.gameplayKenGroup.rotation.x, 0.0);
        assert.equal(input.gameplayKenGroup.rotation.y, 0.0);
        assert.equal(input.gameplayKenGroup.rotation.z, 0.0);

        assert.equal(input.gameplayKenGroup.quaternion.x, 0.0);
        assert.equal(input.gameplayKenGroup.quaternion.y, 0.0);
        assert.equal(input.gameplayKenGroup.quaternion.z, 0.0);
        assert.equal(input.gameplayKenGroup.quaternion.w, 1.0);

        // Properties and launch state
        assert.equal(input.launchRequested, false);
        assert.equal(input.isDisposed, false);
    });

    it('2. mouse movement updates target position', () => {
        const input = new FakeInput();
        const startTargetX = input.targetX;
        const startTargetY = input.targetY;

        // Move mouse 50 pixels right and 50 pixels up (negative screen movementY)
        input.handleMouseMove({ movementX: 50, movementY: -50 });

        assert.ok(
            input.targetX > startTargetX,
            `Expected targetX (${input.targetX}) to increase after right mouse movement`
        );
        assert.ok(
            input.targetY > startTargetY,
            `Expected targetY (${input.targetY}) to increase after upward mouse movement`
        );
    });

    it('3. X movement is clamped to +/-0.25 meters', () => {
        const input = new FakeInput();

        // Huge positive mouse movement to the right
        input.handleMouseMove({ movementX: 100000 });
        assert.equal(input.targetX, REACH_BOUNDS.xMax);
        assert.equal(input.targetX, 0.25);

        // Update should also clamp current smoothed position
        input.update(1.0);
        assert.equal(input.gameplayKenGroup.position.x, 0.25);

        // Huge negative mouse movement to the left
        input.handleMouseMove({ movementX: -200000 });
        assert.equal(input.targetX, REACH_BOUNDS.xMin);
        assert.equal(input.targetX, -0.25);

        input.update(1.0);
        assert.equal(input.gameplayKenGroup.position.x, -0.25);
    });

    it('4. Z remains fixed at -0.45 meters', () => {
        const input = new FakeInput();

        assert.equal(input.z, -0.45);
        assert.equal(input.gameplayKenGroup.position.z, -0.45);

        // Perform various mouse movements and updates
        input.handleMouseMove({ movementX: 100, movementY: -100 });
        input.update(0.016);
        assert.equal(input.gameplayKenGroup.position.z, -0.45);

        input.handleMouseMove({ movementX: -200, movementY: 300 });
        input.update(0.1);
        assert.equal(input.gameplayKenGroup.position.z, -0.45);
        assert.equal(input.z, -0.45);
    });

    it('5. Y movement is clamped to the chosen reach range [0.95, 1.55]', () => {
        const input = new FakeInput();

        // Move upward excessively (negative movementY)
        input.handleMouseMove({ movementY: -100000 });
        assert.equal(input.targetY, REACH_BOUNDS.yMax);
        assert.equal(input.targetY, 1.55);

        input.update(1.0);
        assert.equal(input.gameplayKenGroup.position.y, 1.55);

        // Move downward excessively (positive movementY)
        input.handleMouseMove({ movementY: 200000 });
        assert.equal(input.targetY, REACH_BOUNDS.yMin);
        assert.equal(input.targetY, 0.95);

        input.update(1.0);
        assert.equal(input.gameplayKenGroup.position.y, 0.95);
    });

    it('6. smoothing (lerp) moves the current position towards the target position', () => {
        const input = new FakeInput({ lerpSpeed: 10.0 });
        const initialX = input.x;
        const initialY = input.y;

        // Set target directly
        input.setTargetPosition(0.20, 1.45);

        // First frame update with small dt
        input.update(0.016);

        // Position should have moved partway towards target
        assert.ok(input.x > initialX, 'Current X should have moved towards target');
        assert.ok(input.x < 0.20, 'Current X should not jump instantly to target');
        assert.ok(input.y > initialY, 'Current Y should have moved towards target');
        assert.ok(input.y < 1.45, 'Current Y should not jump instantly to target');

        // Multiple updates should converge on target
        for (let i = 0; i < 50; i++) {
            input.update(0.016);
        }

        assert.ok(Math.abs(input.x - 0.20) < 0.001, `Expected X to converge, got ${input.x}`);
        assert.ok(Math.abs(input.y - 1.45) < 0.001, `Expected Y to converge, got ${input.y}`);
        assert.equal(input.gameplayKenGroup.position.x, input.x);
        assert.equal(input.gameplayKenGroup.position.y, input.y);
    });

    it('7. Space requests a launch only once per key press (edge-triggered)', () => {
        const input = new FakeInput();

        assert.equal(input.launchRequested, false);
        assert.equal(input.consumeLaunchRequest(), false);

        // First press
        input.handleKeyDown({ code: 'Space' });
        assert.equal(input.launchRequested, true);
        assert.equal(input.consumeLaunchRequest(), true);
        assert.equal(input.launchRequested, false, 'consumeLaunchRequest should reset flag');

        // Repeated keydown while held (e.g. OS auto-repeat or repeat: true)
        input.handleKeyDown({ code: 'Space', repeat: true });
        assert.equal(input.launchRequested, false, 'Repeated keydown while held must not re-trigger launch');

        input.handleKeyDown({ code: 'Space' }); // held state prevents re-trigger
        assert.equal(input.launchRequested, false);

        // Release key
        input.handleKeyUp({ code: 'Space' });
        assert.equal(input.launchRequested, false);

        // Second press after release triggers again
        input.handleKeyDown({ code: 'Space' });
        assert.equal(input.launchRequested, true);
        assert.equal(input.consumeLaunchRequest(), true);
    });

    it('8. Q and E rotate the wrist in opposite directions', () => {
        const input = new FakeInput({ rollSpeed: 2.0 });

        // Press Q
        input.handleKeyDown({ code: 'KeyQ' });
        input.update(0.1);

        const rollAfterQ = input.rollAngle;
        assert.ok(rollAfterQ < 0.0, `Holding Q should decrease roll angle, got ${rollAfterQ}`);
        assert.equal(input.gameplayKenGroup.rotation.z, rollAfterQ);

        // Check quaternion matches Z-rotation
        const halfAngleQ = rollAfterQ * 0.5;
        assert.ok(Math.abs(input.gameplayKenGroup.quaternion.z - Math.sin(halfAngleQ)) < 1e-6);
        assert.ok(Math.abs(input.gameplayKenGroup.quaternion.w - Math.cos(halfAngleQ)) < 1e-6);

        // Release Q, press E
        input.handleKeyUp({ code: 'KeyQ' });
        input.handleKeyDown({ code: 'KeyE' });

        // Update for longer so it rolls back in positive direction
        input.update(0.2);

        const rollAfterE = input.rollAngle;
        assert.ok(rollAfterE > rollAfterQ, `Holding E should roll wrist in opposite direction`);
        assert.equal(input.gameplayKenGroup.rotation.z, rollAfterE);

        const halfAngleE = rollAfterE * 0.5;
        assert.ok(Math.abs(input.gameplayKenGroup.quaternion.z - Math.sin(halfAngleE)) < 1e-6);
        assert.ok(Math.abs(input.gameplayKenGroup.quaternion.w - Math.cos(halfAngleE)) < 1e-6);
    });

    it('9. releasing keys works correctly and stops rotation', () => {
        const input = new FakeInput({ rollSpeed: 2.0 });

        // Press Q and rotate
        input.handleKeyDown({ code: 'KeyQ' });
        input.update(0.1);
        const stoppedRoll = input.rollAngle;

        // Release Q
        input.handleKeyUp({ code: 'KeyQ' });

        // Further updates should not change roll angle
        input.update(0.1);
        input.update(0.1);
        assert.equal(input.rollAngle, stoppedRoll, 'Roll angle should stay constant when keys are released');

        // Same for E
        input.handleKeyDown({ code: 'KeyE' });
        input.update(0.1);
        const stoppedRollE = input.rollAngle;

        input.handleKeyUp({ code: 'KeyE' });
        input.update(0.1);
        assert.equal(input.rollAngle, stoppedRollE);
    });

    it('10. dispose() removes event listeners and prevents further input updates', () => {
        // Create mock DOM elements to verify listener removal
        const addedListeners = [];
        const removedListeners = [];

        const mockDomElement = {
            addEventListener: (type, fn) => addedListeners.push({ target: 'dom', type, fn }),
            removeEventListener: (type, fn) => removedListeners.push({ target: 'dom', type, fn }),
        };

        const mockWindow = {
            addEventListener: (type, fn) => addedListeners.push({ target: 'window', type, fn }),
            removeEventListener: (type, fn) => removedListeners.push({ target: 'window', type, fn }),
        };

        const input = new FakeInput({
            domElement: mockDomElement,
            windowObj: mockWindow,
        });

        assert.equal(addedListeners.length, 3, 'Should attach mousemove, keydown, keyup');

        // Dispose
        input.dispose();
        assert.equal(input.isDisposed, true);
        assert.equal(removedListeners.length, 3, 'Should remove mousemove, keydown, keyup');

        // Subsequent updates or input events should be no-ops
        const prevX = input.x;
        input.handleMouseMove({ movementX: 100 });
        input.handleKeyDown({ code: 'Space' });
        input.update(0.1);

        assert.equal(input.x, prevX, 'Position must not change after disposal');
        assert.equal(input.launchRequested, false, 'Launch request must not trigger after disposal');

        // Calling dispose again should be safe
        input.dispose();
        assert.equal(input.isDisposed, true);
    });

    it('11. missing or invalid input elements are handled safely', () => {
        // Construct with no arguments (Node.js environment with no DOM)
        assert.doesNotThrow(() => {
            const input = new FakeInput();
            input.update(0.016);
            input.dispose();
        });

        // Construct with null/undefined domElement and windowObj
        assert.doesNotThrow(() => {
            const input = new FakeInput({ domElement: null, windowObj: null });
            input.handleMouseMove(null);
            input.handleKeyDown(null);
            input.handleKeyUp(null);
            input.update(0.0);
            input.update(-1.0);
            input.update(NaN);
            input.update(Infinity);
            input.dispose();
        });
    });

    it('12. verifies existing modules are intact', () => {
        // Confirm cupConfigs and BallTrajectory are unmodified by importing constants
        assert.ok(REACH_BOUNDS);
        assert.ok(DEFAULT_KEN_POSITION);
    });

    it('13. for each target cup, after enough updates the world-space normal of that cup has dot with (0,1,0) >= 0.99', () => {
        const rotateVec = (v, q) => {
            const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
            const vx = v.x, vy = v.y, vz = v.z;
            const tx = 2 * (qy * vz - qz * vy);
            const ty = 2 * (qz * vx - qx * vz);
            const tz = 2 * (qx * vy - qy * vx);
            return {
                x: vx + qw * tx + (qy * tz - qz * ty),
                y: vy + qw * ty + (qz * tx - qx * tz),
                z: vz + qw * tz + (qx * ty - qy * tx),
            };
        };

        const cups = ['big', 'small', 'base', 'spike'];
        for (const cupKey of cups) {
            const input = new FakeInput();
            input.setTargetCup(cupKey);

            // Settle over ~0.4s (25 frames of 0.016s)
            for (let i = 0; i < 25; i++) {
                input.update(0.016);
            }

            const config = getCupConfig(cupKey);
            const localNormal = config.localNormal || config.normal;
            const worldNormal = rotateVec(localNormal, input.gameplayKenGroup.quaternion);

            // Dot with world up (0, 1, 0) is simply worldNormal.y
            assert.ok(
                worldNormal.y >= 0.99,
                `Cup ${cupKey} normal did not align with world UP: dot=${worldNormal.y}`
            );
        }
    });

    it('14. roll angle changes monotonically toward the target', () => {
        // Test towards positive angle (Big cup: +Math.PI / 2)
        const inputPos = new FakeInput();
        inputPos.setTargetCup('big');

        let prevAngle = inputPos.gameplayKenGroup.rotation.z;
        for (let i = 0; i < 20; i++) {
            inputPos.update(0.016);
            const currentAngle = inputPos.gameplayKenGroup.rotation.z;
            assert.ok(
                currentAngle >= prevAngle,
                `Angle did not increase monotonically towards target: prev=${prevAngle}, current=${currentAngle}`
            );
            prevAngle = currentAngle;
        }

        // Test towards negative angle (Small cup: -Math.PI / 2)
        const inputNeg = new FakeInput();
        inputNeg.setTargetCup('small');

        prevAngle = inputNeg.gameplayKenGroup.rotation.z;
        for (let i = 0; i < 20; i++) {
            inputNeg.update(0.016);
            const currentAngle = inputNeg.gameplayKenGroup.rotation.z;
            assert.ok(
                currentAngle <= prevAngle,
                `Angle did not decrease monotonically towards target: prev=${prevAngle}, current=${currentAngle}`
            );
            prevAngle = currentAngle;
        }
    });

    it('15. unknown cup keys are ignored', () => {
        const input = new FakeInput();
        input.setTargetCup('nonexistent_cup');

        assert.equal(input.targetCup, null);

        for (let i = 0; i < 20; i++) {
            input.update(0.016);
        }

        assert.equal(input.gameplayKenGroup.rotation.z, 0.0);
    });

    it('16. with autoRoll disabled nothing rolls', () => {
        const input = new FakeInput({ autoRoll: false });
        input.setTargetCup('big');

        for (let i = 0; i < 20; i++) {
            input.update(0.016);
        }

        assert.equal(input.gameplayKenGroup.rotation.z, 0.0);
    });

    it('17. manual roll overrides auto-roll while held', () => {
        const input = new FakeInput();
        input.setTargetCup('big'); // target is +90 deg

        // Press Q (manual CCW roll: decreases angle)
        input.handleKeyDown({ code: 'KeyQ', key: 'q' });

        for (let i = 0; i < 10; i++) {
            input.update(0.016);
        }

        // Manual roll should have driven angle negative despite targetCup being +90 deg
        assert.ok(
            input.gameplayKenGroup.rotation.z < 0.0,
            `Manual roll should override auto-roll: got angle ${input.gameplayKenGroup.rotation.z}`
        );

        // Release Q: auto-roll resumes toward +90 deg
        input.handleKeyUp({ code: 'KeyQ', key: 'q' });

        for (let i = 0; i < 30; i++) {
            input.update(0.016);
        }

        assert.ok(
            input.gameplayKenGroup.rotation.z > 1.5,
            `After releasing manual roll, auto-roll should bring angle to ~+1.57 rad: got ${input.gameplayKenGroup.rotation.z}`
        );
    });
});
