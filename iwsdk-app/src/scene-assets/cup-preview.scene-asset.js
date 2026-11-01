/**
 * Celestial Kendama - Procedural Kendama Geometry Preview Asset
 * Role: Person C (Visuals & Rendering)
 *
 * Provides a neutral grey showroom presentation of the complete procedural
 * Kendama assembly generated from Person A's cupConfigs.js:
 * - Sarado (crossbar) running horizontally along X with angled mounting faces
 * - Big Cup on +X wing (tilted outward/upward)
 * - Small Cup on -X wing (tilted outward/upward)
 * - Ken handle descending from center through grip waist to base
 * - Kensaki (spike) rising from center to tip at y = 0.185 m
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
    DirectionalLight,
    PointLight,
} from 'three';
import {
    createCupGeometry,
    createCrossbarGeometry,
    createHandleGeometry,
    createSpikeGeometry,
    deriveSpikeLength,
    deriveHandleDimensions,
    DEFAULT_SARADO_ELEVATION_Y,
} from '../render/KenGeometry.js';
import { CUP_CONFIGS } from '../game/cupConfigs.js';
import {
    COMPONENT_MATERIAL_MAP,
    moonPearlMaterial,
    roseNebulaMaterial,
    lavenderMoonMaterial,
    pearlWhiteMaterial,
} from '../render/KenMaterials.js';

/**
 * Builds a complete Kendama assembly hierarchy in local Ken coordinates.
 *
 * @param {object | import('three').Material} [materials=COMPONENT_MATERIAL_MAP] - Material map or single override Material
 * @returns {Group} Group containing crossbar, big cup, small cup, base cup, spike, and handle
 */
export function createKendamaAssemblyGroup(materials = COMPONENT_MATERIAL_MAP) {
    const kenGroup = new Group();
    kenGroup.name = 'kendama-assembly-root';

    // Helper to resolve material per component name
    const resolveMaterial = (name) => {
        if (!materials) return COMPONENT_MATERIAL_MAP[name] ?? moonPearlMaterial;
        // Support single override Material instance (e.g. in test suites)
        if (materials.isMaterial) return materials;
        if (typeof materials === 'object' && materials[name]) return materials[name];
        if (typeof materials === 'function') return materials(name);
        return COMPONENT_MATERIAL_MAP[name] ?? moonPearlMaterial;
    };

    // 1. Crossbar (Sarado): Horizontal along X at Sarado elevation (Pearl White)
    const crossbarGeom = createCrossbarGeometry();
    const crossbarMesh = new Mesh(crossbarGeom, resolveMaterial('sarado-crossbar'));
    crossbarMesh.name = 'sarado-crossbar';
    crossbarMesh.position.set(0.0, DEFAULT_SARADO_ELEVATION_Y, 0.0);
    crossbarMesh.castShadow = true;
    crossbarMesh.receiveShadow = true;

    // 2. Big Cup (Oozara): Mounted on +X wing at Person A target position (Rose Nebula)
    const bigCupConfig = CUP_CONFIGS.bigCup;
    const bigCupGeom = createCupGeometry(bigCupConfig);
    const bigCupMesh = new Mesh(bigCupGeom, resolveMaterial('big-cup-oozara'));
    bigCupMesh.name = 'big-cup-oozara';
    bigCupMesh.position.set(bigCupConfig.position.x, bigCupConfig.position.y, bigCupConfig.position.z);
    bigCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(bigCupConfig.normal.x, bigCupConfig.normal.y, bigCupConfig.normal.z).normalize()
    );
    bigCupMesh.castShadow = true;
    bigCupMesh.receiveShadow = true;

    // 3. Small Cup (Kozara): Mounted on -X wing at Person A target position (Lavender Moon)
    const smallCupConfig = CUP_CONFIGS.smallCup;
    const smallCupGeom = createCupGeometry(smallCupConfig);
    const smallCupMesh = new Mesh(smallCupGeom, resolveMaterial('small-cup-kozara'));
    smallCupMesh.name = 'small-cup-kozara';
    smallCupMesh.position.set(smallCupConfig.position.x, smallCupConfig.position.y, smallCupConfig.position.z);
    smallCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(smallCupConfig.normal.x, smallCupConfig.normal.y, smallCupConfig.normal.z).normalize()
    );
    smallCupMesh.castShadow = true;
    smallCupMesh.receiveShadow = true;

    // 4. Base Cup (Chuzara): Mounted on handle base at Person A target position (Rose Nebula)
    const baseCupConfig = CUP_CONFIGS.baseCup;
    const baseCupGeom = createCupGeometry(baseCupConfig);
    const baseCupMesh = new Mesh(baseCupGeom, resolveMaterial('base-cup-chuzara'));
    baseCupMesh.name = 'base-cup-chuzara';
    baseCupMesh.position.set(baseCupConfig.position.x, baseCupConfig.position.y, baseCupConfig.position.z);
    baseCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(baseCupConfig.normal.x, baseCupConfig.normal.y, baseCupConfig.normal.z).normalize()
    );
    baseCupMesh.castShadow = true;
    baseCupMesh.receiveShadow = true;

    // 5. Spike (Kensaki): Extends upward from Sarado junction to tip at Person A target position (Moon Pearl)
    const spikeConfig = CUP_CONFIGS.spike;
    const saradoElevationY = DEFAULT_SARADO_ELEVATION_Y;
    const spikeLength = deriveSpikeLength(spikeConfig, saradoElevationY);
    const spikeGeom = createSpikeGeometry({ length: spikeLength });
    const spikeMesh = new Mesh(spikeGeom, resolveMaterial('spike-kensaki'));
    spikeMesh.name = 'spike-kensaki';
    spikeMesh.position.set(spikeConfig.position.x, saradoElevationY, spikeConfig.position.z);
    spikeMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(spikeConfig.normal.x, spikeConfig.normal.y, spikeConfig.normal.z).normalize()
    );
    spikeMesh.castShadow = true;
    spikeMesh.receiveShadow = true;

    // 6. Handle (Ken shaft): Descends from crossbar junction through grip origin (y = 0) to meet Base Cup (Moon Pearl)
    // Base cup top (outer bottom) is at y = baseCupConfig.position.y + (baseCupConfig.depth + wallThickness) = -0.090 + 0.033 = -0.0570 m.
    // Crossbar center is at y = DEFAULT_SARADO_ELEVATION_Y = 0.08885 m.
    // Handle spans from y = -0.0570 m to y = 0.08885 m (length = 0.14585 m, center = 0.015925 m).
    const handleDims = deriveHandleDimensions(baseCupConfig, { saradoElevationY });
    const handleGeom = createHandleGeometry({
        length: handleDims.length,
        topRadius: 0.012,
        bottomRadius: 0.015,
        waistRadius: 0.0105,
        filletRadius: 0.0015,
    });
    const handleMesh = new Mesh(handleGeom, resolveMaterial('handle-ken'));
    handleMesh.name = 'handle-ken';
    handleMesh.position.set(0.0, handleDims.centerY, 0.0);
    handleMesh.castShadow = true;
    handleMesh.receiveShadow = true;

    kenGroup.add(crossbarMesh, bigCupMesh, smallCupMesh, baseCupMesh, spikeMesh, handleMesh);
    return kenGroup;
}

