/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Cup Configurations
 * Role: Person A (The Hands)
 * ============================================================================
 *
 * Defines the geometric and physical catch parameters for the four scoring
 * targets on the Kendama Ken (handle):
 * 1. Big Cup   (Oozara)  - Largest side cup, easiest cup catch.
 * 2. Small Cup (Kozara)  - Opposite side cup, slightly smaller rim.
 * 3. Base Cup  (Chuzara) - Bottom cup on the handle base.
 * 4. Spike     (Kensaki) - Top pointed tip that pierces the ball (Tama) hole.
 *
 * Coordinate Convention (Kendama Local Space):
 * - Origin (0, 0, 0): Center of the handle grip / cross-piece junction.
 * - +Y axis: Points upward along the handle towards the Spike tip.
 * - -Y axis: Points downward along the handle towards the Base Cup.
 * - +X axis: Points outward towards the Big Cup.
 * - -X axis: Points outward towards the Small Cup.
 * - +Z / -Z: Front / back facing axis.
 *
 * This module has ZERO dependencies on Three.js or IWSDK runtime, keeping it
 * completely pure, deterministic, and testable anywhere.
 */

/**
 * Deeply freezes an object to make it completely immutable at runtime.
 * Prevents accidental runtime modification of geometric constants.
 *
 * @template T
 * @param {T} obj - Object to freeze
 * @returns {Readonly<T>} Frozen object
 */
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    Object.freeze(obj);

    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
            deepFreeze(val);
        }
    }

    return obj;
}

/**
 * Unique identifiers for each scoring target.
 * @readonly
 * @enum {string}
 */
export const CUP_IDS = Object.freeze({
    BIG_CUP: 'bigCup',
    SMALL_CUP: 'smallCup',
    BASE_CUP: 'baseCup',
    SPIKE: 'spike',
});

/**
 * Detailed configuration map for all four Kendama catch targets.
 * All dimensions are in meters (standard VR / WebXR units).
 */
export const CUP_CONFIGS = deepFreeze({
    [CUP_IDS.BIG_CUP]: {
        id: CUP_IDS.BIG_CUP,
        name: 'Big Cup (Oozara)',
        description: 'Large cup located on the positive X crossbar wing.',
        baseScore: 100,

        // Local 3D offset relative to Ken grip origin [meters]
        position: { x: 0.055, y: 0.12, z: 0.0 },

        // Normal unit vector pointing out of the cup rim
        normal: { x: 1.0, y: 0.0, z: 0.0 },

        // Catch radii [meters]
        // Clean catch requires accurate placement inside the cup rim
        cleanCatchRadius: 0.045,
        // Assisted catch provides subtle magnet/assist for VR accessibility
        assistedCatchRadius: 0.075,

        // Orientation acceptance thresholds
        // Angle between cup normal and ball approach / gravity direction
        orientationThreshold: {
            maxAngleDeg: 38.0,
            maxAngleRad: 38.0 * (Math.PI / 180),
            // Precomputed cosine: allow dot product test without Math.acos()
            minDotProduct: Math.cos(38.0 * (Math.PI / 180)),
        },
    },

    [CUP_IDS.SMALL_CUP]: {
        id: CUP_IDS.SMALL_CUP,
        name: 'Small Cup (Kozara)',
        description: 'Smaller cup located opposite the big cup on the negative X crossbar wing.',
        baseScore: 150,

        // Local 3D offset relative to Ken grip origin [meters]
        position: { x: -0.050, y: 0.12, z: 0.0 },

        // Normal unit vector pointing out of the cup rim
        normal: { x: -1.0, y: 0.0, z: 0.0 },

        // Catch radii [meters] (smaller than Big Cup)
        cleanCatchRadius: 0.040,
        assistedCatchRadius: 0.070,

        // Orientation acceptance thresholds
        orientationThreshold: {
            maxAngleDeg: 34.0,
            maxAngleRad: 34.0 * (Math.PI / 180),
            minDotProduct: Math.cos(34.0 * (Math.PI / 180)),
        },
    },

    [CUP_IDS.BASE_CUP]: {
        id: CUP_IDS.BASE_CUP,
        name: 'Base Cup (Chuzara)',
        description: 'Bottom cup located at the base of the handle pointing down.',
        baseScore: 200,

        // Local 3D offset relative to Ken grip origin [meters]
        position: { x: 0.0, y: -0.090, z: 0.0 },

        // Normal unit vector pointing straight down along the handle
        normal: { x: 0.0, y: -1.0, z: 0.0 },

        // Catch radii [meters]
        cleanCatchRadius: 0.038,
        assistedCatchRadius: 0.065,

        // Orientation acceptance thresholds
        orientationThreshold: {
            maxAngleDeg: 32.0,
            maxAngleRad: 32.0 * (Math.PI / 180),
            minDotProduct: Math.cos(32.0 * (Math.PI / 180)),
        },
    },

    [CUP_IDS.SPIKE]: {
        id: CUP_IDS.SPIKE,
        name: 'Spike (Kensaki)',
        description: 'Tapered top spike requiring precise tip-to-hole alignment.',
        baseScore: 500,

        // Local 3D offset relative to Ken grip origin [meters]
        position: { x: 0.0, y: 0.185, z: 0.0 },

        // Normal unit vector pointing straight up along the spike axis
        normal: { x: 0.0, y: 1.0, z: 0.0 },

        // Catch radii [meters] (strict: ball hole diameter is ~1.5cm)
        cleanCatchRadius: 0.016,
        assistedCatchRadius: 0.035,

        // Orientation acceptance thresholds (requires strict alignment with the hole)
        orientationThreshold: {
            maxAngleDeg: 22.0,
            maxAngleRad: 22.0 * (Math.PI / 180),
            minDotProduct: Math.cos(22.0 * (Math.PI / 180)),
        },
    },
});

/**
 * Array of all cup configurations for iterative tests or collision sweeps.
 * @type {ReadonlyArray<typeof CUP_CONFIGS[keyof typeof CUP_CONFIGS]>}
 */
export const ALL_CUPS = deepFreeze(Object.values(CUP_CONFIGS));

/**
 * Retrieves a cup configuration by its unique ID.
 *
 * @param {string} id - Cup identifier (e.g. 'bigCup', 'spike')
 * @returns {typeof CUP_CONFIGS[keyof typeof CUP_CONFIGS] | undefined} Cup configuration or undefined if not found
 */
export function getCupConfig(id) {
    return CUP_CONFIGS[id];
}

export default CUP_CONFIGS;
