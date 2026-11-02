/**
 * Celestial Kendama - Procedural Kendama Geometry Preview Asset
 * Role: Person C (Visuals & Rendering)
 *
 * Provides a showroom presentation of the complete procedural
 * Kendama assembly generated from Person A's authoritative cupConfigs.js:
 * - Sarado (crossbar) running horizontally along X centered at (0, 0, 0)
 * - Big Cup on +X wing facing +X
 * - Small Cup on -X wing facing -X
 * - Ken stem / handle descending from crossbar junction (y = -0.033 m) to base (y = -0.180 m)
 * - Kensaki (spike) rising from crossbar junction (y = 0.033 m) to tip at y = 0.0675 m
 *
 * Displays synchronized inspection copies:
 * 1. Center: Front / Turntable View (Upright Kendama in gameplay coordinate space)
 * 2. Left: Top-Down Cavity View (Tilted forward to inspect cup interiors and spike)
 * 3. Right: Three-Quarter / Side Profile View (Tilted to inspect wing mating and grip)
 */

import {
    Group,
    Mesh,
    Vector3,
    Quaternion,
} from 'three';
import {
    createCupGeometry,
    createCrossbarGeometry,
    createHandleGeometry,
    createSpikeGeometry,
    deriveSpikeLength,
    DEFAULT_SARADO_ELEVATION_Y,
    DEFAULT_SPIKE_BASE_Y,
} from '../render/KenGeometry.js';
import {
    cupConfigs,
    CUP_CONFIGS,
    kenGeometry,
    BALL_RADIUS,
} from '../input/cupConfigs.js';
import {
    COMPONENT_MATERIAL_MAP,
    moonPearlMaterial,
    roseNebulaMaterial,
    lavenderMoonMaterial,
    pearlWhiteMaterial,
} from '../render/KenMaterials.js';
import {
    createTamaGeometry,
} from '../render/TamaGeometry.js';
import {
    createCelestialTamaMaterial,
    celestialTamaMaterial,
} from '../render/TamaMaterial.js';
import {
    getKendamaPreset,
    KENDAMA_PRESET_IDS,
    GALAXY_WOOD_PRESET,
} from '../render/KendamaPresets.js';

/**
 * Builds a complete Kendama assembly hierarchy in local Ken coordinates.
 *
 * @param {object | import('three').Material} [materials=COMPONENT_MATERIAL_MAP] - Material map or single override Material
 * @param {object} [options={}] - Assembly options
 * @param {boolean} [options.includeTama=false] - Whether to include the seated Celestial Tama on the spike
 * @returns {Group} Group containing crossbar, big cup, small cup, base cup, spike, and handle (plus seated tama if includeTama=true)
 */
