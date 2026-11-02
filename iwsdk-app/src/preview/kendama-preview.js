/**
 * Standalone Celestial Kendama 3D Previewer
 * Role: Person C (Visuals & Rendering)
 *
 * Provides a desktop-browser inspection tool for the actual procedural Kendama model
 * and Celestial Tama (ball) using the production Three.js geometry and custom galaxy shaders.
 *
 * Features:
 * - Full authentic Kendama assembly (Sarado, Big Cup, Small Cup, Base Cup, Spike, Handle)
 * - Authentic Celestial Tama with genuine physical bore and planetoid galaxy shader
 * - True procedural galaxy shader evaluation with dynamic assembly inverse coordinates
 * - 3D Orbit, Zoom, Pan via Three.js OrbitControls
 * - Component visibility toggles (Sarado, Big Cup, Small Cup, Base Cup, Spike, Handle, Tama)
 * - Studio lighting calibrated specifically for pastel galaxy PBR materials
 * - Background color themes (Light Neutral, Dark Neutral, Soft Lavender)
 * - Camera Reset, Fit Model, and Auto Rotate controls
 * - Live HUD displaying model metrics and active shader pipeline status
 */

import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Color,
    Box3,
    Vector3,
    Mesh,
    Group,
    ACESFilmicToneMapping,
    SRGBColorSpace,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createKendamaAssemblyGroup } from '../scene-assets/cup-preview.scene-asset.js';
import {
    COMPONENT_MATERIAL_MAP,
    KEN_PALETTE,
} from '../render/KenMaterials.js';
import { createTamaGeometry, BALL_RADIUS } from '../render/TamaGeometry.js';
import { createCelestialTamaMaterial } from '../render/TamaMaterial.js';
import { getKendamaPreset, KENDAMA_PRESET_IDS } from '../render/KendamaPresets.js';

// --- Background Themes ---
const BACKGROUND_THEMES = {
    light: '#F2F2F5',
    dark: '#181822',
    lavender: '#EAE6F2',
};

// Initial camera transform
const INITIAL_CAMERA_POS = new Vector3(0.18, 0.08, 0.24);
const INITIAL_TARGET = new Vector3(0.0, -0.02, 0.0);

/**
 * Main application initializer for the standalone previewer.
 */
export function initPreviewer() {
    const container = document.getElementById('preview-container');
    if (!container) {
        console.error('[KendamaPreviewer] Container element #preview-container not found.');
        return;
    }

    // 1. Scene & Background
    const scene = new Scene();
    scene.background = new Color(BACKGROUND_THEMES.light);

    // 2. Camera Setup
    const camera = new PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        0.01,
        20.0
    );
    camera.position.copy(INITIAL_CAMERA_POS);

    // 3. WebGL Renderer
    const renderer = new WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.04;
    controls.maxDistance = 2.0;
    controls.target.copy(INITIAL_TARGET);
    controls.update();

    // 5. Studio Lighting (Tuned specifically to preserve soft pastel galaxy hues)
    const ambientLight = new AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new DirectionalLight(0xffffff, 1.10);
    keyLight.position.set(0.8, 1.6, 1.2);
    scene.add(keyLight);

    const fillLight = new DirectionalLight(0xedf2ff, 0.55);
    fillLight.position.set(-1.2, 0.6, -0.8);
    scene.add(fillLight);

    const rimLight = new DirectionalLight(0xfff5fa, 0.40);
    rimLight.position.set(0.0, -1.0, -1.5);
    scene.add(rimLight);

    // 6. Active Paired Preset Selection (?preset=galaxy-wood or ?preset=celestial)
    const urlParams = new URLSearchParams(window.location.search);
    const requestedPreset = urlParams.get('preset') || KENDAMA_PRESET_IDS.CELESTIAL;
    const activePreset = getKendamaPreset(requestedPreset);
    console.log(`[KendamaPreviewer] Active preset: ${activePreset.name} (${activePreset.id})`);

    // Production Kendama Assembly with active preset
    const kendamaGroup = createKendamaAssemblyGroup(activePreset.kenMaterials, {
        preset: activePreset,
    });
    kendamaGroup.name = 'kendama-assembly-root';
    scene.add(kendamaGroup);

    // Ensure Three.js WebGLRenderer invokes material.onBeforeRender for each mesh
    // so kenAssemblyInv is uploaded to shader uniforms on every draw call
    kendamaGroup.traverse((child) => {
        if (child.isMesh && child.material) {
            child.onBeforeRender = function (rnd, scn, cam, geom, mat, grp) {
                if (mat && typeof mat.onBeforeRender === 'function') {
                    mat.onBeforeRender.call(mat, rnd, scn, cam, geom, this, grp);
                }
            };
        }
    });

    // 7. Matching Preset Tama (Ball) Model
    let tamaMesh = null;
    try {
        const tamaGeom = createTamaGeometry();
        const tamaMat = activePreset.tamaMaterial;
        tamaMesh = new Mesh(tamaGeom, tamaMat);
        tamaMesh.name = 'celestial-tama';
        // Position Tama floating cleanly alongside the Kendama (+X offset)
        tamaMesh.position.set(0.11, 0.0, 0.0);
        scene.add(tamaMesh);
    } catch (err) {
        console.warn('[KendamaPreviewer] Could not initialize Tama model:', err);
    }

    // Map components for quick lookup by ID
    const components = {
        crossbar: kendamaGroup.getObjectByName('sarado-crossbar'),
        bigCup: kendamaGroup.getObjectByName('big-cup-oozara'),
        smallCup: kendamaGroup.getObjectByName('small-cup-kozara'),
        baseCup: kendamaGroup.getObjectByName('base-cup-chuzara'),
        spike: kendamaGroup.getObjectByName('spike-kensaki'),
        handle: kendamaGroup.getObjectByName('handle-ken'),
        tama: tamaMesh,
    };

    // 8. User Interface Bindings
    setupUIControls({
        scene,
        camera,
        controls,
        kendamaGroup,
        components,
        renderer,
    });

    // 9. Window Resize Handling
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    });

    // 10. Animation & Render Loop
    function animate() {
        requestAnimationFrame(animate);

        controls.update();

        // Keep assembly world matrix updated for continuous galaxy coordinates
        kendamaGroup.updateMatrixWorld(true);
        if (tamaMesh && tamaMesh.visible) {
            tamaMesh.updateMatrixWorld(true);
        }

        renderer.render(scene, camera);
    }

    animate();
    console.log('[KendamaPreviewer] Celestial Kendama Previewer successfully initialized.');
}