/**
 * Creates the parentless Object3D asset for IWSDK asset registration.
 *
 * @returns {Group} The preview group containing the three inspection models and showroom lights.
 */
export function createBigCupPreviewAsset() {
    console.log('[DIAGNOSTIC] createBigCupPreviewAsset() factory invoked');
    const root = new Group();
    root.name = 'big-cup-preview-root';

    // 1. Center Model: Upright Kendama Assembly (Front / Turntable Perspective View)
    // Uses the shared celestial pastel galaxy material palette
    const centerModel = createKendamaAssemblyGroup();
    centerModel.name = 'big-cup-three-quarter';
    centerModel.position.set(0.0, 0.0, 0.0);

    // 2. Left Model: Top-Down View (Cavity Interiors & Spike Alignment Inspection)
    const leftModel = createKendamaAssemblyGroup();
    leftModel.name = 'big-cup-cavity-view';
    leftModel.position.set(-0.22, 0.0, 0.0);
    // Tilt forward ~72 degrees toward viewer to inspect cavities and crossbar top
    leftModel.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * 0.40);

    // 3. Right Model: Three-Quarter / Side Profile View (Wing Flaring & Grip Inspection)
    const rightModel = createKendamaAssemblyGroup();
    rightModel.name = 'big-cup-profile-view';
    rightModel.position.set(0.22, 0.0, 0.0);
    // Rotate 45 degrees around Y and slightly tilt to display depth
    const rotY = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 0.25);
    const rotX = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * 0.08);
    rightModel.quaternion.multiplyQuaternions(rotY, rotX);

    // 4. Dedicated showroom inspection lights
    // Overhead key light shining down into cavities and along spike
    const cavityLight = new DirectionalLight(0xffffff, 1.3);
    cavityLight.name = 'cavity-light';
    cavityLight.position.set(0.0, 0.8, 0.4);
    cavityLight.target.name = 'cavity-light-target';
    cavityLight.target.position.set(0.0, 0.08, 0.0);

    // Upward fill light to illuminate underside of cups and handle flare
    const underLight = new DirectionalLight(0xdde8f5, 0.8);
    underLight.name = 'under-light';
    underLight.position.set(0.0, -0.5, -0.3);
    underLight.target.name = 'under-light-target';
    underLight.target.position.set(0.0, 0.05, 0.0);

    // Soft omnidirectional point light for ambient fill
    const fillPointLight = new PointLight(0xfff5ea, 0.6, 2.5);
    fillPointLight.name = 'fill-point-light';
    fillPointLight.position.set(0.0, 0.25, 0.25);

    root.add(
        centerModel,
        leftModel,
        rightModel,
        cavityLight,
        cavityLight.target,
        underLight,
        underLight.target,
        fillPointLight
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

export default createBigCupPreviewAsset;