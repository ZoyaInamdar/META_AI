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

describe('cupConfigs Module (Authoritative)', () => {
    it('defines the standard ball radius', () => {
        assert.equal(BALL_RADIUS, 0.03, 'BALL_RADIUS must be 0.03 meters (3cm radius)');
    });

    it('defines all four required Kendama scoring targets matching Person B keys', () => {
        assert.equal(CUP_IDS.BIG_CUP, 'big');
        assert.equal(CUP_IDS.SMALL_CUP, 'small');
        assert.equal(CUP_IDS.BASE_CUP, 'base');
        assert.equal(CUP_IDS.SPIKE, 'spike');

        assert.ok(CUP_CONFIGS.big, 'Big Cup configuration must exist under "big"');
        assert.ok(CUP_CONFIGS.small, 'Small Cup configuration must exist under "small"');
        assert.ok(CUP_CONFIGS.base, 'Base Cup configuration must exist under "base"');
        assert.ok(CUP_CONFIGS.spike, 'Spike configuration must exist under "spike"');

        assert.equal(ALL_CUPS.length, 4, 'ALL_CUPS must contain exactly 4 configurations');
    });

    it('retrieves configurations using getCupConfig(id)', () => {
        const big = getCupConfig('big');
        assert.equal(big?.id, 'big');

        const spike = getCupConfig('spike');
        assert.equal(spike?.id, 'spike');

        // Backward compatibility with legacy camelCase names
        const bigLegacy = getCupConfig('bigCup');
        assert.equal(bigLegacy?.id, 'big');

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
            CUP_CONFIGS.big.cleanCatchRadius = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.big.position.x = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.spike.orientationThreshold.maxAngleDeg = 999;
        }, TypeError);

        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.big.rimRadius = 999;
        }, TypeError);
    });

    it('verifies correct cup geometry (rimRadius, depth, seatDepth)', () => {
        // Big Cup
        assert.equal(CUP_CONFIGS.big.rimRadius, 0.045);
        assert.equal(CUP_CONFIGS.big.depth, 0.03);
        assert.equal(CUP_CONFIGS.big.seatDepth, 0.01);

        // Small Cup
        assert.equal(CUP_CONFIGS.small.rimRadius, 0.040);
        assert.equal(CUP_CONFIGS.small.depth, 0.03);
        assert.equal(CUP_CONFIGS.small.seatDepth, 0.01);

        // Base Cup
        assert.equal(CUP_CONFIGS.base.rimRadius, 0.042);
        assert.equal(CUP_CONFIGS.base.depth, 0.03);
        assert.equal(CUP_CONFIGS.base.seatDepth, 0.01);

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

    it('verifies that Big and Small Cup normals follow the agreed corrected convention', () => {
        const big = CUP_CONFIGS.big.normal;
        const small = CUP_CONFIGS.small.normal;

        // Big cup tilts outward (+X) and slightly upward (+Y): (0.944, 0.330, 0)
        assert.ok(big.x > 0.9, `Big Cup normal.x (${big.x}) should be positive (~0.944)`);
        assert.ok(big.y > 0.3, `Big Cup normal.y (${big.y}) should be positive (~0.330)`);
        assert.equal(big.z, 0.0, 'Big Cup normal.z should be 0');

        // Verify ratio matches 0.944 / 0.330 within floating point tolerance
        const expectedRatio = 0.944 / 0.330;
        const actualBigRatio = big.x / big.y;
        assert.ok(
            Math.abs(actualBigRatio - expectedRatio) < 1e-4,
            `Big Cup normal x/y ratio (${actualBigRatio}) must match expected (${expectedRatio})`
        );

        // Small cup tilts outward (-X) and slightly upward (+Y): (-0.944, 0.330, 0)
        assert.ok(small.x < -0.9, `Small Cup normal.x (${small.x}) should be negative (~ -0.944)`);
        assert.ok(small.y > 0.3, `Small Cup normal.y (${small.y}) should be positive (~0.330)`);
        assert.equal(small.z, 0.0, 'Small Cup normal.z should be 0');

        const actualSmallRatio = -small.x / small.y;
        assert.ok(
            Math.abs(actualSmallRatio - expectedRatio) < 1e-4,
            `Small Cup normal -x/y ratio (${actualSmallRatio}) must match expected (${expectedRatio})`
        );
    });

    it('verifies Base Cup and Spike normals', () => {
        // Spike points straight up (+Y)
        assert.equal(CUP_CONFIGS.spike.normal.x, 0.0);
        assert.equal(CUP_CONFIGS.spike.normal.y, 1.0);
        assert.equal(CUP_CONFIGS.spike.normal.z, 0.0);

        // Base cup points straight down (-Y)
        assert.equal(CUP_CONFIGS.base.normal.x, 0.0);
        assert.equal(CUP_CONFIGS.base.normal.y, -1.0);
        assert.equal(CUP_CONFIGS.base.normal.z, 0.0);
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
            CUP_CONFIGS.spike.cleanCatchRadius < CUP_CONFIGS.big.cleanCatchRadius,
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