/**
 * Binds DOM controls, toggles, themes, and camera actions.
 */
function setupUIControls({ scene, camera, controls, kendamaGroup, components, renderer }) {
    // Component Toggles
    const toggleMap = {
        'toggle-crossbar': components.crossbar,
        'toggle-big-cup': components.bigCup,
        'toggle-small-cup': components.smallCup,
        'toggle-base-cup': components.baseCup,
        'toggle-spike': components.spike,
        'toggle-handle': components.handle,
        'toggle-tama': components.tama,
    };

    for (const [id, comp] of Object.entries(toggleMap)) {
        const checkbox = document.getElementById(id);
        if (checkbox && comp) {
            checkbox.checked = comp.visible;
            checkbox.addEventListener('change', (e) => {
                comp.visible = e.target.checked;
                updateHUDCounts(components);
            });
        }
    }

    // Reset Camera Button
    const btnReset = document.getElementById('btn-reset-cam');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            camera.position.copy(INITIAL_CAMERA_POS);
            controls.target.copy(INITIAL_TARGET);
            controls.update();
        });
    }

    // Fit Model Button
    const btnFit = document.getElementById('btn-fit-model');
    if (btnFit) {
        btnFit.addEventListener('click', () => {
            fitModelToCamera(camera, controls, [kendamaGroup, components.tama]);
        });
    }

    // Auto Rotate Toggle
    const chkAutoRotate = document.getElementById('toggle-auto-rotate');
    if (chkAutoRotate) {
        chkAutoRotate.addEventListener('change', (e) => {
            controls.autoRotate = e.target.checked;
        });
    }

    // Background Color Theme Selector
    const bgButtons = document.querySelectorAll('[data-bg]');
    bgButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const themeKey = btn.getAttribute('data-bg');
            if (BACKGROUND_THEMES[themeKey]) {
                scene.background.set(BACKGROUND_THEMES[themeKey]);
                bgButtons.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });

    updateHUDCounts(components);
}

/**
 * Fits camera view to enclose all currently visible models.
 */
function fitModelToCamera(camera, controls, roots) {
    const box = new Box3();
    let hasVisible = false;

    for (const root of roots) {
        if (!root) continue;
        root.traverse((obj) => {
            if (obj.isMesh && obj.visible) {
                box.expandByObject(obj);
                hasVisible = true;
            }
        });
    }

    if (!hasVisible) return;

    const center = new Vector3();
    box.getCenter(center);
    const size = new Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDist = (maxDim * 0.5) / Math.tan(fov * 0.5);
    cameraDist *= 1.45; // Generous margin

    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(cameraDist));
    controls.target.copy(center);
    controls.update();
}

/**
 * Updates live HUD mesh and triangle statistics.
 */
function updateHUDCounts(components) {
    let triCount = 0;
    let activeComponents = 0;

    for (const comp of Object.values(components)) {
        if (comp && comp.visible) {
            activeComponents++;
            if (comp.geometry) {
                const geom = comp.geometry;
                triCount += geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
            }
        }
    }

    const hudComp = document.getElementById('hud-active-count');
    if (hudComp) hudComp.textContent = `${activeComponents} / ${Object.keys(components).length}`;

    const hudTris = document.getElementById('hud-tri-count');
    if (hudTris) hudTris.textContent = triCount.toLocaleString();
}

// Auto-boot previewer on window load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initPreviewer);
}
