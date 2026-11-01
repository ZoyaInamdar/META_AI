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
    MeshStandardMaterial,
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
    DEFAULT_SARADO_ELEVATION_Y,
} from '../render/KenGeometry.js';
import { CUP_CONFIGS } from '../game/cupConfigs.js';

/**
 * Builds a complete Kendama assembly hierarchy in local Ken coordinates.
 *
 * @param {MeshStandardMaterial} material - Material for the kendama components
 * @returns {Group} Group containing crossbar, big cup, small cup, spike, and handle
 */
export function createKendamaAssemblyGroup(material) {
    const kenGroup = new Group();
    kenGroup.name = 'kendama-assembly-root';

    // 1. Crossbar (Sarado): Horizontal along X at Sarado elevation
    const crossbarGeom = createCrossbarGeometry();
    const crossbarMesh = new Mesh(crossbarGeom, material);
    crossbarMesh.name = 'sarado-crossbar';
    crossbarMesh.position.set(0.0, DEFAULT_SARADO_ELEVATION_Y, 0.0);
    crossbarMesh.castShadow = true;
    crossbarMesh.receiveShadow = true;

    // 2. Big Cup (Oozara): Mounted on +X wing at Person A target position
    const bigCupConfig = CUP_CONFIGS.bigCup;
    const bigCupGeom = createCupGeometry(bigCupConfig);
    const bigCupMesh = new Mesh(bigCupGeom, material);
    bigCupMesh.name = 'big-cup-oozara';
    bigCupMesh.position.set(bigCupConfig.position.x, bigCupConfig.position.y, bigCupConfig.position.z);
    bigCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(bigCupConfig.normal.x, bigCupConfig.normal.y, bigCupConfig.normal.z).normalize()
    );
    bigCupMesh.castShadow = true;
    bigCupMesh.receiveShadow = true;

    // 3. Small Cup (Kozara): Mounted on -X wing at Person A target position
    const smallCupConfig = CUP_CONFIGS.smallCup;
    const smallCupGeom = createCupGeometry(smallCupConfig);
    const smallCupMesh = new Mesh(smallCupGeom, material);
    smallCupMesh.name = 'small-cup-kozara';
    smallCupMesh.position.set(smallCupConfig.position.x, smallCupConfig.position.y, smallCupConfig.position.z);
    smallCupMesh.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(smallCupConfig.normal.x, smallCupConfig.normal.y, smallCupConfig.normal.z).normalize()
    );
    smallCupMesh.castShadow = true;
    smallCupMesh.receiveShadow = true;

    // 4. Spike (Kensaki): Extends upward from Sarado junction to tip at y = 0.185 m
    const spikeGeom = createSpikeGeometry();
    const spikeMesh = new Mesh(spikeGeom, material);
    spikeMesh.name = 'spike-kensaki';
    spikeMesh.position.set(0.0, DEFAULT_SARADO_ELEVATION_Y, 0.0);
    spikeMesh.castShadow = true;
    spikeMesh.receiveShadow = true;

    // 5. Handle (Ken shaft): Descends from crossbar junction through grip origin (y = 0)
    // Length: 0.145 m, positioned at y = 0.0159 m (top at y = 0.0884 m, bottom at y = -0.0566 m)
    const handleGeom = createHandleGeometry({
        length: 0.145,
        topRadius: 0.012,
        bottomRadius: 0.013,
        waistRadius: 0.0105,
    });
    const handleMesh = new Mesh(handleGeom, material);
    handleMesh.name = 'handle-ken';
    handleMesh.position.set(0.0, 0.0159, 0.0);
    handleMesh.castShadow = true;
    handleMesh.receiveShadow = true;

    kenGroup.add(crossbarMesh, bigCupMesh, smallCupMesh, spikeMesh, handleMesh);
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

    // Neutral grey matte/satin material to clearly reveal geometric contours
    const neutralGreyMaterial = new MeshStandardMaterial({
        color: 0x8a8a8a,      // Neutral 54% mid-grey
        roughness: 0.45,      // Satin finish to highlight specular curvature and contours
        metalness: 0.05,      // Non-metallic dielectric response
    });

    // 1. Center Model: Upright Kendama Assembly (Front / Turntable Perspective View)
    const centerModel = createKendamaAssemblyGroup(neutralGreyMaterial);
    centerModel.name = 'big-cup-three-quarter';
    centerModel.position.set(0.0, 0.0, 0.0);

    // 2. Left Model: Top-Down View (Cavity Interiors & Spike Alignment Inspection)
    const leftModel = createKendamaAssemblyGroup(neutralGreyMaterial);
    leftModel.name = 'big-cup-cavity-view';
    leftModel.position.set(-0.22, 0.0, 0.0);
    // Tilt forward ~72 degrees toward viewer to inspect cavities and crossbar top
    leftModel.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI * 0.40);

    // 3. Right Model: Three-Quarter / Side Profile View (Wing Flaring & Grip Inspection)
    const rightModel = createKendamaAssemblyGroup(neutralGreyMaterial);
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