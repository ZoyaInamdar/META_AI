/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for BallTrajectory.js
 * Role: Person A (The Hands)
 * ============================================================================
 */

import { describe, it, test } from 'vitest';
import assert from 'node:assert/strict';
import {
    BallTrajectory,
    GRAVITY,
    APEX,
    INITIAL_VELOCITY_Y,
    FLIGHT_DURATION,
    v0,
    flightDuration,
    BallTrajectoryMode,
} from './BallTrajectory.js';

describe('BallTrajectory Module', () => {
    describe('Physics Constants & Analytical Predictions', () => {
        it('has expected gravity and apex constants', () => {
            assert.equal(GRAVITY, 2.5);
            assert.equal(APEX, 0.22);
        });

        it('calculates initial vertical velocity approximately equal to 1.0488 m/s', () => {
            // v0 = sqrt(2 * 2.5 * 0.22) = sqrt(1.1) ≈ 1.0488088...
            assert.ok(Math.abs(INITIAL_VELOCITY_Y - 1.0488) < 0.001);
            assert.equal(INITIAL_VELOCITY_Y, v0);
        });

        it('calculates flight duration approximately equal to 0.8390 s', () => {
            // flightDuration = 2 * v0 / GRAVITY ≈ 0.839047...
            assert.ok(Math.abs(FLIGHT_DURATION - 0.8390) < 0.001);
            assert.equal(FLIGHT_DURATION, flightDuration);
        });

        it('calculates height at apex (t = 0.4195 s) approximately equal to 0.22 m', () => {
            const trajectory = new BallTrajectory();
            const apexHeight = trajectory.heightAt(0.4195);
            assert.ok(
                Math.abs(apexHeight - 0.22) < 0.001,
                `Expected apex height ~0.22m, got ${apexHeight}`
            );
        });

        it('calculates height at landing (t = 0.8390 s) approximately equal to 0 m', () => {
            const trajectory = new BallTrajectory();
            const landingHeight = trajectory.heightAt(0.8390);
            assert.ok(
                Math.abs(landingHeight - 0.0) < 0.001,
                `Expected landing height ~0m, got ${landingHeight}`
            );
        });
    });

    describe('Launch & State Management', () => {
        it('starts in seated mode before launch', () => {
            const trajectory = new BallTrajectory();
            assert.equal(trajectory.mode, BallTrajectoryMode.SEATED);
            assert.equal(trajectory.state.mode, 'seated');
            assert.equal(trajectory.elapsed, 0.0);
        });

        it('launches from a non-zero starting position and sets mode to air', () => {
            const trajectory = new BallTrajectory();
            const start = { x: 0.12, y: 1.45, z: -0.38 };
            trajectory.launch(start);

            assert.equal(trajectory.mode, BallTrajectoryMode.AIR);
            assert.equal(trajectory.state.mode, 'air');
            assert.equal(trajectory.elapsed, 0.0);

            const state = trajectory.state;
            assert.equal(state.position.x, 0.12);
            assert.equal(state.position.y, 1.45);
            assert.equal(state.position.z, -0.38);

            // Initial vertical velocity should match v0
            assert.equal(state.velocity.x, 0.0);
            assert.ok(Math.abs(state.velocity.y - INITIAL_VELOCITY_Y) < 1e-6);
            assert.equal(state.velocity.z, 0.0);
        });

        it('does not mutate the input vector after launch and prevents external tampering', () => {
            const trajectory = new BallTrajectory();
            const inputVec = { x: 1.0, y: 2.0, z: 3.0 };
            trajectory.launch(inputVec);

            // Mutate caller's original vector
            inputVec.x = 999.0;
            inputVec.y = 888.0;
            inputVec.z = 777.0;

            // Internal stored launch position should not have changed
            assert.equal(trajectory.state.position.x, 1.0);
            assert.equal(trajectory.state.position.y, 2.0);
            assert.equal(trajectory.state.position.z, 3.0);
        });

        it('returns defensive copies from state getter to prevent internal state mutation', () => {
            const trajectory = new BallTrajectory();
            trajectory.launch({ x: 0.5, y: 1.0, z: 0.5 });

            const stateCopy = trajectory.state;
            stateCopy.position.x = 999.0;
            stateCopy.velocity.y = 999.0;
            // @ts-ignore
            stateCopy.mode = 'corrupted';

            // Fresh state getter should be intact
            const freshState = trajectory.state;
            assert.equal(freshState.position.x, 0.5);
            assert.ok(Math.abs(freshState.velocity.y - INITIAL_VELOCITY_Y) < 1e-6);
            assert.equal(freshState.mode, 'air');
        });

        it('resets previous flight when launch is called again', () => {
            const trajectory = new BallTrajectory();
            trajectory.launch({ x: 0, y: 0, z: 0 });
            trajectory.update(0.3);

            assert.ok(trajectory.elapsed > 0);

            // Relaunch from new position
            trajectory.launch({ x: 5, y: 10, z: 15 });
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.state.position.x, 5);
            assert.equal(trajectory.state.position.y, 10);
            assert.equal(trajectory.state.position.z, 15);
            assert.ok(Math.abs(trajectory.state.velocity.y - INITIAL_VELOCITY_Y) < 1e-6);
            assert.equal(trajectory.mode, 'air');
        });
    });

    describe('Trajectory Updates & Kinematics', () => {
        it('keeps horizontal coordinates unchanged during flight', () => {
            const trajectory = new BallTrajectory();
            trajectory.launch({ x: -0.25, y: 1.0, z: 0.75 });

            trajectory.update(0.1);
            assert.equal(trajectory.state.position.x, -0.25);
            assert.equal(trajectory.state.position.z, 0.75);

            trajectory.update(0.2);
            assert.equal(trajectory.state.position.x, -0.25);
            assert.equal(trajectory.state.position.z, 0.75);
        });

        it('decreases vertical velocity linearly under gravity (vy = v0 - g * t)', () => {
            const trajectory = new BallTrajectory();
            trajectory.launch({ x: 0, y: 0, z: 0 });

            const dt = 0.2;
            trajectory.update(dt);

            const expectedVy = INITIAL_VELOCITY_Y - GRAVITY * dt;
            assert.ok(
                Math.abs(trajectory.state.velocity.y - expectedVy) < 1e-6,
                `Expected vy ${expectedVy}, got ${trajectory.state.velocity.y}`
            );
        });

        it('updates position correctly after a known dt (y = y0 + v0 * t - 0.5 * g * t^2)', () => {
            const trajectory = new BallTrajectory();
            const y0 = 1.5;
            trajectory.launch({ x: 0, y: y0, z: 0 });

            const dt = 0.25;
            trajectory.update(dt);

            const expectedY = y0 + INITIAL_VELOCITY_Y * dt - 0.5 * GRAVITY * dt * dt;
            assert.ok(
                Math.abs(trajectory.state.position.y - expectedY) < 1e-6,
                `Expected y ${expectedY}, got ${trajectory.state.position.y}`
            );
        });

        it('transitions from air to seated at landing', () => {
            const trajectory = new BallTrajectory();
            const y0 = 1.0;
            trajectory.launch({ x: 0, y: y0, z: 0 });

            // Step in two increments to slightly past total flight duration
            trajectory.update(0.5);
            assert.equal(trajectory.mode, 'air');

            trajectory.update(0.4); // total elapsed 0.9s > flightDuration ~0.8390s
            assert.equal(trajectory.mode, 'seated');
            assert.equal(trajectory.elapsed, FLIGHT_DURATION);

            // Ball clamped to landing position
            assert.equal(trajectory.state.position.y, y0);
            assert.equal(trajectory.state.velocity.y, 0.0);
        });

        it('clamps oversized dt and does not move the ball below the landing point', () => {
            const trajectory = new BallTrajectory();
            const y0 = 0.75;
            trajectory.launch({ x: 0.1, y: y0, z: 0.2 });

            // Massive single time step of 10 seconds
            trajectory.update(10.0);

            assert.equal(trajectory.mode, 'seated');
            assert.equal(trajectory.elapsed, FLIGHT_DURATION);
            assert.equal(trajectory.state.position.y, y0);
            assert.equal(trajectory.state.position.x, 0.1);
            assert.equal(trajectory.state.position.z, 0.2);
            assert.equal(trajectory.state.velocity.y, 0.0);
        });

        it('safely ignores invalid or negative dt without corrupting state', () => {
            const trajectory = new BallTrajectory();
            trajectory.launch({ x: 0, y: 1.0, z: 0 });

            // Case 1: negative dt
            trajectory.update(-0.1);
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.state.position.y, 1.0);

            // Case 2: zero dt
            trajectory.update(0.0);
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.state.position.y, 1.0);

            // Case 3: NaN
            trajectory.update(NaN);
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.state.position.y, 1.0);

            // Case 4: Infinity
            trajectory.update(Infinity);
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.state.position.y, 1.0);
        });

        it('is a no-op when update is called on an already seated ball', () => {
            const trajectory = new BallTrajectory();
            // In initial seated mode
            trajectory.update(0.1);
            assert.equal(trajectory.elapsed, 0.0);
            assert.equal(trajectory.mode, 'seated');
        });
    });
});
