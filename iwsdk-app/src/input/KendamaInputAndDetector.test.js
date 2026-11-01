/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for KendamaInputAndDetector.js (Catch Detection Engine)
 * Role: Person A (The Hands)
 * ============================================================================
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    KendamaInputAndDetector,
    BALL_RADIUS,
    CATCH_RADII,
    ORIENTATION_THRESHOLDS,
    APPROACH_DIRECTION_MAX_DOT,
    REQUIRED_CONFIRMATION_FRAMES,
    UNRESOLVED_DEFAULT_MAX_RELATIVE_SPEED,
} from './KendamaInputAndDetector.js';
import { CUP_IDS, CUP_CONFIGS, getCupConfig } from '../game/cupConfigs.js';

/**
 * Creates a mock Three.js Object3D / Group matching Person B's gameplayKenGroup.
 * Produces a standard column-major matrixWorld elements array and quaternion.
 */
function createMockKenGroup(
    position = { x: 0.0, y: 1.25, z: -0.45 },
    quaternion = { x: 0.0, y: 0.0, z: 0.0, w: 1.0 }
) {
    const qx = quaternion.x;
    const qy = quaternion.y;
    const qz = quaternion.z;
    const qw = quaternion.w;

    const px = position.x;
    const py = position.y;
    const pz = position.z;

    const m00 = 1.0 - 2.0 * (qy * qy + qz * qz);
    const m01 = 2.0 * (qx * qy - qz * qw);
    const m02 = 2.0 * (qx * qz + qy * qw);

    const m10 = 2.0 * (qx * qy + qz * qw);
    const m11 = 1.0 - 2.0 * (qx * qx + qz * qz);
    const m12 = 2.0 * (qy * qz - qx * qw);

    const m20 = 2.0 * (qx * qz - qy * qw);
    const m21 = 2.0 * (qy * qz + qx * qw);
    const m22 = 1.0 - 2.0 * (qx * qx + qy * qy);

    const elements = [
        m00, m10, m20, 0,
        m01, m11, m21, 0,
        m02, m12, m22, 0,
        px, py, pz, 1,
    ];

    const pos = {
        get x() { return elements[12]; },
        set x(v) { elements[12] = v; },
        get y() { return elements[13]; },
        set y(v) { elements[13] = v; },
        get z() { return elements[14]; },
        set z(v) { elements[14] = v; },
    };

    return {
        position: pos,
        quaternion: { x: qx, y: qy, z: qz, w: qw },
        matrixWorld: { elements },
        updateMatrixWorld: () => {},
    };
}

