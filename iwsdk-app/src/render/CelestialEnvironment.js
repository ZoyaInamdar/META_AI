/**
 * Celestial Kendama - Pastel Galaxy Gameplay Environment Module
 * Role: Person C (Visuals & Rendering)
 *
 * Implements the environment configuration and controller for Celestial Kendama:
 * - Phase 1: Native IWSDK DomeGradient and IBLGradient atmospheric foundation.
 * - Phase 2: Procedural Pastel Nebula Layer with 3D simplex noise and domain warping.
 * - Softcore pastel galaxy palette:
 *   - Sky: Soft Lavender (#C5B4E3)
 *   - Equator: Blush Rose (#F5B7B1)
 *   - Ground: Dusty Periwinkle (#8B9DC3)
 * - Complete preservation of Showroom environment and PBR material lighting.
 * - Dual-architecture support:
 *   1. Non-destructive in-place mode switching ('showroom' <-> 'gameplay')
 *   2. Standalone scene document loading via world.loadLevel('scenes/gameplay.iwsdk.scene.json')
 */

import { createSystem } from '@iwsdk/core';
import { DomeGradient, IBLGradient } from '@iwsdk/core';
import { LevelRoot } from '@iwsdk/core';
import { createCelestialNebulaMesh } from './CelestialNebulaShader.js';
import { createCelestialStarfield } from './CelestialStarfield.js';
import { createCelestialStardust } from './CelestialStardust.js';
import { createCelestialLandmarks, disposeCelestialLandmarks } from './CelestialLandmarks.js';
import { createCelestialBelt, updateCelestialBelt, disposeCelestialBelt } from './CelestialBelt.js';
import {
    PlanetoidRenderer,
    PLANETOID_DEFAULT_SCALE,
    PLANETOID_DEFAULT_ANCHOR,
    PLANETOID_SHOWCASE_SCALE,
    PLANETOID_SHOWCASE_ANCHOR,
} from './PlanetoidRenderer.js';
import { PlanetEvolutionController } from '../gameplay/PlanetEvolutionController.js';
import { PlanetTransformationController } from '../game/PlanetTransformationController.js';
import { PlanetUnlockUI } from '../ui/PlanetUnlockUI.js';
import { PlanetUnlockCelebration } from '../ui/PlanetUnlockCelebration.js';
import NarrativeDirector from '../game/NarrativeDirector.js';
import OrreryVisualSystem, { ORRERY_DEFAULT_ANCHOR } from './OrreryVisualSystem.js';
import { Vector3 } from 'three';
import { eventBus as defaultEventBus } from '../contracts/EventBus.js';
import { Events, BallState, PlanetState, BallMode } from '../contracts/Interfaces.js';

/**
 * Converts a hex color string ('#RRGGBB' or 'RRGGBB') to normalized RGBA float array [r, g, b, a].
 * @param {string} hex - Hex color string.
 * @param {number} [alpha=1.0] - Alpha channel.
 * @returns {[number, number, number, number]}
 */
