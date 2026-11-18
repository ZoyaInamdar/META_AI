/**
 * Celestial Kendama - Unit Tests for KendamaPresets.js & Set 2: Galaxy Wood
 * Role: Person C (Visuals & Rendering)
 *
 * Verifies Set 2: Galaxy Wood Preset:
 * - Authoritative paired preset registration (Ken + Tama pair)
 * - Ken wood material properties: dark reddish-brown base (#441E15), polished lacquer finish,
 *   procedural 3D cylindrical wood grain shader with annual latewood lines and warm heartwood
 * - Tama nebula material properties: 5-color palette (teal, turquoise, violet, indigo, muted pink),
 *   domain-warped cloud FBM, subtle luminous regions, starlight sparkles, and bore interior handling
 * - Production geometry preservation (identical dimensions, spike placement at Y=0.0780m, clearances)
 * - Showroom preview asset generation (createGalaxyWoodPreviewAsset)
 * - Complete isolation from and preservation of Set 1: Celestial Kendama
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MeshPhysicalMaterial, ShaderLib, Color, Vector3, Mesh } from 'three';
import {
    KENDAMA_PRESET_IDS,
    KENDAMA_PRESETS,
    CELESTIAL_PRESET,
    GALAXY_WOOD_PRESET,
    BUBBLEGUM_POP_PRESET,
    DARK_MATTER_PRESET,
    PORCELAIN_DREAMS_PRESET,
    getKendamaPreset,
} from './KendamaPresets.js';
import {
    GALAXY_WOOD_PALETTE,
    GALAXY_WOOD_COMPONENT_MATERIAL_MAP,
    createKenWoodMaterial,
    galaxyWoodCrossbarMaterial,
    galaxyWoodBigCupMaterial,
    galaxyWoodSmallCupMaterial,
    galaxyWoodBaseCupMaterial,
    galaxyWoodSpikeMaterial,
    galaxyWoodHandleMaterial,
    DEFAULT_WOOD_BASE_COLOR,
    DEFAULT_WOOD_ROUGHNESS,
    DEFAULT_WOOD_CLEARCOAT,
} from './KenWoodMaterial.js';
import {
    GALAXY_WOOD_TAMA_PALETTE,
    createGalaxyWoodTamaMaterial,
    galaxyWoodTamaMaterial,
    DEFAULT_GW_TAMA_BASE_COLOR,
    DEFAULT_GW_TAMA_ROUGHNESS,
    DEFAULT_GW_TAMA_CLEARCOAT,
} from './GalaxyWoodTamaMaterial.js';
import {
    BUBBLEGUM_POP_KEN_PALETTE,
    BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP,
    createBubblegumKenMaterial,
    bubblegumCrossbarMaterial,
    bubblegumBigCupMaterial,
    bubblegumSmallCupMaterial,
    bubblegumBaseCupMaterial,
    bubblegumSpikeMaterial,
    bubblegumHandleMaterial,
    DEFAULT_BG_KEN_BASE_COLOR,
    DEFAULT_BG_KEN_ROUGHNESS,
    DEFAULT_BG_KEN_CLEARCOAT,
} from './BubblegumKenMaterial.js';
import {
    BUBBLEGUM_POP_TAMA_PALETTE,
    createBubblegumTamaMaterial,
    bubblegumPopTamaMaterial,
    DEFAULT_BG_TAMA_BASE_COLOR,
    DEFAULT_BG_TAMA_ROUGHNESS,
    DEFAULT_BG_TAMA_CLEARCOAT,
} from './BubblegumTamaMaterial.js';
import {
    DARK_MATTER_KEN_PALETTE,
    DARK_MATTER_COMPONENT_MATERIAL_MAP,
    createDarkMatterKenMaterial,
    darkMatterCrossbarMaterial,
    darkMatterBigCupMaterial,
    darkMatterSmallCupMaterial,
    darkMatterBaseCupMaterial,
    darkMatterSpikeMaterial,
    darkMatterHandleMaterial,
    DEFAULT_DM_KEN_BASE_COLOR,
    DEFAULT_DM_KEN_ROUGHNESS,
    DEFAULT_DM_KEN_CLEARCOAT,
} from './DarkMatterKenMaterial.js';
import {
    DARK_MATTER_TAMA_PALETTE,
    createDarkMatterTamaMaterial,
    darkMatterTamaMaterial,
    DEFAULT_DM_TAMA_BASE_COLOR,
    DEFAULT_DM_TAMA_ROUGHNESS,
    DEFAULT_DM_TAMA_CLEARCOAT,
} from './DarkMatterTamaMaterial.js';
import {
    PORCELAIN_PALETTE,
    createPatternCanvas,
    drawFlower,
    drawLeaf,
    drawCurvingVine,
    drawDecorativeCurl,
    drawGeometricBorder,
    drawOrnamentalDetail,
    createPorcelainTamaTexture,
    createPorcelainCupTexture,
    createPorcelainHandleTexture,
    createPorcelainCrossbarTexture,
    createPorcelainSpikeTexture,
} from './PorcelainPattern.js';
import {
    PORCELAIN_COMPONENT_MATERIAL_MAP,
    createPorcelainKenMaterial,
    porcelainCrossbarMaterial,
    porcelainBigCupMaterial,
    porcelainSmallCupMaterial,
    porcelainBaseCupMaterial,
    porcelainSpikeMaterial,
    porcelainHandleMaterial,
    DEFAULT_PORCELAIN_KEN_BASE_COLOR,
    DEFAULT_PORCELAIN_KEN_ROUGHNESS,
    DEFAULT_PORCELAIN_KEN_CLEARCOAT,
} from './PorcelainKenMaterial.js';
import {
    createPorcelainTamaMaterial,
    porcelainTamaMaterial,
    DEFAULT_PORCELAIN_TAMA_BASE_COLOR,
    DEFAULT_PORCELAIN_TAMA_ROUGHNESS,
    DEFAULT_PORCELAIN_TAMA_CLEARCOAT,
} from './PorcelainTamaMaterial.js';
import {
    createKendamaAssemblyGroup,
    createBigCupPreviewAsset,
    createGalaxyWoodPreviewAsset,
    createBubblegumPopPreviewAsset,
    createDarkMatterPreviewAsset,
    createPorcelainDreamsPreviewAsset,
} from '../scene-assets/cup-preview.scene-asset.js';
import {
    COMPONENT_MATERIAL_MAP,
    KEN_PALETTE,
    KEN_MATERIALS,
    pearlWhiteMaterial,
} from './KenMaterials.js';
import {
    celestialTamaMaterial,
    TAMA_PALETTE,
} from './TamaMaterial.js';
import {
    cupConfigs,
    BALL_RADIUS,
    kenGeometry,
} from '../input/cupConfigs.js';
import {
    DEFAULT_BORE_TIP_CLEARANCE,
} from './TamaGeometry.js';

describe('KendamaPresets Module & Set 2: Galaxy Wood', () => {
    describe('Preset Registry & Matching Pair Registration', () => {
        it('registers Celestial Kendama, Galaxy Wood, Bubblegum Pop, Dark Matter, and Porcelain Dreams presets', () => {
            assert.ok(KENDAMA_PRESETS[KENDAMA_PRESET_IDS.CELESTIAL], 'Celestial preset must be registered');
            assert.ok(KENDAMA_PRESETS[KENDAMA_PRESET_IDS.GALAXY_WOOD], 'Galaxy Wood preset must be registered');
            assert.ok(KENDAMA_PRESETS[KENDAMA_PRESET_IDS.BUBBLEGUM_POP], 'Bubblegum Pop preset must be registered');
            assert.ok(KENDAMA_PRESETS[KENDAMA_PRESET_IDS.DARK_MATTER], 'Dark Matter preset must be registered');
            assert.ok(KENDAMA_PRESETS[KENDAMA_PRESET_IDS.PORCELAIN_DREAMS], 'Porcelain Dreams preset must be registered');
        });

        it('retrieves presets correctly via getKendamaPreset()', () => {
            const celestial = getKendamaPreset('celestial');
            assert.equal(celestial.id, 'celestial');
            assert.equal(celestial.name, 'Celestial Kendama');

            const galaxyWood = getKendamaPreset('galaxy-wood');
            assert.equal(galaxyWood.id, 'galaxy-wood');
            assert.equal(galaxyWood.name, 'Galaxy Wood');

            const bubblegumPop = getKendamaPreset('bubblegum-pop');
            assert.equal(bubblegumPop.id, 'bubblegum-pop');
            assert.equal(bubblegumPop.name, 'Bubblegum Pop');

            const darkMatter = getKendamaPreset('dark-matter');
            assert.equal(darkMatter.id, 'dark-matter');
            assert.equal(darkMatter.name, 'Dark Matter');

            const porcelainDreams = getKendamaPreset('porcelain-dreams');
            assert.equal(porcelainDreams.id, 'porcelain-dreams');
            assert.equal(porcelainDreams.name, 'Porcelain Dreams');

            // Default fallback
            const fallback = getKendamaPreset('unknown-id');
            assert.equal(fallback.id, 'celestial');
        });

        it('registers Ken materials and Tama material as one matching pair in Galaxy Wood', () => {
            assert.equal(GALAXY_WOOD_PRESET.id, 'galaxy-wood');
            assert.ok(GALAXY_WOOD_PRESET.kenMaterials, 'Preset must define kenMaterials');
            assert.ok(GALAXY_WOOD_PRESET.tamaMaterial, 'Preset must define tamaMaterial');

            // Must include all 6 Ken components
            const requiredComponents = [
                'sarado-crossbar',
                'big-cup-oozara',
                'small-cup-kozara',
                'base-cup-chuzara',
                'spike-kensaki',
                'handle-ken',
            ];
            for (const comp of requiredComponents) {
                assert.ok(
                    GALAXY_WOOD_PRESET.kenMaterials[comp] instanceof MeshPhysicalMaterial,
                    `Component ${comp} must have a valid MeshPhysicalMaterial in Galaxy Wood preset`
                );
            }

            // Tama material must be the Galaxy Wood Tama material
            assert.equal(GALAXY_WOOD_PRESET.tamaMaterial, galaxyWoodTamaMaterial);
            assert.equal(GALAXY_WOOD_PRESET.tamaMaterial.name, 'mat-galaxy-wood-tama');
        });

        it('registers Ken materials and Tama material as one matching pair in Bubblegum Pop', () => {
            assert.equal(BUBBLEGUM_POP_PRESET.id, 'bubblegum-pop');
            assert.ok(BUBBLEGUM_POP_PRESET.kenMaterials, 'Preset must define kenMaterials');
            assert.ok(BUBBLEGUM_POP_PRESET.tamaMaterial, 'Preset must define tamaMaterial');

            const requiredComponents = [
                'sarado-crossbar',
                'big-cup-oozara',
                'small-cup-kozara',
                'base-cup-chuzara',
                'spike-kensaki',
                'handle-ken',
            ];
            for (const comp of requiredComponents) {
                assert.ok(
                    BUBBLEGUM_POP_PRESET.kenMaterials[comp] instanceof MeshPhysicalMaterial,
                    `Component ${comp} must have a valid MeshPhysicalMaterial in Bubblegum Pop preset`
                );
            }

            assert.equal(BUBBLEGUM_POP_PRESET.tamaMaterial, bubblegumPopTamaMaterial);
            assert.equal(BUBBLEGUM_POP_PRESET.tamaMaterial.name, 'mat-bubblegum-pop-tama');
        });

        it('registers Ken materials and Tama material as one matching pair in Dark Matter', () => {
            assert.equal(DARK_MATTER_PRESET.id, 'dark-matter');
            assert.ok(DARK_MATTER_PRESET.kenMaterials, 'Preset must define kenMaterials');
            assert.ok(DARK_MATTER_PRESET.tamaMaterial, 'Preset must define tamaMaterial');

            const requiredComponents = [
                'sarado-crossbar',
                'big-cup-oozara',
                'small-cup-kozara',
                'base-cup-chuzara',
                'spike-kensaki',
                'handle-ken',
            ];
            for (const comp of requiredComponents) {
                assert.ok(
                    DARK_MATTER_PRESET.kenMaterials[comp] instanceof MeshPhysicalMaterial,
                    `Component ${comp} must have a valid MeshPhysicalMaterial in Dark Matter preset`
                );
            }

            assert.equal(DARK_MATTER_PRESET.tamaMaterial, darkMatterTamaMaterial);
            assert.equal(DARK_MATTER_PRESET.tamaMaterial.name, 'mat-dark-matter-tama');
        });
    });

    describe('Ken Appearance: Natural Dark Reddish-Brown Wood Materials', () => {
        it('uses natural dark reddish-brown wood as the dominant base albedo', () => {
            assert.equal(GALAXY_WOOD_PALETTE.WOOD_BASE_BROWN, '#441E15');
            assert.equal(DEFAULT_WOOD_BASE_COLOR, '#441E15');

            // Verify crossbar, cups, handle and spike all share the dark wood base tone
            assert.equal(galaxyWoodHandleMaterial.color.getHexString().toLowerCase(), '441e15');
            assert.equal(galaxyWoodCrossbarMaterial.color.getHexString().toLowerCase(), '441e15');
            assert.equal(galaxyWoodBigCupMaterial.color.getHexString().toLowerCase(), '441e15');
            assert.equal(galaxyWoodSmallCupMaterial.color.getHexString().toLowerCase(), '441e15');
            assert.equal(galaxyWoodBaseCupMaterial.color.getHexString().toLowerCase(), '441e15');
            assert.equal(galaxyWoodSpikeMaterial.color.getHexString().toLowerCase(), '441e15');
        });

        it('configures polished wooden PBR finish with glossy clearcoat and satin micro-roughness', () => {
            const mat = createKenWoodMaterial();
            assert.ok(mat instanceof MeshPhysicalMaterial);
            assert.equal(mat.roughness, DEFAULT_WOOD_ROUGHNESS);
            assert.equal(mat.metalness, 0.0, 'Natural wood must be dielectric (metalness = 0)');
            assert.equal(mat.clearcoat, DEFAULT_WOOD_CLEARCOAT);
            assert.ok(mat.clearcoatRoughness <= 0.20, 'Clearcoat must be smooth and glossy');
            assert.ok(mat.sheen > 0.20, 'Wood should have warm sheen');
            assert.equal(mat.sheenColor.getHexString().toLowerCase(), 'c88e70');
        });

        it('compiles procedural 3D wood shader injecting cylindrical grain and latewood lines', () => {
            const mat = createKenWoodMaterial();
            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };

            assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

            // Vertex Shader: assembly space coordinates
            assert.ok(mockShader.vertexShader.includes('varying vec3 vWoodPos;'), 'Must declare vWoodPos');
            assert.ok(mockShader.vertexShader.includes('kenAssemblyInv'), 'Must use kenAssemblyInv for shared assembly space');

            // Fragment Shader: procedural wood generation functions
            const frag = mockShader.fragmentShader;
            assert.ok(frag.includes('kenWoodTurbulence'), 'Must include kenWoodTurbulence vector field');
            assert.ok(frag.includes('computeKenWoodMetrics'), 'Must include computeKenWoodMetrics function');
            assert.ok(frag.includes('grainLine'), 'Must compute dark annual latewood grainLine');
            assert.ok(frag.includes('microRay'), 'Must compute longitudinal wood micro-rays');
            assert.ok(frag.includes('woodBody'), 'Must blend heartwood tonal variation');

            // Embeds dark grain palette color
            const cDark = new Color(GALAXY_WOOD_PALETTE.WOOD_DARK_GRAIN);
            assert.ok(frag.includes(cDark.r.toFixed(4)), 'Must contain dark grain line color');
        });
    });

    describe('Tama Appearance: Solar Flare Cosmic Nebula Material', () => {
        it('exports the authoritative Solar Flare 5-color palette (molten gold, solar yellow, amber orange, burnt orange, dark burgundy)', () => {
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.MOLTEN_GOLD, '#F5B82E');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.SOLAR_YELLOW, '#FFD95A');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.AMBER_ORANGE, '#E88724');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.BURNT_ORANGE, '#C95725');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.DARK_BURGUNDY, '#481B2B');

            // Semantic role aliases
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.PRIMARY_GOLD, '#F5B82E');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.HIGHLIGHT, '#FFD95A');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.SECONDARY, '#E88724');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.TRANSITION, '#C95725');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.DEEP_SHADOW, '#481B2B');
        });

        it('configures polished spherical PBR finish for the Solar Flare Tama', () => {
            const mat = createGalaxyWoodTamaMaterial();
            assert.ok(mat instanceof MeshPhysicalMaterial);
            assert.equal(mat.name, 'mat-galaxy-wood-tama');
            assert.equal(mat.roughness, DEFAULT_GW_TAMA_ROUGHNESS);
            assert.equal(mat.clearcoat, DEFAULT_GW_TAMA_CLEARCOAT);
            assert.ok(mat.clearcoatRoughness <= 0.15, 'Clearcoat must be polished and smooth');
            assert.ok(mat.iridescence > 0.25, 'Tama must have subtle thin-film iridescence');
            assert.equal(mat.sheenColor.getHexString().toLowerCase(), 'ffd285');
        });

        it('compiles procedural 3D nebula shader with Solar Flare 5-color continuous flow and domain warping', () => {
            const mat = createGalaxyWoodTamaMaterial();
            const mockShader = {
                vertexShader: ShaderLib.physical.vertexShader,
                fragmentShader: ShaderLib.physical.fragmentShader,
                uniforms: { ...ShaderLib.physical.uniforms },
            };

            assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

            const frag = mockShader.fragmentShader;

            // 3D procedural coordinates in local space (zero UV seams across sphere)
            assert.ok(mockShader.vertexShader.includes('vTamaPos = transformed;'), 'Must evaluate in 3D local mesh space');

            // Multi-octave domain warping
            assert.ok(frag.includes('gwTamaWarp3D_A'), 'Must include domain warping vector field A');
            assert.ok(frag.includes('gwTamaWarp3D_B'), 'Must include domain warping vector field B');
            assert.ok(frag.includes('gwTamaNebulaFbm'), 'Must include multi-octave nebula FBM');

            // 5-color continuous Solar Flare ramp
            assert.ok(frag.includes('gwTamaGalaxyRamp'), 'Must include 5-color galaxy ramp');
            const cMoltenGold = new Color(GALAXY_WOOD_TAMA_PALETTE.MOLTEN_GOLD);
            const cSolarYellow = new Color(GALAXY_WOOD_TAMA_PALETTE.SOLAR_YELLOW);
            const cAmberOrange = new Color(GALAXY_WOOD_TAMA_PALETTE.AMBER_ORANGE);
            const cBurntOrange = new Color(GALAXY_WOOD_TAMA_PALETTE.BURNT_ORANGE);
            const cDarkBurgundy = new Color(GALAXY_WOOD_TAMA_PALETTE.DARK_BURGUNDY);

            assert.ok(frag.includes(cMoltenGold.r.toFixed(4)), 'Shader must include Molten Gold channel');
            assert.ok(frag.includes(cSolarYellow.r.toFixed(4)), 'Shader must include Solar Yellow channel');
            assert.ok(frag.includes(cAmberOrange.r.toFixed(4)), 'Shader must include Amber Orange channel');
            assert.ok(frag.includes(cBurntOrange.r.toFixed(4)), 'Shader must include Burnt Orange channel');
            assert.ok(frag.includes(cDarkBurgundy.r.toFixed(4)), 'Shader must include Dark Burgundy channel');

            // Luminous regions and starlight sparkles
            assert.ok(frag.includes('coreLuminance'), 'Must calculate luminous cloud regions');
            assert.ok(frag.includes('starHash'), 'Must calculate micro-hash starlight sparkles');

            // Bore cavity interior detection & sparkle suppression
            assert.ok(frag.includes('boreCavity'), 'Must detect bore cavity');
            assert.ok(frag.includes('boreInteriorTone'), 'Must blend bore interior tone');
            assert.ok(frag.includes('(1.0 - boreCavity)'), 'Sparkles must be suppressed inside the hole');
        });
    });

    describe('Assembly & Geometry Preservation with Galaxy Wood Preset', () => {
        it('instantiates complete Galaxy Wood kendama assembly with matching Ken and seated Tama', () => {
            const assembly = createKendamaAssemblyGroup('galaxy-wood', { includeTama: true });
            assert.ok(assembly, 'Must return assembly group');
            assert.equal(assembly.children.length, 7, 'Assembly must contain 6 Ken components + 1 Tama');

            // Verify Ken components have wood materials
            const crossbar = assembly.getObjectByName('sarado-crossbar');
            const bigCup = assembly.getObjectByName('big-cup-oozara');
            const smallCup = assembly.getObjectByName('small-cup-kozara');
            const baseCup = assembly.getObjectByName('base-cup-chuzara');
            const spike = assembly.getObjectByName('spike-kensaki');
            const handle = assembly.getObjectByName('handle-ken');
            const tama = assembly.getObjectByName('celestial-tama');

            assert.equal(crossbar.material, galaxyWoodCrossbarMaterial);
            assert.equal(bigCup.material, galaxyWoodBigCupMaterial);
            assert.equal(smallCup.material, galaxyWoodSmallCupMaterial);
            assert.equal(baseCup.material, galaxyWoodBaseCupMaterial);
            assert.equal(spike.material, galaxyWoodSpikeMaterial);
            assert.equal(handle.material, galaxyWoodHandleMaterial);

            // Verify Tama has Galaxy Wood Tama material
            assert.equal(tama.material, galaxyWoodTamaMaterial);
        });

        it('preserves exact spike placement, bore alignment, and clearances in Galaxy Wood preset', () => {
            const assembly = createKendamaAssemblyGroup('galaxy-wood', { includeTama: true });
            const tama = assembly.getObjectByName('celestial-tama');

            // Spike axis centering: X = 0, Z = 0
            assert.ok(Math.abs(tama.position.x) < 1e-6);
            assert.ok(Math.abs(tama.position.z) < 1e-6);

            // Spike seated elevation: Y = spikeBaseY + BALL_RADIUS = 0.033 + 0.045 = 0.0780 m
            const expectedY = kenGeometry.spike.baseY + BALL_RADIUS;
            assert.ok(
                Math.abs(tama.position.y - expectedY) < 1e-6,
                `Tama Y position (${tama.position.y}) must equal ${expectedY}`
            );

            // Bore opening faces downward along -Y toward spike
            const boreDir = new Vector3(0, -1, 0).applyQuaternion(tama.quaternion);
            assert.ok(boreDir.y < -0.999, 'Bore opening must face downward toward spike');

            // Longitudinal tip clearance
            const spikeTipY = cupConfigs.spike.localPos.y;
            const assemblyBoreApexY = tama.position.y + (-BALL_RADIUS + 0.038);
            const tipClearance = assemblyBoreApexY - spikeTipY;
            assert.ok(
                Math.abs(tipClearance - DEFAULT_BORE_TIP_CLEARANCE) < 1e-4,
                `Tip clearance (${tipClearance} m) must match ${DEFAULT_BORE_TIP_CLEARANCE} m`
            );
        });
    });

    describe('Showroom Preview Asset Integration', () => {
        it('creates showroom preview asset for Galaxy Wood via createGalaxyWoodPreviewAsset()', () => {
            const root = createGalaxyWoodPreviewAsset();
            assert.ok(root, 'createGalaxyWoodPreviewAsset() must return group');
            assert.equal(root.name, 'galaxy-wood-preview-root');

            // Verify exactly one Tama exists in the entire asset
            const tamaMeshes = [];
            root.traverse((child) => {
                if (child.isMesh && child.name === 'celestial-tama') {
                    tamaMeshes.push(child);
                }
            });
            assert.equal(tamaMeshes.length, 1, 'Galaxy Wood showroom asset must contain exactly 1 Tama mesh');

            // Verify Tama is on center model with Galaxy Wood material
            const centerModel = root.getObjectByName('big-cup-three-quarter');
            assert.equal(tamaMeshes[0].parent, centerModel);
            assert.equal(tamaMeshes[0].material, galaxyWoodTamaMaterial);

            // Verify Ken on center model has wood material on all 6 components
            const requiredKenComponents = [
                'sarado-crossbar',
                'big-cup-oozara',
                'small-cup-kozara',
                'base-cup-chuzara',
                'spike-kensaki',
                'handle-ken',
            ];
            for (const compName of requiredKenComponents) {
                const mesh = centerModel.getObjectByName(compName);
                assert.ok(mesh, `Center model must contain component "${compName}"`);
                assert.equal(
                    mesh.material,
                    GALAXY_WOOD_COMPONENT_MATERIAL_MAP[compName],
                    `Component "${compName}" on center model must use Galaxy Wood material`
                );
            }

            // Inspection models remain free of Tama and use wood materials on all 6 components
            const leftModel = root.getObjectByName('big-cup-cavity-view');
            const rightModel = root.getObjectByName('big-cup-profile-view');
            assert.equal(leftModel.getObjectByName('celestial-tama'), undefined);
            assert.equal(rightModel.getObjectByName('celestial-tama'), undefined);

            for (const compName of requiredKenComponents) {
                const leftMesh = leftModel.getObjectByName(compName);
                const rightMesh = rightModel.getObjectByName(compName);
                assert.ok(leftMesh, `Left model must contain component "${compName}"`);
                assert.ok(rightMesh, `Right model must contain component "${compName}"`);
                assert.equal(
                    leftMesh.material,
                    GALAXY_WOOD_COMPONENT_MATERIAL_MAP[compName],
                    `Left model "${compName}" must use Galaxy Wood material`
                );
                assert.equal(
                    rightMesh.material,
                    GALAXY_WOOD_COMPONENT_MATERIAL_MAP[compName],
                    `Right model "${compName}" must use Galaxy Wood material`
                );
            }
        });

        it('verifies the active IWSDK scene JSON references porcelain-dreams-preview for cup-preview node', () => {
            const scenePath = resolve(__dirname, '../../public/scenes/main.iwsdk.scene.json');
            const sceneRaw = readFileSync(scenePath, 'utf-8');
            const scene = JSON.parse(sceneRaw);

            // Recursive helper to find node by id in the scene hierarchy
            const findNodeById = (nodes, id) => {
                for (const node of nodes) {
                    if (node.id === id) return node;
                    if (node.children) {
                        const found = findNodeById(node.children, id);
                        if (found) return found;
                    }
                }
                return null;
            };

            const nodes = scene.nodes ?? [];
            const cupNode = findNodeById(nodes, 'cup-preview');

            assert.ok(cupNode, 'Active scene JSON must contain node with id "cup-preview"');
            assert.equal(cupNode.content?.type, 'asset', 'Node content type must be "asset"');
            assert.equal(
                cupNode.content?.asset,
                'porcelain-dreams-preview',
                'Active scene node "cup-preview" must reference asset "porcelain-dreams-preview"'
            );
        });
    });

    describe('Set 3: Bubblegum Pop Preset & Materials', () => {
        describe('Ken Appearance: Vibrant Pink Materials with Tonal Separation', () => {
            it('exports the authoritative Bubblegum Pop Ken palette (primary pink, hot pink, highlight pink, deep shadow)', () => {
                assert.equal(BUBBLEGUM_POP_KEN_PALETTE.PRIMARY_PINK, '#F23891');
                assert.equal(BUBBLEGUM_POP_KEN_PALETTE.HOT_PINK, '#C91E70');
                assert.equal(BUBBLEGUM_POP_KEN_PALETTE.HIGHLIGHT_PINK, '#FF83C2');
                assert.equal(BUBBLEGUM_POP_KEN_PALETTE.DEEP_PINK_SHADOW, '#861044');
                assert.equal(BUBBLEGUM_POP_KEN_PALETTE.SHEEN_PINK, '#FF6EBD');
                assert.equal(DEFAULT_BG_KEN_BASE_COLOR, '#F23891');
            });

            it('configures glossy polished lacquer finish for Bubblegum Pop Ken materials', () => {
                const mat = createBubblegumKenMaterial();
                assert.ok(mat instanceof MeshPhysicalMaterial);
                assert.equal(mat.roughness, DEFAULT_BG_KEN_ROUGHNESS);
                assert.equal(mat.metalness, 0.0, 'Dielectric painted wood (metalness = 0)');
                assert.equal(mat.clearcoat, DEFAULT_BG_KEN_CLEARCOAT);
                assert.ok(mat.clearcoatRoughness <= 0.10, 'Clearcoat must be smooth and glossy');
                assert.ok(mat.sheen > 0.30, 'Must have vibrant candy sheen');
            });

            it('compiles Bubblegum Ken shader injecting curvature highlights and recess shading', () => {
                const mat = createBubblegumKenMaterial();
                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

                assert.ok(mockShader.vertexShader.includes('varying vec3 vKenLocalPos;'), 'Must declare vKenLocalPos');
                assert.ok(mockShader.fragmentShader.includes('computeBubblegumKenShading'), 'Must define computeBubblegumKenShading');

                const cHighlight = new Color(BUBBLEGUM_POP_KEN_PALETTE.HIGHLIGHT_PINK);
                const cHot = new Color(BUBBLEGUM_POP_KEN_PALETTE.HOT_PINK);
                assert.ok(mockShader.fragmentShader.includes(cHighlight.r.toFixed(4)), 'Must contain highlight pink');
                assert.ok(mockShader.fragmentShader.includes(cHot.r.toFixed(4)), 'Must contain hot pink');
            });

            it('maps all 6 Ken components with subtle tonal variation for component separation', () => {
                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mat = BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP[comp];
                    assert.ok(mat instanceof MeshPhysicalMaterial, `${comp} must have a valid material`);
                    assert.ok(mat.name.startsWith('mat-bubblegum-'), `${comp} material name must be prefixed mat-bubblegum-`);
                }

                // Verify specific component materials are bound correctly
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['sarado-crossbar'], bubblegumCrossbarMaterial);
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['big-cup-oozara'], bubblegumBigCupMaterial);
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['small-cup-kozara'], bubblegumSmallCupMaterial);
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['base-cup-chuzara'], bubblegumBaseCupMaterial);
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['spike-kensaki'], bubblegumSpikeMaterial);
                assert.equal(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP['handle-ken'], bubblegumHandleMaterial);
            });
        });

        describe('Tama Appearance: Organic 3-Color Gradient Material (Purple, Pink, Yellow)', () => {
            it('exports the authoritative Bubblegum Pop Tama palette (vibrant purple, bubblegum pink, golden yellow)', () => {
                assert.equal(BUBBLEGUM_POP_TAMA_PALETTE.VIBRANT_PURPLE, '#7436C8');
                assert.equal(BUBBLEGUM_POP_TAMA_PALETTE.BUBBLEGUM_PINK, '#F044A0');
                assert.equal(BUBBLEGUM_POP_TAMA_PALETTE.GOLDEN_YELLOW, '#FFD447');
                assert.equal(DEFAULT_BG_TAMA_BASE_COLOR, '#F044A0');
            });

            it('configures polished spherical candy PBR finish for Bubblegum Pop Tama', () => {
                const mat = createBubblegumTamaMaterial();
                assert.ok(mat instanceof MeshPhysicalMaterial);
                assert.equal(mat.name, 'mat-bubblegum-pop-tama');
                assert.equal(mat.roughness, DEFAULT_BG_TAMA_ROUGHNESS);
                assert.equal(mat.clearcoat, DEFAULT_BG_TAMA_CLEARCOAT);
                assert.ok(mat.clearcoatRoughness <= 0.10, 'Clearcoat must be smooth and glossy');
                assert.ok(mat.iridescence > 0.20, 'Tama must have candy iridescence');
            });

            it('compiles procedural 3D spherical shader with organic 3-color ramp and bore cavity shading', () => {
                const mat = createBubblegumTamaMaterial();
                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

                const frag = mockShader.fragmentShader;

                // 3D procedural coordinates in local space (zero UV seams across sphere)
                assert.ok(mockShader.vertexShader.includes('vTamaPos = transformed;'), 'Must evaluate in 3D local mesh space');

                // 3D vector displacement warp
                assert.ok(frag.includes('bgTamaWarp'), 'Must include 3D vector warp function');

                // 3-color organic gradient ramp
                assert.ok(frag.includes('bgTamaColorRamp'), 'Must include 3-color gradient ramp');
                const cPurple = new Color(BUBBLEGUM_POP_TAMA_PALETTE.VIBRANT_PURPLE);
                const cPink = new Color(BUBBLEGUM_POP_TAMA_PALETTE.BUBBLEGUM_PINK);
                const cYellow = new Color(BUBBLEGUM_POP_TAMA_PALETTE.GOLDEN_YELLOW);

                assert.ok(frag.includes(cPurple.r.toFixed(4)), 'Shader must include Vibrant Purple channel');
                assert.ok(frag.includes(cPink.r.toFixed(4)), 'Shader must include Bubblegum Pink channel');
                assert.ok(frag.includes(cYellow.r.toFixed(4)), 'Shader must include Golden Yellow channel');

                // Bore cavity interior detection & shading
                assert.ok(frag.includes('boreCavity'), 'Must detect bore cavity');
                assert.ok(frag.includes('boreInteriorTone'), 'Must blend bore interior tone');
            });
        });

        describe('Assembly & Geometry Preservation with Bubblegum Pop Preset', () => {
            it('instantiates complete Bubblegum Pop kendama assembly with matching Ken and seated Tama', () => {
                const assembly = createKendamaAssemblyGroup(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'bubblegum-pop',
                });

                // Verify Ken components exist with Bubblegum Pop materials
                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mesh = assembly.getObjectByName(comp);
                    assert.ok(mesh instanceof Mesh, `Component ${comp} must exist as Mesh`);
                    assert.equal(
                        mesh.material,
                        BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP[comp],
                        `Component ${comp} must use Bubblegum Pop material`
                    );
                }

                // Verify Tama is present with Bubblegum Pop material
                const tama = assembly.getObjectByName('celestial-tama');
                assert.ok(tama instanceof Mesh, 'Tama mesh must exist');
                assert.equal(tama.material, bubblegumPopTamaMaterial);
            });

            it('preserves exact spike placement, bore alignment, and clearances in Bubblegum Pop preset', () => {
                const assembly = createKendamaAssemblyGroup(BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'bubblegum-pop',
                });
                const tama = assembly.getObjectByName('celestial-tama');

                // Centred on spike axis (X = 0, Z = 0)
                assert.ok(Math.abs(tama.position.x) < 1e-6);
                assert.ok(Math.abs(tama.position.z) < 1e-6);

                // Spike seated elevation: Y = spikeBaseY + BALL_RADIUS = 0.033 + 0.045 = 0.0780 m
                const expectedY = kenGeometry.spike.baseY + BALL_RADIUS;
                assert.ok(
                    Math.abs(tama.position.y - expectedY) < 1e-6,
                    `Tama Y position (${tama.position.y}) must equal ${expectedY}`
                );

                // Bore opening faces downward along -Y toward spike
                const boreDir = new Vector3(0, -1, 0).applyQuaternion(tama.quaternion);
                assert.ok(boreDir.y < -0.999, 'Bore opening must face downward toward spike');

                // Longitudinal tip clearance
                const spikeTipY = cupConfigs.spike.localPos.y;
                const assemblyBoreApexY = tama.position.y + (-BALL_RADIUS + 0.038);
                const tipClearance = assemblyBoreApexY - spikeTipY;
                assert.ok(
                    Math.abs(tipClearance - DEFAULT_BORE_TIP_CLEARANCE) < 1e-4,
                    `Tip clearance (${tipClearance} m) must match ${DEFAULT_BORE_TIP_CLEARANCE} m`
                );
            });
        });

        describe('Showroom Preview Asset Integration for Bubblegum Pop', () => {
            it('creates showroom preview asset via createBubblegumPopPreviewAsset()', () => {
                const root = createBubblegumPopPreviewAsset();
                assert.ok(root, 'createBubblegumPopPreviewAsset() must return group');
                assert.equal(root.name, 'bubblegum-pop-preview-root');

                // Exactly one Tama on center model
                const tamaMeshes = [];
                root.traverse((child) => {
                    if (child.isMesh && child.name === 'celestial-tama') {
                        tamaMeshes.push(child);
                    }
                });
                assert.equal(tamaMeshes.length, 1, 'Showroom asset must contain exactly 1 Tama mesh');

                const centerModel = root.getObjectByName('big-cup-three-quarter');
                assert.equal(tamaMeshes[0].parent, centerModel);
                assert.equal(tamaMeshes[0].material, bubblegumPopTamaMaterial);

                // All 6 Ken components of center model use Bubblegum materials
                const requiredKenComponents = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const compName of requiredKenComponents) {
                    const mesh = centerModel.getObjectByName(compName);
                    assert.ok(mesh, `Center model must contain component "${compName}"`);
                    assert.equal(
                        mesh.material,
                        BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP[compName],
                        `Component "${compName}" on center model must use Bubblegum Pop material`
                    );
                }

                // Inspection models remain free of Tama and use Bubblegum materials
                const leftModel = root.getObjectByName('big-cup-cavity-view');
                const rightModel = root.getObjectByName('big-cup-profile-view');
                assert.equal(leftModel.getObjectByName('celestial-tama'), undefined);
                assert.equal(rightModel.getObjectByName('celestial-tama'), undefined);

                for (const compName of requiredKenComponents) {
                    const leftMesh = leftModel.getObjectByName(compName);
                    const rightMesh = rightModel.getObjectByName(compName);
                    assert.ok(leftMesh, `Left model must contain component "${compName}"`);
                    assert.ok(rightMesh, `Right model must contain component "${compName}"`);
                    assert.equal(
                        leftMesh.material,
                        BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP[compName],
                        `Left model "${compName}" must use Bubblegum Pop material`
                    );
                    assert.equal(
                        rightMesh.material,
                        BUBBLEGUM_POP_COMPONENT_MATERIAL_MAP[compName],
                        `Right model "${compName}" must use Bubblegum Pop material`
                    );
                }
            });

            it('verifies that the active asset factory resolves Bubblegum Pop without fallback to Celestial', () => {
                const root = createBubblegumPopPreviewAsset();
                const centerModel = root.getObjectByName('big-cup-three-quarter');
                const tama = centerModel.getObjectByName('celestial-tama');
                const crossbar = centerModel.getObjectByName('sarado-crossbar');

                // Must NOT fall back to Celestial materials
                assert.notEqual(tama.material, celestialTamaMaterial, 'Active factory must not use Celestial Tama material');
                assert.notEqual(crossbar.material, pearlWhiteMaterial, 'Active factory must not use Celestial Crossbar material');

                // Must explicitly resolve Bubblegum Pop materials
                assert.equal(tama.material, bubblegumPopTamaMaterial, 'Active factory must assign bubblegumPopTamaMaterial');
                assert.equal(crossbar.material, bubblegumCrossbarMaterial, 'Active factory must assign bubblegumCrossbarMaterial');
            });
        });
    });

    describe('Set 4: Dark Matter Preset & Materials', () => {
        describe('Ken Appearance: Deep Charcoal and Smoky Black Marble Materials', () => {
            it('exports the authoritative Dark Matter Ken palette (smoky black, deep charcoal, smoky grey, vein grey, mineral highlight)', () => {
                assert.equal(DARK_MATTER_KEN_PALETTE.SMOKY_BLACK, '#121215');
                assert.equal(DARK_MATTER_KEN_PALETTE.DEEP_CHARCOAL, '#1E1F24');
                assert.equal(DARK_MATTER_KEN_PALETTE.SMOKY_GREY, '#353740');
                assert.equal(DARK_MATTER_KEN_PALETTE.VEIN_GREY, '#5A5D6B');
                assert.equal(DARK_MATTER_KEN_PALETTE.MINERAL_HIGHLIGHT, '#888C9D');
                assert.equal(DARK_MATTER_KEN_PALETTE.SHEEN_MINERAL, '#4E5261');
                assert.equal(DEFAULT_DM_KEN_BASE_COLOR, '#1E1F24');
            });

            it('configures glossy polished lacquer finish for Dark Matter Ken materials', () => {
                const mat = createDarkMatterKenMaterial();
                assert.ok(mat instanceof MeshPhysicalMaterial);
                assert.equal(mat.roughness, DEFAULT_DM_KEN_ROUGHNESS);
                assert.equal(mat.metalness, 0.0, 'Dielectric stone / lacquer (metalness = 0)');
                assert.equal(mat.clearcoat, DEFAULT_DM_KEN_CLEARCOAT);
                assert.ok(mat.clearcoatRoughness <= 0.10, 'Clearcoat must be smooth and glossy');
                assert.ok(mat.sheen > 0.25, 'Must have subtle mineral sheen');
            });

            it('compiles Dark Matter Ken shader injecting 3D marble turbulence and flowing veins', () => {
                const mat = createDarkMatterKenMaterial();
                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

                assert.ok(mockShader.vertexShader.includes('varying vec3 vKenLocalPos;'), 'Must declare vKenLocalPos');
                assert.ok(mockShader.fragmentShader.includes('dmKenTurbulence'), 'Must define dmKenTurbulence');
                assert.ok(mockShader.fragmentShader.includes('computeDarkMatterMarble'), 'Must define computeDarkMatterMarble');

                const cVein = new Color(DARK_MATTER_KEN_PALETTE.VEIN_GREY);
                const cHighlight = new Color(DARK_MATTER_KEN_PALETTE.MINERAL_HIGHLIGHT);
                assert.ok(mockShader.fragmentShader.includes(cVein.r.toFixed(4)), 'Must contain vein grey');
                assert.ok(mockShader.fragmentShader.includes(cHighlight.r.toFixed(4)), 'Must contain mineral highlight');
            });

            it('maps all 6 Ken components with subtle tonal variation for component separation', () => {
                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mat = DARK_MATTER_COMPONENT_MATERIAL_MAP[comp];
                    assert.ok(mat instanceof MeshPhysicalMaterial, `${comp} must have a valid material`);
                    assert.ok(mat.name.startsWith('mat-dark-matter-'), `${comp} material name must be prefixed mat-dark-matter-`);
                }

                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['sarado-crossbar'], darkMatterCrossbarMaterial);
                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['big-cup-oozara'], darkMatterBigCupMaterial);
                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['small-cup-kozara'], darkMatterSmallCupMaterial);
                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['base-cup-chuzara'], darkMatterBaseCupMaterial);
                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['spike-kensaki'], darkMatterSpikeMaterial);
                assert.equal(DARK_MATTER_COMPONENT_MATERIAL_MAP['handle-ken'], darkMatterHandleMaterial);
            });
        });

        describe('Tama Appearance: Hot-Pink to Smoky Black Organic Gradient Material', () => {
            it('exports the authoritative Dark Matter Tama palette (hot pink, magenta, smoky plum, smoky charcoal, deep black)', () => {
                assert.equal(DARK_MATTER_TAMA_PALETTE.HOT_PINK, '#FF2B95');
                assert.equal(DARK_MATTER_TAMA_PALETTE.MAGENTA_BURST, '#C61A74');
                assert.equal(DARK_MATTER_TAMA_PALETTE.SMOKY_PLUM, '#4E2138');
                assert.equal(DARK_MATTER_TAMA_PALETTE.SMOKY_CHARCOAL, '#20222A');
                assert.equal(DARK_MATTER_TAMA_PALETTE.DEEP_BLACK, '#0F1014');
                assert.equal(DARK_MATTER_TAMA_PALETTE.BORE_SHADOW, '#090A0D');
                assert.equal(DEFAULT_DM_TAMA_BASE_COLOR, '#0F1014');
            });

            it('configures polished spherical PBR finish for Dark Matter Tama', () => {
                const mat = createDarkMatterTamaMaterial();
                assert.ok(mat instanceof MeshPhysicalMaterial);
                assert.equal(mat.name, 'mat-dark-matter-tama');
                assert.equal(mat.roughness, DEFAULT_DM_TAMA_ROUGHNESS);
                assert.equal(mat.clearcoat, DEFAULT_DM_TAMA_CLEARCOAT);
                assert.ok(mat.clearcoatRoughness <= 0.10, 'Clearcoat must be smooth and glossy');
                assert.ok(mat.iridescence > 0.15, 'Tama must have subtle iridescence');
            });

            it('compiles procedural 3D spherical shader with organic hot-pink to black ramp and bore cavity shading', () => {
                const mat = createDarkMatterTamaMaterial();
                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));

                const frag = mockShader.fragmentShader;

                assert.ok(mockShader.vertexShader.includes('vTamaPos = transformed;'), 'Must evaluate in 3D local mesh space');
                assert.ok(frag.includes('dmTamaWarp'), 'Must include 3D vector warp function');
                assert.ok(frag.includes('dmTamaColorRamp'), 'Must include 5-stage color transition ramp');

                const cPink = new Color(DARK_MATTER_TAMA_PALETTE.HOT_PINK);
                const cBlack = new Color(DARK_MATTER_TAMA_PALETTE.DEEP_BLACK);
                const cPlum = new Color(DARK_MATTER_TAMA_PALETTE.SMOKY_PLUM);

                assert.ok(frag.includes(cPink.r.toFixed(4)), 'Shader must include Hot Pink channel');
                assert.ok(frag.includes(cBlack.r.toFixed(4)), 'Shader must include Deep Black channel');
                assert.ok(frag.includes(cPlum.r.toFixed(4)), 'Shader must include Smoky Plum channel');

                assert.ok(frag.includes('boreCavity'), 'Must detect bore cavity');
                assert.ok(frag.includes('boreInteriorTone'), 'Must blend bore interior tone');
            });
        });

        describe('Assembly & Geometry Preservation with Dark Matter Preset', () => {
            it('instantiates complete Dark Matter kendama assembly with matching Ken and seated Tama', () => {
                const assembly = createKendamaAssemblyGroup(DARK_MATTER_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'dark-matter',
                });

                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mesh = assembly.getObjectByName(comp);
                    assert.ok(mesh instanceof Mesh, `Component ${comp} must exist as Mesh`);
                    assert.equal(
                        mesh.material,
                        DARK_MATTER_COMPONENT_MATERIAL_MAP[comp],
                        `Component ${comp} must use Dark Matter material`
                    );
                }

                const tama = assembly.getObjectByName('celestial-tama');
                assert.ok(tama instanceof Mesh, 'Tama mesh must exist');
                assert.equal(tama.material, darkMatterTamaMaterial);
            });

            it('preserves exact spike placement, bore alignment, and clearances in Dark Matter preset', () => {
                const assembly = createKendamaAssemblyGroup(DARK_MATTER_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'dark-matter',
                });
                const tama = assembly.getObjectByName('celestial-tama');

                assert.ok(Math.abs(tama.position.x) < 1e-6);
                assert.ok(Math.abs(tama.position.z) < 1e-6);

                const expectedY = kenGeometry.spike.baseY + BALL_RADIUS;
                assert.ok(
                    Math.abs(tama.position.y - expectedY) < 1e-6,
                    `Tama Y position (${tama.position.y}) must equal ${expectedY}`
                );

                const boreDir = new Vector3(0, -1, 0).applyQuaternion(tama.quaternion);
                assert.ok(boreDir.y < -0.999, 'Bore opening must face downward toward spike');

                const spikeTipY = cupConfigs.spike.localPos.y;
                const assemblyBoreApexY = tama.position.y + (-BALL_RADIUS + 0.038);
                const tipClearance = assemblyBoreApexY - spikeTipY;
                assert.ok(
                    Math.abs(tipClearance - DEFAULT_BORE_TIP_CLEARANCE) < 1e-4,
                    `Tip clearance (${tipClearance} m) must match ${DEFAULT_BORE_TIP_CLEARANCE} m`
                );
            });
        });

        describe('Showroom Preview Asset Integration for Dark Matter', () => {
            it('creates showroom preview asset via createDarkMatterPreviewAsset()', () => {
                const root = createDarkMatterPreviewAsset();
                assert.ok(root, 'createDarkMatterPreviewAsset() must return group');
                assert.equal(root.name, 'dark-matter-preview-root');

                const tamaMeshes = [];
                root.traverse((child) => {
                    if (child.isMesh && child.name === 'celestial-tama') {
                        tamaMeshes.push(child);
                    }
                });
                assert.equal(tamaMeshes.length, 1, 'Showroom asset must contain exactly 1 Tama mesh');

                const centerModel = root.getObjectByName('big-cup-three-quarter');
                assert.equal(tamaMeshes[0].parent, centerModel);
                assert.equal(tamaMeshes[0].material, darkMatterTamaMaterial);

                const requiredKenComponents = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const compName of requiredKenComponents) {
                    const mesh = centerModel.getObjectByName(compName);
                    assert.ok(mesh, `Center model must contain component "${compName}"`);
                    assert.equal(
                        mesh.material,
                        DARK_MATTER_COMPONENT_MATERIAL_MAP[compName],
                        `Component "${compName}" on center model must use Dark Matter material`
                    );
                }

                const leftModel = root.getObjectByName('big-cup-cavity-view');
                const rightModel = root.getObjectByName('big-cup-profile-view');
                assert.equal(leftModel.getObjectByName('celestial-tama'), undefined);
                assert.equal(rightModel.getObjectByName('celestial-tama'), undefined);

                for (const compName of requiredKenComponents) {
                    const leftMesh = leftModel.getObjectByName(compName);
                    const rightMesh = rightModel.getObjectByName(compName);
                    assert.ok(leftMesh, `Left model must contain component "${compName}"`);
                    assert.ok(rightMesh, `Right model must contain component "${compName}"`);
                    assert.equal(
                        leftMesh.material,
                        DARK_MATTER_COMPONENT_MATERIAL_MAP[compName],
                        `Left model "${compName}" must use Dark Matter material`
                    );
                    assert.equal(
                        rightMesh.material,
                        DARK_MATTER_COMPONENT_MATERIAL_MAP[compName],
                        `Right model "${compName}" must use Dark Matter material`
                    );
                }
            });

            it('verifies that the active asset factory resolves Dark Matter without fallback to Celestial', () => {
                const root = createDarkMatterPreviewAsset();
                const centerModel = root.getObjectByName('big-cup-three-quarter');
                const tama = centerModel.getObjectByName('celestial-tama');
                const crossbar = centerModel.getObjectByName('sarado-crossbar');

                assert.notEqual(tama.material, celestialTamaMaterial, 'Active factory must not use Celestial Tama material');
                assert.notEqual(crossbar.material, pearlWhiteMaterial, 'Active factory must not use Celestial Crossbar material');

                assert.equal(tama.material, darkMatterTamaMaterial, 'Active factory must assign darkMatterTamaMaterial');
                assert.equal(crossbar.material, darkMatterCrossbarMaterial, 'Active factory must assign darkMatterCrossbarMaterial');
            });

            it('confirms dark-matter-preview is registered in assets.js', () => {
                const assetsPath = resolve(__dirname, '../assets.js');
                const assetsRaw = readFileSync(assetsPath, 'utf-8');
                assert.ok(assetsRaw.includes("'dark-matter-preview'"), 'assets.js must register dark-matter-preview');
            });
        });
    });

    describe('Set 5: Porcelain Dreams Preset & Materials', () => {
        describe('Procedural Pattern Engine & Reusable Primitives', () => {
            it('exports the authoritative Porcelain Dreams palette (ivory, rich cobalt, royal blue, deep cobalt, soft blue)', () => {
                assert.equal(PORCELAIN_PALETTE.WARM_IVORY, '#F5F0E5');
                assert.equal(PORCELAIN_PALETTE.RICH_COBALT, '#174A9C');
                assert.equal(PORCELAIN_PALETTE.ROYAL_BLUE, '#245EB8');
                assert.equal(PORCELAIN_PALETTE.DEEP_COBALT, '#10366F');
                assert.equal(PORCELAIN_PALETTE.SOFT_BLUE, '#7896C7');
                assert.equal(PORCELAIN_PALETTE.GLAZE_HIGHLIGHT, '#FDFBF7');
            });

            it('executes drawFlower() and generates multi-layered porcelain petals with core stamens', () => {
                const canvas = createPatternCanvas(256, 256);
                const ctx = canvas.getContext('2d');
                drawFlower(ctx, 128, 128, 50, { petals: 8, innerLayers: 2 });

                const methods = ctx._calls.map((c) => c.method);
                assert.ok(methods.includes('beginPath'));
                assert.ok(methods.includes('bezierCurveTo'));
                assert.ok(methods.includes('arc'));
                assert.ok(methods.includes('fill'));
                assert.ok(methods.includes('stroke'));
            });

            it('executes drawLeaf() and generates contoured leaf with central and lateral veins', () => {
                const canvas = createPatternCanvas(256, 256);
                const ctx = canvas.getContext('2d');
                drawLeaf(ctx, 50, 50, 40, 15, Math.PI * 0.25, { veinCount: 3 });

                const methods = ctx._calls.map((c) => c.method);
                assert.ok(methods.includes('bezierCurveTo'));
                assert.ok(methods.includes('quadraticCurveTo'));
                assert.ok(methods.includes('fill'));
                assert.ok(methods.includes('stroke'));
            });

            it('executes drawCurvingVine() with intermediate Bezier control points and branching tendrils', () => {
                const canvas = createPatternCanvas(256, 256);
                const ctx = canvas.getContext('2d');
                drawCurvingVine(ctx, 10, 10, 200, 200, [{ x: 50, y: 150 }, { x: 150, y: 50 }], {
                    withTendrils: true,
                });

                const methods = ctx._calls.map((c) => c.method);
                assert.ok(methods.includes('bezierCurveTo'));
                assert.ok(methods.includes('stroke'));
            });

            it('executes drawDecorativeCurl() generating inward spiral flourishes', () => {
                const canvas = createPatternCanvas(128, 128);
                const ctx = canvas.getContext('2d');
                drawDecorativeCurl(ctx, 64, 64, 30, 0, Math.PI * 1.5, { direction: 1 });

                const methods = ctx._calls.map((c) => c.method);
                assert.ok(methods.includes('lineTo'));
                assert.ok(methods.includes('stroke'));
            });

            it('executes drawGeometricBorder() across all supported pattern types (meander, lotus, ruyi, diamond)', () => {
                const types = ['meander', 'lotus-petal', 'ruyi-cloud', 'diamond-chain'];
                for (const t of types) {
                    const canvas = createPatternCanvas(256, 64);
                    const ctx = canvas.getContext('2d');
                    drawGeometricBorder(ctx, 5, 256, 40, { patternType: t, repeatCount: 8 });

                    const methods = ctx._calls.map((c) => c.method);
                    assert.ok(methods.includes('stroke'));
                }
            });

            it('executes drawOrnamentalDetail() across detail types (floret, teardrop, trefoil, cloud-pip)', () => {
                const types = ['floret', 'teardrop', 'trefoil', 'cloud-pip'];
                for (const t of types) {
                    const canvas = createPatternCanvas(64, 64);
                    const ctx = canvas.getContext('2d');
                    drawOrnamentalDetail(ctx, 32, 32, 16, t);

                    const methods = ctx._calls.map((c) => c.method);
                    assert.ok(methods.includes('fill'));
                }
            });

            it('generates component-specific CanvasTextures with valid Three.js wrapping and filters', () => {
                const tamaTex = createPorcelainTamaTexture({ width: 256, height: 128 });
                const cupTex = createPorcelainCupTexture('big', { width: 128, height: 64 });
                const handleTex = createPorcelainHandleTexture({ width: 128, height: 128 });
                const crossbarTex = createPorcelainCrossbarTexture({ width: 128, height: 64 });
                const spikeTex = createPorcelainSpikeTexture({ width: 64, height: 128 });

                assert.ok(tamaTex.isCanvasTexture);
                assert.ok(cupTex.isCanvasTexture);
                assert.ok(handleTex.isCanvasTexture);
                assert.ok(crossbarTex.isCanvasTexture);
                assert.ok(spikeTex.isCanvasTexture);

                assert.equal(tamaTex.name, 'tex-porcelain-tama');
                assert.equal(cupTex.name, 'tex-porcelain-cup-big');
                assert.equal(handleTex.name, 'tex-porcelain-handle');
                assert.equal(crossbarTex.name, 'tex-porcelain-crossbar');
                assert.equal(spikeTex.name, 'tex-porcelain-spike');
            });
        });

        describe('Ken Appearance: Glazed Porcelain Materials & Tailored Textures', () => {
            it('exports authoritative default PBR constants for Porcelain Dreams Ken', () => {
                assert.equal(DEFAULT_PORCELAIN_KEN_BASE_COLOR, '#F5F0E5');
                assert.equal(DEFAULT_PORCELAIN_KEN_ROUGHNESS, 0.12);
                assert.equal(DEFAULT_PORCELAIN_KEN_CLEARCOAT, 0.95);
            });

            it('maps all 6 Ken components with glazed porcelain PBR materials prefixed mat-porcelain-', () => {
                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mat = PORCELAIN_COMPONENT_MATERIAL_MAP[comp];
                    assert.ok(mat instanceof MeshPhysicalMaterial, `${comp} must have a valid material`);
                    assert.ok(mat.name.startsWith('mat-porcelain-'), `${comp} material name must be prefixed mat-porcelain-`);
                    assert.equal(mat.roughness, DEFAULT_PORCELAIN_KEN_ROUGHNESS);
                    assert.equal(mat.clearcoat, DEFAULT_PORCELAIN_KEN_CLEARCOAT);
                }

                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['sarado-crossbar'], porcelainCrossbarMaterial);
                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['big-cup-oozara'], porcelainBigCupMaterial);
                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['small-cup-kozara'], porcelainSmallCupMaterial);
                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['base-cup-chuzara'], porcelainBaseCupMaterial);
                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['spike-kensaki'], porcelainSpikeMaterial);
                assert.equal(PORCELAIN_COMPONENT_MATERIAL_MAP['handle-ken'], porcelainHandleMaterial);
            });

            it('attaches crossbar cylindrical projection shader via onBeforeCompile', () => {
                assert.equal(typeof porcelainCrossbarMaterial.onBeforeCompile, 'function');
                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => porcelainCrossbarMaterial.onBeforeCompile(mockShader));
                assert.ok(mockShader.vertexShader.includes('vPorcelainCrossbarUv'), 'Must compute cylindrical crossbar UV');
                assert.ok(mockShader.fragmentShader.includes('uPorcelainCrossbarMap'), 'Must sample crossbar texture');
            });
        });

        describe('Tama Appearance: Glazed Ivory & Cobalt Porcelain Material', () => {
            it('exports authoritative default PBR constants for Porcelain Dreams Tama', () => {
                assert.equal(DEFAULT_PORCELAIN_TAMA_BASE_COLOR, '#F5F0E5');
                assert.equal(DEFAULT_PORCELAIN_TAMA_ROUGHNESS, 0.10);
                assert.equal(DEFAULT_PORCELAIN_TAMA_CLEARCOAT, 0.96);
            });

            it('configures glazed spherical finish and bore cavity shading for Porcelain Tama', () => {
                const mat = createPorcelainTamaMaterial();
                assert.ok(mat instanceof MeshPhysicalMaterial);
                assert.equal(mat.name, 'mat-porcelain-tama');
                assert.equal(mat.roughness, DEFAULT_PORCELAIN_TAMA_ROUGHNESS);
                assert.equal(mat.clearcoat, DEFAULT_PORCELAIN_TAMA_CLEARCOAT);
                assert.ok(mat.map?.isCanvasTexture);

                const mockShader = {
                    vertexShader: ShaderLib.physical.vertexShader,
                    fragmentShader: ShaderLib.physical.fragmentShader,
                    uniforms: { ...ShaderLib.physical.uniforms },
                };

                assert.doesNotThrow(() => mat.onBeforeCompile(mockShader));
                assert.ok(mockShader.vertexShader.includes('vPorcelainTamaPos = transformed;'), 'Must pass transformed coordinates');
                assert.ok(mockShader.fragmentShader.includes('boreCavityTone'), 'Must blend bore cavity shadow');
            });
        });

        describe('Assembly & Geometry Preservation with Porcelain Dreams Preset', () => {
            it('instantiates complete Porcelain Dreams kendama assembly with matching Ken and seated Tama', () => {
                const assembly = createKendamaAssemblyGroup(PORCELAIN_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'porcelain-dreams',
                });

                const required = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const comp of required) {
                    const mesh = assembly.getObjectByName(comp);
                    assert.ok(mesh instanceof Mesh, `Component ${comp} must exist as Mesh`);
                    assert.equal(
                        mesh.material,
                        PORCELAIN_COMPONENT_MATERIAL_MAP[comp],
                        `Component ${comp} must use Porcelain Dreams material`
                    );
                }

                const tama = assembly.getObjectByName('celestial-tama');
                assert.ok(tama instanceof Mesh, 'Tama mesh must exist');
                assert.equal(tama.material, porcelainTamaMaterial);
            });

            it('preserves exact spike placement, bore alignment, and clearances in Porcelain Dreams preset', () => {
                const assembly = createKendamaAssemblyGroup(PORCELAIN_COMPONENT_MATERIAL_MAP, {
                    includeTama: true,
                    preset: 'porcelain-dreams',
                });
                const tama = assembly.getObjectByName('celestial-tama');

                assert.ok(Math.abs(tama.position.x) < 1e-6);
                assert.ok(Math.abs(tama.position.z) < 1e-6);

                const expectedY = kenGeometry.spike.baseY + BALL_RADIUS;
                assert.ok(
                    Math.abs(tama.position.y - expectedY) < 1e-6,
                    `Tama Y position (${tama.position.y}) must equal ${expectedY}`
                );

                const boreDir = new Vector3(0, -1, 0).applyQuaternion(tama.quaternion);
                assert.ok(boreDir.y < -0.999, 'Bore opening must face downward toward spike');

                const spikeTipY = cupConfigs.spike.localPos.y;
                const assemblyBoreApexY = tama.position.y + (-BALL_RADIUS + 0.038);
                const tipClearance = assemblyBoreApexY - spikeTipY;
                assert.ok(
                    Math.abs(tipClearance - DEFAULT_BORE_TIP_CLEARANCE) < 1e-4,
                    `Tip clearance (${tipClearance} m) must match ${DEFAULT_BORE_TIP_CLEARANCE} m`
                );
            });
        });

        describe('Showroom Preview Asset Integration for Porcelain Dreams', () => {
            it('creates showroom preview asset via createPorcelainDreamsPreviewAsset()', () => {
                const root = createPorcelainDreamsPreviewAsset();
                assert.ok(root, 'createPorcelainDreamsPreviewAsset() must return group');
                assert.equal(root.name, 'porcelain-dreams-preview-root');

                const tamaMeshes = [];
                root.traverse((child) => {
                    if (child.isMesh && child.name === 'celestial-tama') {
                        tamaMeshes.push(child);
                    }
                });
                assert.equal(tamaMeshes.length, 1, 'Showroom asset must contain exactly 1 Tama mesh');

                const centerModel = root.getObjectByName('big-cup-three-quarter');
                assert.equal(tamaMeshes[0].parent, centerModel);
                assert.equal(tamaMeshes[0].material, porcelainTamaMaterial);

                const requiredKenComponents = [
                    'sarado-crossbar',
                    'big-cup-oozara',
                    'small-cup-kozara',
                    'base-cup-chuzara',
                    'spike-kensaki',
                    'handle-ken',
                ];
                for (const compName of requiredKenComponents) {
                    const mesh = centerModel.getObjectByName(compName);
                    assert.ok(mesh, `Center model must contain component "${compName}"`);
                    assert.equal(
                        mesh.material,
                        PORCELAIN_COMPONENT_MATERIAL_MAP[compName],
                        `Component "${compName}" on center model must use Porcelain Dreams material`
                    );
                }

                const leftModel = root.getObjectByName('big-cup-cavity-view');
                const rightModel = root.getObjectByName('big-cup-profile-view');
                assert.equal(leftModel.getObjectByName('celestial-tama'), undefined);
                assert.equal(rightModel.getObjectByName('celestial-tama'), undefined);

                for (const compName of requiredKenComponents) {
                    const leftMesh = leftModel.getObjectByName(compName);
                    const rightMesh = rightModel.getObjectByName(compName);
                    assert.ok(leftMesh, `Left model must contain component "${compName}"`);
                    assert.ok(rightMesh, `Right model must contain component "${compName}"`);
                    assert.equal(
                        leftMesh.material,
                        PORCELAIN_COMPONENT_MATERIAL_MAP[compName],
                        `Left model "${compName}" must use Porcelain Dreams material`
                    );
                    assert.equal(
                        rightMesh.material,
                        PORCELAIN_COMPONENT_MATERIAL_MAP[compName],
                        `Right model "${compName}" must use Porcelain Dreams material`
                    );
                }
            });

            it('verifies that the active asset factory resolves Porcelain Dreams without fallback to Celestial', () => {
                const root = createPorcelainDreamsPreviewAsset();
                const centerModel = root.getObjectByName('big-cup-three-quarter');
                const tama = centerModel.getObjectByName('celestial-tama');
                const crossbar = centerModel.getObjectByName('sarado-crossbar');

                assert.notEqual(tama.material, celestialTamaMaterial, 'Active factory must not use Celestial Tama material');
                assert.notEqual(crossbar.material, pearlWhiteMaterial, 'Active factory must not use Celestial Crossbar material');

                assert.equal(tama.material, porcelainTamaMaterial, 'Active factory must assign porcelainTamaMaterial');
                assert.equal(crossbar.material, porcelainCrossbarMaterial, 'Active factory must assign porcelainCrossbarMaterial');
            });

            it('confirms the active showroom scene node "cup-preview" references porcelain-dreams-preview', () => {
                const scenePath = resolve(__dirname, '../../public/scenes/main.iwsdk.scene.json');
                const sceneRaw = readFileSync(scenePath, 'utf-8');
                const scene = JSON.parse(sceneRaw);

                const findNodeById = (nodes, id) => {
                    for (const node of nodes) {
                        if (node.id === id) return node;
                        if (node.children) {
                            const found = findNodeById(node.children, id);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const cupNode = findNodeById(scene.nodes ?? [], 'cup-preview');
                assert.ok(cupNode, 'Active scene JSON must contain node "cup-preview"');
                assert.equal(cupNode.content?.type, 'asset');
                assert.equal(cupNode.content?.asset, 'porcelain-dreams-preview');
            });
        });
    });

    describe('Independence from Sets 1â€“4: Celestial Kendama, Galaxy Wood, Bubblegum Pop, and Dark Matter', () => {
        it('preserves Set 1 Celestial Kendama materials and default showroom asset', () => {
            // Default showroom asset without options must remain Celestial Kendama
            const defaultRoot = createBigCupPreviewAsset();
            assert.equal(defaultRoot.name, 'big-cup-preview-root');

            const centerModel = defaultRoot.getObjectByName('big-cup-three-quarter');
            const defaultCrossbar = centerModel.getObjectByName('sarado-crossbar');
            assert.equal(
                defaultCrossbar.material,
                pearlWhiteMaterial,
                'Default showroom asset must continue using Celestial Kendama materials'
            );

            const defaultTama = centerModel.getObjectByName('celestial-tama');
            assert.equal(
                defaultTama.material,
                celestialTamaMaterial,
                'Default showroom asset must continue using Celestial Tama material'
            );
        });

        it('allows all five presets to be created and inspected independently without side effects', () => {
            const celestial = createBigCupPreviewAsset();
            const galaxyWood = createGalaxyWoodPreviewAsset();
            const bubblegumPop = createBubblegumPopPreviewAsset();
            const darkMatter = createDarkMatterPreviewAsset();
            const porcelainDreams = createPorcelainDreamsPreviewAsset();

            const celestialTama = celestial.getObjectByName('big-cup-three-quarter').getObjectByName('celestial-tama');
            const gwTama = galaxyWood.getObjectByName('big-cup-three-quarter').getObjectByName('celestial-tama');
            const bgTama = bubblegumPop.getObjectByName('big-cup-three-quarter').getObjectByName('celestial-tama');
            const dmTama = darkMatter.getObjectByName('big-cup-three-quarter').getObjectByName('celestial-tama');
            const porcelainTama = porcelainDreams.getObjectByName('big-cup-three-quarter').getObjectByName('celestial-tama');

            assert.notEqual(celestialTama.material, gwTama.material);
            assert.notEqual(celestialTama.material, bgTama.material);
            assert.notEqual(celestialTama.material, dmTama.material);
            assert.notEqual(celestialTama.material, porcelainTama.material);
            assert.notEqual(gwTama.material, bgTama.material);
            assert.notEqual(gwTama.material, dmTama.material);
            assert.notEqual(gwTama.material, porcelainTama.material);
            assert.notEqual(bgTama.material, dmTama.material);
            assert.notEqual(bgTama.material, porcelainTama.material);
            assert.notEqual(dmTama.material, porcelainTama.material);

            assert.equal(celestialTama.material.name, 'mat-celestial-tama');
            assert.equal(gwTama.material.name, 'mat-galaxy-wood-tama');
            assert.equal(bgTama.material.name, 'mat-bubblegum-pop-tama');
            assert.equal(dmTama.material.name, 'mat-dark-matter-tama');
            assert.equal(porcelainTama.material.name, 'mat-porcelain-tama');

            const celestialCrossbar = celestial.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');
            const gwCrossbar = galaxyWood.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');
            const bgCrossbar = bubblegumPop.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');
            const dmCrossbar = darkMatter.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');
            const porcelainCrossbar = porcelainDreams.getObjectByName('big-cup-three-quarter').getObjectByName('sarado-crossbar');

            assert.notEqual(celestialCrossbar.material, gwCrossbar.material);
            assert.notEqual(celestialCrossbar.material, bgCrossbar.material);
            assert.notEqual(celestialCrossbar.material, dmCrossbar.material);
            assert.notEqual(celestialCrossbar.material, porcelainCrossbar.material);
            assert.notEqual(gwCrossbar.material, bgCrossbar.material);
            assert.notEqual(gwCrossbar.material, dmCrossbar.material);
            assert.notEqual(gwCrossbar.material, porcelainCrossbar.material);
            assert.notEqual(bgCrossbar.material, dmCrossbar.material);
            assert.notEqual(bgCrossbar.material, porcelainCrossbar.material);
            assert.notEqual(dmCrossbar.material, porcelainCrossbar.material);

            assert.equal(celestialCrossbar.material.name, 'mat-pearl-white');
            assert.equal(gwCrossbar.material.name, 'mat-wood-crossbar');
            assert.equal(bgCrossbar.material.name, 'mat-bubblegum-crossbar');
            assert.equal(dmCrossbar.material.name, 'mat-dark-matter-crossbar');
            assert.equal(porcelainCrossbar.material.name, 'mat-porcelain-sarado-crossbar');
        });

        it('does not mutate KEN_PALETTE, TAMA_PALETTE, GALAXY_WOOD_PALETTE, BUBBLEGUM_POP, DARK_MATTER, or PORCELAIN_PALETTE palettes', () => {
            assert.ok(Object.isFrozen(KEN_PALETTE));
            assert.ok(Object.isFrozen(TAMA_PALETTE));
            assert.ok(Object.isFrozen(GALAXY_WOOD_PALETTE));
            assert.ok(Object.isFrozen(GALAXY_WOOD_TAMA_PALETTE));
            assert.ok(Object.isFrozen(BUBBLEGUM_POP_KEN_PALETTE));
            assert.ok(Object.isFrozen(BUBBLEGUM_POP_TAMA_PALETTE));
            assert.ok(Object.isFrozen(DARK_MATTER_KEN_PALETTE));
            assert.ok(Object.isFrozen(DARK_MATTER_TAMA_PALETTE));
            assert.ok(Object.isFrozen(PORCELAIN_PALETTE));

            assert.equal(KEN_PALETTE.MOON_PEARL, '#F7F0F5');
            assert.equal(TAMA_PALETTE.DARK_LAVENDER, '#786A9E');
            assert.equal(GALAXY_WOOD_PALETTE.WOOD_BASE_BROWN, '#441E15');
            assert.equal(GALAXY_WOOD_TAMA_PALETTE.MOLTEN_GOLD, '#F5B82E');
            assert.equal(BUBBLEGUM_POP_KEN_PALETTE.PRIMARY_PINK, '#F23891');
            assert.equal(BUBBLEGUM_POP_TAMA_PALETTE.VIBRANT_PURPLE, '#7436C8');
            assert.equal(DARK_MATTER_KEN_PALETTE.SMOKY_BLACK, '#121215');
            assert.equal(DARK_MATTER_TAMA_PALETTE.HOT_PINK, '#FF2B95');
            assert.equal(PORCELAIN_PALETTE.WARM_IVORY, '#F5F0E5');
            assert.equal(PORCELAIN_PALETTE.RICH_COBALT, '#174A9C');
            assert.equal(PORCELAIN_PALETTE.ROYAL_BLUE, '#245EB8');
            assert.equal(PORCELAIN_PALETTE.DEEP_COBALT, '#10366F');
            assert.equal(PORCELAIN_PALETTE.SOFT_BLUE, '#7896C7');
        });
    });
});
