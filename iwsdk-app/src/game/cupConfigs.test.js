/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Unit Tests for cupConfigs.js
 * Role: Person A (The Hands)
 * ============================================================================
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BALL_RADIUS,
    CUP_IDS,
    CUP_CONFIGS,
    ALL_CUPS,
    getCupConfig,
} from './cupConfigs.js';

describe('cupConfigs Module', () => {
    it('defines the standard ball radius', () => {
        assert.equal(BALL_RADIUS, 0.03, 'BALL_RADIUS must be 0.03 meters (3cm radius)');
    });

    it('defines all four required Kendama scoring targets', () => {
        assert.equal(CUP_IDS.BIG_CUP, 'bigCup');
        assert.equal(CUP_IDS.SMALL_CUP, 'smallCup');
        assert.equal(CUP_IDS.BASE_CUP, 'baseCup');
        assert.equal(CUP_IDS.SPIKE, 'spike');

        assert.ok(CUP_CONFIGS.bigCup, 'Big Cup configuration must exist');
        assert.ok(CUP_CONFIGS.smallCup, 'Small Cup configuration must exist');
        assert.ok(CUP_CONFIGS.baseCup, 'Base Cup configuration must exist');
        assert.ok(CUP_CONFIGS.spike, 'Spike configuration must exist');

        assert.equal(ALL_CUPS.length, 4, 'ALL_CUPS must contain exactly 4 configurations');
    });

    it('retrieves configurations using getCupConfig(id)', () => {
        const big = getCupConfig('bigCup');
        assert.equal(big?.id, 'bigCup');

        const spike = getCupConfig('spike');
        assert.equal(spike?.id, 'spike');

        const nonexistent = getCupConfig('unknown_cup');
        assert.equal(nonexistent, undefined);
    });

    it('enforces runtime immutability on cup configurations (deep freeze)', () => {
        // Top-level freeze check
        assert.ok(Object.isFrozen(CUP_CONFIGS), 'CUP_CONFIGS dictionary must be frozen');
        assert.ok(Object.isFrozen(CUP_IDS), 'CUP_IDS must be frozen');
        assert.ok(Object.isFrozen(ALL_CUPS), 'ALL_CUPS array must be frozen');

        // Nested property mutation must fail
        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.bigCup.cleanCatchRadius = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.bigCup.position.x = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.spike.orientationThreshold.maxAngleDeg = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.bigCup.rimRadius = 999;
        }, TypeError);
    });

    it('verifies correct cup geometry (rimRadius, depth, seatDepth)', () => {
        // Big Cup
        assert.equal(CUP_CONFIGS.bigCup.rimRadius, 0.045);
        assert.equal(CUP_CONFIGS.bigCup.depth, 0.03);
        assert.equal(CUP_CONFIGS.bigCup.seatDepth, 0.01);

        // Small Cup
        assert.equal(CUP_CONFIGS.smallCup.rimRadius, 0.040);
        assert.equal(CUP_CONFIGS.smallCup.depth, 0.03);
        assert.equal(CUP_CONFIGS.smallCup.seatDepth, 0.01);

        // Base Cup
        assert.equal(CUP_CONFIGS.baseCup.rimRadius, 0.042);
        assert.equal(CUP_CONFIGS.baseCup.depth, 0.03);
        assert.equal(CUP_CONFIGS.baseCup.seatDepth, 0.01);

        // Spike must NOT have cup rim geometry properties
        assert.equal(CUP_CONFIGS.spike.rimRadius, undefined);
        assert.equal(CUP_CONFIGS.spike.depth, undefined);
        assert.equal(CUP_CONFIGS.spike.seatDepth, undefined);
    });

    it('ensures each cup has valid local positions and normalized normals', () => {
        for (const cup of ALL_CUPS) {
            // Validate position coordinates
            assert.ok(Number.isFinite(cup.position.x), `${cup.id} position.x must be a finite number`);
            assert.ok(Number.isFinite(cup.position.y), `${cup.id} position.y must be a finite number`);
            assert.ok(Number.isFinite(cup.position.z), `${cup.id} position.z must be a finite number`);

            // Validate normal vector length is approximately 1.0
            const nx = cup.normal.x;
            const ny = cup.normal.y;
            const nz = cup.normal.z;
            const length = Math.hypot(nx, ny, nz);
            assert.ok(
                Math.abs(length - 1.0) < 1e-4,
                `${cup.id} normal must be a normalized unit vector (length = ${length})`
            );
        }
    });

    it('verifies that Big and Small Cup normals follow the upright-tilted convention', () => {
        const big = CUP_CONFIGS.bigCup.normal;
        const small = CUP_CONFIGS.smallCup.normal;

        // Big cup tilts outward (+X) and upward (+Y)
        assert.ok(big.x > 0.3, 'Big Cup normal.x should be positive (~0.33)');
        assert.ok(big.y > 0.9, 'Big Cup normal.y should be positive (~0.944)');
        assert.equal(big.z, 0.0, 'Big Cup normal.z should be 0');

        // Verify ratio matches 0.33 / 0.944 within floating point tolerance
        const expectedRatio = 0.33 / 0.944;
        const actualBigRatio = big.x / big.y;
        assert.ok(
            Math.abs(actualBigRatio - expectedRatio) < 1e-5,
            `Big Cup normal x/y ratio (${actualBigRatio}) must match expected (${expectedRatio})`
        );

        // Small cup tilts outward (-X) and upward (+Y)
        assert.ok(small.x < -0.3, 'Small Cup normal.x should be negative (~ -0.33)');
        assert.ok(small.y > 0.9, 'Small Cup normal.y should be positive (~0.944)');
        assert.equal(small.z, 0.0, 'Small Cup normal.z should be 0');

        const actualSmallRatio = -small.x / small.y;
        assert.ok(
            Math.abs(actualSmallRatio - expectedRatio) < 1e-5,
            `Small Cup normal -x/y ratio (${actualSmallRatio}) must match expected (${expectedRatio})`
        );
    });

    it('verifies Base Cup and Spike normals', () => {
        // Spike points straight up (+Y)
        assert.equal(CUP_CONFIGS.spike.normal.x, 0.0);
        assert.equal(CUP_CONFIGS.spike.normal.y, 1.0);
        assert.equal(CUP_CONFIGS.spike.normal.z, 0.0);

        // Base cup points straight down (-Y)
        assert.equal(CUP_CONFIGS.baseCup.normal.x, 0.0);
        assert.equal(CUP_CONFIGS.baseCup.normal.y, -1.0);
        assert.equal(CUP_CONFIGS.baseCup.normal.z, 0.0);
    });

    it('ensures valid catch radii where assisted radius > clean radius', () => {
        for (const cup of ALL_CUPS) {
            assert.ok(cup.cleanCatchRadius > 0, `${cup.id} cleanCatchRadius must be positive`);
            assert.ok(cup.assistedCatchRadius > 0, `${cup.id} assistedCatchRadius must be positive`);
            assert.ok(
                cup.assistedCatchRadius > cup.cleanCatchRadius,
                `${cup.id} assistedCatchRadius must be larger than cleanCatchRadius`
            );
        }

        // Spike should have the smallest clean catch radius due to hole precision
        assert.ok(
            CUP_CONFIGS.spike.cleanCatchRadius < CUP_CONFIGS.bigCup.cleanCatchRadius,
            'Spike clean catch radius should be tighter than Big Cup'
        );
    });

    it('ensures orientation thresholds are valid and precomputed correctly', () => {
        for (const cup of ALL_CUPS) {
            const thresh = cup.orientationThreshold;
            assert.ok(thresh.maxAngleDeg > 0 && thresh.maxAngleDeg < 90, `${cup.id} angle must be between 0 and 90 deg`);
            assert.ok(thresh.maxAngleRad > 0 && thresh.maxAngleRad < Math.PI / 2);
            assert.ok(thresh.minDotProduct > 0 && thresh.minDotProduct <= 1.0);

            // Verify cosine match
            const expectedCos = Math.cos(thresh.maxAngleRad);
            assert.ok(
                Math.abs(thresh.minDotProduct - expectedCos) < 1e-6,
                `${cup.id} minDotProduct must match Math.cos(maxAngleRad)`
            );
        }
    });
});
