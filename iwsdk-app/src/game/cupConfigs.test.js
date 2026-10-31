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
    CUP_IDS,
    CUP_CONFIGS,
    ALL_CUPS,
    getCupConfig,
} from './cupConfigs.js';

describe('cupConfigs Module', () => {
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
            const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
            assert.ok(
                Math.abs(length - 1.0) < 1e-4,
                `${cup.id} normal must be a normalized unit vector (length = ${length})`
            );
        }
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

    it('has sensible relative cup orientations', () => {
        // Spike points up (+Y)
        assert.equal(CUP_CONFIGS.spike.normal.y, 1.0);
        // Base cup points down (-Y)
        assert.equal(CUP_CONFIGS.baseCup.normal.y, -1.0);
        // Big cup points along +X
        assert.equal(CUP_CONFIGS.bigCup.normal.x, 1.0);
        // Small cup points along -X
        assert.equal(CUP_CONFIGS.smallCup.normal.x, -1.0);
    });
});
