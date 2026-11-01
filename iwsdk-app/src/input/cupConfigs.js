/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Authoritative Cup Configurations & Ken Geometry
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * SINGLE SOURCE OF TRUTH:
 * This module defines the authoritative geometric specifications, catch
 * tolerances, and physical dimensions for both catch detection (Person A) and
 * 3D visual rendering (Person C).
 *
 * Coordinate Convention & Origin:
 * - Origin (0, 0, 0): Center of the crossbar junction (Sarado / Ken junction).
 * - +Y axis: Points upward along the handle towards the Spike tip.
 * - -Y axis: Points downward along the stem towards the Base Cup.
 * - +X axis: Points outward along the crossbar towards the Big Cup.
 * - -X axis: Points outward along the crossbar towards the Small Cup.
 * - +Z / -Z: Front / back facing axis.
 *
 * Real Kendama Anatomy:
 * - Crossbar: Flared ends form the Big (+X) and Small (-X) cups with openings
 *   facing sideways (normals along +X and -X).
 * - Stem: Tapered handle below the crossbar extending down to the Base Cup (-Y),
 *   opening downward (normal along -Y).
 * - Spike: Tapered pointed tip above the crossbar pointing upward (+Y).
 *
 * Units & Scaling:
 * - All base dimensions are specified at REAL size in meters.
 * - Everything is uniformly scaled in one place by KEN_SCALE (default 1.5) for
 *   enhanced VR visibility and reach ergonomics.
 *
 * Ball & Rim Seating:
 * - The ball (Tama) is significantly larger than the cup rims (radius 0.03m vs
 *   0.022m, 0.017m, 0.0175m at real size).
 * - Consequently, the ball does not sink to the floor of the bowl; it rests on
 *   the rim circle.
 * - localPos marks the CATCH POINT = centre of the cup's rim circle.
 * - seatOffset = sqrt(BALL_RADIUS^2 - rimRadius^2) calculates the distance from
 *   the rim circle centre to the seated ball centre along the cup normal.
 *   Seated ball centre = localPos + localNormal * seatOffset.
 */

// Dynamic/conditional Three.js import to support browser, bundler, and Node runtimes
let THREE = globalThis.THREE;
if (!THREE) {
    try {
        THREE = await import('three');
    } catch {
        try {
            THREE = await import('../../../iwsdk-app/node_modules/three/build/three.module.js');
        } catch {
            // Fallback will be handled by class Vector3 below if three cannot be loaded
        }
    }
}

const Vector3 = THREE?.Vector3 || class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.isVector3 = true;
    }
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }
    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }
    length() {
        return Math.hypot(this.x, this.y, this.z);
    }
    normalize() {
        const len = this.length() || 1;
        this.x /= len;
        this.y /= len;
        this.z /= len;
        return this;
    }
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }
};

/**
 * Global scale multiplier applied to the entire kendama for VR gameplay.
 * Default: 1.5 (150% real size).
 * @type {number}
 */
export const KEN_SCALE = 1.5;

/**
 * Standard Kendama ball (Tama) radius in meters, scaled by KEN_SCALE.
 * Real size: 0.03 meters (3.0 cm radius, 6.0 cm diameter).
 * @type {number}
 */
export const BALL_RADIUS = 0.03 * KEN_SCALE;

/**
 * Base real-size specifications before KEN_SCALE multiplication.
 * Dimensions in meters.
 */
const REAL_KEN_GEOMETRY = {
    crossbar: {
        halfWidth: 0.0405,
        waistRadius: 0.011,
        endRadius: 0.022,
    },
    stem: {
        topY: -0.022,
        bottomY: -0.120,
        neckRadius: 0.0075,
        bulgeY: -0.079,
        bulgeRadius: 0.013,
        baseFlareRadius: 0.0175,
    },
    spike: {
        baseY: 0.022,
        tipY: 0.045,
    },
};

/**
 * Scaled Kendama structural geometry for 3D visual rendering.
 * All positions and radii are scaled by KEN_SCALE.
 */
export const kenGeometry = Object.freeze({
    crossbar: Object.freeze({
        halfWidth: REAL_KEN_GEOMETRY.crossbar.halfWidth * KEN_SCALE,
        waistRadius: REAL_KEN_GEOMETRY.crossbar.waistRadius * KEN_SCALE,
        endRadius: REAL_KEN_GEOMETRY.crossbar.endRadius * KEN_SCALE,
    }),
    stem: Object.freeze({
        topY: REAL_KEN_GEOMETRY.stem.topY * KEN_SCALE,
        bottomY: REAL_KEN_GEOMETRY.stem.bottomY * KEN_SCALE,
        neckRadius: REAL_KEN_GEOMETRY.stem.neckRadius * KEN_SCALE,
        bulgeY: REAL_KEN_GEOMETRY.stem.bulgeY * KEN_SCALE,
        bulgeRadius: REAL_KEN_GEOMETRY.stem.bulgeRadius * KEN_SCALE,
        baseFlareRadius: REAL_KEN_GEOMETRY.stem.baseFlareRadius * KEN_SCALE,
    }),
    spike: Object.freeze({
        baseY: REAL_KEN_GEOMETRY.spike.baseY * KEN_SCALE,
        tipY: REAL_KEN_GEOMETRY.spike.tipY * KEN_SCALE,
    }),
});