export function createKendamaAssemblyGroup(materials = COMPONENT_MATERIAL_MAP, options = {}) {
    const { includeTama = false, preset = null } = options;
    const kenGroup = new Group();
    kenGroup.name = 'kendama-assembly-root';

    // Check if a preset is requested via options.preset or materials argument
    let activePreset = null;
    let activeMaterials = materials;

    if (typeof preset === 'string') {
        activePreset = getKendamaPreset(preset);
        activeMaterials = activePreset.kenMaterials;
    } else if (preset && typeof preset === 'object' && preset.kenMaterials) {
        activePreset = preset;
        activeMaterials = activePreset.kenMaterials;
    } else if (typeof materials === 'string') {
        activePreset = getKendamaPreset(materials);
        activeMaterials = activePreset.kenMaterials;
    } else if (materials && typeof materials === 'object' && materials.kenMaterials) {
        activePreset = materials;
        activeMaterials = activePreset.kenMaterials;
    }

    // Helper to resolve material per component name
    const resolveMaterial = (name) => {
        if (name === 'celestial-tama') {
            if (activePreset && activePreset.tamaMaterial) return activePreset.tamaMaterial;
            if (activeMaterials && activeMaterials['celestial-tama']) return activeMaterials['celestial-tama'];
            return celestialTamaMaterial;
        }
        if (!activeMaterials) return COMPONENT_MATERIAL_MAP[name] ?? moonPearlMaterial;
        if (activeMaterials.isMaterial) return activeMaterials;
        if (typeof activeMaterials === 'object' && activeMaterials[name]) return activeMaterials[name];
        if (typeof activeMaterials === 'function') return activeMaterials(name);
        return COMPONENT_MATERIAL_MAP[name] ?? moonPearlMaterial;
    };

    // 1. Crossbar (Sarado): Horizontal along X centered at origin (0, 0, 0) (Pearl White)
    const crossbarGeom = createCrossbarGeometry();
    const crossbarMesh = new Mesh(crossbarGeom, resolveMaterial('sarado-crossbar'));
    crossbarMesh.name = 'sarado-crossbar';
    crossbarMesh.position.set(0.0, DEFAULT_SARADO_ELEVATION_Y, 0.0);
    crossbarMesh.castShadow = true;
    crossbarMesh.receiveShadow = true;

    // 2. Big Cup (Oozara): Mounted on +X wing at Person A target position (Rose Nebula)
    const bigCupConfig = cupConfigs.big ?? CUP_CONFIGS.big;
    const bigCupGeom = createCupGeometry(bigCupConfig);
    const bigCupMesh = new Mesh(bigCupGeom, resolveMaterial('big-cup-oozara'));
    bigCupMesh.name = 'big-cup-oozara';
    bigCupMesh.position.set(bigCupConfig.localPos.x, bigCupConfig.localPos.y, bigCupConfig.localPos.z);
    bigCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(bigCupConfig.localNormal.x, bigCupConfig.localNormal.y, bigCupConfig.localNormal.z).normalize()
    );
    bigCupMesh.castShadow = true;
    bigCupMesh.receiveShadow = true;

    // 3. Small Cup (Kozara): Mounted on -X wing at Person A target position (Lavender Moon)
    const smallCupConfig = cupConfigs.small ?? CUP_CONFIGS.small;
    const smallCupGeom = createCupGeometry(smallCupConfig);
    const smallCupMesh = new Mesh(smallCupGeom, resolveMaterial('small-cup-kozara'));
    smallCupMesh.name = 'small-cup-kozara';
    smallCupMesh.position.set(smallCupConfig.localPos.x, smallCupConfig.localPos.y, smallCupConfig.localPos.z);
    smallCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(smallCupConfig.localNormal.x, smallCupConfig.localNormal.y, smallCupConfig.localNormal.z).normalize()
    );
    smallCupMesh.castShadow = true;
    smallCupMesh.receiveShadow = true;

    // 4. Base Cup (Chuzara): Mounted on handle base at Person A target position (Rose Nebula)
    const baseCupConfig = cupConfigs.base ?? CUP_CONFIGS.base;
    const baseCupGeom = createCupGeometry(baseCupConfig);
    const baseCupMesh = new Mesh(baseCupGeom, resolveMaterial('base-cup-chuzara'));
    baseCupMesh.name = 'base-cup-chuzara';
    baseCupMesh.position.set(baseCupConfig.localPos.x, baseCupConfig.localPos.y, baseCupConfig.localPos.z);
    baseCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(baseCupConfig.localNormal.x, baseCupConfig.localNormal.y, baseCupConfig.localNormal.z).normalize()
    );
    baseCupMesh.castShadow = true;
    baseCupMesh.receiveShadow = true;

    // 5. Spike (Kensaki): Extends upward from Sarado junction to tip at Person A target position (Moon Pearl)
    const spikeConfig = cupConfigs.spike ?? CUP_CONFIGS.spike;
    const spikeBaseY = kenGeometry.spike.baseY ?? DEFAULT_SPIKE_BASE_Y;
    const spikeLength = deriveSpikeLength(spikeConfig, spikeBaseY);
    const spikeGeom = createSpikeGeometry({
        length: spikeLength,
        rootRadius: kenGeometry.stem.neckRadius,
    });
    const spikeMesh = new Mesh(spikeGeom, resolveMaterial('spike-kensaki'));
    spikeMesh.name = 'spike-kensaki';
    spikeMesh.position.set(spikeConfig.localPos.x, spikeBaseY, spikeConfig.localPos.z);
    spikeMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(spikeConfig.localNormal.x, spikeConfig.localNormal.y, spikeConfig.localNormal.z).normalize()
    );
    spikeMesh.castShadow = true;
    spikeMesh.receiveShadow = true;

    // 6. Handle (Ken stem): Descends from crossbar junction (-0.033 m) to Base Cup (-0.180 m) (Moon Pearl)
    const handleGeom = createHandleGeometry();
    const handleMesh = new Mesh(handleGeom, resolveMaterial('handle-ken'));
    handleMesh.name = 'handle-ken';
    handleMesh.position.set(0.0, 0.0, 0.0);
    handleMesh.castShadow = true;
    handleMesh.receiveShadow = true;

    kenGroup.add(crossbarMesh, bigCupMesh, smallCupMesh, baseCupMesh, spikeMesh, handleMesh);

    // 7. Celestial Tama (Ball): Physically seated on the Spike (Kensaki)
    if (includeTama) {
        const tamaGeom = createTamaGeometry();
        const tamaMat = resolveMaterial('celestial-tama');
        const tamaMesh = new Mesh(tamaGeom, tamaMat);
        tamaMesh.name = 'celestial-tama';

        // Authoritative Seated Position on Spike:
        // Spike base Y is at spikeBaseY (0.033 m), spike tip at spikeConfig.localPos.y (0.0675 m).
        // Aligning the ball with the spike axis (X = spikeConfig.localPos.x, Z = spikeConfig.localPos.z)
        // and setting center elevation to seatedY = spikeBaseY + BALL_RADIUS (0.033 + 0.045 = 0.0780 m):
        // - Bore apex (y = -0.0070 m) reaches assembly Y = 0.0710 m, leaving exact 3.5 mm tip clearance (0.0710 - 0.0675 m)
        //   so the spike tip does not pierce or collide with the bore ceiling.
        // - Outer bevel rim (y = -0.0426 m) reaches assembly Y = 0.0354 m, sitting stably 2.4 mm above the spike shoulder.
        // - Spike enters the bore by 32.1 mm past the outer bevel rim.
        // - Radial clearance throughout the insertion length ranges between 2.84 mm and 3.92 mm (no wall intersection).
        const seatedY = spikeBaseY + BALL_RADIUS;
        tamaMesh.position.set(spikeConfig.localPos.x, seatedY, spikeConfig.localPos.z);

        // Authoritative Bore-to-Spike Alignment:
        // The physical bore opens along local -Y. To face downward toward the spike along -spikeConfig.localNormal (0, -1, 0),
        // local -Y aligns with assembly -Y, mapping local +Y to assembly +Y (identity quaternion).
        tamaMesh.quaternion.set(0, 0, 0, 1);
        tamaMesh.castShadow = true;
        tamaMesh.receiveShadow = true;

        kenGroup.add(tamaMesh);
    }

    return kenGroup;
}