export function hexToRgbaFloat(hex, alpha = 1.0) {
    const cleanHex = hex.replace(/^#/u, '').trim();
    if (cleanHex.length !== 6) {
        throw new Error(`Invalid hex color string: "${hex}". Expected 6 characters.`);
    }
    const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
    const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
    const b = parseInt(cleanHex.slice(4, 6), 16) / 255;
    return [
        Math.round(r * 10000) / 10000,
        Math.round(g * 10000) / 10000,
        Math.round(b * 10000) / 10000,
        alpha,
    ];
}

/**
 * Converts a normalized RGBA float array [r, g, b, a] back to uppercase hex string '#RRGGBB'.
 * @param {number[] | Float32Array} rgba - Normalized RGBA float array.
 * @returns {string} Hex color string.
 */
export function rgbaFloatToHex(rgba) {
    const r = Math.min(255, Math.max(0, Math.round((rgba[0] ?? 0) * 255)));
    const g = Math.min(255, Math.max(0, Math.round((rgba[1] ?? 0) * 255)));
    const b = Math.min(255, Math.max(0, Math.round((rgba[2] ?? 0) * 255)));
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Baseline showroom environment configuration, matching main.iwsdk.scene.json exactly.
 * Preserves the original showroom studio backdrop and lighting.
 */
export const SHOWROOM_ENVIRONMENT_CONFIG = Object.freeze({
    id: 'showroom',
    name: 'Showroom Studio',
    domeGradient: Object.freeze({
        sky: Object.freeze([0.843, 0.796, 0.882, 1.0]),
        equator: Object.freeze([0.808, 0.855, 0.91, 1.0]),
        ground: Object.freeze([0.902, 0.855, 0.82, 1.0]),
        elevationDeg: 24,
        azimuthDeg: -31,
        dither: true,
        intensity: 1.0,
    }),
    iblGradient: Object.freeze({
        sky: Object.freeze([0.72, 0.7, 0.8, 1.0]),
        equator: Object.freeze([0.78, 0.78, 0.84, 1.0]),
        ground: Object.freeze([0.5, 0.52, 0.58, 1.0]),
        intensity: 0.2025,
    }),
});

/**
 * Softcore Pastel Galaxy gameplay environment configuration.
 *
 * Palette:
 * - Sky: Soft Lavender (#C5B4E3) -> [0.7725, 0.7059, 0.8902, 1.0]
 * - Equator: Blush Rose (#F5B7B1) -> [0.9608, 0.7176, 0.6941, 1.0]
 * - Ground: Dusty Periwinkle (#8B9DC3) -> [0.5451, 0.6157, 0.7647, 1.0]
 *
 * Parameters:
 * - elevationDeg: 32Â° (tilts soft blush region toward forward view)
 * - azimuthDeg: 0Â° (centered along player forward axis -Z)
 * - dither: true (eliminates color banding on Quest displays)
 * - intensity: 1.0
 * - iblGradient: Preserved from showroom to ensure kendama PBR materials maintain their calibrated reflections
 */
export const GAMEPLAY_PASTEL_GALAXY_CONFIG = Object.freeze({
    id: 'gameplay-pastel-galaxy',
    name: 'Celestial Pastel Galaxy',
    domeGradient: Object.freeze({
        sky: Object.freeze(hexToRgbaFloat('#C5B4E3', 1.0)),      // [0.7725, 0.7059, 0.8902, 1.0]
        equator: Object.freeze(hexToRgbaFloat('#F5B7B1', 1.0)),  // [0.9608, 0.7176, 0.6941, 1.0]
        ground: Object.freeze(hexToRgbaFloat('#8B9DC3', 1.0)),   // [0.5451, 0.6157, 0.7647, 1.0]
        elevationDeg: 32,
        azimuthDeg: 0,
        dither: true,
        intensity: 1.0,
    }),
    iblGradient: Object.freeze({
        sky: Object.freeze([0.72, 0.7, 0.8, 1.0]),
        equator: Object.freeze([0.78, 0.78, 0.84, 1.0]),
        ground: Object.freeze([0.5, 0.52, 0.58, 1.0]),
        intensity: 0.2025,
    }),
});

/**
 * Applies an environment configuration to a target LevelRoot entity.
 * Uses getVectorView and setValue to trigger IWSDK EnvironmentSystem's reactive frame updates.
 *
 * @param {any} levelRootEntity - Entity possessing LevelRoot component.
 * @param {typeof SHOWROOM_ENVIRONMENT_CONFIG | typeof GAMEPLAY_PASTEL_GALAXY_CONFIG} config
 * @returns {boolean} True if successfully applied.
 */
export function applyEnvironmentConfig(levelRootEntity, config) {
    if (!levelRootEntity) {
        return false;
    }

    // 1. Update DomeGradient
    if (levelRootEntity.hasComponent?.(DomeGradient)) {
        const { domeGradient } = config;
        const skyView = levelRootEntity.getVectorView?.(DomeGradient, 'sky');
        const eqView = levelRootEntity.getVectorView?.(DomeGradient, 'equator');
        const grView = levelRootEntity.getVectorView?.(DomeGradient, 'ground');

        if (skyView?.set) skyView.set(domeGradient.sky);
        if (eqView?.set) eqView.set(domeGradient.equator);
        if (grView?.set) grView.set(domeGradient.ground);

        levelRootEntity.setValue?.(DomeGradient, 'elevationDeg', domeGradient.elevationDeg);
        levelRootEntity.setValue?.(DomeGradient, 'azimuthDeg', domeGradient.azimuthDeg);
        levelRootEntity.setValue?.(DomeGradient, 'dither', domeGradient.dither);
        levelRootEntity.setValue?.(DomeGradient, 'intensity', domeGradient.intensity);
        levelRootEntity.setValue?.(DomeGradient, '_needsUpdate', true);
    }

    // 2. Update IBLGradient if provided
    if (config.iblGradient && levelRootEntity.hasComponent?.(IBLGradient)) {
        const { iblGradient } = config;
        const skyView = levelRootEntity.getVectorView?.(IBLGradient, 'sky');
        const eqView = levelRootEntity.getVectorView?.(IBLGradient, 'equator');
        const grView = levelRootEntity.getVectorView?.(IBLGradient, 'ground');

        if (skyView?.set) skyView.set(iblGradient.sky);
        if (eqView?.set) eqView.set(iblGradient.equator);
        if (grView?.set) grView.set(iblGradient.ground);

        levelRootEntity.setValue?.(IBLGradient, 'intensity', iblGradient.intensity);
        levelRootEntity.setValue?.(IBLGradient, '_needsUpdate', true);
    }

    return true;
}

/**
 * Reads the current environment configuration from a LevelRoot entity.
 * @param {any} levelRootEntity
 * @returns {object | null}
 */
export function readEnvironmentConfig(levelRootEntity) {
    if (!levelRootEntity || !levelRootEntity.hasComponent?.(DomeGradient)) {
        return null;
    }

    const readVector = (comp, prop) => {
        const view = levelRootEntity.getVectorView?.(comp, prop);
        if (!view) return [0, 0, 0, 1];
        if (typeof view.get === 'function') {
            return Array.from(view.get());
        }
        if (typeof view[Symbol.iterator] === 'function') {
            return Array.from(view);
        }
        return [view[0] ?? 0, view[1] ?? 0, view[2] ?? 0, view[3] ?? 1];
    };

    const sky = readVector(DomeGradient, 'sky');
    const equator = readVector(DomeGradient, 'equator');
    const ground = readVector(DomeGradient, 'ground');
    const elevationDeg = levelRootEntity.getValue?.(DomeGradient, 'elevationDeg');
    const azimuthDeg = levelRootEntity.getValue?.(DomeGradient, 'azimuthDeg');
    const dither = levelRootEntity.getValue?.(DomeGradient, 'dither');
    const intensity = levelRootEntity.getValue?.(DomeGradient, 'intensity');

    return {
        domeGradient: {
            sky,
            equator,
            ground,
            elevationDeg,
            azimuthDeg,
            dither,
            intensity,
        },
    };
}

/**
 * Canonical showroom node IDs that must be hidden during gameplay to isolate the Kendama.
 * @readonly
 */
export const SHOWROOM_NODE_IDS_TO_HIDE = Object.freeze([
    'studio-floor',
    'stage',
    'grab-plinth',
    'spin-plinth',
    'welcome-panel',
    'gallery-set',
    'sideboard-set',
    'brand-banner',
]);

/**
 * Inspection Kendama assembly names to hide during gameplay.
 * @readonly
 */
export const KENDAMA_AUXILIARY_MODELS_TO_HIDE = Object.freeze([
    'big-cup-cavity-view',
    'big-cup-profile-view',
]);

/**
 * Inspection Kendama assembly name to preserve during gameplay.
 * @readonly
 */
export const KENDAMA_ACTIVE_MODEL_TO_KEEP = Object.freeze([
    'big-cup-three-quarter',
]);

/**
 * ECS System managing the Celestial Kendama environment mode and nebula layer.
 * Defaults to 'showroom' so the initial showroom remains visually identical to authoring.
 * In 'gameplay' mode, applies the pastel galaxy dome and activates the procedural nebula shell.
 */
export class CelestialEnvironmentSystem extends createSystem({
    levelRoots: { required: [LevelRoot] },
}) {
    /** @type {'showroom' | 'gameplay' | 'planet-showcase'} */
    mode = 'showroom';

    /** @type {any} */
    activeConfig = SHOWROOM_ENVIRONMENT_CONFIG;

    /** @type {boolean} */
    isInitialized = false;

    /** @type {any} */
    nebulaMesh = null;

    /** @type {any} */
    starfieldMesh = null;

    /** @type {any} */
    stardustMesh = null;

    /** @type {any} */
    landmarksGroup = null;

    /** @type {any} */
    beltGroup = null;

    /** @type {boolean | null} */
    originalStudioFloorVisible = null;

    /**
     * Map of managed Object3D instances to their initial/authored visibility states.
     * Guaranteed to record at most once per object to prevent gameplay visibility pollution.
     * @type {Map<any, boolean>}
     */
    visibilityBaseline = new Map();

    /** @type {any} */
    wiredCupPreviewNode = null;

    /** @type {any} */
    wiredSelectPlinthNode = null;

    /** @type {PlanetoidRenderer | null} */
    planetoidRenderer = null;

    /** @type {BallState | null} */
    lastBallState = null;

    /** @type {PlanetState | null} */
    lastPlanetState = null;

    /** @type {Vector3 | null} */
    _scratchSeatedPos = null;

    /** @type {Vector3 | null} */
    _cachedCamPos = null;

    /** @type {Vector3 | null} */
    _cachedCamDir = null;

    /** @type {boolean} */
    _visibilityDirty = true;

    /** @type {BallState | null} */
    _defaultSeatedBallState = null;

    /** @type {PlanetState | null} */
    _defaultPlanetState = null;

    /** @type {PlanetUnlockUI | null} */
    unlockUI = null;

    /** @type {PlanetUnlockCelebration | null} */
    unlockCelebration = null;

    /** @type {NarrativeDirector | null} */
    narrativeDirector = null;

    /** @type {OrreryVisualSystem | null} */
    orreryVisualSystem = null;

    init() {
        this.mode = 'showroom';
        this.activeConfig = SHOWROOM_ENVIRONMENT_CONFIG;
        this.isInitialized = true;
        this.nebulaMesh = null;
        this.starfieldMesh = null;
        this.stardustMesh = null;
        this.landmarksGroup = null;
        this.beltGroup = null;
        this.originalStudioFloorVisible = null;
        this.visibilityBaseline = new Map();
        this.kendamaOriginalTransform = null;
        this.wiredCupPreviewNode = null;
        this.wiredSelectPlinthNode = null;
        this.planetoidRenderer = null;
        this.evolutionController = null;
        this.transformationController = null;
        this.unlockUI = null;
        this.unlockCelebration = null;
        this.narrativeDirector = null;
        this.orreryVisualSystem = null;
        this.lastBallState = null;
        this.lastPlanetState = null;
        this._scratchSeatedPos = new Vector3();
        this._cachedCamPos = new Vector3();
        this._cachedCamDir = new Vector3();
        this._visibilityDirty = true;
        this._defaultSeatedBallState = null;
        this._defaultPlanetState = null;
        this.eventUnsubs = [];

        // Subscribe to live EventBus for BallState & PlanetState events
        if (defaultEventBus && typeof defaultEventBus.on === 'function') {
            const unsubBall = defaultEventBus.on(Events.BALL, (state) => {
                this.lastBallState = state;
            });
            const unsubPlanet = defaultEventBus.on(Events.PLANET, (state) => {
                this.lastPlanetState = state;
            });
            if (typeof unsubBall === 'function') this.eventUnsubs.push(unsubBall);
            if (typeof unsubPlanet === 'function') this.eventUnsubs.push(unsubPlanet);
        }

        // Eagerly instantiate PlanetoidRenderer so debug hooks & references are live immediately
        this.ensurePlanetoidRenderer();
    }

    /**
     * Resolves the current active level root entity from the world.
     * @returns {any}
     */
    getLevelRoot() {
        if (this.world?.activeLevel?.value) {
            return this.world.activeLevel.value;
        }
        for (const root of this.queries?.levelRoots?.entities || []) {
            return root;
        }
        return null;
    }

    /**
     * Helper to look up a scene object by ID, name, or alternate identifier.
     * Checks world.getSceneObject() first, then world.scene.getObjectByName().
     * @param {string} id
     * @param {string} [altName]
     * @returns {any}
     */
    findSceneObject(id, altName) {
        if (!this.world) return null;
        let obj = null;
        if (typeof this.world.getSceneObject === 'function') {
            obj = this.world.getSceneObject(id);
            if (!obj && altName) {
                obj = this.world.getSceneObject(altName);
            }
        }
        if (!obj && this.world.scene?.getObjectByName) {
            obj = this.world.scene.getObjectByName(id);
            if (!obj && altName) {
                obj = this.world.scene.getObjectByName(altName);
            }
        }
        return obj;
    }

    /**
     * Records an object's initial authored visibility state in the baseline map.
     * Strictly records at most once per object.
     * @param {any} obj
     */
    recordBaseline(obj) {
        if (!obj || typeof obj.visible !== 'boolean') return;
        if (!this.visibilityBaseline.has(obj)) {
            this.visibilityBaseline.set(obj, obj.visible);
        }
    }

    /**
     * Resolves the showroom studio floor object if present in the scene,
     * recording its original visibility state on first access.
     * @returns {any}
     */
    getStudioFloor() {
        const floor = this.findSceneObject('studio-floor', 'Studio Floor');
        if (floor && this.originalStudioFloorVisible === null && typeof floor.visible === 'boolean') {
            this.originalStudioFloorVisible = floor.visible;
            this.recordBaseline(floor);
        }
        return floor;
    }

    /**
     * Ensures the procedural nebula shell mesh is available.
     * Reuses existing instance in world.scene or creates an internal instance.
     * Sole ownership: environment system manages creation, visibility, and disposal.
     * @returns {any}
     */
    ensureNebulaMesh() {
        if (!this.nebulaMesh) {
            const existing = this.world?.getSceneObject?.('celestial-nebula') ||
                this.world?.scene?.children?.find?.(
                    (c) => c.name === 'celestial-nebula-shell' || c.name === 'celestial-nebula'
                );
            if (existing) {
                this.nebulaMesh = existing;
            } else {
                this.nebulaMesh = createCelestialNebulaMesh();
                if (this.world?.scene) {
                    this.world.scene.add(this.nebulaMesh);
                }
            }
        }
        return this.nebulaMesh;
    }

    /**
     * Ensures the procedural starfield points object is available.
     * Reuses existing instance in world.scene or creates an internal instance.
     * Sole ownership: environment system manages creation, visibility, and disposal.
     * @returns {any}
     */
    ensureStarfieldMesh() {
        if (!this.starfieldMesh) {
            const existing = this.world?.getSceneObject?.('celestial-starfield') ||
                this.world?.scene?.children?.find?.(
                    (c) => c.name === 'celestial-starfield'
                );
            if (existing) {
                this.starfieldMesh = existing;
            } else {
                this.starfieldMesh = createCelestialStarfield();
                if (this.world?.scene) {
                    this.world.scene.add(this.starfieldMesh);
                }
            }
        }
        return this.starfieldMesh;
    }

    /**
     * Ensures the procedural stardust points object is available.
     * Reuses existing instance in world.scene or creates an internal instance.
     * Sole ownership: environment system manages creation, visibility, and disposal.
     * @returns {any}
     */
    ensureStardustMesh() {
        if (!this.stardustMesh) {
            const existing = this.world?.getSceneObject?.('celestial-stardust') ||
                this.world?.scene?.children?.find?.(
                    (c) => c.name === 'celestial-stardust'
                );
            if (existing) {
                this.stardustMesh = existing;
            } else {
                this.stardustMesh = createCelestialStardust();
                if (this.world?.scene) {
                    this.world.scene.add(this.stardustMesh);
                }
            }
        }
        return this.stardustMesh;
    }

    /**
     * Ensures the procedural celestial landmarks group is available.
     * Reuses existing instance in world.scene or creates an internal instance.
     * Sole ownership: environment system manages creation, visibility, and disposal.
     * @returns {any}
     */
    ensureLandmarksGroup() {
        if (!this.landmarksGroup) {
            const existing = this.world?.getSceneObject?.('celestial-landmarks') ||
                this.world?.scene?.children?.find?.(
                    (c) => c.name === 'celestial-landmarks'
                );
            if (existing) {
                this.landmarksGroup = existing;
            } else {
                this.landmarksGroup = createCelestialLandmarks();
                if (this.world?.scene) {
                    this.world.scene.add(this.landmarksGroup);
                }
            }
        }
        return this.landmarksGroup;
    }

    /**
     * Sets celestial landmarks visibility independently.
     * @param {boolean} visible
     * @returns {boolean | undefined}
     */
    setLandmarksVisible(visible) {
        const landmarks = this.ensureLandmarksGroup();
        if (landmarks) {
            landmarks.visible = Boolean(visible);
        }
        return landmarks?.visible;
    }

    /**
     * Ensures the procedural golden celestial belt group is available.
     * Attaches to landmarksGroup so it shares the celestial structures hierarchy
     * and preserves the 4 top-level scene objects in sceneGroup.
     * @returns {any}
     */
    ensureCelestialBelt() {
        if (!this.beltGroup) {
            const existing = this.world?.getSceneObject?.('celestial-belt') ||
                this.landmarksGroup?.getObjectByName?.('celestial-belt') ||
                this.world?.scene?.getObjectByName?.('celestial-belt');
            if (existing) {
                this.beltGroup = existing;
            } else {
                this.beltGroup = createCelestialBelt();
                const landmarks = this.ensureLandmarksGroup();
                if (typeof landmarks?.add === 'function') {
                    landmarks.add(this.beltGroup);
                } else if (typeof this.world?.scene?.add === 'function') {
                    this.world.scene.add(this.beltGroup);
                }
            }
        }
        return this.beltGroup;
    }

    /**
     * Sets celestial belt visibility independently.
     * @param {boolean} visible
     * @returns {boolean | undefined}
     */
    setBeltVisible(visible) {
        const belt = this.ensureCelestialBelt();
        if (belt) {
            belt.visible = Boolean(visible);
        }
        return belt?.visible;
    }

    /**
     * Sets celestial belt intensity uniform independently.
     * @param {number} intensity
     */
    setBeltIntensity(intensity) {
        const belt = this.ensureCelestialBelt();
        if (belt) {
            belt.traverse((child) => {
                if (child.material?.uniforms?.uBeltIntensity) {
                    child.material.uniforms.uBeltIntensity.value = intensity;
                }
                if (child.material?.uniforms?.uNodeIntensity) {
                    child.material.uniforms.uNodeIntensity.value = intensity;
                }
            });
        }
    }

    /**
     * Returns the active golden celestial belt group.
     * @returns {any}
     */
    getCelestialBelt() {
        return this.beltGroup || this.landmarksGroup?.getObjectByName?.('celestial-belt');
    }

    /**
     * Ensures the procedural OrreryVisualSystem instance is created and attached to landmarksGroup.
     * Reuses existing instance across showroom/gameplay transitions to prevent duplicate meshes.
     * Attaches to landmarksGroup so it shares the celestial structures hierarchy
     * and preserves the 4 top-level scene objects in sceneGroup.
     * @returns {OrreryVisualSystem}
     */
    ensureOrreryVisualSystem() {
        if (!this.narrativeDirector) {
            this.narrativeDirector = new NarrativeDirector({ eventBus: defaultEventBus });
        }
        if (!this.orreryVisualSystem) {
            this.orreryVisualSystem = new OrreryVisualSystem({
                narrativeDirector: this.narrativeDirector,
                parentGroup: this.landmarksGroup || null,
                eventBus: defaultEventBus,
                planetoidRenderer: this.planetoidRenderer
            });
            if (this.evolutionController && typeof this.evolutionController.getVisualStage === 'function' && typeof this.orreryVisualSystem.setVisualStage === 'function') {
                this.orreryVisualSystem.setVisualStage(this.evolutionController.getVisualStage());
            }
            if (this.orreryVisualSystem.group) {
                this.orreryVisualSystem.group.visible = (this.mode === 'gameplay' || this.mode === 'planet-showcase');
            }
        }
        if (this.landmarksGroup && this.orreryVisualSystem.group?.parent !== this.landmarksGroup) {
            if (typeof this.landmarksGroup.add === 'function') {
                this.landmarksGroup.add(this.orreryVisualSystem.group);
            }
        }
        return this.orreryVisualSystem;
    }

    /**
     * Ensures the procedural PlanetoidRenderer instance is created and attached to the Three.js scene.
     * Reuses existing instance across showroom/gameplay transitions to prevent duplicate meshes.
     * Attaches to landmarksGroup so it shares the celestial structures hierarchy
     * and preserves the 4 top-level scene objects in sceneGroup.
     * @returns {PlanetoidRenderer}
     */
    ensurePlanetoidRenderer() {
        if (!this.planetoidRenderer) {
            this.planetoidRenderer = new PlanetoidRenderer({
                radius: 0.035,
                scale: PLANETOID_DEFAULT_SCALE
            });
            if (this.planetoidRenderer.group) {
                // In gameplay mode, the Three-Body planetary body is the visible representation
                // of Our Planet. The close-up PlanetoidRenderer is hidden so it does not compete,
                // remaining active for showcase, showroom, and debug modes.
                const isCh2Active = (this.orreryVisualSystem && (this.orreryVisualSystem.getChapter() === 2 || (typeof this.orreryVisualSystem.isChapter2DebugActive === 'function' && this.orreryVisualSystem.isChapter2DebugActive())));
                this.planetoidRenderer.group.visible = !isCh2Active && ((this.mode === 'planet-showcase') || this.planetoidRenderer.isDebugMode());
            }
            if (this.orreryVisualSystem && typeof this.orreryVisualSystem.setPlanetoidRenderer === 'function') {
                this.orreryVisualSystem.setPlanetoidRenderer(this.planetoidRenderer);
            }
            if (!this.evolutionController) {
                this.evolutionController = new PlanetEvolutionController({
                    planetoidRenderer: this.planetoidRenderer,
                    eventBus: defaultEventBus
                });
            } else if (!this.evolutionController.planetoidRenderer) {
                this.evolutionController.setPlanetoidRenderer(this.planetoidRenderer);
            }
            if (!this.transformationController) {
                this.transformationController = new PlanetTransformationController({
                    evolutionController: this.evolutionController,
                    planetoidRenderer: this.planetoidRenderer,
                    eventBus: defaultEventBus,
                    autoTransform: true,
                });
            } else {
                if (!this.transformationController.evolutionController) {
                    this.transformationController.setEvolutionController(this.evolutionController);
                }
                if (!this.transformationController.planetoidRenderer) {
                    this.transformationController.setPlanetoidRenderer(this.planetoidRenderer);
                }
            }
            if (!this.unlockUI) {
                this.unlockUI = new PlanetUnlockUI({
                    eventBus: defaultEventBus,
                    planetoidRenderer: this.planetoidRenderer,
                    parentGroup: this.landmarksGroup,
                    autoSubscribe: false,
                });
            } else {
                if (!this.unlockUI.planetoidRenderer) {
                    this.unlockUI.setPlanetoidRenderer(this.planetoidRenderer);
                }
                if (this.landmarksGroup && this.unlockUI.group?.parent !== this.landmarksGroup) {
                    this.unlockUI.setParentGroup(this.landmarksGroup);
                }
            }
            if (!this.unlockCelebration) {
                this.unlockCelebration = new PlanetUnlockCelebration({
                    eventBus: defaultEventBus,
                    planetoidRenderer: this.planetoidRenderer,
                    unlockUI: this.unlockUI,
                    parentGroup: this.landmarksGroup,
                });
            } else {
                if (!this.unlockCelebration.planetoidRenderer) {
                    this.unlockCelebration.setPlanetoidRenderer(this.planetoidRenderer);
                }
                if (!this.unlockCelebration.unlockUI) {
                    this.unlockCelebration.setUnlockUI(this.unlockUI);
                }
                if (this.landmarksGroup && this.unlockCelebration.group?.parent !== this.landmarksGroup) {
                    this.unlockCelebration.setParentGroup(this.landmarksGroup);
                }
            }
            if (!this.narrativeDirector) {
                this.narrativeDirector = new NarrativeDirector({ eventBus: defaultEventBus });
            }
            if (!this.orreryVisualSystem) {
                this.orreryVisualSystem = new OrreryVisualSystem({
                    narrativeDirector: this.narrativeDirector,
                    parentGroup: this.landmarksGroup,
                    eventBus: defaultEventBus,
                    planetoidRenderer: this.planetoidRenderer
                });
                if (this.orreryVisualSystem.group) {
                    this.orreryVisualSystem.group.visible = (this.mode === 'gameplay' || this.mode === 'planet-showcase');
                }
            } else if (this.landmarksGroup && this.orreryVisualSystem.group?.parent !== this.landmarksGroup) {
                if (typeof this.landmarksGroup.add === 'function') {
                    this.landmarksGroup.add(this.orreryVisualSystem.group);
                }
            }
            if (this.orreryVisualSystem && this.evolutionController && typeof this.evolutionController.getVisualStage === 'function' && typeof this.orreryVisualSystem.setVisualStage === 'function') {
                this.orreryVisualSystem.setVisualStage(this.evolutionController.getVisualStage());
            }
            const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
            if (globalScope) {
                globalScope.planetoidRenderer = this.planetoidRenderer;
                globalScope.celestialEvolution = this.evolutionController;
                globalScope.celestialTransformation = this.transformationController;
                globalScope.planetUnlockCelebration = this.unlockCelebration;
                globalScope.narrativeDirector = this.narrativeDirector;
                globalScope.orreryVisualSystem = this.orreryVisualSystem;
                globalScope.planetUnlockUI = {
                    showStage: (s = 2) => this.unlockUI?.showStage(s),
                    show: (s = 2) => this.unlockUI?.show(s),
                    hide: () => this.unlockUI?.hide(),
                    isVisible: () => this.unlockUI?.isVisible(),
                    getState: () => this.unlockUI?.getState(),
                    getPhase: () => this.unlockUI?.getPhase(),
                    getProgress: () => this.unlockUI?.getProgress(),
                    getDebugInfo: () => this.unlockUI?.getDebugInfo(),
                    getWorldPosition: () => this.unlockUI?.getWorldPosition(),
                    getWorldScale: () => this.unlockUI?.getWorldScale(),
                    debugForceVisible: (s = 2) => this.unlockUI?.debugForceVisible(s),
                    reset: () => this.unlockUI?.hide(),
                };
                globalScope.__CELESTIAL_PLANETOID_DEBUG__ = {
                    setStage: (s) => {
                        const res = this.planetoidRenderer?.setDebugStage(s);
                        const landmarks = this.ensureLandmarksGroup();
                        if (landmarks && this.planetoidRenderer?.group?.parent !== landmarks) {
                            landmarks.add(this.planetoidRenderer.group);
                        }
                        if (landmarks) {
                            landmarks.visible = true;
                        }
                        if (this.planetoidRenderer?.group) {
                            this.planetoidRenderer.group.visible = true;
                        }
                        return res;
                    },
                    transitionToStage: (s) => {
                        const res = this.planetoidRenderer?.transitionToStage(s);
                        const landmarks = this.ensureLandmarksGroup();
                        if (landmarks && this.planetoidRenderer?.group?.parent !== landmarks) {
                            landmarks.add(this.planetoidRenderer.group);
                        }
                        if (landmarks) {
                            landmarks.visible = true;
                        }
                        if (this.planetoidRenderer?.group) {
                            this.planetoidRenderer.group.visible = true;
                        }
                        return res;
                    },
                    clear: () => {
                        this.planetoidRenderer?.clearDebugStage();
                        if (this.mode !== 'gameplay' && this.mode !== 'planet-showcase') {
                            if (this.planetoidRenderer?.group) {
                                this.planetoidRenderer.group.visible = false;
                            }
                            if (this.landmarksGroup) {
                                this.landmarksGroup.visible = false;
                            }
                        }
                    },
                    getStage: () => this.planetoidRenderer?.getDebugStage(),
                    getTargetStage: () => this.planetoidRenderer?.getTargetStage(),
                    getVisualStage: () => this.planetoidRenderer?.getVisualStage(),
                    setVisualStage: (s) => this.planetoidRenderer?.setVisualStage(s),
                    playAwakening: (duration = 1.85) => {
                        const res = this.planetoidRenderer?.playAwakening(duration);
                        const landmarks = this.ensureLandmarksGroup();
                        if (landmarks && this.planetoidRenderer?.group?.parent !== landmarks) {
                            landmarks.add(this.planetoidRenderer.group);
                        }
                        if (landmarks) {
                            landmarks.visible = true;
                        }
                        if (this.planetoidRenderer?.group) {
                            this.planetoidRenderer.group.visible = true;
                        }
                        return res;
                    },
                    resetAwakening: () => this.planetoidRenderer?.resetAwakening(),
                    getAwakeningProgress: () => this.planetoidRenderer?.getAwakeningProgress(),
                    getAwakeningPhase: () => this.planetoidRenderer?.getAwakeningPhase(),
                    setAnchor: (x, y, z) => this.planetoidRenderer?.setAnchorPosition(x, y, z),
                    getAnchor: () => this.planetoidRenderer?.getAnchorPosition(),
                    setScale: (s) => this.planetoidRenderer?.setScale(s),
                    getScale: () => this.planetoidRenderer?.getScale(),
                    setShowcaseMode: (m) => this.setPlanetShowcaseMode(m),
                    isShowcaseMode: () => this.isPlanetShowcaseMode(),
                    getShowcaseScale: () => this.planetoidRenderer?.getShowcaseScale(),
                    getShowcaseAnchor: () => this.planetoidRenderer?.getShowcaseAnchor(),
                    getGameplayScale: () => this.planetoidRenderer?.getGameplayScale(),
                    getGameplayAnchor: () => this.planetoidRenderer?.getGameplayAnchor(),
                    startTransformation: (cfg) => this.planetoidRenderer?.startTransformation(cfg),
                    updateTransformation: (p, phase, params) => this.planetoidRenderer?.updateTransformation(p, phase, params),
                    finishTransformation: (s) => this.planetoidRenderer?.finishTransformation(s),
                    cancelTransformation: () => this.planetoidRenderer?.cancelTransformation(),
                    evolution: this.evolutionController,
                    transformation: this.transformationController,
                    unlockCelebration: this.unlockCelebration,
                    playCelebration: (s = 2) => this.unlockCelebration?.play(s),
                    debugShowCelebration: (s = 2) => this.unlockCelebration?.debugShow(s),
                    unlockUI: this.unlockUI,
                    showUnlockUI: (s = 2) => this.unlockUI?.showStage(s),
                    hideUnlockUI: () => this.unlockUI?.hide(),
                    isUnlockUIVisible: () => this.unlockUI?.isVisible(),
                    getUnlockUIDebugInfo: () => this.unlockUI?.getDebugInfo(),
                    debugForceUnlockUI: (s = 2) => this.unlockUI?.debugForceVisible(s),
                };
            }
        }
        // Attach to landmarks if in gameplay/showcase mode or if landmarksGroup already exists
        if (this.landmarksGroup && this.planetoidRenderer.group?.parent !== this.landmarksGroup) {
            if (typeof this.landmarksGroup.add === 'function') {
                this.landmarksGroup.add(this.planetoidRenderer.group);
                if (this.unlockCelebration && this.unlockCelebration.group?.parent !== this.landmarksGroup) {
                    this.unlockCelebration.setParentGroup(this.landmarksGroup);
                }
                if (this.unlockUI && this.unlockUI.group?.parent !== this.landmarksGroup) {
                    this.unlockUI.setParentGroup(this.landmarksGroup);
                }
                if (this.orreryVisualSystem && this.orreryVisualSystem.group?.parent !== this.landmarksGroup) {
                    this.landmarksGroup.add(this.orreryVisualSystem.group);
                }
            } else if (typeof this.world?.scene?.add === 'function' && this.planetoidRenderer.group?.parent !== this.world.scene) {
                this.world.scene.add(this.planetoidRenderer.group);
            }
        } else if (this.mode === 'gameplay' || this.mode === 'planet-showcase') {
            const landmarks = this.ensureLandmarksGroup();
            if (typeof landmarks?.add === 'function' && this.planetoidRenderer.group?.parent !== landmarks) {
                landmarks.add(this.planetoidRenderer.group);
                if (this.unlockCelebration && this.unlockCelebration.group?.parent !== landmarks) {
                    this.unlockCelebration.setParentGroup(landmarks);
                }
                if (this.unlockUI && this.unlockUI.group?.parent !== landmarks) {
                    this.unlockUI.setParentGroup(landmarks);
                }
                if (this.orreryVisualSystem && this.orreryVisualSystem.group?.parent !== landmarks) {
                    landmarks.add(this.orreryVisualSystem.group);
                }
            } else if (typeof this.world?.scene?.add === 'function' && this.planetoidRenderer.group?.parent !== this.world.scene) {
                this.world.scene.add(this.planetoidRenderer.group);
            }
        }
        return this.planetoidRenderer;
    }

    /**
     * Resolves a stable celestial anchor in front of the player.
     * In gameplay mode: derived once from active camera (target -1.80m behind Kendama)
     *   or defaults to canonical hero-scale anchor (0.0, 1.48, -1.80).
     * In planet-showcase mode: centers the planet directly along the camera viewing axis,
     *   occupying ~74% of viewport height at showcase scale ~40.0.
     */
    updatePlanetoidAnchorFromCamera() {
        if (!this.planetoidRenderer) return;

        const isShowcase = (this.mode === 'planet-showcase');
        const defaultAnchor = isShowcase ? PLANETOID_SHOWCASE_ANCHOR : PLANETOID_DEFAULT_ANCHOR;

        let anchorX = defaultAnchor.x;
        let anchorY = defaultAnchor.y;
        let anchorZ = defaultAnchor.z;

        const camera = this.world?.camera;
        if (camera && typeof camera.getWorldPosition === 'function' && typeof camera.getWorldDirection === 'function') {
            const camPos = this._cachedCamPos || (this._cachedCamPos = new Vector3());
            camera.getWorldPosition(camPos);
            const camDir = this._cachedCamDir || (this._cachedCamDir = new Vector3());
            camera.getWorldDirection(camDir);

            if (camPos.lengthSq() > 0.01 || Math.abs(camDir.z) > 0.1) {
                if (camDir.lengthSq() > 0.001) {
                    camDir.normalize();

                    if (isShowcase) {
                        // In showcase mode: center planet along camera forward sightline
                        const showcaseDistance = 2.70;
                        anchorX = camPos.x + camDir.x * showcaseDistance;
                        anchorY = camPos.y + camDir.y * showcaseDistance;
                        anchorZ = camPos.z + camDir.z * showcaseDistance;

                        // Calibrate showcase scale if camera fov is available to guarantee ~58% viewport height (accommodating celestial rings)
                        if (typeof camera.fov === 'number' && Number.isFinite(camera.fov) && camera.fov > 10) {
                            const vFovRad = (camera.fov * Math.PI) / 180;
                            const visibleHeight = 2.0 * showcaseDistance * Math.tan(vFovRad / 2.0);
                            const calibratedScale = (visibleHeight * 0.58) / (2.0 * this.planetoidRenderer.radius);
                            this.planetoidRenderer.setShowcaseScale(calibratedScale);
                        }
                    } else {
                        // Maintain centered alignment along the player's viewing axis
                        anchorX = Math.abs(camDir.x) > 0.05 ? (camPos.x + camDir.x * 1.80) : 0.0;
                        // Keep Y in comfortable seated viewing height 1.45 - 1.50m
                        const derivedY = camPos.y > 0.5 ? camPos.y - 0.10 : PLANETOID_DEFAULT_ANCHOR.y;
                        anchorY = Math.max(1.45, Math.min(1.50, derivedY));
                        // Depth: target -1.7m to -1.9m behind the Kendama
                        const targetDepth = -1.80;
                        const derivedZ = camPos.z !== 0 ? (camPos.z + targetDepth) : targetDepth;
                        anchorZ = Math.max(-1.90, Math.min(-1.70, derivedZ));
                    }
                }
            }
        }

        if (isShowcase) {
            this.planetoidRenderer.setShowcaseAnchor(anchorX, anchorY, anchorZ);
        } else {
            this.planetoidRenderer.setAnchorPosition(anchorX, anchorY, anchorZ);
        }
    }

    /**
     * Returns the active PlanetoidRenderer instance.
     * @returns {PlanetoidRenderer | null}
     */
    getPlanetoidRenderer() {
        return this.planetoidRenderer;
    }

    /**
     * Sets stardust visibility independently from nebula and starfield.
     * @param {boolean} visible
     * @returns {boolean | undefined}
     */
    setStardustVisible(visible) {
        const stardust = this.ensureStardustMesh();
        if (stardust) {
            stardust.visible = Boolean(visible);
        }
        return stardust?.visible;
    }

    /**
     * Sets stardust intensity uniform independently from nebula and starfield.
     * @param {number} intensity
     */
    setStardustIntensity(intensity) {
        const stardust = this.ensureStardustMesh();
        if (stardust?.material?.uniforms?.uStardustIntensity) {
            stardust.material.uniforms.uStardustIntensity.value = intensity;
        }
    }

    /**
     * Sets starfield visibility independently from nebula.
     * @param {boolean} visible
     * @returns {boolean | undefined}
     */
    setStarfieldVisible(visible) {
        const starfield = this.ensureStarfieldMesh();
        if (starfield) {
            starfield.visible = Boolean(visible);
        }
        return starfield?.visible;
    }

    /**
     * Sets starfield intensity uniform independently from nebula.
     * @param {number} intensity
     */
    setStarfieldIntensity(intensity) {
        const starfield = this.ensureStarfieldMesh();
        if (starfield?.material?.uniforms?.uStarfieldIntensity) {
            starfield.material.uniforms.uStarfieldIntensity.value = intensity;
        }
    }

    /**
     * Sets nebula visibility independently from starfield.
     * @param {boolean} visible
     * @returns {boolean | undefined}
     */
    setNebulaVisible(visible) {
        const nebula = this.ensureNebulaMesh();
        if (nebula) {
            nebula.visible = Boolean(visible);
        }
        return nebula?.visible;
    }

    /**
     * Sets nebula intensity uniform independently from starfield.
     * @param {number} intensity
     */
    setNebulaIntensity(intensity) {
        const nebula = this.ensureNebulaMesh();
        if (nebula?.material?.uniforms?.uNebulaIntensity) {
            nebula.material.uniforms.uNebulaIntensity.value = intensity;
        }
    }

    /**
     * Switches the environment mode.
     * @param {'showroom' | 'gameplay'} mode - Target mode.
     * @returns {boolean} True if successfully switched.
     */
    /**
     * Wires Three.js 'childadded' event listeners to handle late-loaded assets.
     * @param {any} node
     * @param {'cup-preview' | 'select-plinth'} type
     */
    wireChildAddedListener(node, type) {
        if (!node || typeof node.addEventListener !== 'function') return;
        if (type === 'cup-preview' && this.wiredCupPreviewNode === node) return;
        if (type === 'select-plinth' && this.wiredSelectPlinthNode === node) return;

        if (type === 'cup-preview') this.wiredCupPreviewNode = node;
        if (type === 'select-plinth') this.wiredSelectPlinthNode = node;

        const onChildAdded = (event) => {
            const child = event?.child || event?.object;
            if (child) {
                this._visibilityDirty = true;
                if (this.mode === 'gameplay') {
                    this.applyGameplayVisibility();
                } else if (this.mode === 'planet-showcase') {
                    this.applyShowcaseVisibility();
                }
            }
        };

        node.addEventListener('childadded', onChildAdded);
        if (Array.isArray(this.cleanupFuncs)) {
            this.cleanupFuncs.push(() => {
                if (typeof node.removeEventListener === 'function') {
                    node.removeEventListener('childadded', onChildAdded);
                }
            });
        }
    }

    /**
     * Applies gameplay visibility across showroom and Kendama hierarchies.
     */
    applyGameplayVisibility() {
        this._visibilityDirty = false;
        // 1. Standalone showroom objects to hide
        for (const id of SHOWROOM_NODE_IDS_TO_HIDE) {
            const obj = this.findSceneObject(id);
            if (obj) {
                this.recordBaseline(obj);
                obj.visible = false;
            }
        }

        // Also track originalStudioFloorVisible if studio-floor was found
        const floor = this.findSceneObject('studio-floor', 'Studio Floor');
        if (floor && this.originalStudioFloorVisible === null && typeof floor.visible === 'boolean') {
            this.originalStudioFloorVisible = this.visibilityBaseline.get(floor) ?? floor.visible;
        }

        // 2. Select Plinth and children: keep Kendama root visible, hide pedestal & accessories
        const selectPlinth = this.findSceneObject('select-plinth', 'Select Plinth');
        const cupPreview = this.findSceneObject('cup-preview', 'Big Cup Preview');

        if (selectPlinth) {
            this.recordBaseline(selectPlinth);
            selectPlinth.visible = true; // Crucial: must remain visible so cup-preview renders
            this.wireChildAddedListener(selectPlinth, 'select-plinth');

            if (Array.isArray(selectPlinth.children)) {
                for (const child of selectPlinth.children) {
                    const isKendama = (child === cupPreview) ||
                        (child.name === 'cup-preview') ||
                        (child.name?.includes('preview-root')) ||
                        (typeof child.getObjectByName === 'function' && !!child.getObjectByName('big-cup-three-quarter'));

                    this.recordBaseline(child);
                    if (isKendama) {
                        child.visible = true;
                    } else {
                        child.visible = false;
                    }
                }
            }
        }

        // 3. Kendama inspection views: hide auxiliary views, keep center assembly visible
        const resolvedCupPreview = cupPreview || selectPlinth?.getObjectByName?.('cup-preview') || null;
        if (resolvedCupPreview) {
            this.recordBaseline(resolvedCupPreview);
            resolvedCupPreview.visible = true;
            this.wireChildAddedListener(resolvedCupPreview, 'cup-preview');

            for (const auxName of KENDAMA_AUXILIARY_MODELS_TO_HIDE) {
                const auxModel = resolvedCupPreview.getObjectByName?.(auxName);
                if (auxModel) {
                    this.recordBaseline(auxModel);
                    auxModel.visible = false;
                }
            }

            for (const activeName of KENDAMA_ACTIVE_MODEL_TO_KEEP) {
                const activeModel = resolvedCupPreview.getObjectByName?.(activeName);
                if (activeModel) {
                    this.recordBaseline(activeModel);
                    activeModel.visible = true;
                }
            }

            // Gameplay framing: strengthen Kendama focal point to occupy ~10-15% of vertical frame
            if (!this.kendamaOriginalTransform) {
                this.kendamaOriginalTransform = {
                    posZ: resolvedCupPreview.position?.z ?? -0.02,
                    posY: resolvedCupPreview.position?.y ?? 1.1,
                    scaleX: resolvedCupPreview.scale?.x ?? 1.0,
                    scaleY: resolvedCupPreview.scale?.y ?? 1.0,
                    scaleZ: resolvedCupPreview.scale?.z ?? 1.0,
                };
            }
            if (resolvedCupPreview.position && typeof resolvedCupPreview.position.set === 'function') {
                resolvedCupPreview.position.z = 0.38;
                resolvedCupPreview.position.y = 1.12;
            }
            if (resolvedCupPreview.scale && typeof resolvedCupPreview.scale.set === 'function') {
                resolvedCupPreview.scale.set(1.35, 1.35, 1.35);
            }

            // The physical Kendama ball (celestial-tama) remains visible in gameplay mode
            const tamaMesh = resolvedCupPreview.getObjectByName?.('celestial-tama');
            if (tamaMesh) {
                this.recordBaseline(tamaMesh);
                tamaMesh.visible = true;
            }

            const planetoid = this.ensurePlanetoidRenderer();
            if (planetoid) {
                this.updatePlanetoidAnchorFromCamera();
                if (planetoid.group) {
                    planetoid.group.visible = true;
                }
            }
        }
    }

    /**
     * Applies showcase visibility: hides showroom furniture and hides Kendama visually,
     * while leaving all physics, game loops, and contracts running unaffected.
     */
    applyShowcaseVisibility() {
        this._visibilityDirty = false;
        // 1. Standalone showroom objects to hide
        for (const id of SHOWROOM_NODE_IDS_TO_HIDE) {
            const obj = this.findSceneObject(id);
            if (obj) {
                this.recordBaseline(obj);
                obj.visible = false;
            }
        }

        // Also track originalStudioFloorVisible if studio-floor was found
        const floor = this.findSceneObject('studio-floor', 'Studio Floor');
        if (floor && this.originalStudioFloorVisible === null && typeof floor.visible === 'boolean') {
            this.originalStudioFloorVisible = this.visibilityBaseline.get(floor) ?? floor.visible;
        }

        // 2. Select Plinth and children: hide completely in showcase mode
        const selectPlinth = this.findSceneObject('select-plinth', 'Select Plinth');
        if (selectPlinth) {
            this.recordBaseline(selectPlinth);
            selectPlinth.visible = false;
            this.wireChildAddedListener(selectPlinth, 'select-plinth');

            if (Array.isArray(selectPlinth.children)) {
                for (const child of selectPlinth.children) {
                    this.recordBaseline(child);
                    child.visible = false;
                }
            }
        }

        // 3. Kendama inspection views & Tama: hide completely in showcase mode
        const cupPreview = this.findSceneObject('cup-preview', 'Big Cup Preview') ||
            selectPlinth?.getObjectByName?.('cup-preview') || null;
        if (cupPreview) {
            this.recordBaseline(cupPreview);
            cupPreview.visible = false;
            this.wireChildAddedListener(cupPreview, 'cup-preview');

            for (const auxName of KENDAMA_AUXILIARY_MODELS_TO_HIDE) {
                const auxModel = cupPreview.getObjectByName?.(auxName);
                if (auxModel) {
                    this.recordBaseline(auxModel);
                    auxModel.visible = false;
                }
            }

            for (const activeName of KENDAMA_ACTIVE_MODEL_TO_KEEP) {
                const activeModel = cupPreview.getObjectByName?.(activeName);
                if (activeModel) {
                    this.recordBaseline(activeModel);
                    activeModel.visible = false;
                }
            }

            const tamaMesh = cupPreview.getObjectByName?.('celestial-tama');
            if (tamaMesh) {
                this.recordBaseline(tamaMesh);
                tamaMesh.visible = false;
            }
        }

        const planetoid = this.ensurePlanetoidRenderer();
        if (planetoid) {
            planetoid.setShowcaseMode(true);
            this.updatePlanetoidAnchorFromCamera();
            if (planetoid.group) {
                planetoid.group.visible = true;
            }
        }
    }

    /**
     * Restores all managed objects to their exact authored visibility states.
     */
    restoreShowroomVisibility() {
        this._visibilityDirty = false;
        for (const [obj, originalVisible] of this.visibilityBaseline.entries()) {
            if (obj && typeof obj.visible === 'boolean') {
                obj.visible = originalVisible;
            }
        }

        // Hide PlanetoidRenderer in showroom mode unless debug mode active
        if (this.planetoidRenderer?.group && !this.planetoidRenderer.isDebugMode()) {
            this.planetoidRenderer.group.visible = false;
        }

        // Restore Kendama preview position and scale to authored showroom pedestal values
        if (this.kendamaOriginalTransform) {
            const selectPlinth = this.findSceneObject('select-plinth', 'Select Plinth');
            const cupPreview = this.findSceneObject('cup-preview', 'Big Cup Preview') ||
                selectPlinth?.getObjectByName?.('cup-preview') || null;
            if (cupPreview) {
                if (cupPreview.position && typeof cupPreview.position.set === 'function') {
                    cupPreview.position.z = this.kendamaOriginalTransform.posZ;
                    cupPreview.position.y = this.kendamaOriginalTransform.posY;
                }
                if (cupPreview.scale && typeof cupPreview.scale.set === 'function') {
                    cupPreview.scale.set(
                        this.kendamaOriginalTransform.scaleX,
                        this.kendamaOriginalTransform.scaleY,
                        this.kendamaOriginalTransform.scaleZ
                    );
                }
            }
        }
    }

    /**
     * Switches the environment mode.
     * @param {'showroom' | 'gameplay' | 'planet-showcase'} mode - Target mode.
     * @returns {boolean} True if successfully switched.
     */
    setMode(mode) {
        if (mode !== 'showroom' && mode !== 'gameplay' && mode !== 'planet-showcase') {
            console.warn(`[CelestialEnvironmentSystem] Unknown mode "${mode}". Expected "showroom", "gameplay", or "planet-showcase".`);
            return false;
        }

        this.mode = mode;
        this.activeConfig = (mode === 'showroom')
            ? SHOWROOM_ENVIRONMENT_CONFIG
            : GAMEPLAY_PASTEL_GALAXY_CONFIG;

        const levelRoot = this.getLevelRoot();
        if (levelRoot) {
            applyEnvironmentConfig(levelRoot, this.activeConfig);
        }

        if (mode === 'planet-showcase') {
            // Apply showcase visibility: hides showroom furniture & hides Kendama visually
            this.applyShowcaseVisibility();

            // Activate celestial rendering components (reusing instances, no duplicates)
            const nebula = this.ensureNebulaMesh();
            if (nebula) {
                nebula.visible = true;
            }
            const starfield = this.ensureStarfieldMesh();
            if (starfield) {
                starfield.visible = true;
            }
            const stardust = this.ensureStardustMesh();
            if (stardust) {
                stardust.visible = true;
            }
            const landmarks = this.ensureLandmarksGroup();
            if (landmarks) {
                landmarks.visible = true;
            }
            const belt = this.ensureCelestialBelt();
            if (belt) {
                belt.visible = true;
            }
            const planetoid = this.ensurePlanetoidRenderer();
            if (planetoid) {
                planetoid.setShowcaseMode(true);
                this.updatePlanetoidAnchorFromCamera();
                if (planetoid.group) {
                    planetoid.group.visible = true;
                }
            }
            const orrery = this.ensureOrreryVisualSystem();
            if (orrery) {
                if (this.evolutionController && typeof this.evolutionController.getVisualStage === 'function' && typeof orrery.setVisualStage === 'function') {
                    orrery.setVisualStage(this.evolutionController.getVisualStage());
                }
                orrery.setVisible(true);
            }
        } else if (mode === 'gameplay') {
            // Apply gameplay visibility (hiding showroom furniture and auxiliary Kendama views)
            this.applyGameplayVisibility();

            // Activate celestial rendering components (reusing instances, no duplicates)
            const nebula = this.ensureNebulaMesh();
            if (nebula) {
                nebula.visible = true;
            }
            const starfield = this.ensureStarfieldMesh();
            if (starfield) {
                starfield.visible = true;
            }
            const stardust = this.ensureStardustMesh();
            if (stardust) {
                stardust.visible = true;
            }
            const landmarks = this.ensureLandmarksGroup();
            if (landmarks) {
                landmarks.visible = true;
            }
            const belt = this.ensureCelestialBelt();
            if (belt) {
                belt.visible = true;
            }
            const planetoid = this.ensurePlanetoidRenderer();
            if (planetoid) {
                planetoid.setShowcaseMode(false);
                this.updatePlanetoidAnchorFromCamera();
                if (planetoid.group) {
                    // Close-up PlanetoidRenderer is hidden during gameplay in favor of the Three-Body system
                    const isCh2Active = (this.orreryVisualSystem && (this.orreryVisualSystem.getChapter() === 2 || (typeof this.orreryVisualSystem.isChapter2DebugActive === 'function' && this.orreryVisualSystem.isChapter2DebugActive())));
                    planetoid.group.visible = !isCh2Active && Boolean(planetoid.isDebugMode());
                }
            }
            const orrery = this.ensureOrreryVisualSystem();
            if (orrery) {
                if (this.evolutionController && typeof this.evolutionController.getVisualStage === 'function' && typeof orrery.setVisualStage === 'function') {
                    orrery.setVisualStage(this.evolutionController.getVisualStage());
                }
                orrery.setVisible(true);
            }
        } else {
            // Restore original showroom visibility states from baseline
            this.restoreShowroomVisibility();

            // Hide celestial components without disposing them
            if (this.nebulaMesh) {
                this.nebulaMesh.visible = false;
            }
            if (this.starfieldMesh) {
                this.starfieldMesh.visible = false;
            }
            if (this.stardustMesh) {
                this.stardustMesh.visible = false;
            }
            if (this.landmarksGroup) {
                this.landmarksGroup.visible = false;
            }
            if (this.beltGroup) {
                this.beltGroup.visible = false;
            }
            if (this.orreryVisualSystem) {
                this.orreryVisualSystem.setVisible(false);
            }
            if (this.planetoidRenderer) {
                this.planetoidRenderer.setShowcaseMode(false);
                if (this.planetoidRenderer.group && !this.planetoidRenderer.isDebugMode()) {
                    this.planetoidRenderer.group.visible = false;
                }
            }
        }

        return true;
    }

    /**
     * Toggles dedicated Planet Showcase Mode on or off.
     * When enabled, the planet is prominently hero-scaled and centered, and Kendama is hidden.
     * When disabled, reverts to normal gameplay composition.
     *
     * @param {boolean} [enabled=true]
     * @returns {boolean} True if successfully switched.
     */
    setPlanetShowcaseMode(enabled = true) {
        return this.setMode(enabled ? 'planet-showcase' : 'gameplay');
    }

    /**
     * Returns whether Planet Showcase Mode is currently active.
     * @returns {boolean}
     */
    isPlanetShowcaseMode() {
        return this.mode === 'planet-showcase';
    }

    /**
     * Toggles between showroom and gameplay environment modes.
     * If currently in planet-showcase, returns to gameplay.
     * @returns {'showroom' | 'gameplay'} The new active mode.
     */
    toggleMode() {
        const nextMode = (this.mode === 'showroom')
            ? 'gameplay'
            : (this.mode === 'planet-showcase' ? 'gameplay' : 'showroom');
        this.setMode(nextMode);
        return this.mode;
    }

    /**
     * Returns the current environment mode.
     * @returns {'showroom' | 'gameplay' | 'planet-showcase'}
     */
    getMode() {
        return this.mode;
    }

    /**
     * Returns the active procedural nebula mesh.
     * @returns {any}
     */
    getNebulaMesh() {
        return this.nebulaMesh;
    }

    /**
     * Returns the active procedural starfield mesh.
     * @returns {any}
     */
    getStarfieldMesh() {
        return this.starfieldMesh;
    }

    /**
     * Returns the active procedural stardust mesh.
     * @returns {any}
     */
    getStardustMesh() {
        return this.stardustMesh;
    }

    /**
     * Returns the active procedural celestial landmarks group.
     * @returns {any}
     */
    getLandmarksGroup() {
        return this.landmarksGroup;
    }

    update(dt) {
        if (this.mode === 'gameplay' || this.mode === 'planet-showcase') {
            const levelRoot = this.getLevelRoot();
            if (levelRoot) {
                const currentSky = levelRoot.getVectorView?.(DomeGradient, 'sky');
                const targetSky = GAMEPLAY_PASTEL_GALAXY_CONFIG.domeGradient.sky;
                if (currentSky && currentSky[0] !== targetSky[0]) {
                    applyEnvironmentConfig(levelRoot, this.activeConfig);
                }
            }

            // Enforce appropriate visibility only when hierarchy/mode state is dirty
            if (this._visibilityDirty) {
                if (this.mode === 'planet-showcase') {
                    this.applyShowcaseVisibility();
                } else {
                    this.applyGameplayVisibility();
                }
                this._visibilityDirty = false;
            }

            const deltaSeconds = (typeof dt === 'number' && Number.isFinite(dt)) ? dt : 0.016;

            // Animate procedural nebula time
            if (this.nebulaMesh && this.nebulaMesh.visible) {
                const mat = this.nebulaMesh.material;
                if (mat?.uniforms?.uTime) {
                    mat.uniforms.uTime.value += deltaSeconds;
                }
            }

            // Animate procedural starfield time
            if (this.starfieldMesh && this.starfieldMesh.visible) {
                const mat = this.starfieldMesh.material;
                if (mat?.uniforms?.uTime) {
                    mat.uniforms.uTime.value += deltaSeconds;
                }
            }

            // Animate procedural stardust time
            if (this.stardustMesh && this.stardustMesh.visible) {
                const mat = this.stardustMesh.material;
                if (mat?.uniforms?.uTime) {
                    mat.uniforms.uTime.value += deltaSeconds;
                }
            }

            // Animate procedural golden celestial belt drift and shimmer
            if (this.beltGroup && this.beltGroup.visible) {
                updateCelestialBelt(this.beltGroup, deltaSeconds);
            }
        }

        // Ensure standalone foreground PlanetoidRenderer never competes during Chapter 2
        const isCh2Active = (this.orreryVisualSystem && (this.orreryVisualSystem.getChapter() === 2 || (typeof this.orreryVisualSystem.isChapter2DebugActive === 'function' && this.orreryVisualSystem.isChapter2DebugActive())));
        if (isCh2Active && this.planetoidRenderer?.group && !this.planetoidRenderer.isDebugMode()) {
            this.planetoidRenderer.group.visible = false;
        }

        // Update PlanetoidRenderer driven by read-only BallState & PlanetState
        if (this.planetoidRenderer && (this.mode === 'gameplay' || this.mode === 'planet-showcase' || this.planetoidRenderer.isDebugMode())) {
            const deltaSeconds = (typeof dt === 'number' && Number.isFinite(dt)) ? dt : 0.016;

            let activeBallState = this.lastBallState;
            if (!activeBallState) {
                if (!this._defaultSeatedBallState) {
                    this._defaultSeatedBallState = new BallState({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, BallMode.SEATED);
                }
                activeBallState = this._defaultSeatedBallState;
            }

            let activePlanetState = this.lastPlanetState;
            if (!activePlanetState) {
                if (!this._defaultPlanetState) {
                    this._defaultPlanetState = new PlanetState();
                }
                activePlanetState = this._defaultPlanetState;
            }

            this.planetoidRenderer.update(deltaSeconds, activeBallState, activePlanetState);
            this.evolutionController?.update(deltaSeconds);
            this.transformationController?.update(deltaSeconds);
            this.unlockCelebration?.update(deltaSeconds);
            this.unlockUI?.update(deltaSeconds);
        }

        // Animate procedural Orrery visual system
        if (this.orreryVisualSystem && (this.mode === 'gameplay' || this.mode === 'planet-showcase' || this.orreryVisualSystem.isVisible())) {
            const deltaSeconds = (typeof dt === 'number' && Number.isFinite(dt)) ? dt : 0.016;
            if (this.evolutionController && typeof this.evolutionController.getVisualStage === 'function' && typeof this.orreryVisualSystem.setVisualStage === 'function') {
                this.orreryVisualSystem.setVisualStage(this.evolutionController.getVisualStage());
            }
            this.orreryVisualSystem.update(deltaSeconds);

            // Section 12: Temporarily quiet background during three-body alignment & pulse for enhanced contrast
            if (typeof this.orreryVisualSystem.getAlignmentVisualState === 'function') {
                const alignVis = this.orreryVisualSystem.getAlignmentVisualState();
                if (alignVis.active) {
                    let nebulaTarget = 0.85;
                    let beltTarget = 0.95;
                    if (alignVis.phase === 'CONVERGING' || alignVis.phase === 'ALIGNED') {
                        nebulaTarget = 0.75;
                        beltTarget = 0.75;
                    } else if (alignVis.phase === 'PULSE') {
                        nebulaTarget = 0.68;
                        beltTarget = 0.48;
                    } else if (alignVis.phase === 'REVEAL_HOLD') {
                        nebulaTarget = 0.72;
                        beltTarget = 0.58;
                    } else if (alignVis.phase === 'RETURNING') {
                        nebulaTarget = 0.80;
                        beltTarget = 0.82;
                    }
                    if (this.nebulaMesh?.material?.uniforms?.uNebulaIntensity) {
                        this.nebulaMesh.material.uniforms.uNebulaIntensity.value = nebulaTarget;
                    }
                    if (this.beltGroup) {
                        this.setBeltIntensity(beltTarget);
                    }
                } else {
                    // Restore exact normal baseline
                    if (this.nebulaMesh?.material?.uniforms?.uNebulaIntensity && this.nebulaMesh.material.uniforms.uNebulaIntensity.value !== 0.85) {
                        this.nebulaMesh.material.uniforms.uNebulaIntensity.value = 0.85;
                    }
                    if (this.beltGroup) {
                        this.setBeltIntensity(0.95);
                    }
                }
            }
        }
    }

    destroy() {
        if (this.orreryVisualSystem) {
            this.orreryVisualSystem.destroy();
            this.orreryVisualSystem = null;
        }
        if (this.narrativeDirector) {
            this.narrativeDirector.destroy();
            this.narrativeDirector = null;
        }
        if (this.unlockCelebration) {
            this.unlockCelebration.destroy();
            this.unlockCelebration = null;
        }
        if (this.unlockUI) {
            this.unlockUI.destroy();
            this.unlockUI = null;
        }
        if (this.transformationController) {
            this.transformationController.destroy();
            this.transformationController = null;
        }
        if (this.evolutionController) {
            this.evolutionController.destroy();
            this.evolutionController = null;
        }
        if (this.planetoidRenderer) {
            this.planetoidRenderer.setShowcaseMode(false);
        }
        // Restore showroom visibility before destroying
        this.restoreShowroomVisibility();
        this.visibilityBaseline.clear();

        // Clean up EventBus listeners
        if (Array.isArray(this.eventUnsubs)) {
            this.eventUnsubs.forEach((unsub) => unsub());
            this.eventUnsubs = [];
        }

        // Dispose PlanetoidRenderer
        if (this.planetoidRenderer) {
            this.planetoidRenderer.group?.removeFromParent?.();
            this.planetoidRenderer.dispose();
            this.planetoidRenderer = null;
        }
        const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
        if (globalScope) {
            if (globalScope.planetoidRenderer === this.planetoidRenderer) {
                globalScope.planetoidRenderer = null;
            }
            if (globalScope.narrativeDirector === this.narrativeDirector) {
                globalScope.narrativeDirector = null;
            }
            if (globalScope.orreryVisualSystem === this.orreryVisualSystem) {
                globalScope.orreryVisualSystem = null;
            }
        }

        // Dispose celestial objects owned exclusively by this system
        if (this.beltGroup) {
            disposeCelestialBelt(this.beltGroup);
            this.beltGroup.removeFromParent?.();
            this.beltGroup = null;
        }
        if (this.nebulaMesh) {
            this.nebulaMesh.removeFromParent?.();
            this.nebulaMesh.geometry?.dispose?.();
            this.nebulaMesh.material?.dispose?.();
            this.nebulaMesh = null;
        }
        if (this.starfieldMesh) {
            this.starfieldMesh.removeFromParent?.();
            this.starfieldMesh.geometry?.dispose?.();
            this.starfieldMesh.material?.dispose?.();
            this.starfieldMesh = null;
        }
        if (this.stardustMesh) {
            this.stardustMesh.removeFromParent?.();
            this.stardustMesh.geometry?.dispose?.();
            this.stardustMesh.material?.dispose?.();
            this.stardustMesh = null;
        }
        if (this.landmarksGroup) {
            disposeCelestialLandmarks(this.landmarksGroup);
            this.landmarksGroup.removeFromParent?.();
            this.landmarksGroup = null;
        }

        // Clean up registered listeners and superclass state
        if (typeof super.destroy === 'function') {
            super.destroy();
        } else if (Array.isArray(this.cleanupFuncs)) {
            this.cleanupFuncs.forEach((func) => func());
            this.cleanupFuncs = [];
        }

        if (this.kendamaOriginalTransform) {
            const selectPlinth = this.findSceneObject('select-plinth', 'Select Plinth');
            const cupPreview = this.findSceneObject('cup-preview', 'Big Cup Preview') ||
                selectPlinth?.getObjectByName?.('cup-preview') || null;
            if (cupPreview) {
                if (cupPreview.position && typeof cupPreview.position.set === 'function') {
                    cupPreview.position.z = this.kendamaOriginalTransform.posZ;
                    cupPreview.position.y = this.kendamaOriginalTransform.posY;
                }
                if (cupPreview.scale && typeof cupPreview.scale.set === 'function') {
                    cupPreview.scale.set(
                        this.kendamaOriginalTransform.scaleX,
                        this.kendamaOriginalTransform.scaleY,
                        this.kendamaOriginalTransform.scaleZ
                    );
                }
            }
            this.kendamaOriginalTransform = null;
        }

        this.wiredCupPreviewNode = null;
        this.wiredSelectPlinthNode = null;
        this.originalStudioFloorVisible = null;
        this.isInitialized = false;
        this.activeConfig = SHOWROOM_ENVIRONMENT_CONFIG;
        this.mode = 'showroom';
    }
}

export default CelestialEnvironmentSystem;
