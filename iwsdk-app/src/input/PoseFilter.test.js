/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for PoseFilter.js (One Euro Filter for 3D Positions)
 * Role: Person A (The Hands)
 * ============================================================================
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PoseFilter } from './PoseFilter.js';

describe('PoseFilter Module', () => {
    it('initializes with default options and starts uninitialized', () => {
        const filter = new PoseFilter();
        assert.equal(filter.isInitialized(), false);
        assert.equal(filter.minCutoff, 1.0);
        assert.equal(filter.beta, 1.0);
        assert.equal(filter.dCutoff, 1.0);
    });

    it('initializes to the exact input coordinates on first sample', () => {
        const filter = new PoseFilter();
        const raw = { x: 0.15, y: 1.25, z: -0.45 };
        const result = filter.filter(raw, 0.016);

        assert.equal(filter.isInitialized(), true);
        assert.equal(result.x, 0.15);
        assert.equal(result.y, 1.25);
        assert.equal(result.z, -0.45);
    });

    it('smooths stationary input with high jitter reduction', () => {
        const filter = new PoseFilter({ minCutoff: 1.0, beta: 0.05 });
        const dt = 1.0 / 72.0; // 72 Hz VR frame rate (~0.0138s)

        // Seed initial position at (0, 1, 0)
        filter.filter({ x: 0.0, y: 1.0, z: 0.0 }, dt);

        // Feed alternating jitter around y=1.0 (+/- 5mm noise)
        const jitteredOutputs = [];
        for (let i = 0; i < 30; i++) {
            const noise = (i % 2 === 0 ? 0.005 : -0.005);
            const res = filter.filter({ x: 0.0, y: 1.0 + noise, z: 0.0 }, dt);
            jitteredOutputs.push(res.y);
        }

        // The filtered output deviation from 1.0 should be strictly less than the 0.005 raw noise
        const maxDeviation = Math.max(...jitteredOutputs.map((y) => Math.abs(y - 1.0)));
        assert.ok(
            maxDeviation < 0.003,
            `Expected jitter to be smoothed below 0.003m, but observed max deviation was ${maxDeviation}m`
        );
    });

    it('adapts during sudden rapid movement to minimize lag', () => {
        // With beta = 1.0, rapid velocity immediately raises cutoff frequency
        const filter = new PoseFilter({ minCutoff: 1.0, beta: 1.0 });
        const dt = 1.0 / 90.0; // 90 Hz frame

        // Initialize at origin
        filter.filter({ x: 0.0, y: 0.0, z: 0.0 }, dt);

        // Rapid swing of 1.0 meter in one frame (90 m/s impulse)
        const fastResult = filter.filter({ x: 1.0, y: 0.0, z: 0.0 }, dt);

        // Filter should respond aggressively because speed is high
        assert.ok(
            fastResult.x > 0.7,
            `Adaptive filter should track fast jump closely, but got ${fastResult.x}`
        );

        // Velocity should reflect the rapid movement
        const vel = filter.getVelocity();
        assert.ok(vel.x > 50.0, `Velocity should be positive and high, got ${vel.x}`);
    });

    it('safely handles invalid delta time without division by zero or NaN', () => {
        const filter = new PoseFilter();
        const dt = 0.016;

        // Valid first sample
        filter.filter({ x: 1.0, y: 2.0, z: 3.0 }, dt);

        // Case 1: dt = 0
        const zeroDtRes = filter.filter({ x: 1.5, y: 2.5, z: 3.5 }, 0.0);
        assert.ok(Number.isFinite(zeroDtRes.x));
        assert.ok(Number.isFinite(zeroDtRes.y));
        assert.ok(Number.isFinite(zeroDtRes.z));
        assert.equal(zeroDtRes.x, 1.0, 'Should hold previous filtered position when dt <= 0');

        // Case 2: negative dt
        const negDtRes = filter.filter({ x: 1.5, y: 2.5, z: 3.5 }, -0.016);
        assert.equal(negDtRes.x, 1.0);

        // Case 3: NaN or non-finite dt
        const nanDtRes = filter.filter({ x: 1.5, y: 2.5, z: 3.5 }, NaN);
        assert.equal(nanDtRes.x, 1.0);

        const infDtRes = filter.filter({ x: 1.5, y: 2.5, z: 3.5 }, Infinity);
        assert.equal(infDtRes.x, 1.0);
    });

    it('handles large elapsed pauses (dt > 1.0s) safely by snapping without velocity spikes', () => {
        const filter = new PoseFilter();
        filter.filter({ x: 0.0, y: 0.0, z: 0.0 }, 0.016);

        // Simulate 5-second VR headset sleep/pause
        const pausedResult = filter.filter({ x: 2.0, y: 0.0, z: 0.0 }, 5.0);
        assert.equal(pausedResult.x, 2.0, 'Should snap directly to position after long pause');

        const vel = filter.getVelocity();
        assert.equal(vel.x, 0.0, 'Velocity derivative should be reset on long pause snap');
    });

    it('supports zero-allocation updates using an optional out parameter', () => {
        const filter = new PoseFilter();
        const persistentTarget = { x: 0, y: 0, z: 0 };

        const returnedTarget = filter.filterXYZ(0.5, 0.6, 0.7, 0.016, persistentTarget);

        assert.equal(returnedTarget, persistentTarget, 'Should return the exact out object passed');
        assert.equal(persistentTarget.x, 0.5);
        assert.equal(persistentTarget.y, 0.6);
        assert.equal(persistentTarget.z, 0.7);
    });

    it('resets state correctly upon reset()', () => {
        const filter = new PoseFilter();
        filter.filter({ x: 10.0, y: 20.0, z: 30.0 }, 0.016);
        assert.equal(filter.isInitialized(), true);

        filter.reset();
        assert.equal(filter.isInitialized(), false);

        // Next sample after reset should initialize directly to new position
        const postReset = filter.filter({ x: -1.0, y: -2.0, z: -3.0 }, 0.016);
        assert.equal(postReset.x, -1.0);
        assert.equal(postReset.y, -2.0);
        assert.equal(postReset.z, -3.0);
    });
});
