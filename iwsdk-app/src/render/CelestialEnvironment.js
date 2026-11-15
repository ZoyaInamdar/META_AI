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
    /** @type {'showroom' | 'gameplay'} */
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
    }

    /**
     * Resolves the current active level root entity from the world.
     * @returns {any}
     */
    getLevelRoot() {
        if (this.world?.activeLevel?.value) {
            return this.world.activeLevel.value;
        }
        for (const root of this.queries.levelRoots.entities) {
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
            if (child && this.mode === 'gameplay') {
                this.applyGameplayVisibility();
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
        }
    }

    /**
     * Restores all managed objects to their exact authored visibility states.
     */
    restoreShowroomVisibility() {
        for (const [obj, originalVisible] of this.visibilityBaseline.entries()) {
            if (obj && typeof obj.visible === 'boolean') {
                obj.visible = originalVisible;
            }
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
     * @param {'showroom' | 'gameplay'} mode - Target mode.
     * @returns {boolean} True if successfully switched.
     */
    setMode(mode) {
        if (mode !== 'showroom' && mode !== 'gameplay') {
            console.warn(`[CelestialEnvironmentSystem] Unknown mode "${mode}". Expected "showroom" or "gameplay".`);
            return false;
        }

        this.mode = mode;
        this.activeConfig = (mode === 'gameplay')
            ? GAMEPLAY_PASTEL_GALAXY_CONFIG
            : SHOWROOM_ENVIRONMENT_CONFIG;

        const levelRoot = this.getLevelRoot();
        if (levelRoot) {
            applyEnvironmentConfig(levelRoot, this.activeConfig);
        }

        if (mode === 'gameplay') {
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
        }

        return true;
    }

    /**
     * Toggles between showroom and gameplay environment modes.
     * @returns {'showroom' | 'gameplay'} The new active mode.
     */
    toggleMode() {
        const nextMode = (this.mode === 'showroom') ? 'gameplay' : 'showroom';
        this.setMode(nextMode);
        return this.mode;
    }

    /**
     * Returns the current environment mode.
     * @returns {'showroom' | 'gameplay'}
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
        if (this.mode === 'gameplay') {
            const levelRoot = this.getLevelRoot();
            if (levelRoot) {
                const currentSky = levelRoot.getVectorView?.(DomeGradient, 'sky');
                const targetSky = GAMEPLAY_PASTEL_GALAXY_CONFIG.domeGradient.sky;
                if (currentSky && currentSky[0] !== targetSky[0]) {
                    applyEnvironmentConfig(levelRoot, this.activeConfig);
                }
            }

            // Enforce gameplay visibility in case of late-loaded children
            this.applyGameplayVisibility();

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
    }

    destroy() {
        // Restore showroom visibility before destroying
        this.restoreShowroomVisibility();
        this.visibilityBaseline.clear();

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