/**
 * Real-size base cup parameters before KEN_SCALE scaling.
 */
const REAL_CUPS = {
    big: {
        id: 'big',
        name: 'Big Cup (Oozara)',
        localPos: { x: 0.0405, y: 0.0, z: 0.0 },
        localNormal: { x: 1.0, y: 0.0, z: 0.0 },
        rimRadius: 0.022,
        depth: 0.012,
        minDot: Math.cos(40.0 * (Math.PI / 180)),
        cleanRadius: 0.045,
        assistRadius: 0.075,
        maxRelSpeed: 2.5,
        baseScore: 100,
    },
    small: {
        id: 'small',
        name: 'Small Cup (Kozara)',
        localPos: { x: -0.0405, y: 0.0, z: 0.0 },
        localNormal: { x: -1.0, y: 0.0, z: 0.0 },
        rimRadius: 0.017,
        depth: 0.010,
        minDot: Math.cos(40.0 * (Math.PI / 180)),
        cleanRadius: 0.040,
        assistRadius: 0.070,
        maxRelSpeed: 2.5,
        baseScore: 150,
    },
    base: {
        id: 'base',
        name: 'Base Cup (Chuzara)',
        localPos: { x: 0.0, y: -0.120, z: 0.0 },
        localNormal: { x: 0.0, y: -1.0, z: 0.0 },
        rimRadius: 0.0175,
        depth: 0.008,
        minDot: Math.cos(40.0 * (Math.PI / 180)),
        cleanRadius: 0.038,
        assistRadius: 0.065,
        maxRelSpeed: 2.5,
        baseScore: 200,
    },
    spike: {
        id: 'spike',
        name: 'Spike (Kensaki)',
        localPos: { x: 0.0, y: 0.045, z: 0.0 },
        localNormal: { x: 0.0, y: 1.0, z: 0.0 },
        rimRadius: 0.0,
        depth: 0.0,
        minDot: Math.cos(18.0 * (Math.PI / 180)),
        cleanRadius: 0.016,
        assistRadius: 0.035,
        maxRelSpeed: 2.5,
        baseScore: 500,
    },
};

/**
 * Builds scaled cup configurations.
 */
function buildCupConfigs() {
    const configs = {};

    for (const [key, baseCup] of Object.entries(REAL_CUPS)) {
        // Scaled position and dimensions
        const rimRadius = baseCup.rimRadius * KEN_SCALE;
        const depth = baseCup.depth * KEN_SCALE;

        // CATCH POINT: Center of the rim circle
        const localPos = new Vector3(
            baseCup.localPos.x * KEN_SCALE,
            baseCup.localPos.y * KEN_SCALE,
            baseCup.localPos.z * KEN_SCALE
        );

        // Normalized THREE.Vector3 normal vector
        const localNormal = new Vector3(
            baseCup.localNormal.x,
            baseCup.localNormal.y,
            baseCup.localNormal.z
        ).normalize();

        // seatOffset: distance from rim center to ball center when seated on rim circle
        // For bowl cups: sqrt(BALL_RADIUS^2 - rimRadius^2)
        // For spike: 0
        const seatOffset = rimRadius > 0
            ? Math.sqrt(Math.max(0, BALL_RADIUS ** 2 - rimRadius ** 2))
            : 0.0;

        configs[key] = {
            id: baseCup.id,
            name: baseCup.name,
            localPos,
            localNormal,
            rimRadius,
            depth,
            seatOffset,
            minDot: baseCup.minDot,
            cleanRadius: baseCup.cleanRadius * KEN_SCALE,
            assistRadius: baseCup.assistRadius * KEN_SCALE,
            maxRelSpeed: baseCup.maxRelSpeed * KEN_SCALE,
            baseScore: baseCup.baseScore,

            // Aliases for compatibility with existing detection & test interfaces
            position: localPos,
            normal: localNormal,
            seatDepth: depth,
            cleanCatchRadius: baseCup.cleanRadius * KEN_SCALE,
            assistedCatchRadius: baseCup.assistRadius * KEN_SCALE,
            orientationThreshold: {
                maxAngleDeg: Math.acos(baseCup.minDot) * (180.0 / Math.PI),
                maxAngleRad: Math.acos(baseCup.minDot),
                minDotProduct: baseCup.minDot,
            },
        };
    }

    // Legacy camelCase property aliases
    Object.defineProperty(configs, 'bigCup', {
        get() { return configs.big; },
        enumerable: false,
    });
    Object.defineProperty(configs, 'smallCup', {
        get() { return configs.small; },
        enumerable: false,
    });
    Object.defineProperty(configs, 'baseCup', {
        get() { return configs.base; },
        enumerable: false,
    });

    return Object.freeze(configs);
}

