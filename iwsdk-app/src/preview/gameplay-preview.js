/**
 * Celestial Kendama - Default Gameplay Camera Visualizer & Capture
 * Role: Person C (Visuals & Rendering)
 *
 * Renders the authentic default gameplay composition:
 * - Default gameplay camera at (0, 1.6, 0) looking forward-down at Kendama (0, 1.15, -1.12)
 * - Deep midnight-blue cosmic space + dreamy lavender/pink pastel galaxy
 * - Procedural Nebula Shell (2-octave simplex with domain warp)
 * - Procedural Starfield (1200 twinkling stars)
 * - Procedural Stardust (150 champagne-gold dust particles)
 * - Distant Celestial Landmarks (Astraea, Champagne Gold Ring, Selene, Chroma)
 * - Golden Celestial Belt (Fragmented Torus arcs, energy nodes, distinctive ✦ sparkle bursts)
 * - Central Celestial Kendama with genuine PBR materials and procedural galaxy Tama
 * - Gameplay Key Light and Hemisphere Fill Light
 */

import {
    ACESFilmicToneMapping,
    Color,
    DirectionalLight,
    Group,
    HemisphereLight,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Scene,
    SphereGeometry,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
} from 'three';
import { createCelestialNebulaMesh } from '../render/CelestialNebulaShader.js';
import { createCelestialStarfield } from '../render/CelestialStarfield.js';
import { createCelestialStardust } from '../render/CelestialStardust.js';
import { createCelestialLandmarks } from '../render/CelestialLandmarks.js';
import { createCelestialBelt, updateCelestialBelt } from '../render/CelestialBelt.js';
import { createKendamaAssemblyGroup } from '../scene-assets/cup-preview.scene-asset.js';
import { getKendamaPreset, KENDAMA_PRESET_IDS } from '../render/KendamaPresets.js';
import { createTamaGeometry, BALL_RADIUS } from '../render/TamaGeometry.js';
import { createCelestialTamaMaterial } from '../render/TamaMaterial.js';

/**
 * Creates a background hemisphere dome gradient mimicking IWSDK DomeGradient.
 * Sky: #C5B4E3, Equator: #F5B7B1, Ground: #8B9DC3
 */
function createDomeGradientBackground() {
    const domeGeom = new SphereGeometry(120, 32, 16);
    // Inverted sphere for background
    const domeMat = new MeshBasicMaterial({
        color: new Color('#221B35'),
        side: 1, // BackSide
        depthWrite: false,
    });
    const domeMesh = new Mesh(domeGeom, domeMat);
    domeMesh.name = 'dome-gradient-backdrop';
    domeMesh.renderOrder = -1000;
    return domeMesh;
}

export function initGameplayPreview() {
    const container = document.getElementById('preview-container');
    if (!container) return;

    // 1. Scene
    const scene = new Scene();
    scene.background = new Color('#161228'); // Deep cosmic midnight blue

    // Dome backdrop
    scene.add(createDomeGradientBackground());

    // 2. Default Gameplay Camera
    // Player eye height at Y = 1.6m, looking slightly down at Kendama at Y = 1.15m, Z = -1.12m
    const camera = new PerspectiveCamera(
        58,
        window.innerWidth / window.innerHeight,
        0.05,
        250.0
    );
    camera.position.set(0.0, 1.55, 0.0);
    const kendamaTarget = new Vector3(0.0, 1.12, -0.92);
    camera.lookAt(kendamaTarget);

    // 3. WebGL Renderer
    const renderer = new WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 4. Lighting calibrated for Gameplay
    const keyLight = new DirectionalLight(0xfff1e0, 2.3);
    keyLight.position.set(-2.35, 11.28, 1.76);
    scene.add(keyLight);

    const hemiLight = new HemisphereLight(0xc7d4f5, 0x979ba6, 1.15);
    scene.add(hemiLight);

    // Kendama beauty highlight
    const frontGlow = new DirectionalLight(0xfff5fa, 0.85);
    frontGlow.position.set(0.0, 1.6, 0.8);
    scene.add(frontGlow);

    // 5. Celestial Environment Layers (Person C Cosmic Architecture)
    // Layer 1: Procedural Pastel Nebula
    const nebulaMesh = createCelestialNebulaMesh();
    scene.add(nebulaMesh);

    // Layer 2: Procedural Starfield
    const starfieldMesh = createCelestialStarfield();
    scene.add(starfieldMesh);

    // Layer 3: Procedural Stardust (Champagne gold particles)
    const stardustMesh = createCelestialStardust();
    scene.add(stardustMesh);

    // Layer 4: Distant Celestial Landmarks (Astraea, Ring, Selene, Chroma)
    const landmarksGroup = createCelestialLandmarks();
    scene.add(landmarksGroup);

    // Layer 5: Golden Celestial Orbital Belt (Fragmented Arcs + Nodes + Sparkles)
    const beltGroup = createCelestialBelt();
    landmarksGroup.add(beltGroup);

    // 6. Central Celestial Kendama (Primary Focal Point)
    const preset = getKendamaPreset(KENDAMA_PRESET_IDS.CELESTIAL);
    const kendama = createKendamaAssemblyGroup(preset.kenMaterials, { preset });
    kendama.name = 'big-cup-three-quarter';

    // Seated Celestial Tama
    const tamaGeom = createTamaGeometry();
    const tamaMat = createCelestialTamaMaterial();
    const tamaMesh = new Mesh(tamaGeom, tamaMat);
    tamaMesh.name = 'celestial-seated-tama';
    // Seated cleanly on the spike apex
    tamaMesh.position.set(0.0, 0.145, 0.0);
    kendama.add(tamaMesh);

    // Kendama assembly shader callbacks
    kendama.traverse((child) => {
        if (child.isMesh && child.material) {
            child.onBeforeRender = function (rnd, scn, cam, geom, mat, grp) {
                if (mat && typeof mat.onBeforeRender === 'function') {
                    mat.onBeforeRender.call(mat, rnd, scn, cam, geom, this, grp);
                }
            };
        }
    });

    // Root positioned at default gameplay transform: Z ≈ -0.85, Y ≈ 1.12, scaled to 1.35x
    const kendamaRoot = new Group();
    kendamaRoot.name = 'cup-preview-root';
    kendamaRoot.position.set(0.0, 1.12, -0.85);
    kendamaRoot.scale.set(1.35, 1.35, 1.35);
    kendamaRoot.rotation.set(0.08, -0.25, 0.05); // slight natural tilt
    kendamaRoot.add(kendama);
    scene.add(kendamaRoot);

    // 7. Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Expose capture helper for automated headless screenshot
    window.__CAPTURE_SCREENSHOT__ = () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
    };
    window.__SCENE_READY__ = true;

    // 8. Render loop
    let lastTime = performance.now();
    function animate(now) {
        requestAnimationFrame(animate);
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        // Animate nebula, starfield, stardust, and belt
        if (nebulaMesh.material?.uniforms?.uTime) {
            nebulaMesh.material.uniforms.uTime.value += dt;
        }
        if (starfieldMesh.material?.uniforms?.uTime) {
            starfieldMesh.material.uniforms.uTime.value += dt;
        }
        if (stardustMesh.material?.uniforms?.uTime) {
            stardustMesh.material.uniforms.uTime.value += dt;
        }
        updateCelestialBelt(beltGroup, dt);

        kendama.updateMatrixWorld(true);
        renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
    console.log('[GameplayPreview] Initialized successfully.');
}