/**
 * Creates the parentless Object3D asset for IWSDK asset registration.
 *
 * @param {object} [options={}] - Showroom preview options
 * @param {string | object} [options.preset=null] - Optional preset ID ('celestial', 'galaxy-wood') or preset object
 * @returns {Group} The preview group containing the three inspection models and showroom lights.
 */
export function createBigCupPreviewAsset(options = {}) {
    const { preset = null } = options;
    const activePreset = preset ? getKendamaPreset(preset) : null;
    const matMap = activePreset ? activePreset.kenMaterials : COMPONENT_MATERIAL_MAP;

    console.log('[DIAGNOSTIC] createBigCupPreviewAsset() factory invoked', activePreset ? `(preset: ${activePreset.id})` : '');
    const root = new Group();
    root.name = activePreset ? `${activePreset.id}-preview-root` : 'big-cup-preview-root';

    // 1. Center Model: Upright Kendama Assembly (Front / Turntable Perspective View) with seated Tama
    const centerModel = createKendamaAssemblyGroup(matMap, {
        includeTama: true,
        preset: activePreset,
    });
    centerModel.name = 'big-cup-three-quarter';
    centerModel.position.set(0.0, 0.0, 0.0);

    // 2. Left Model: Top-Down View (Cavity Interiors & Spike Alignment Inspection)
    // Left model Big Cup cavity remains open for clear cavity/wall inspection
    const leftModel = createKendamaAssemblyGroup(matMap, {
        includeTama: false,
        preset: activePreset,
    });
    leftModel.name = 'big-cup-cavity-view';
    leftModel.position.set(-0.22, 0.0, 0.0);
    leftModel.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * 0.40);

    // 3. Right Model: Three-Quarter / Side Profile View (Wing Flaring & Grip Inspection)
    const rightModel = createKendamaAssemblyGroup(matMap, {
        includeTama: false,
        preset: activePreset,
    });
    rightModel.name = 'big-cup-profile-view';
    rightModel.position.set(0.22, 0.0, 0.0);
    const rotY = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 0.25);
    const rotX = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * 0.08);
    rightModel.quaternion.multiplyQuaternions(rotY, rotX);

    // 4. Showroom inspection models (global studio lighting provided by main.iwsdk.scene.json)
    root.add(
        centerModel,
        leftModel,
        rightModel
    );

    console.log(
        '[DIAGNOSTIC] createBigCupPreviewAsset() completed with full Kendama assembly:',
        root.name,
        'with',
        root.children.length,
        'children'
    );
    return root;
}

/**
 * Creates the Galaxy Wood paired preset showroom asset for IWSDK asset registration.
 *
 * @returns {Group} The preview group featuring the Galaxy Wood Kendama and Tama.
 */
export function createGalaxyWoodPreviewAsset() {
    return createBigCupPreviewAsset({ preset: 'galaxy-wood' });
}

/**
 * Creates the Bubblegum Pop paired preset showroom asset for IWSDK asset registration.
 *
 * @returns {Group} The preview group featuring the Bubblegum Pop Kendama and Tama.
 */
export function createBubblegumPopPreviewAsset() {
    return createBigCupPreviewAsset({ preset: 'bubblegum-pop' });
}

/**
 * Creates the Dark Matter paired preset showroom asset for IWSDK asset registration.
 *
 * @returns {Group} The preview group featuring the Dark Matter Kendama and Tama.
 */
export function createDarkMatterPreviewAsset() {
    return createBigCupPreviewAsset({ preset: 'dark-matter' });
}

/**
 * Creates the Porcelain Dreams paired preset showroom asset for IWSDK asset registration.
 *
 * @returns {Group} The preview group featuring the Porcelain Dreams Kendama and Tama.
 */
export function createPorcelainDreamsPreviewAsset() {
    return createBigCupPreviewAsset({ preset: 'porcelain-dreams' });
}

export default createBigCupPreviewAsset;