/**
 * Unique identifiers for each scoring target matching Person B's cup keys.
 * @readonly
 * @enum {string}
 */
export const CUP_IDS = Object.freeze({
    BIG_CUP: 'big',
    SMALL_CUP: 'small',
    BASE_CUP: 'base',
    SPIKE: 'spike',
    BIG: 'big',
    SMALL: 'small',
    BASE: 'base',
});

/**
 * Detailed configuration map for all four Kendama catch targets.
 */
export const cupConfigs = buildCupConfigs();
export const CUP_CONFIGS = cupConfigs;

/**
 * Array of all cup configurations for iterative sweeps.
 * @type {ReadonlyArray<typeof cupConfigs[keyof typeof cupConfigs]>}
 */
export const ALL_CUPS = Object.freeze(Object.values(cupConfigs));

/**
 * Retrieves a cup configuration by its unique ID.
 *
 * @param {string} id - Cup identifier (e.g. 'big', 'spike', 'bigCup')
 * @returns {typeof cupConfigs[keyof typeof cupConfigs] | undefined}
 */
export function getCupConfig(id) {
    if (id === 'bigCup') return cupConfigs.big;
    if (id === 'smallCup') return cupConfigs.small;
    if (id === 'baseCup') return cupConfigs.base;
    return cupConfigs[id];
}

/**
 * Prints verification metrics for Kendama cup configurations.
 */
export function printCupConfigVerification() {
    const worldUp = new Vector3(0, 1, 0);
    console.log('--- Kendama Cup Configs Verification ---');
    console.log(`KEN_SCALE: ${KEN_SCALE}`);
    console.log(`BALL_RADIUS: ${BALL_RADIUS.toFixed(5)} m`);

    console.log('\n1. Normal lengths (must be 1):');
    for (const [key, cup] of Object.entries(cupConfigs)) {
        console.log(`  ${key}: length = ${cup.localNormal.length().toFixed(6)}`);
    }

    console.log('\n2. seatOffset values:');
    for (const [key, cup] of Object.entries(cupConfigs)) {
        const baseOffset = cup.seatOffset / KEN_SCALE;
        console.log(`  ${key}: ${cup.seatOffset.toFixed(5)} m (base: ${baseOffset.toFixed(4)} * KEN_SCALE)`);
    }

    console.log('\n3. Cosine of angle between normal and world up (0, 1, 0):');
    for (const [key, cup] of Object.entries(cupConfigs)) {
        const cosUp = cup.localNormal.dot(worldUp);
        console.log(`  ${key}: cos = ${cosUp.toFixed(4)}`);
    }
    console.log('----------------------------------------');
}

// Runnable check when executed directly via Node
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('cupConfigs.js')) {
    printCupConfigVerification();
}

// In-source test suite for Vitest
if (import.meta.vitest) {
    const { describe, it, expect } = import.meta.vitest;
    describe('cupConfigs authoritative geometry verification', () => {
        it('verifies unit normals, seat offsets, and orientation cosines', () => {
            const worldUp = new Vector3(0, 1, 0);

            // 1. Every localNormal length is 1
            for (const cup of Object.values(cupConfigs)) {
                expect(cup.localNormal.length()).toBeCloseTo(1.0, 5);
            }

            // 2. seatOffset for big, small, base (expect about 0.0204, 0.0247, 0.0244 * KEN_SCALE)
            expect(cupConfigs.big.seatOffset / KEN_SCALE).toBeCloseTo(0.020396, 3);
            expect(cupConfigs.small.seatOffset / KEN_SCALE).toBeCloseTo(0.024718, 3);
            expect(cupConfigs.base.seatOffset / KEN_SCALE).toBeCloseTo(0.024367, 3);
            expect(cupConfigs.spike.seatOffset).toBe(0.0);

            // 3. Cosine between normal and world up
            expect(cupConfigs.big.localNormal.dot(worldUp)).toBeCloseTo(0.0, 4);
            expect(cupConfigs.small.localNormal.dot(worldUp)).toBeCloseTo(0.0, 4);
            expect(cupConfigs.base.localNormal.dot(worldUp)).toBeCloseTo(-1.0, 4);
            expect(cupConfigs.spike.localNormal.dot(worldUp)).toBeCloseTo(1.0, 4);
        });
    });
}

export default cupConfigs;