describe('KendamaInputAndDetector Module', () => {
    it('1. correctly transforms local cup position to world space using matrixWorld', () => {
        const kenPos = { x: 0.5, y: 1.0, z: -0.2 };
        const mockKen = createMockKenGroup(kenPos);
        const detector = new KendamaInputAndDetector(mockKen);

        const spikeConfig = getCupConfig(CUP_IDS.SPIKE);
        const transformed = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        assert.ok(transformed);
        // Spike local pos: { x: 0.0, y: 0.185, z: 0.0 }
        assert.ok(Math.abs(transformed.position.x - (kenPos.x + spikeConfig.position.x)) < 1e-5);
        assert.ok(Math.abs(transformed.position.y - (kenPos.y + spikeConfig.position.y)) < 1e-5);
        assert.ok(Math.abs(transformed.position.z - (kenPos.z + spikeConfig.position.z)) < 1e-5);
    });

    it('2. correctly transforms local cup normal to world space', () => {
        // Rotate Ken 90 degrees around Z axis (roll)
        // q = (0, 0, sin(45 deg), cos(45 deg))
        const sin45 = Math.sin(Math.PI / 4);
        const cos45 = Math.cos(Math.PI / 4);
        const roll90Z = { x: 0.0, y: 0.0, z: sin45, w: cos45 };

        const mockKen = createMockKenGroup({ x: 0, y: 0, z: 0 }, roll90Z);
        const detector = new KendamaInputAndDetector(mockKen);

        // Spike local normal is (0, 1, 0). Rotated 90 deg around Z, it should point along (-1, 0, 0)
        const transformed = detector.getWorldCupTransform(CUP_IDS.SPIKE);
        assert.ok(transformed);
        assert.ok(Math.abs(transformed.normal.x - (-1.0)) < 1e-4, `Expected normal.x ~ -1.0, got ${transformed.normal.x}`);
        assert.ok(Math.abs(transformed.normal.y - 0.0) < 1e-4, `Expected normal.y ~ 0.0, got ${transformed.normal.y}`);
        assert.ok(Math.abs(transformed.normal.z - 0.0) < 1e-4, `Expected normal.z ~ 0.0, got ${transformed.normal.z}`);

        // Verify normal length remains 1.0
        const len = Math.hypot(transformed.normal.x, transformed.normal.y, transformed.normal.z);
        assert.ok(Math.abs(len - 1.0) < 1e-5);
    });

    it('3. uses BALL_RADIUS correctly in geometric calculations', () => {
        assert.equal(BALL_RADIUS, 0.03, 'BALL_RADIUS should be 0.03m');

        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        // Position ball at exactly 0.025m above spike (within assisted 0.045m, outside clean 0.020m)
        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.025,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        const result = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.ok(Math.abs(result.details.distance - 0.025) < 1e-6);
        // surfaceDistance = max(0, distance - BALL_RADIUS)
        assert.equal(result.details.surfaceDistance, 0.0);
    });

    it('4. distinguishes clean and assisted catch regions', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const bigCupWorld = detector.getWorldCupTransform(CUP_IDS.BIG_CUP);

        // Big cup clean radius is 0.035m, assisted is 0.075m
        assert.equal(CATCH_RADII.bigCup.clean, 0.035);
        assert.equal(CATCH_RADII.bigCup.assisted, 0.075);

        // Case A: Clean catch at distance 0.020m
        const cleanBallPos = {
            x: bigCupWorld.position.x + bigCupWorld.normal.x * 0.020,
            y: bigCupWorld.position.y + bigCupWorld.normal.y * 0.020,
            z: bigCupWorld.position.z + bigCupWorld.normal.z * 0.020,
        };
        const ballVel = {
            x: -bigCupWorld.normal.x * 0.5,
            y: -bigCupWorld.normal.y * 0.5,
            z: -bigCupWorld.normal.z * 0.5,
        };

        const cleanRes = detector.evaluateCatch(cleanBallPos, ballVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(cleanRes.valid, true);
        assert.equal(cleanRes.catchType, 'clean');

        detector.reset();

        // Case B: Assisted catch at distance 0.050m (between 0.035 and 0.075)
        const assistedBallPos = {
            x: bigCupWorld.position.x + bigCupWorld.normal.x * 0.050,
            y: bigCupWorld.position.y + bigCupWorld.normal.y * 0.050,
            z: bigCupWorld.position.z + bigCupWorld.normal.z * 0.050,
        };
        const assistedRes = detector.evaluateCatch(assistedBallPos, ballVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(assistedRes.valid, true);
        assert.equal(assistedRes.catchType, 'assisted');

        detector.reset();

        // Case C: Out of range at distance 0.100m (> 0.075)
        const farBallPos = {
            x: bigCupWorld.position.x + bigCupWorld.normal.x * 0.100,
            y: bigCupWorld.position.y + bigCupWorld.normal.y * 0.100,
            z: bigCupWorld.position.z + bigCupWorld.normal.z * 0.100,
        };
        const farRes = detector.evaluateCatch(farBallPos, ballVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(farRes.valid, false);
        assert.equal(farRes.reason, 'out_of_range');
    });

    it('5. enforces orientation thresholds for all four cups', () => {
        // Thresholds: Big Cup: 30°, Small Cup: 25°, Base Cup: 35°, Spike: 18°
        assert.equal(ORIENTATION_THRESHOLDS.bigCup.maxAngleDeg, 30);
        assert.equal(ORIENTATION_THRESHOLDS.smallCup.maxAngleDeg, 25);
        assert.equal(ORIENTATION_THRESHOLDS.baseCup.maxAngleDeg, 35);
        assert.equal(ORIENTATION_THRESHOLDS.spike.maxAngleDeg, 18);

        // Spike upright test (Spike points +Y, angle with world up is 0 deg <= 18 deg)
        const mockKenUpright = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKenUpright);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const validBallPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const validBallVel = { x: 0.0, y: -0.5, z: 0.0 };

        const uprightRes = detector.evaluateCatch(validBallPos, validBallVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(uprightRes.valid, true);

        // Tilt Spike by 30 degrees around Z axis (> 18 deg threshold)
        const tiltAngle = 30.0 * (Math.PI / 180);
        const tiltQuat = { x: 0.0, y: 0.0, z: Math.sin(tiltAngle / 2), w: Math.cos(tiltAngle / 2) };
        const mockKenTilted = createMockKenGroup({ x: 0, y: 1.25, z: -0.45 }, tiltQuat);
        detector.setKenGroup(mockKenTilted);

        const tiltedSpike = detector.getWorldCupTransform(CUP_IDS.SPIKE);
        const tiltedBallPos = {
            x: tiltedSpike.position.x,
            y: tiltedSpike.position.y + 0.015,
            z: tiltedSpike.position.z,
        };
        // Ball approaching along negative cup normal
        const tiltedBallVel = {
            x: -tiltedSpike.normal.x * 0.5,
            y: -tiltedSpike.normal.y * 0.5,
            z: -tiltedSpike.normal.z * 0.5,
        };

        const tiltedRes = detector.evaluateCatch(tiltedBallPos, tiltedBallVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(tiltedRes.valid, false);
        assert.equal(tiltedRes.reason, 'cup_orientation_invalid');

        // Base Cup inverted test: Base Cup normal is (0, -1, 0) locally.
        // Holding Ken upright -> Base Cup points DOWN (180 deg) -> must fail!
        detector.setKenGroup(mockKenUpright);
        const baseWorld = detector.getWorldCupTransform(CUP_IDS.BASE_CUP);
        const baseBallPos = {
            x: baseWorld.position.x,
            y: baseWorld.position.y - 0.02,
            z: baseWorld.position.z,
        };
        const baseBallVel = { x: 0, y: 0.5, z: 0 };
        const baseUprightRes = detector.evaluateCatch(baseBallPos, baseBallVel, CUP_IDS.BASE_CUP, 1.0, 0.016);
        assert.equal(baseUprightRes.valid, false);
        assert.equal(baseUprightRes.reason, 'cup_orientation_invalid');

        // Invert Ken (rotate 180 deg around X axis so Base Cup points UP)
        const invertQuat = { x: 1.0, y: 0.0, z: 0.0, w: 0.0 };
        const mockKenInverted = createMockKenGroup({ x: 0, y: 1.25, z: -0.45 }, invertQuat);
        detector.setKenGroup(mockKenInverted);
        const baseInvertedWorld = detector.getWorldCupTransform(CUP_IDS.BASE_CUP);
        assert.ok(baseInvertedWorld.normal.y > 0.99, 'Base cup should point up when Ken is inverted');

        const baseInvertedPos = {
            x: baseInvertedWorld.position.x,
            y: baseInvertedWorld.position.y + 0.02,
            z: baseInvertedWorld.position.z,
        };
        const baseInvertedVel = { x: 0, y: -0.5, z: 0 };
        const baseInvertedRes = detector.evaluateCatch(baseInvertedPos, baseInvertedVel, CUP_IDS.BASE_CUP, 1.0, 0.016);
        assert.equal(baseInvertedRes.valid, true);
    });

    it('6. rejects catches exceeding maximum allowed relative speed', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen, { maxRelativeSpeed: 2.0 });

        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);
        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };

        // Relative speed of 1.0 m/s (under 2.0 limit)
        const slowVel = { x: 0.0, y: -1.0, z: 0.0 };
        const slowRes = detector.evaluateCatch(ballPos, slowVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(slowRes.valid, true);

        detector.reset();

        // Relative speed of 4.0 m/s (exceeds 2.0 limit)
        const fastVel = { x: 0.0, y: -4.0, z: 0.0 };
        const fastRes = detector.evaluateCatch(ballPos, fastVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(fastRes.valid, false);
        assert.equal(fastRes.reason, 'relative_speed_exceeded');
    });

    it('7. approach direction check requires dot product < -0.2', () => {
        assert.equal(APPROACH_DIRECTION_MAX_DOT, -0.2);

        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };

        // Case A: Ball moving downwards into Spike (-0.5 m/s, dot = -0.5 < -0.2)
        const enteringVel = { x: 0.0, y: -0.5, z: 0.0 };
        const enteringRes = detector.evaluateCatch(ballPos, enteringVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(enteringRes.valid, true);

        detector.reset();

        // Case B: Ball moving upwards away from Spike (+0.5 m/s, dot = +0.5 >= -0.2)
        const leavingVel = { x: 0.0, y: 0.5, z: 0.0 };
        const leavingRes = detector.evaluateCatch(ballPos, leavingVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(leavingRes.valid, false);
        assert.equal(leavingRes.reason, 'approach_direction_invalid');

        detector.reset();

        // Case C: Ball moving horizontally across Spike (dot = 0.0 >= -0.2)
        const sidewaysVel = { x: 0.5, y: 0.0, z: 0.0 };
        const sidewaysRes = detector.evaluateCatch(ballPos, sidewaysVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(sidewaysRes.valid, false);
        assert.equal(sidewaysRes.reason, 'approach_direction_invalid');
    });

    it('8. requires two consecutive valid frames before confirming a catch', () => {
        assert.equal(REQUIRED_CONFIRMATION_FRAMES, 2);

        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // Frame 1: Valid, but confirmed must be false (confirmationCount = 1)
        const frame1 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(frame1.valid, true);
        assert.equal(frame1.confirmationCount, 1);
        assert.equal(frame1.confirmed, false, 'First valid frame should not confirm yet');

        // Frame 2: Valid, now confirmed must be true (confirmationCount = 2)
        const frame2 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(frame2.valid, true);
        assert.equal(frame2.confirmationCount, 2);
        assert.equal(frame2.confirmed, true, 'Second consecutive valid frame must confirm catch');
    });

    it('9. any failed check resets the consecutive-frame confirmation count', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const validPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const validVel = { x: 0.0, y: -0.5, z: 0.0 };

        // Frame 1: Valid
        const frame1 = detector.evaluateCatch(validPos, validVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(frame1.confirmationCount, 1);
        assert.equal(frame1.confirmed, false);

        // Frame 2: Fails (ball moved too far away)
        const invalidPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.20,
            z: spikeWorld.position.z,
        };
        const frame2 = detector.evaluateCatch(invalidPos, validVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(frame2.valid, false);
        assert.equal(frame2.confirmationCount, 0);
        assert.equal(frame2.confirmed, false);

        // Frame 3: Valid again, but starts over at count = 1 (NOT confirmed)
        const frame3 = detector.evaluateCatch(validPos, validVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(frame3.valid, true);
        assert.equal(frame3.confirmationCount, 1);
        assert.equal(frame3.confirmed, false);
    });

    it('10. calculates Ken velocity correctly from position changes and dt', () => {
        const mockKen = createMockKenGroup({ x: 0.0, y: 1.0, z: 0.0 });
        const detector = new KendamaInputAndDetector(mockKen);

        // First frame: initial sample, velocity is 0
        detector.updateKenVelocity(0.016);
        let vel = detector.getKenVelocity();
        assert.equal(vel.x, 0.0);
        assert.equal(vel.y, 0.0);
        assert.equal(vel.z, 0.0);

        // Second frame: Ken moved +0.032m in Y over 0.016s (vel = 2.0 m/s)
        mockKen.position.y = 1.032;
        detector.updateKenVelocity(0.016);
        vel = detector.getKenVelocity();
        assert.ok(Math.abs(vel.y - 2.0) < 1e-4, `Expected vy ~ 2.0 m/s, got ${vel.y}`);
    });

    it('11. safely handles first-frame and invalid dt in velocity tracking', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);

        // dt = 0
        detector.updateKenVelocity(0.0);
        let vel = detector.getKenVelocity();
        assert.ok(Number.isFinite(vel.x));
        assert.ok(Number.isFinite(vel.y));
        assert.ok(Number.isFinite(vel.z));

        // dt < 0
        detector.updateKenVelocity(-0.016);
        vel = detector.getKenVelocity();
        assert.ok(Number.isFinite(vel.y));

        // dt = NaN
        detector.updateKenVelocity(NaN);
        vel = detector.getKenVelocity();
        assert.ok(Number.isFinite(vel.y));

        // dt = Infinity
        detector.updateKenVelocity(Infinity);
        vel = detector.getKenVelocity();
        assert.ok(Number.isFinite(vel.y));
    });

    it('12. safely handles unknown cup keys and invalid inputs', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);

        // Unknown cup key
        const unknownRes = detector.evaluateCatch({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, 'imaginaryCup');
        assert.equal(unknownRes.valid, false);
        assert.equal(unknownRes.reason, 'unknown_cup');

        // Null ball position
        const nullPosRes = detector.evaluateCatch(null, { x: 0, y: -1, z: 0 }, CUP_IDS.BIG_CUP);
        assert.equal(nullPosRes.valid, false);
        assert.equal(nullPosRes.reason, 'invalid_input');

        // Null ball velocity
        const nullVelRes = detector.evaluateCatch({ x: 0, y: 1, z: 0 }, null, CUP_IDS.BIG_CUP);
        assert.equal(nullVelRes.valid, false);
        assert.equal(nullVelRes.reason, 'invalid_input');

        // Missing gameplayKenGroup
        const noKenDetector = new KendamaInputAndDetector(null);
        const noKenRes = noKenDetector.evaluateCatch({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, CUP_IDS.BIG_CUP);
        assert.equal(noKenRes.valid, false);
        assert.equal(noKenRes.reason, 'missing_ken_group');
    });

    it('13. calculates Ken velocity once per frame regardless of cup evaluation order', () => {
        const mockKen = createMockKenGroup({ x: 0.0, y: 1.0, z: -0.45 });
        const detector = new KendamaInputAndDetector(mockKen);

        // Frame 1 initialization at t = 1.0
        detector.evaluateCatch({ x: 0, y: 1.25, z: -0.45 }, { x: 0, y: -0.5, z: 0 }, CUP_IDS.BIG_CUP, 1.0, 0.016);

        // Ken moves +0.032m in Y (vy = 2.0 m/s) at t = 1.016
        mockKen.position.y = 1.032;

        // Evaluate Big Cup first at now = 1.016, dt = 0.016
        const bigRes = detector.evaluateCatch(
            { x: 0, y: 1.25, z: -0.45 },
            { x: 0, y: -0.5, z: 0 },
            CUP_IDS.BIG_CUP,
            1.016,
            0.016
        );
        assert.ok(Math.abs(bigRes.details.kenVelocity.y - 2.0) < 1e-4, 'First cup should see 2.0 m/s Ken velocity');

        // Evaluate Small Cup immediately within the same frame at now = 1.016, dt = 0.016
        const smallRes = detector.evaluateCatch(
            { x: 0, y: 1.25, z: -0.45 },
            { x: 0, y: -0.5, z: 0 },
            CUP_IDS.SMALL_CUP,
            1.016,
            0.016
        );
        // Small Cup MUST see the exact same Ken velocity (2.0 m/s), NOT 0.0 m/s
        assert.ok(Math.abs(smallRes.details.kenVelocity.y - 2.0) < 1e-4, 'Second cup in same frame must reuse Ken velocity');
        assert.equal(bigRes.details.kenVelocity.y, smallRes.details.kenVelocity.y);
    });

    it('14. one-shot confirmation triggers true only once per confirmed catch', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // Frame 1: Valid, confirmationCount = 1, confirmed = false
        const f1 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(f1.valid, true);
        assert.equal(f1.confirmationCount, 1);
        assert.equal(f1.confirmed, false);

        // Frame 2: Valid, confirmationCount = 2, confirmed = true (ONE-SHOT TRIGGER!)
        const f2 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(f2.valid, true);
        assert.equal(f2.confirmationCount, 2);
        assert.equal(f2.confirmed, true, 'Transition to confirmed must return true');

        // Frame 3: Valid, confirmationCount = 3, confirmed = false (prevent repeated scoring)
        const f3 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(f3.valid, true);
        assert.equal(f3.confirmationCount, 3);
        assert.equal(f3.confirmed, false, 'Subsequent valid frame in same catch must return confirmed: false');

        // Frame 4: Ball leaves cup (break catch)
        const farPos = { x: ballPos.x, y: ballPos.y + 0.5, z: ballPos.z };
        const f4 = detector.evaluateCatch(farPos, ballVel, CUP_IDS.SPIKE, 1.048, 0.016);
        assert.equal(f4.valid, false);
        assert.equal(f4.confirmed, false);
        assert.equal(f4.confirmationCount, 0);

        // Frame 5: Ball re-enters cup -> count = 1, confirmed = false
        const f5 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.064, 0.016);
        assert.equal(f5.valid, true);
        assert.equal(f5.confirmationCount, 1);
        assert.equal(f5.confirmed, false);

        // Frame 6: Count = 2, confirmed = true again!
        const f6 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.080, 0.016);
        assert.equal(f6.valid, true);
        assert.equal(f6.confirmationCount, 2);
        assert.equal(f6.confirmed, true, 'New catch confirmation must trigger true again');
    });

    it('15. candidate cup switching resets confirmation counter and prevents cross-cup confirmation', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);

        const bigWorld = detector.getWorldCupTransform(CUP_IDS.BIG_CUP);
        const smallWorld = detector.getWorldCupTransform(CUP_IDS.SMALL_CUP);

        const bigPos = {
            x: bigWorld.position.x + bigWorld.normal.x * 0.02,
            y: bigWorld.position.y + bigWorld.normal.y * 0.02,
            z: bigWorld.position.z + bigWorld.normal.z * 0.02,
        };
        const bigVel = {
            x: -bigWorld.normal.x * 0.5,
            y: -bigWorld.normal.y * 0.5,
            z: -bigWorld.normal.z * 0.5,
        };

        const smallPos = {
            x: smallWorld.position.x + smallWorld.normal.x * 0.02,
            y: smallWorld.position.y + smallWorld.normal.y * 0.02,
            z: smallWorld.position.z + smallWorld.normal.z * 0.02,
        };
        const smallVel = {
            x: -smallWorld.normal.x * 0.5,
            y: -smallWorld.normal.y * 0.5,
            z: -smallWorld.normal.z * 0.5,
        };

        // Frame 1: Valid for Big Cup (confirmationCount = 1)
        const frame1 = detector.evaluateCatch(bigPos, bigVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(frame1.valid, true);
        assert.equal(frame1.cupKey, CUP_IDS.BIG_CUP);
        assert.equal(frame1.confirmationCount, 1);
        assert.equal(frame1.confirmed, false);

        // Frame 2: Valid for Small Cup (switches candidate cup)
        const frame2 = detector.evaluateCatch(smallPos, smallVel, CUP_IDS.SMALL_CUP, 1.016, 0.016);
        assert.equal(frame2.valid, true);
        assert.equal(frame2.cupKey, CUP_IDS.SMALL_CUP);
        assert.equal(frame2.confirmationCount, 1, 'Confirmation count must reset to 1 on cup switch');
        assert.equal(frame2.confirmed, false, 'Switching cup candidate must NOT confirm catch');

        // Frame 3: Valid for Small Cup again -> now confirmationCount = 2, confirmed = true
        const frame3 = detector.evaluateCatch(smallPos, smallVel, CUP_IDS.SMALL_CUP, 1.032, 0.016);
        assert.equal(frame3.valid, true);
        assert.equal(frame3.confirmationCount, 2);
        assert.equal(frame3.confirmed, true);
    });

    it('16. validates all 6 coordinates in ball position and velocity', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);

        const invalidVectors = [
            // Invalid X in position
            { pos: { x: NaN, y: 1, z: 0 }, vel: { x: 0, y: -1, z: 0 } },
            { pos: { x: Infinity, y: 1, z: 0 }, vel: { x: 0, y: -1, z: 0 } },
            // Invalid Y in position
            { pos: { x: 0, y: NaN, z: 0 }, vel: { x: 0, y: -1, z: 0 } },
            // Invalid Z in position
            { pos: { x: 0, y: 1, z: Infinity }, vel: { x: 0, y: -1, z: 0 } },
            // Missing Z in position
            { pos: { x: 0, y: 1 }, vel: { x: 0, y: -1, z: 0 } },
            // Invalid X in velocity
            { pos: { x: 0, y: 1, z: 0 }, vel: { x: NaN, y: -1, z: 0 } },
            { pos: { x: 0, y: 1, z: 0 }, vel: { x: Infinity, y: -1, z: 0 } },
            // Invalid Y in velocity
            { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: NaN, z: 0 } },
            // Invalid Z in velocity
            { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: -1, z: -Infinity } },
            // Non-numeric string in velocity
            { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 'fast', z: 0 } },
        ];

        for (const { pos, vel } of invalidVectors) {
            const res = detector.evaluateCatch(pos, vel, CUP_IDS.BIG_CUP, 1.0, 0.016);
            assert.equal(res.valid, false);
            assert.equal(res.confirmed, false);
            assert.equal(res.reason, 'invalid_input');
        }
    });

    it('17. prevents false velocity spike after invalid or zero dt frames', () => {
        const mockKen = createMockKenGroup({ x: 0.0, y: 1.0, z: 0.0 });
        const detector = new KendamaInputAndDetector(mockKen);

        // Frame 1: initial setup at y = 1.0
        detector.updateKenVelocity(0.016, 1.0);

        // Ken teleports or moves to y = 1.5 during an invalid dt frame (e.g. dt = 0 or NaN)
        mockKen.position.y = 1.5;
        detector.updateKenVelocity(0.0, 1.016);
        let vel = detector.getKenVelocity();
        assert.equal(vel.y, 0.0, 'Invalid dt frame must yield zero velocity');

        // Next frame: Ken moves normally from 1.5 to 1.516 with valid dt = 0.016 (vy = 1.0 m/s)
        mockKen.position.y = 1.516;
        detector.updateKenVelocity(0.016, 1.032);
        vel = detector.getKenVelocity();
        // If prevKenPos was not updated during the invalid frame, vy would be (1.516 - 1.0)/0.016 = 32.25 m/s
        assert.ok(Math.abs(vel.y - 1.0) < 1e-4, `Expected vy ~ 1.0 m/s without spike, got ${vel.y}`);
    });

    it('18. uses matrixWorld translation to ensure Ken velocity and cup transforms share coordinates', () => {
        // Plain mock with matrixWorld translation
        const elements = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0.1, 1.2, -0.4, 1,
        ];
        const group = {
            position: { x: 999, y: 999, z: 999 }, // Deliberately different from matrixWorld to test precedence
            matrixWorld: { elements },
        };
        const detector = new KendamaInputAndDetector(group);

        // First frame
        detector.updateKenVelocity(0.016, 1.0);

        // Translate matrixWorld by +0.032 in Y
        elements[13] = 1.232;
        detector.updateKenVelocity(0.016, 1.016);

        const vel = detector.getKenVelocity();
        // Should calculate from elements (1.232 - 1.2)/0.016 = 2.0 m/s, NOT from position (which stayed 999)
        assert.ok(Math.abs(vel.y - 2.0) < 1e-4, `Expected velocity derived from matrixWorld translation, got ${vel.y}`);
    });

    it('19. prevents duplicate confirmation when evaluated multiple times at the same timestamp', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // 1. First valid evaluation at timestamp 1.0: confirmed === false, confirmation count is 1.
        const step1 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(step1.valid, true);
        assert.equal(step1.confirmed, false);
        assert.equal(step1.confirmationCount, 1);

        // 2. Second evaluation of the same cup at timestamp 1.0: confirmation count must remain 1 and confirmed === false.
        const step2 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.0, 0.016);
        assert.equal(step2.valid, true);
        assert.equal(step2.confirmed, false);
        assert.equal(step2.confirmationCount, 1);

        // 3. Evaluation at timestamp 1.016: confirmation count becomes 2 and confirmed === true.
        const step3 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(step3.valid, true);
        assert.equal(step3.confirmationCount, 2);
        assert.equal(step3.confirmed, true);

        // 4. Another evaluation at timestamp 1.016: confirmed === false; no repeated confirmation.
        const step4 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(step4.valid, true);
        assert.equal(step4.confirmationCount, 2);
        assert.equal(step4.confirmed, false);

        // 5. Evaluation at timestamp 1.032: no repeated confirmation while the same catch remains valid.
        const step5 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(step5.valid, true);
        assert.equal(step5.confirmationCount, 3);
        assert.equal(step5.confirmed, false);
    });

    it('20. switching candidate cups at the same timestamp cannot accidentally confirm a catch', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);

        const bigWorld = detector.getWorldCupTransform(CUP_IDS.BIG_CUP);
        const smallWorld = detector.getWorldCupTransform(CUP_IDS.SMALL_CUP);

        const bigPos = {
            x: bigWorld.position.x + bigWorld.normal.x * 0.02,
            y: bigWorld.position.y + bigWorld.normal.y * 0.02,
            z: bigWorld.position.z + bigWorld.normal.z * 0.02,
        };
        const bigVel = {
            x: -bigWorld.normal.x * 0.5,
            y: -bigWorld.normal.y * 0.5,
            z: -bigWorld.normal.z * 0.5,
        };

        const smallPos = {
            x: smallWorld.position.x + smallWorld.normal.x * 0.02,
            y: smallWorld.position.y + smallWorld.normal.y * 0.02,
            z: smallWorld.position.z + smallWorld.normal.z * 0.02,
        };
        const smallVel = {
            x: -smallWorld.normal.x * 0.5,
            y: -smallWorld.normal.y * 0.5,
            z: -smallWorld.normal.z * 0.5,
        };

        // At timestamp 1.0, evaluate Big Cup (count 1, confirmed: false)
        const res1 = detector.evaluateCatch(bigPos, bigVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(res1.valid, true);
        assert.equal(res1.confirmationCount, 1);
        assert.equal(res1.confirmed, false);

        // At same timestamp 1.0, switch to Small Cup (resets count to 1, confirmed: false)
        const res2 = detector.evaluateCatch(smallPos, smallVel, CUP_IDS.SMALL_CUP, 1.0, 0.016);
        assert.equal(res2.valid, true);
        assert.equal(res2.confirmationCount, 1);
        assert.equal(res2.confirmed, false);

        // At same timestamp 1.0, duplicate evaluation for Small Cup (count must hold at 1, confirmed: false)
        const res3 = detector.evaluateCatch(smallPos, smallVel, CUP_IDS.SMALL_CUP, 1.0, 0.016);
        assert.equal(res3.valid, true);
        assert.equal(res3.confirmationCount, 1);
        assert.equal(res3.confirmed, false);

        // At same timestamp 1.0, switch back to Big Cup (resets count to 1, confirmed: false)
        const res4 = detector.evaluateCatch(bigPos, bigVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(res4.valid, true);
        assert.equal(res4.confirmationCount, 1);
        assert.equal(res4.confirmed, false);

        // Duplicate evaluation for Big Cup at same timestamp 1.0 (count must hold at 1, confirmed: false)
        const res5 = detector.evaluateCatch(bigPos, bigVel, CUP_IDS.BIG_CUP, 1.0, 0.016);
        assert.equal(res5.valid, true);
        assert.equal(res5.confirmationCount, 1);
        assert.equal(res5.confirmed, false);
    });

    it('21. rejects stale and repeated confirmation timestamps', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // 1. First evaluation at 1.016 -> count 1, confirmed === false
        const step1 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.016, 0.016);
        assert.equal(step1.valid, true);
        assert.equal(step1.confirmationCount, 1);
        assert.equal(step1.confirmed, false);

        // 2. Evaluation at 1.032 -> count 2 and confirmed === true
        const step2 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(step2.valid, true);
        assert.equal(step2.confirmationCount, 2);
        assert.equal(step2.confirmed, true);

        // 3. Evaluation at 1.000 (older/stale timestamp) -> count remains 2 and confirmed remains false
        const step3 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.000, 0.016);
        assert.equal(step3.valid, true);
        assert.equal(step3.confirmationCount, 2);
        assert.equal(step3.confirmed, false, 'Stale timestamp must not trigger confirmation or increment count');

        // 4. Repeated evaluation at 1.032 -> count remains 2 and no repeated confirmation
        const step4 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(step4.valid, true);
        assert.equal(step4.confirmationCount, 2);
        assert.equal(step4.confirmed, false, 'Repeated timestamp must not trigger confirmation or increment count');
    });

    it('22. correctly reuses timestamp when evaluateCatch is called without now after updateKenVelocity', () => {
        const mockKen = createMockKenGroup({ x: 0.0, y: 1.0, z: -0.45 });
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // 1. Calls updateKenVelocity(0.016, 1.0) once.
        detector.updateKenVelocity(0.016, 1.0);

        // 2. Evaluates the same cup twice without passing now.
        const res1 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE);
        assert.equal(res1.valid, true);
        assert.equal(res1.confirmed, false);
        assert.equal(res1.confirmationCount, 1);

        const res2 = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE);
        assert.equal(res2.valid, true);
        assert.equal(res2.confirmed, false);
        // 3. Verifies confirmation remains at 1.
        assert.equal(res2.confirmationCount, 1);

        // 4. Moves the Ken group and calls updateKenVelocity(0.016, 1.016) once.
        mockKen.position.y = 1.016; // delta +0.016m over 0.016s = 1.0 m/s in Y
        detector.updateKenVelocity(0.016, 1.016);

        // Update ball position and velocity to maintain valid catch conditions with Ken moving up at 1.0 m/s
        const movedSpikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);
        const movedBallPos = {
            x: movedSpikeWorld.position.x,
            y: movedSpikeWorld.position.y + 0.015,
            z: movedSpikeWorld.position.z,
        };
        // Ball stationary in world space -> relative velocity is (0 - 1.0) = -1.0 m/s (approaching cup opening)
        const frame2BallVel = { x: 0.0, y: 0.0, z: 0.0 };

        // 5. Evaluates the cup without passing now.
        const res3 = detector.evaluateCatch(movedBallPos, frame2BallVel, CUP_IDS.SPIKE);

        // 6. Verifies confirmation advances to 2 and Ken velocity is correct.
        assert.equal(res3.valid, true);
        assert.equal(res3.confirmationCount, 2);
        assert.equal(res3.confirmed, true);
        assert.ok(Math.abs(res3.details.kenVelocity.y - 1.0) < 1e-4, `Expected Ken vy ~ 1.0 m/s, got ${res3.details.kenVelocity.y}`);
    });

    it('23. enforces chronological timestamp progression in velocity tracking', () => {
        const mockKen = createMockKenGroup({ x: 0.0, y: 1.0, z: -0.45 });
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // 1. Update at timestamp 1.016
        detector.updateKenVelocity(0.016, 1.016);
        assert.equal(detector._lastFrameTime, 1.016);

        // 2. Move Ken and update at 1.032
        mockKen.position.y = 1.032; // delta +0.032m over 0.016s = 2.0 m/s in Y
        detector.updateKenVelocity(0.016, 1.032);

        // 3. Record _lastFrameTime, previous Ken position and Ken velocity
        const recordedTime = detector._lastFrameTime;
        const recordedPrevPos = { ...detector._prevKenPos };
        const recordedVelocity = detector.getKenVelocity();

        assert.equal(recordedTime, 1.032);
        assert.ok(Math.abs(recordedVelocity.y - 2.0) < 1e-4);

        // 4. Evaluate at stale timestamp 1.000
        detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.000, 0.016);

        // 5. Verify all three recorded velocity-tracking values remain unchanged
        assert.equal(detector._lastFrameTime, recordedTime, '_lastFrameTime must not be rewound by stale timestamp');
        assert.deepEqual(detector._prevKenPos, recordedPrevPos, 'prevKenPos must remain unchanged on stale timestamp');
        assert.deepEqual(detector.getKenVelocity(), recordedVelocity, 'kenVelocity must remain unchanged on stale timestamp');

        // 6. Evaluate again at 1.032 and verify it does not process the frame a second time
        detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.032, 0.016);
        assert.equal(detector._lastFrameTime, recordedTime, '_lastFrameTime must not change on duplicate timestamp');
        assert.deepEqual(detector._prevKenPos, recordedPrevPos, 'prevKenPos must not change on duplicate timestamp');
        assert.deepEqual(detector.getKenVelocity(), recordedVelocity, 'kenVelocity must not change on duplicate timestamp');

        // 7. Verify a subsequent newer timestamp, such as 1.048, still calculates velocity correctly
        mockKen.position.y = 1.048; // delta +0.016m over 0.016s = 1.0 m/s
        const movedSpikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);
        const movedBallPos = {
            x: movedSpikeWorld.position.x,
            y: movedSpikeWorld.position.y + 0.015,
            z: movedSpikeWorld.position.z,
        };
        const frameBallVel = { x: 0.0, y: 0.0, z: 0.0 };

        const res = detector.evaluateCatch(movedBallPos, frameBallVel, CUP_IDS.SPIKE, 1.048, 0.016);
        assert.equal(detector._lastFrameTime, 1.048);
        assert.ok(Math.abs(res.details.kenVelocity.y - 1.0) < 1e-4, `Expected Ken vy ~ 1.0 m/s, got ${res.details.kenVelocity.y}`);
    });

    it('24. rejects stale evaluations and prevents them from modifying catch confirmation state', () => {
        const mockKen = createMockKenGroup();
        const detector = new KendamaInputAndDetector(mockKen);
        const spikeWorld = detector.getWorldCupTransform(CUP_IDS.SPIKE);

        const ballPos = {
            x: spikeWorld.position.x,
            y: spikeWorld.position.y + 0.015,
            z: spikeWorld.position.z,
        };
        const ballVel = { x: 0.0, y: -0.5, z: 0.0 };

        // 1. Advance velocity tracking to timestamp 1.032
        detector.updateKenVelocity(0.016, 1.016);
        detector.updateKenVelocity(0.016, 1.032);
        assert.equal(detector._lastFrameTime, 1.032);

        // 2. Ensure there is no active candidate cup
        assert.equal(detector.candidateCup, null);
        assert.equal(detector.confirmationCount, 0);
        assert.equal(detector._lastConfirmationTime, null);
        assert.equal(detector._catchConfirmedFired, false);

        // 3. Evaluate a valid catch at stale timestamp 1.000
        const staleRes = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.000, 0.016);

        // 4. Assert that the result does not confirm and that confirmation state remains unchanged
        assert.equal(staleRes.confirmed, false);
        assert.equal(detector.candidateCup, null, '_candidateCup must remain null after stale evaluation');
        assert.equal(detector.confirmationCount, 0, '_confirmationCount must remain 0 after stale evaluation');
        assert.equal(detector._lastConfirmationTime, null, '_lastConfirmationTime must remain null after stale evaluation');
        assert.equal(detector._catchConfirmedFired, false, '_catchConfirmedFired must remain false after stale evaluation');

        // 5. Evaluate at 1.048: genuinely newer evaluation starts the candidate at count 1 (NOT confirmed)
        const newerRes = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.048, 0.016);
        assert.equal(newerRes.valid, true);
        assert.equal(newerRes.confirmed, false, 'Genuinely newer evaluation should start candidate, not confirm');
        assert.equal(newerRes.confirmationCount, 1);
        assert.equal(detector.candidateCup, CUP_IDS.SPIKE);
        assert.equal(detector.confirmationCount, 1);
        assert.equal(detector._lastConfirmationTime, 1.048);

        // 6. Test that a stale evaluation does not reset an already active candidate
        // A) Stale failing evaluation (out of range) at 1.000
        const farBallPos = { x: ballPos.x, y: ballPos.y + 0.5, z: ballPos.z };
        const staleFailRes = detector.evaluateCatch(farBallPos, ballVel, CUP_IDS.SPIKE, 1.000, 0.016);
        assert.equal(staleFailRes.valid, false);
        assert.equal(detector.candidateCup, CUP_IDS.SPIKE, 'Stale failing evaluation must not reset candidate cup');
        assert.equal(detector.confirmationCount, 1, 'Stale failing evaluation must not reset confirmation count');
        assert.equal(detector._lastConfirmationTime, 1.048);

        // B) Stale evaluation for a different cup (Big Cup) at 1.000
        const bigWorld = detector.getWorldCupTransform(CUP_IDS.BIG_CUP);
        const bigBallPos = {
            x: bigWorld.position.x + bigWorld.normal.x * 0.02,
            y: bigWorld.position.y + bigWorld.normal.y * 0.02,
            z: bigWorld.position.z + bigWorld.normal.z * 0.02,
        };
        const bigBallVel = {
            x: -bigWorld.normal.x * 0.5,
            y: -bigWorld.normal.y * 0.5,
            z: -bigWorld.normal.z * 0.5,
        };
        const staleSwitchRes = detector.evaluateCatch(bigBallPos, bigBallVel, CUP_IDS.BIG_CUP, 1.000, 0.016);
        assert.equal(detector.candidateCup, CUP_IDS.SPIKE, 'Stale evaluation must not switch candidate cup');
        assert.equal(detector.confirmationCount, 1, 'Stale evaluation must not modify confirmation count');
        assert.equal(detector._lastConfirmationTime, 1.048);

        // 7. Verify subsequent newer evaluation at 1.064 legitimately confirms the catch
        const confirmRes = detector.evaluateCatch(ballPos, ballVel, CUP_IDS.SPIKE, 1.064, 0.016);
        assert.equal(confirmRes.valid, true);
        assert.equal(confirmRes.confirmed, true, 'Second genuine newer frame must confirm catch');
        assert.equal(confirmRes.confirmationCount, 2);
    });
});