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

import { describe, it, test } from 'vitest';
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
        assert.equal(BALL_RADIUS, 0.045, 'BALL_RADIUS must be 0.045 meters (0.03 * KEN_SCALE)');
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

        // Top-level mutation must fail
        assert.throws(() => {
            // @ts-ignore
            CUP_CONFIGS.big = 999;
        }, TypeError);
    });

    it('verifies correct cup geometry (rimRadius, depth, seatDepth)', () => {
        // Regression check: every bowl cup must have non-negative radicand (BALL_RADIUS >= rimRadius)
        for (const cupKey of [CUP_IDS.BIG_CUP, CUP_IDS.SMALL_CUP, CUP_IDS.BASE_CUP]) {
            const cup = CUP_CONFIGS[cupKey];
            const radicand = BALL_RADIUS ** 2 - cup.rimRadius ** 2;
            assert.ok(radicand >= 0, `${cupKey} radicand (${radicand}) must be non-negative`);
        }

        // Big Cup
        const expectedBigRimRadius = 0.045;
        assert.equal(CUP_CONFIGS.big.rimRadius, expectedBigRimRadius);
        assert.equal(CUP_CONFIGS.big.depth, 0.012 * 1.5);
        assert.equal(CUP_CONFIGS.big.seatOffset, 0);
        assert.ok(Math.abs(CUP_CONFIGS.big.seatOffset - Math.sqrt(BALL_RADIUS ** 2 - expectedBigRimRadius ** 2)) < 1e-6);

        // Small Cup
        const expectedSmallRimRadius = 0.040;
        assert.equal(CUP_CONFIGS.small.rimRadius, expectedSmallRimRadius);
        assert.equal(CUP_CONFIGS.small.depth, 0.010 * 1.5);
        assert.ok(Math.abs(CUP_CONFIGS.small.seatOffset - Math.sqrt(BALL_RADIUS ** 2 - expectedSmallRimRadius ** 2)) < 1e-6);

        // Base Cup
        const expectedBaseRimRadius = 0.042;
        assert.equal(CUP_CONFIGS.base.rimRadius, expectedBaseRimRadius);
        assert.equal(CUP_CONFIGS.base.depth, 0.008 * 1.5);
        assert.ok(Math.abs(CUP_CONFIGS.base.seatOffset - Math.sqrt(BALL_RADIUS ** 2 - expectedBaseRimRadius ** 2)) < 1e-6);

        // Spike has no bowl
        assert.equal(CUP_CONFIGS.spike.rimRadius, 0);
        assert.equal(CUP_CONFIGS.spike.depth, 0);
        assert.equal(CUP_CONFIGS.spike.seatOffset, 0);
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

        // Big cup points outward along +X: (1, 0, 0)
        assert.equal(big.x, 1.0);
        assert.equal(big.y, 0.0);
        assert.equal(big.z, 0.0);

        // Small cup points outward along -X: (-1, 0, 0)
        assert.equal(small.x, -1.0);
        assert.equal(small.y, 0.0);
        assert.equal(small.z, 0.0);
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
