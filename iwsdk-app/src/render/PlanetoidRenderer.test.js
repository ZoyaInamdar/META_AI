/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scene, Vector3 } from 'three';
import {
  PlanetoidRenderer,
  PLANETOID_STAGES,
  DEBUG_STAGE_PRESETS,
  PLANETOID_DEFAULT_SCALE,
  PLANETOID_SHOWCASE_SCALE,
  PLANETOID_DEFAULT_ANCHOR,
  PLANETOID_SHOWCASE_ANCHOR
} from './PlanetoidRenderer.js';
import { PLANETOID_PALETTE } from './PlanetoidShader.js';
import { BallState, PlanetState } from '../contracts/Interfaces.js';

describe('PlanetoidRenderer (Person C)', () => {
  let renderer;
  let scene;

  beforeEach(() => {
    scene = new Scene();
    renderer = new PlanetoidRenderer();
  });

  afterEach(() => {
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
  });

  // ==========================================================================
  // 1. CONSTRUCTION & HIERARCHY
  // ==========================================================================
  describe('Construction & Scene Graph', () => {
    it('creates root group and child meshes', () => {
      expect(renderer.group).toBeDefined();
      expect(renderer.group.name).toBe('planetoid-renderer-root');

      expect(renderer.coreMesh).toBeDefined();
      expect(renderer.coreMesh.name).toBe('planetoid-core');
      expect(renderer.coreGeometry).toBeDefined();
      expect(renderer.coreMaterial).toBeDefined();

      expect(renderer.atmosphereMesh).toBeDefined();
      expect(renderer.atmosphereMesh.name).toBe('planetoid-atmosphere');
      expect(renderer.atmosphereGeometry).toBeDefined();
      expect(renderer.atmosphereMaterial).toBeDefined();

      expect(renderer.ringMesh).toBeDefined();
      expect(renderer.ringMesh.name).toBe('planetoid-rings');
      expect(renderer.ringGeometry).toBeDefined();
      expect(renderer.ringMaterial).toBeDefined();
    });

    it('attaches to scene via init() idempotently', () => {
      renderer.init(scene);
      expect(scene.children).toContain(renderer.group);

      // Repeat init should not duplicate
      renderer.init(scene);
      expect(scene.children.filter((c) => c === renderer.group).length).toBe(1);
    });

    it('has vertex budget under Quest 2,000 vertex target', () => {
      const coreVerts = renderer.coreGeometry.attributes.position.count;
      const atmoVerts = renderer.atmosphereGeometry.attributes.position.count;
      const ringVerts = renderer.ringGeometry.attributes.position.count;
      const totalVerts = coreVerts + atmoVerts + ringVerts;

      expect(totalVerts).toBeLessThan(2000);
      expect(coreVerts).toBeLessThan(1200);
    });

    it('initializes atmosphere and ring invisible in dormant state', () => {
      expect(renderer.atmosphereMesh.visible).toBe(false);
      expect(renderer.ringMesh.visible).toBe(false);
    });

    it('initializes planetary rings with horizontal celestial orientation tilted toward camera', () => {
      // Ring lies in horizontal plane (~XZ) with ~13 deg tilt toward player camera and ~7 deg roll
      expect(renderer.ringMesh.rotation.x).toBeCloseTo(-1.35, 2);
      expect(renderer.ringMesh.rotation.y).toBeCloseTo(0.0, 2);
      expect(renderer.ringMesh.rotation.z).toBeCloseTo(0.12, 2);
    });

    it('maintains stable planetary ring orientation without wobble or Euler reset during updates', () => {
      renderer.setStage(5);
      const initialRotX = renderer.ringMesh.rotation.x;
      const initialRotY = renderer.ringMesh.rotation.y;
      const initialRotZ = renderer.ringMesh.rotation.z;

      for (let i = 0; i < 20; i++) {
        renderer.update(0.016);
      }

      expect(renderer.ringMesh.rotation.x).toBeCloseTo(initialRotX, 4);
      expect(renderer.ringMesh.rotation.y).toBeCloseTo(initialRotY, 4);
      expect(renderer.ringMesh.rotation.z).toBeCloseTo(initialRotZ, 4);
    });
  });

  // ==========================================================================
  // 2. STATE HANDLING & CONTRACT IMMUTABILITY
  // ==========================================================================
  describe('State Handling (BallState & PlanetState)', () => {
    it('maintains independent celestial gameplay anchor and does NOT derive position from BallState', () => {
      const ballState = new BallState({ x: 0.1, y: 1.2, z: -0.5 }, { x: 0, y: 0, z: 0 }, 'air');
      renderer.update({ ballState });

      // Planetoid position must NOT copy ballState.position
      expect(renderer.group.position.x).toBeCloseTo(0.0);
      expect(renderer.group.position.y).toBeCloseTo(1.48);
      expect(renderer.group.position.z).toBeCloseTo(-1.80);
    });

    it('allows setting custom celestial gameplay anchor independently', () => {
      renderer.setAnchorPosition(0.0, 1.6, -2.8);
      expect(renderer.group.position.z).toBeCloseTo(-2.8);

      // Subsequent ballState update must NOT overwrite the anchor
      const ballState = new BallState([0.3, 0.8, -0.4], [0, 0, 0], 'seated');
      renderer.update({ ballState });

      expect(renderer.group.position.x).toBeCloseTo(0.0);
      expect(renderer.group.position.y).toBeCloseTo(1.6);
      expect(renderer.group.position.z).toBeCloseTo(-2.8);
    });

    it('initializes with celestial focal scale yielding ~1.19m diameter', () => {
      expect(renderer.getScale()).toBeCloseTo(17.0);
      expect(renderer.radius * 2 * renderer.getScale()).toBeCloseTo(1.19);
    });

    it('applies rotational spin during air mode', () => {
      const ballState = new BallState({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 'air');
      const prevRotY = renderer.coreMesh.rotation.y;
      renderer.update({ ballState, deltaTime: 0.1 });

      expect(renderer.coreMesh.rotation.y).toBeGreaterThan(prevRotY);
    });

    it('does NOT mutate the input BallState', () => {
      const originalPos = { x: 0.25, y: 0.95, z: -0.35 };
      const originalVel = { x: 0.0, y: 1.5, z: 0.0 };
      const ballState = Object.freeze(new BallState(
        Object.freeze({ ...originalPos }),
        Object.freeze({ ...originalVel }),
        'air'
      ));

      expect(() => renderer.update({ ballState, deltaTime: 0.016 })).not.toThrow();
      expect(ballState.position.x).toBe(0.25);
      expect(ballState.position.y).toBe(0.95);
      expect(ballState.position.z).toBe(-0.35);
      expect(ballState.mode).toBe('air');
    });

    it('updates shader uniforms from PlanetState', () => {
      const planetState = new PlanetState({
        kintsugiGlow: 0.75,
        atmosphereDensity: 0.40,
        oceanFill: 0.60,
        ringAlpha: 0.30,
        shieldCharge: 0.50,
        scarsCount: 2,
        goldIgnited: false
      });

      renderer.update({ planetState });

      const u = renderer.coreMaterial.uniforms;
      expect(u.uKintsugiGlow.value).toBeCloseTo(0.75);
      expect(u.uAtmosphereDensity.value).toBeCloseTo(0.40);
      expect(u.uOceanFill.value).toBeCloseTo(0.60);
      expect(u.uShieldCharge.value).toBeCloseTo(0.50);
      expect(u.uScarsCount.value).toBe(2);
      expect(u.uGoldIgnited.value).toBe(0.0);

      expect(renderer.atmosphereMesh.visible).toBe(true);
      expect(renderer.ringMesh.visible).toBe(true);
    });

    it('does NOT mutate the input PlanetState', () => {
      const planetState = Object.freeze(new PlanetState({
        kintsugiGlow: 0.9,
        atmosphereDensity: 0.5,
        oceanFill: 0.7,
        ringAlpha: 0.4,
        shieldCharge: 0.3,
        scarsCount: 1,
        goldIgnited: false
      }));

      expect(() => renderer.update({ planetState, deltaTime: 0.016 })).not.toThrow();
      expect(planetState.kintsugiGlow).toBe(0.9);
      expect(planetState.atmosphereDensity).toBe(0.5);
      expect(planetState.oceanFill).toBe(0.7);
    });

    it('supports positional argument syntax update(dt, ballState, planetState)', () => {
      const ballState = new BallState({ x: 0.5, y: 1.0, z: -0.2 });
      const planetState = new PlanetState({ kintsugiGlow: 0.88 });

      renderer.update(0.02, ballState, planetState);

      // Group position remains anchored, while shader uniform reflects planetState
      expect(renderer.group.position.x).toBeCloseTo(0.0);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBeCloseTo(0.88);
    });
  });

  // ==========================================================================
  // 3. STAGE PROGRESSION
  // ==========================================================================
  describe('Stage Progression Evolution', () => {
    it('Stage 1 (Seed): dark dormant planet without oceans or atmosphere', () => {
      renderer.setDebugStage(PLANETOID_STAGES.SEED);

      const u = renderer.coreMaterial.uniforms;
      expect(u.uKintsugiGlow.value).toBe(0.0);
      expect(u.uAtmosphereDensity.value).toBe(0.0);
      expect(u.uOceanFill.value).toBe(0.0);
      expect(u.uGoldIgnited.value).toBe(0.0);
      expect(renderer.atmosphereMesh.visible).toBe(false);
      expect(renderer.ringMesh.visible).toBe(false);
    });

    it('Stage 1 (Seed): defines primordial barren geological hierarchy with Mars-like palette', () => {
      // Mars primordial palette constants verification
      expect(PLANETOID_PALETTE.MARS_VOLCANIC_BROWN).toBe('#2C1613');
      expect(PLANETOID_PALETTE.MARS_DEEP_RUST).toBe('#4E2019');
      expect(PLANETOID_PALETTE.MARS_BURNT_SIENNA).toBe('#793322');
      expect(PLANETOID_PALETTE.MARS_TERRACOTTA_BASE).toBe('#A84E32');
      expect(PLANETOID_PALETTE.MARS_WARM_OCHRE).toBe('#C66F42');
      expect(PLANETOID_PALETTE.MARS_DUSTY_ORANGE).toBe('#D48255');
      expect(PLANETOID_PALETTE.MARS_PEACH_RIDGE).toBe('#E5A27A');

      // Backward-compatible aliases
      expect(PLANETOID_PALETTE.PRIMORDIAL_RECESS_BLACK).toBe('#2C1613');
      expect(PLANETOID_PALETTE.PRIMORDIAL_CHARCOAL_BASE).toBe('#4E2019');
      expect(PLANETOID_PALETTE.PRIMORDIAL_BARREN_TERRAIN).toBe('#A84E32');
      expect(PLANETOID_PALETTE.PRIMORDIAL_MINERAL_MAUVE).toBe('#C66F42');
      expect(PLANETOID_PALETTE.PRIMORDIAL_WEATHERED_DUST).toBe('#D48255');
      expect(PLANETOID_PALETTE.PRIMORDIAL_RIDGE_LAVENDER).toBe('#E5A27A');
      expect(PLANETOID_PALETTE.PRIMORDIAL_CREST_HIGHLIGHT).toBe('#E5A27A');
      expect(PLANETOID_PALETTE.RECESS_BLACK).toBe('#2C1613');
      expect(PLANETOID_PALETTE.DARK_INDIGO_BASE).toBe('#4E2019');

      // Shader source verification for macro terrain, craters, dormant fractures, and Mars materials
      const fragShader = renderer.coreMaterial.fragmentShader;
      expect(fragShader).toContain('planetElevationFbm');
      expect(fragShader).toContain('warp1');
      expect(fragShader).toContain('warp2');
      expect(fragShader).toContain('evaluateImpactBasinSystem');
      expect(fragShader).toContain('evaluateImpactCrater');
      expect(fragShader).toContain('evaluatePrimaryFractures');
      expect(fragShader).toContain('primaryFractureMask');
      expect(fragShader).toContain('primaryFractureGroove');
      expect(fragShader).toContain('faultShoulder');
      expect(fragShader).toContain('ridgeField');
      expect(fragShader).toContain('fineGrain');
      expect(fragShader).toContain('cVolcanicBrown');
      expect(fragShader).toContain('cDeepRust');
      expect(fragShader).toContain('cBurntSienna');
      expect(fragShader).toContain('cTerracotta');
      expect(fragShader).toContain('cWarmOchre');
      expect(fragShader).toContain('cDustyOrange');
      expect(fragShader).toContain('cMineralPeach');
      expect(fragShader).toContain('cRecessBlack');
      expect(fragShader).toContain('cavityAO');
      expect(fragShader).toContain('recessAO');
      expect(fragShader).toContain('cosmicFill');
    });

    it('Stage 1 (Seed): defines 5-6 dominant planet-scale fracture systems dormant in Stage 1', () => {
      const fragShader = renderer.coreMaterial.fragmentShader;
      expect(fragShader).toContain('evaluatePrimaryFractures');
      expect(fragShader).toContain('Fault 1: Long Diagonal Fault');
      expect(fragShader).toContain('Fault 2: Curved Continental Split');
      expect(fragShader).toContain('Fault 3: Shorter Deep Highland Fault');
      expect(fragShader).toContain('Fault 4: Long Branching Fault');
      expect(fragShader).toContain('Fault 5: Lower Hemisphere Southern Rift');
      expect(fragShader).toContain('Fault 6: Major Cross-Connection Rift');
      expect(fragShader).toContain('primaryFractureCore');
      expect(fragShader).toContain('primaryFractureGroove');
      expect(fragShader).toContain('primaryFractureTrench');

      // In Stage 1, verify dormant state without gold emission
      renderer.setDebugStage(PLANETOID_STAGES.SEED);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uGoldIgnited.value).toBe(0.0);
      expect(renderer.atmosphereMesh.visible).toBe(false);
      expect(renderer.ringMesh.visible).toBe(false);
    });

    it('Stage 1 (Seed): ensures barren lifeless state with zero biological coverage or ocean liquid', () => {
      renderer.setDebugStage(PLANETOID_STAGES.SEED);
      expect(renderer.coreMaterial.uniforms.uOceanFill.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uAtmosphereDensity.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(1.0);
      expect(renderer.atmosphereMesh.visible).toBe(false);
    });

    it('Stage 2 (Awakening): golden kintsugi veins appear with low atmosphere and Golden Mineral World material', () => {
      // Golden Mineral World palette constants verification
      expect(PLANETOID_PALETTE.STAGE2_VOLCANIC).toBe('#241713');
      expect(PLANETOID_PALETTE.STAGE2_DARK_BRONZE).toBe('#4A2D1B');
      expect(PLANETOID_PALETTE.STAGE2_BURNT_AMBER).toBe('#70451F');
      expect(PLANETOID_PALETTE.STAGE2_OCHRE).toBe('#9A6A2D');
      expect(PLANETOID_PALETTE.STAGE2_MINERAL_GOLD).toBe('#C29343');
      expect(PLANETOID_PALETTE.STAGE2_WARM_CHAMPAGNE).toBe('#D9BD78');
      expect(PLANETOID_PALETTE.STAGE2_BRIGHT_CREST).toBe('#E8D39A');

      const fragShader = renderer.coreMaterial.fragmentShader;
      expect(fragShader).toContain('stage2Crust');
      expect(fragShader).toContain('cVolcanic2');
      expect(fragShader).toContain('cDarkBronze');
      expect(fragShader).toContain('cBurntAmber');
      expect(fragShader).toContain('cMineralOchre');
      expect(fragShader).toContain('cMineralGold');
      expect(fragShader).toContain('cChampagneMin');
      expect(fragShader).toContain('cBrightCrest');
      expect(fragShader).toContain('s12Blend');

      renderer.setDebugStage(PLANETOID_STAGES.AWAKENING);

      const u = renderer.coreMaterial.uniforms;
      expect(u.uKintsugiGlow.value).toBeGreaterThanOrEqual(0.8);
      expect(u.uOceanFill.value).toBe(0.0);
      expect(renderer.ringMesh.visible).toBe(false);
    });

    it('Stage 3 (Oceans): oceans fill lower basins and define blue ocean world', () => {
      // Blue Ocean World palette constants verification
      expect(PLANETOID_PALETTE.STAGE3_OCEAN_ABYSS).toBe('#071B3D');
      expect(PLANETOID_PALETTE.STAGE3_OCEAN_DEEP).toBe('#0D3766');
      expect(PLANETOID_PALETTE.STAGE3_OCEAN_MID).toBe('#155A8A');
      expect(PLANETOID_PALETTE.STAGE3_OCEAN_TEAL).toBe('#218B91');
      expect(PLANETOID_PALETTE.STAGE3_OCEAN_SHALLOW).toBe('#55B9B0');
      expect(PLANETOID_PALETTE.STAGE3_COAST_HIGHLIGHT).toBe('#8AD9CF');

      const fragShader = renderer.coreMaterial.fragmentShader;
      expect(fragShader).toContain('stage3Land');
      expect(fragShader).toContain('stage3Ocean');
      expect(fragShader).toContain('stage3Surface');
      expect(fragShader).toContain('cOceanAbyss');
      expect(fragShader).toContain('cOceanDeepBlue');
      expect(fragShader).toContain('cOceanMidBlue');
      expect(fragShader).toContain('cCoastSand');
      expect(fragShader).toContain('cTemperateRock');
      expect(fragShader).toContain('s23Blend');

      renderer.setDebugStage(PLANETOID_STAGES.OCEANS);

      const u = renderer.coreMaterial.uniforms;
      expect(u.uOceanFill.value).toBeGreaterThan(0.7);
      expect(u.uKintsugiGlow.value).toBe(1.0);
      expect(renderer.atmosphereMesh.visible).toBe(true);
    });

    it('Stage 4 (Life & Atmosphere): rich atmosphere, living green biomes, and preserved oceans', () => {
      // Living Green World palette constants verification
      expect(PLANETOID_PALETTE.STAGE4_DEEP_VEGETATION).toBe('#123A24');
      expect(PLANETOID_PALETTE.STAGE4_FOREST).toBe('#1F5A32');
      expect(PLANETOID_PALETTE.STAGE4_GREEN).toBe('#348A45');
      expect(PLANETOID_PALETTE.STAGE4_EMERALD).toBe('#45A95A');
      expect(PLANETOID_PALETTE.STAGE4_MOSS).toBe('#718F45');
      expect(PLANETOID_PALETTE.STAGE4_FRESH_VEGETATION).toBe('#8FBE62');

      const fragShader = renderer.coreMaterial.fragmentShader;
      expect(fragShader).toContain('stage4Land');
      expect(fragShader).toContain('stage4Surface');
      expect(fragShader).toContain('cDeepVeg');
      expect(fragShader).toContain('cForest');
      expect(fragShader).toContain('cGreen');
      expect(fragShader).toContain('cEmerald');
      expect(fragShader).toContain('cMoss');
      expect(fragShader).toContain('cFreshVeg');
      expect(fragShader).toContain('s34Blend');

      renderer.setDebugStage(PLANETOID_STAGES.LIFE_ATMOSPHERE);

      const u = renderer.coreMaterial.uniforms;
      expect(u.uAtmosphereDensity.value).toBeGreaterThanOrEqual(0.9);
      expect(u.uOceanFill.value).toBeGreaterThanOrEqual(0.9);
      expect(renderer.atmosphereMesh.visible).toBe(true);
    });

    it('multi-stage atmosphere evolving subtly with planetary progression', () => {
      const atmoShader = renderer.atmosphereMaterial.fragmentShader;
      expect(atmoShader).toContain('cAtmoAmber2');
      expect(atmoShader).toContain('cAtmoOcean3');
      expect(atmoShader).toContain('cAtmoGreen4');
      expect(atmoShader).toContain('cStage5Atmo');

      const coreShader = renderer.coreMaterial.fragmentShader;
      expect(coreShader).toContain('cWarmMineralRim');
      expect(coreShader).toContain('cAtmoAmber2');
      expect(coreShader).toContain('cAtmoBlue3');
      expect(coreShader).toContain('cAtmoGreen4');
    });

    it('Stage 5 (Celestial Alignment): golden ignition, shield, and rings with Golden Celestial World hierarchy', () => {
      // Golden Celestial World palette verification
      expect(PLANETOID_PALETTE.GOLD_ANTIQUE_RECESS).toBe('#6F4A20');
      expect(PLANETOID_PALETTE.GOLD_BRONZE_LOW).toBe('#A97B35');
      expect(PLANETOID_PALETTE.GOLD_MAIN_CELESTIAL).toBe('#D6B56A');
      expect(PLANETOID_PALETTE.GOLD_BRIGHT_RIDGE).toBe('#E8C982');
      expect(PLANETOID_PALETTE.GOLD_PEAK_ENERGY).toBe('#FFFDF2');

      renderer.setDebugStage(PLANETOID_STAGES.CELESTIAL_ALIGNMENT);

      const u = renderer.coreMaterial.uniforms;
      expect(u.uGoldIgnited.value).toBe(1.0);
      expect(u.uShieldCharge.value).toBe(1.0);
      expect(renderer.ringMesh.visible).toBe(true);
      expect(renderer.atmosphereMesh.visible).toBe(true);
      expect(renderer.ringMaterial.uniforms.uRingAlpha.value).toBeCloseTo(0.95);
    });
  });

  // ==========================================================================
  // 4. DEVELOPMENT DEBUG CONTROLS
  // ==========================================================================
  describe('Debug Mode', () => {
    it('sets debug stages by number 1..5', () => {
      expect(renderer.setDebugStage(1)).toBe(true);
      expect(renderer.getDebugStage()).toBe(PLANETOID_STAGES.SEED);

      expect(renderer.setDebugStage(5)).toBe(true);
      expect(renderer.getDebugStage()).toBe(PLANETOID_STAGES.CELESTIAL_ALIGNMENT);
    });

    it('sets debug stages by string names', () => {
      expect(renderer.setDebugStage('awakening')).toBe(true);
      expect(renderer.getDebugStage()).toBe(PLANETOID_STAGES.AWAKENING);

      expect(renderer.setDebugStage('oceans')).toBe(true);
      expect(renderer.getDebugStage()).toBe(PLANETOID_STAGES.OCEANS);
    });

    it('rejects invalid stage keys gracefully', () => {
      expect(renderer.setDebugStage('invalid_stage_xyz')).toBe(false);
      expect(renderer.setDebugStage(99)).toBe(false);
    });

    it('clears debug stage override and restores live PlanetState control', () => {
      renderer.setDebugStage(PLANETOID_STAGES.CELESTIAL_ALIGNMENT);
      expect(renderer.isDebugMode()).toBe(true);

      renderer.clearDebugStage();
      expect(renderer.isDebugMode()).toBe(false);
      expect(renderer.getDebugStage()).toBeNull();

      // Normal state update should now take effect
      const liveState = new PlanetState({ kintsugiGlow: 0.12 });
      renderer.update({ planetState: liveState });
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBeCloseTo(0.12);
    });

    it('debug override does NOT mutate live PlanetState', () => {
      renderer.setDebugStage(PLANETOID_STAGES.CELESTIAL_ALIGNMENT);

      const liveState = Object.freeze(new PlanetState({ kintsugiGlow: 0.2 }));
      renderer.update({ planetState: liveState });

      expect(liveState.kintsugiGlow).toBe(0.2);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBe(1.0); // from debug preset
    });
  });

  // ==========================================================================
  // 5. PHASE 3 — LAYER 1: SMOOTH VISUAL STAGE INTERPOLATION
  // ==========================================================================
  describe('Phase 3 — Layer 1: Smooth Visual Stage Interpolation', () => {
    it('initializes with visualStage === targetStage === 1.0 in valid range [1.0, 5.0]', () => {
      expect(renderer.getTargetStage()).toBe(1.0);
      expect(renderer.getVisualStage()).toBe(1.0);
      expect(renderer.targetStage).toBe(1.0);
      expect(renderer.visualStage).toBe(1.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(1.0);
    });

    it('smooth transition: transitionToStage(2) interpolates visualStage (1.0 < visualStage < 2.0) before settling', () => {
      renderer.setStage(1);
      expect(renderer.getTargetStage()).toBe(1.0);
      expect(renderer.getVisualStage()).toBe(1.0);

      const initiated = renderer.transitionToStage(2);
      expect(initiated).toBe(true);
      expect(renderer.getTargetStage()).toBe(2.0);
      expect(renderer.getVisualStage()).toBe(1.0); // Not immediately changed!

      // Advance a few simulated frames (e.g. 3 frames of 16ms = 48ms)
      for (let i = 0; i < 3; i++) {
        renderer.update(0.016);
      }

      // Must be strictly interpolating between 1.0 and 2.0
      expect(renderer.getVisualStage()).toBeGreaterThan(1.0);
      expect(renderer.getVisualStage()).toBeLessThan(2.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(renderer.getVisualStage());
    });

    it('completion: settles cleanly to targetStage after sufficient simulated time', () => {
      renderer.setStage(1);
      renderer.transitionToStage(2);

      // Simulate 2.0 seconds of updates at 60fps (120 frames of 0.016s)
      for (let i = 0; i < 120; i++) {
        renderer.update(0.016);
      }

      expect(renderer.getVisualStage()).toBe(2.0);
      expect(renderer.getTargetStage()).toBe(2.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(2.0);
      // When settled on integer stage, debugStage updates to matching preset
      expect(renderer.getStage()).toBe(PLANETOID_STAGES.AWAKENING);
    });

    it('reverse transition: smoothly decreases from Stage 5 to Stage 3', () => {
      renderer.setStage(5);
      expect(renderer.getTargetStage()).toBe(5.0);
      expect(renderer.getVisualStage()).toBe(5.0);

      renderer.transitionToStage(3);
      expect(renderer.getTargetStage()).toBe(3.0);
      expect(renderer.getVisualStage()).toBe(5.0);

      // Advance several frames
      for (let i = 0; i < 6; i++) {
        renderer.update(0.016);
      }

      // Value must have smoothly decreased
      expect(renderer.getVisualStage()).toBeLessThan(5.0);
      expect(renderer.getVisualStage()).toBeGreaterThan(3.0);

      // Settle
      for (let i = 0; i < 120; i++) {
        renderer.update(0.016);
      }
      expect(renderer.getVisualStage()).toBe(3.0);
    });

    it('skipped transition: 1 -> 4 traverses range smoothly without intermediate stops', () => {
      renderer.setStage(1);
      renderer.transitionToStage(4);
      expect(renderer.getTargetStage()).toBe(4.0);

      const capturedValues = [];
      for (let i = 0; i < 100; i++) {
        renderer.update(0.016);
        capturedValues.push(renderer.getVisualStage());
      }

      // Check monotonicity
      for (let i = 1; i < capturedValues.length; i++) {
        expect(capturedValues[i]).toBeGreaterThanOrEqual(capturedValues[i - 1]);
      }

      // Must have traversed through stages 2 and 3 continuously
      const passedStage2 = capturedValues.some((v) => v > 1.8 && v < 2.5);
      const passedStage3 = capturedValues.some((v) => v > 2.8 && v < 3.5);
      expect(passedStage2).toBe(true);
      expect(passedStage3).toBe(true);

      // Settles cleanly at 4.0
      for (let i = 0; i < 50; i++) {
        renderer.update(0.016);
      }
      expect(renderer.getVisualStage()).toBe(4.0);
    });

    it('setStage(4) immediately sets both targetStage === 4 and visualStage === 4', () => {
      renderer.setStage(1);
      expect(renderer.getVisualStage()).toBe(1.0);

      renderer.setStage(4);
      expect(renderer.getTargetStage()).toBe(4.0);
      expect(renderer.getVisualStage()).toBe(4.0);
      expect(renderer.getStage()).toBe(PLANETOID_STAGES.LIFE_ATMOSPHERE);
    });

    it('transitionToStage(4) sets targetStage === 4 without immediately forcing visualStage === 4', () => {
      renderer.setStage(1);
      expect(renderer.getVisualStage()).toBe(1.0);

      const ok = renderer.transitionToStage(4);
      expect(ok).toBe(true);
      expect(renderer.getTargetStage()).toBe(4.0);
      expect(renderer.getVisualStage()).toBe(1.0); // Still 1.0 until updated
    });

    it('safely rejects invalid transition stages according to existing conventions', () => {
      expect(renderer.transitionToStage('invalid_stage_xyz')).toBe(false);
      expect(renderer.transitionToStage(99)).toBe(false);
      expect(renderer.transitionToStage(0)).toBe(false);
      expect(renderer.transitionToStage(-2)).toBe(false);

      // targetStage must remain at valid stage
      expect(renderer.getTargetStage()).toBeGreaterThanOrEqual(1.0);
      expect(renderer.getTargetStage()).toBeLessThanOrEqual(5.0);
    });

    it('supports string stage names in transitionToStage ("seed", "awakening", "oceans", etc.)', () => {
      renderer.setStage(1);
      expect(renderer.transitionToStage('oceans')).toBe(true);
      expect(renderer.getTargetStage()).toBe(3.0);

      expect(renderer.transitionToStage('celestial_alignment')).toBe(true);
      expect(renderer.getTargetStage()).toBe(5.0);

      expect(renderer.transitionToStage('awakening')).toBe(true);
      expect(renderer.getTargetStage()).toBe(2.0);
    });

    it('exposes transition methods on global debug hooks', () => {
      const dbg = globalThis.__CELESTIAL_PLANETOID_DEBUG__;
      expect(dbg).toBeDefined();
      expect(typeof dbg.transitionToStage).toBe('function');
      expect(typeof dbg.getTargetStage).toBe('function');
      expect(typeof dbg.getVisualStage).toBe('function');
      expect(typeof dbg.setVisualStage).toBe('function');

      dbg.setStage(1);
      expect(dbg.getVisualStage()).toBe(1.0);

      dbg.transitionToStage(3);
      expect(dbg.getTargetStage()).toBe(3.0);
      expect(dbg.getVisualStage()).toBe(1.0);
    });

    it('setVisualStage() sets fractional visual stage directly and updates all material uniforms', () => {
      renderer.setStage(1);
      expect(renderer.getVisualStage()).toBe(1.0);

      renderer.setVisualStage(1.5);
      expect(renderer.getVisualStage()).toBe(1.5);
      expect(renderer.getTargetStage()).toBe(1.5);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(1.5);
      expect(renderer.coreMaterial.uniforms.uAwakeningProgress.value).toBeCloseTo(0.5);
      expect(renderer.atmosphereMaterial.uniforms.uVisualStage.value).toBe(1.5);
      expect(renderer.ringMaterial.uniforms.uVisualStage.value).toBe(1.5);

      renderer.setVisualStage(3.7);
      expect(renderer.getVisualStage()).toBe(3.7);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(3.7);
      expect(renderer.atmosphereMesh.visible).toBe(true);

      // Clamps outside [1.0, 5.0]
      renderer.setVisualStage(0.5);
      expect(renderer.getVisualStage()).toBe(1.0);

      renderer.setVisualStage(6.0);
      expect(renderer.getVisualStage()).toBe(5.0);
    });

    it('manages cinematic transformation lifecycle: start, update, finish, and cancel', () => {
      renderer.setStage(1);
      expect(renderer.getIsTransformationActive()).toBe(false);
      expect(renderer.getTransformationProgress()).toBe(0.0);

      renderer.startTransformation({ targetStage: 2.0 });
      expect(renderer.getIsTransformationActive()).toBe(true);
      expect(renderer.coreMaterial.uniforms.uTransformationProgress.value).toBe(0.0);

      renderer.updateTransformation(0.55, 'climax', { visualStage: 1.8, awakeningProgress: 0.9 });
      expect(renderer.getTransformationProgress()).toBe(0.55);
      expect(renderer.coreMaterial.uniforms.uTransformationProgress.value).toBe(0.55);
      expect(renderer.getVisualStage()).toBe(1.8);
      expect(renderer.getAwakeningProgress()).toBe(0.9);

      renderer.finishTransformation(2.0);
      expect(renderer.getIsTransformationActive()).toBe(false);
      expect(renderer.getTransformationProgress()).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uTransformationProgress.value).toBe(0.0);
      expect(renderer.getVisualStage()).toBe(2.0);

      // Cancel behavior
      renderer.startTransformation();
      expect(renderer.getIsTransformationActive()).toBe(true);
      renderer.cancelTransformation();
      expect(renderer.getIsTransformationActive()).toBe(false);
      expect(renderer.coreMaterial.uniforms.uTransformationProgress.value).toBe(0.0);
    });
  });

  // ==========================================================================
  // 6. PHASE 3 — LAYER 2: CONTINUOUS FEATURE BLENDING
  // ==========================================================================
  describe('Phase 3 — Layer 2: Continuous Feature Blending', () => {
    it('synchronizes uVisualStage across core, atmosphere, and ring materials', () => {
      renderer.setStage(1);
      renderer.update(0.016);

      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(1.0);
      expect(renderer.atmosphereMaterial.uniforms.uVisualStage.value).toBe(1.0);
      expect(renderer.ringMaterial.uniforms.uVisualStage.value).toBe(1.0);

      renderer.setStage(3);
      renderer.update(0.016);

      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(3.0);
      expect(renderer.atmosphereMaterial.uniforms.uVisualStage.value).toBe(3.0);
      expect(renderer.ringMaterial.uniforms.uVisualStage.value).toBe(3.0);
    });

    it('preserves exact authoritative appearance at integer stages 1.0 through 5.0', () => {
      // Stage 1: Dormant Seed
      renderer.setStage(1);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uOceanFill.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uAtmosphereDensity.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uGoldIgnited.value).toBe(0.0);
      expect(renderer.atmosphereMesh.visible).toBe(false);
      expect(renderer.ringMesh.visible).toBe(false);

      // Stage 2: Awakening
      renderer.setStage(2);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBeCloseTo(0.85);
      expect(renderer.coreMaterial.uniforms.uOceanFill.value).toBe(0.0);
      expect(renderer.ringMesh.visible).toBe(false);

      // Stage 3: Oceans
      renderer.setStage(3);
      expect(renderer.coreMaterial.uniforms.uOceanFill.value).toBeCloseTo(0.85);
      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBeCloseTo(1.0);
      expect(renderer.ringMesh.visible).toBe(false);

      // Stage 4: Life & Atmosphere
      renderer.setStage(4);
      expect(renderer.coreMaterial.uniforms.uAtmosphereDensity.value).toBeCloseTo(0.90);
      expect(renderer.coreMaterial.uniforms.uOceanFill.value).toBeCloseTo(0.95);
      expect(renderer.atmosphereMesh.visible).toBe(true);

      // Stage 5: Celestial Alignment
      renderer.setStage(5);
      expect(renderer.coreMaterial.uniforms.uGoldIgnited.value).toBe(1.0);
      expect(renderer.ringMaterial.uniforms.uRingAlpha.value).toBeCloseTo(0.95);
      expect(renderer.ringMesh.visible).toBe(true);
      expect(renderer.atmosphereMesh.visible).toBe(true);
    });

    it('interpolates debug preset values smoothly at fractional visual stages', () => {
      // 1.5: Midpoint of Seed -> Awakening
      const p15 = renderer.getInterpolatedDebugPreset(1.5);
      expect(p15.kintsugiGlow).toBeCloseTo(0.425, 3);
      expect(p15.oceanFill).toBe(0.0);
      expect(p15.ringAlpha).toBe(0.0);
      expect(p15.goldIgnited).toBe(false);

      // 2.5: Midpoint of Awakening -> Oceans
      const p25 = renderer.getInterpolatedDebugPreset(2.5);
      expect(p25.oceanFill).toBeCloseTo(0.425, 3);
      expect(p25.kintsugiGlow).toBeCloseTo(0.925, 3);
      expect(p25.ringAlpha).toBe(0.0);

      // 3.5: Midpoint of Oceans -> Life & Atmosphere
      const p35 = renderer.getInterpolatedDebugPreset(3.5);
      expect(p35.atmosphereDensity).toBeCloseTo(0.725, 3);
      expect(p35.oceanFill).toBeCloseTo(0.90, 2);

      // 4.5: Midpoint of Life & Atmosphere -> Celestial Alignment
      const p45 = renderer.getInterpolatedDebugPreset(4.5);
      expect(p45.ringAlpha).toBeCloseTo(0.575, 3);
      expect(p45.shieldCharge).toBeCloseTo(0.80, 2);
      expect(p45.goldIgnited).toBe(true);
    });

    it('clamps getInterpolatedDebugPreset for out-of-range stages', () => {
      const pLow = renderer.getInterpolatedDebugPreset(0.5);
      expect(pLow.kintsugiGlow).toBe(0.0);

      const pHigh = renderer.getInterpolatedDebugPreset(6.2);
      expect(pHigh.ringAlpha).toBeCloseTo(0.95);
    });

    it('gradually introduces atmosphere shell visibility as visualStage crosses 3.60', () => {
      renderer.setStage(3);
      renderer.update(0.016);
      expect(renderer.visualStage).toBe(3.0);

      // Transition to Stage 4
      renderer.transitionToStage(4);

      // Run until visualStage reaches ~3.4
      while (renderer.getVisualStage() < 3.4) {
        renderer.update(0.016);
      }
      expect(renderer.atmosphereMesh.visible).toBe(true); // Atmosphere density > 0.01 in preset

      // At Stage 1, atmosphere is definitely not visible
      renderer.setStage(1);
      renderer.update(0.016);
      expect(renderer.atmosphereMesh.visible).toBe(false);
    });

    it('gradually introduces planetary rings visibility only in transition 4 -> 5', () => {
      renderer.setStage(4);
      renderer.update(0.016);

      // In pure Stage 4, ringAlpha from preset is 0.20, but ring visibility during smooth transition requires >= 4.45 or ringAlpha > 0.01
      // When at Stage 1..3, ring must remain invisible
      renderer.setStage(1);
      renderer.update(0.016);
      expect(renderer.ringMesh.visible).toBe(false);

      renderer.setStage(2);
      renderer.update(0.016);
      expect(renderer.ringMesh.visible).toBe(false);

      renderer.setStage(3);
      renderer.update(0.016);
      expect(renderer.ringMesh.visible).toBe(false);

      // Transition to Stage 5
      renderer.setStage(4);
      renderer.transitionToStage(5);

      // Before 4.45, ringMesh is not visible if ringAlpha is small
      renderer.setStage(1);
      renderer.transitionToStage(2);
      while (renderer.getVisualStage() < 1.9) {
        renderer.update(0.016);
        expect(renderer.ringMesh.visible).toBe(false);
      }

      // At Stage 5, ringMesh is definitely visible
      renderer.setStage(5);
      renderer.update(0.016);
      expect(renderer.ringMesh.visible).toBe(true);
    });

    it('smoothly evolves uniforms during transition 1 -> 2 without abrupt popping', () => {
      renderer.setStage(1);
      renderer.transitionToStage(2);

      const glowSamples = [];
      for (let i = 0; i < 30; i++) {
        renderer.update(0.016);
        glowSamples.push(renderer.coreMaterial.uniforms.uKintsugiGlow.value);
      }

      // Must be strictly monotonically non-decreasing
      for (let i = 1; i < glowSamples.length; i++) {
        expect(glowSamples[i]).toBeGreaterThanOrEqual(glowSamples[i - 1]);
      }

      // First sample must be between 0 and 0.85
      expect(glowSamples[0]).toBeGreaterThan(0.0);
      expect(glowSamples[glowSamples.length - 1]).toBeLessThanOrEqual(0.85);
    });

    it('smoothly evolves ocean fill during transition 2 -> 3', () => {
      renderer.setStage(2);
      renderer.transitionToStage(3);

      const oceanSamples = [];
      for (let i = 0; i < 30; i++) {
        renderer.update(0.016);
        oceanSamples.push(renderer.coreMaterial.uniforms.uOceanFill.value);
      }

      for (let i = 1; i < oceanSamples.length; i++) {
        expect(oceanSamples[i]).toBeGreaterThanOrEqual(oceanSamples[i - 1]);
      }

      expect(oceanSamples[0]).toBeGreaterThan(0.0);
      expect(oceanSamples[oceanSamples.length - 1]).toBeLessThanOrEqual(0.85);
    });
  });

  // ==========================================================================
  // 7. PHASE 3 — LAYER 3: DRAMATIC TRANSITION & CELESTIAL FINALE POLISH
  // ==========================================================================
  describe('Phase 3 — Layer 3: Dramatic Transition & Celestial Finale Polish', () => {
    it('propagates uTime to core, atmosphere, and ring materials for harmonic pulses and crystalline sparkles', () => {
      renderer.setStage(5);
      renderer.update({ deltaTime: 0.016, elapsedTime: 4.25 });

      expect(renderer.coreMaterial.uniforms.uTime.value).toBeCloseTo(4.25);
      expect(renderer.atmosphereMaterial.uniforms.uTime.value).toBeCloseTo(4.25);
      expect(renderer.ringMaterial.uniforms.uTime.value).toBeCloseTo(4.25);
    });

    it('maintains strict Quest vertex budget with enhanced 64-segment planetary rings', () => {
      const coreVerts = renderer.coreGeometry.attributes.position.count;
      const atmoVerts = renderer.atmosphereGeometry.attributes.position.count;
      const ringVerts = renderer.ringGeometry.attributes.position.count;
      const totalVerts = coreVerts + atmoVerts + ringVerts;

      expect(ringVerts).toBe(130); // (64 + 1) * 2 vertices
      expect(totalVerts).toBeLessThan(2000);
      expect(totalVerts).toBeGreaterThan(1200);
    });

    it('keeps Stage 1 Seed dormant without premature Kintsugi emergence below 1.15', () => {
      renderer.setStage(1);
      renderer.update(0.016);

      expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBe(0.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(1.0);
      expect(renderer.atmosphereMesh.visible).toBe(false);
      expect(renderer.ringMesh.visible).toBe(false);

      // Interpolated preset at 1.10 remains dormant
      const p11 = renderer.getInterpolatedDebugPreset(1.10);
      expect(p11.kintsugiGlow).toBeCloseTo(0.085, 3);
      expect(p11.oceanFill).toBe(0.0);
      expect(p11.ringAlpha).toBe(0.0);
    });

    it('fully equips Stage 5 Celestial Alignment with luminous atmosphere and crystalline rings', () => {
      renderer.setStage(5);
      renderer.update(0.016);

      expect(renderer.getVisualStage()).toBe(5.0);
      expect(renderer.coreMaterial.uniforms.uVisualStage.value).toBe(5.0);
      expect(renderer.atmosphereMaterial.uniforms.uVisualStage.value).toBe(5.0);
      expect(renderer.ringMaterial.uniforms.uVisualStage.value).toBe(5.0);

      expect(renderer.coreMaterial.uniforms.uGoldIgnited.value).toBe(1.0);
      expect(renderer.ringMaterial.uniforms.uRingAlpha.value).toBeCloseTo(0.95);
      expect(renderer.coreMaterial.uniforms.uAtmosphereDensity.value).toBeCloseTo(1.0);
      expect(renderer.atmosphereMesh.visible).toBe(true);
      expect(renderer.ringMesh.visible).toBe(true);
    });

    it('smoothly evolves planetary ringAlpha and shieldCharge during transition 4 -> 5', () => {
      renderer.setStage(4);
      renderer.transitionToStage(5);

      const ringSamples = [];
      const shieldSamples = [];
      for (let i = 0; i < 30; i++) {
        renderer.update(0.016);
        ringSamples.push(renderer.ringMaterial.uniforms.uRingAlpha.value);
        shieldSamples.push(renderer.coreMaterial.uniforms.uShieldCharge.value);
      }

      // Non-decreasing progression toward 0.95 / 1.0
      for (let i = 1; i < ringSamples.length; i++) {
        expect(ringSamples[i]).toBeGreaterThanOrEqual(ringSamples[i - 1]);
        expect(shieldSamples[i]).toBeGreaterThanOrEqual(shieldSamples[i - 1]);
      }

      expect(ringSamples[0]).toBeGreaterThanOrEqual(0.20);
      expect(ringSamples[ringSamples.length - 1]).toBeLessThanOrEqual(0.95);
      expect(shieldSamples[0]).toBeGreaterThanOrEqual(0.60);
      expect(shieldSamples[shieldSamples.length - 1]).toBeLessThanOrEqual(1.0);
    });

    it('implements Phase 3 Layer 4 Golden Celestial World and dramatic stage transitions in shaders', () => {
      const coreFrag = renderer.coreMaterial.fragmentShader;
      const atmoFrag = renderer.atmosphereMaterial.fragmentShader;
      const ringFrag = renderer.ringMaterial.fragmentShader;

      // Golden Celestial World hierarchy & features
      expect(coreFrag).toContain('cGoldAntiqueValleys');
      expect(coreFrag).toContain('cGoldBronzeLow');
      expect(coreFrag).toContain('cGoldMainCelestial');
      expect(coreFrag).toContain('cGoldBrightRidge');
      expect(coreFrag).toContain('cGoldRadiantCrest');
      expect(coreFrag).toContain('cMoltenOceanDeep');
      expect(coreFrag).toContain('goldSpreadMask');
      expect(coreFrag).toContain('internalWarmth');

      // Stage 1 -> 2 Awakening sub-events
      expect(coreFrag).toContain('firstIgnition');
      expect(coreFrag).toContain('surgeWave');
      expect(coreFrag).toContain('energyPeak12');

      // Stage 2 -> 3 Ocean filling sub-events
      expect(coreFrag).toContain('shoreFillActive');
      expect(coreFrag).toContain('capillaryRipple');
      expect(coreFrag).toContain('shoreEdge');

      // Stage 3 -> 4 Life colonization sub-events
      expect(coreFrag).toContain('coastalProximity');
      expect(coreFrag).toContain('coastalBias');
      expect(coreFrag).toContain('bioCoverage');

      // Stage 5 Celestial pulse crest synchronized across core, atmosphere, and rings
      expect(coreFrag).toContain('celestialPulse');
      expect(atmoFrag).toContain('celestialPulse');
      expect(ringFrag).toContain('celestialPulse');
    });
  });

  // ==========================================================================
  // 8. PLANET SHOWCASE MODE (VISUAL DEVELOPMENT ARCHITECTURE)
  // ==========================================================================
  describe('Planet Showcase Mode (Visual Development Architecture)', () => {
    it('defines canonical showcase scale factor and showcase anchor constants', () => {
      expect(PLANETOID_SHOWCASE_SCALE).toBe(30.0);
      expect(PLANETOID_SHOWCASE_ANCHOR.x).toBe(0.0);
      expect(PLANETOID_SHOWCASE_ANCHOR.y).toBe(1.25);
      expect(PLANETOID_SHOWCASE_ANCHOR.z).toBe(-1.80);
      expect(PLANETOID_DEFAULT_SCALE).toBe(17.0);
      expect(PLANETOID_DEFAULT_ANCHOR.x).toBe(0.0);
      expect(PLANETOID_DEFAULT_ANCHOR.y).toBe(1.48);
      expect(PLANETOID_DEFAULT_ANCHOR.z).toBe(-1.80);
    });

    it('initializes in standard gameplay mode with scale 17.0 and canonical gameplay anchor', () => {
      expect(renderer.isShowcaseMode()).toBe(false);
      expect(renderer.getScale()).toBeCloseTo(17.0);
      expect(renderer.getGameplayScale()).toBeCloseTo(17.0);
      expect(renderer.getAnchorPosition().x).toBeCloseTo(0.0);
      expect(renderer.getAnchorPosition().y).toBeCloseTo(1.48);
      expect(renderer.getAnchorPosition().z).toBeCloseTo(-1.80);
      expect(renderer.group.scale.x).toBeCloseTo(17.0);
    });

    it('switches to showcase mode with scale 30.0 (~58% viewport height) and centered anchor', () => {
      renderer.setShowcaseMode(true);

      expect(renderer.isShowcaseMode()).toBe(true);
      expect(renderer.getScale()).toBeCloseTo(30.0);
      expect(renderer.getShowcaseScale()).toBeCloseTo(30.0);
      expect(renderer.group.scale.x).toBeCloseTo(30.0);
      expect(renderer.group.scale.y).toBeCloseTo(30.0);
      expect(renderer.group.scale.z).toBeCloseTo(30.0);

      // Apparent diameter with 30.0 scale: 0.07m * 30.0 = 2.10m
      expect(renderer.radius * 2 * renderer.getScale()).toBeCloseTo(2.10);

      expect(renderer.getAnchorPosition().x).toBeCloseTo(0.0);
      expect(renderer.getAnchorPosition().y).toBeCloseTo(1.25);
      expect(renderer.getAnchorPosition().z).toBeCloseTo(-1.80);
      expect(renderer.group.position.x).toBeCloseTo(0.0);
      expect(renderer.group.position.y).toBeCloseTo(1.25);
      expect(renderer.group.position.z).toBeCloseTo(-1.80);
    });

    it('restores exact gameplay scale and anchor when exiting showcase mode without permanent mutation', () => {
      // Customize gameplay transform first
      renderer.setScale(18.5);
      renderer.setAnchorPosition(0.0, 1.52, -1.85);

      // Enter showcase mode
      renderer.setShowcaseMode(true);
      expect(renderer.getScale()).toBeCloseTo(30.0);
      expect(renderer.getAnchorPosition().y).toBeCloseTo(1.25);

      // Exit showcase mode back to gameplay
      renderer.setShowcaseMode(false);
      expect(renderer.isShowcaseMode()).toBe(false);
      expect(renderer.getScale()).toBeCloseTo(18.5);
      expect(renderer.getAnchorPosition().y).toBeCloseTo(1.52);
      expect(renderer.getAnchorPosition().z).toBeCloseTo(-1.85);
      expect(renderer.group.scale.x).toBeCloseTo(18.5);
      expect(renderer.group.position.y).toBeCloseTo(1.52);
    });

    it('locks group position to showcase anchor during updateBallState when in showcase mode', () => {
      renderer.setShowcaseMode(true);
      const ballState = new BallState({ x: 0.5, y: 1.1, z: 0.2 }, { x: 0, y: 0, z: 0 }, 'air');
      renderer.update({ ballState, deltaTime: 0.016 });

      expect(renderer.group.position.x).toBeCloseTo(0.0);
      expect(renderer.group.position.y).toBeCloseTo(1.25);
      expect(renderer.group.position.z).toBeCloseTo(-1.80);
      expect(renderer.group.scale.x).toBeCloseTo(30.0);
    });

    it('allows updating showcase anchor and showcase scale independently', () => {
      renderer.setShowcaseMode(true);
      renderer.setShowcaseScale(38.0);
      renderer.setShowcaseAnchor(0.0, 1.20, -2.50);

      expect(renderer.getScale()).toBeCloseTo(38.0);
      expect(renderer.getAnchorPosition().y).toBeCloseTo(1.20);
      expect(renderer.getAnchorPosition().z).toBeCloseTo(-2.50);

      // Gameplay values remain unaffected
      expect(renderer.getGameplayScale()).toBeCloseTo(17.0);
      expect(renderer.getGameplayAnchor().z).toBeCloseTo(-1.80);
    });
  });

  // ==========================================================================
  // 8. STAGE 1 -> STAGE 2: CINEMATIC GOLDEN AWAKENING
  // ==========================================================================
  describe('Stage 1 -> Stage 2: Cinematic Golden Awakening', () => {
    it('initializes uAwakeningProgress uniform to 0.0 in dormant Stage 1', () => {
      renderer.setStage(1);
      expect(renderer.coreMaterial.uniforms.uAwakeningProgress).toBeDefined();
      expect(renderer.coreMaterial.uniforms.uAwakeningProgress.value).toBe(0.0);
      expect(renderer.getAwakeningProgress()).toBe(0.0);
      expect(renderer.getAwakeningPhase()).toBe('dormant');
    });

    it('playAwakening() starts sequence, advances progress, and updates visualStage toward 2.0', () => {
      renderer.setStage(1);
      renderer.playAwakening(1.0); // 1.0 second duration for test

      expect(renderer.isAwakeningPlaying).toBe(true);
      expect(renderer.getTargetStage()).toBe(2.0);
      expect(renderer.getVisualStage()).toBe(1.0);
      expect(renderer.getAwakeningProgress()).toBe(0.0);

      // Advance ~0.5s (31 frames * 0.016s = 0.496s)
      for (let i = 0; i < 31; i++) {
        renderer.update(0.016);
      }

      expect(renderer.getAwakeningProgress()).toBeGreaterThanOrEqual(0.45);
      expect(renderer.getAwakeningProgress()).toBeLessThanOrEqual(0.55);
      expect(renderer.getVisualStage()).toBeGreaterThanOrEqual(1.45);
      expect(renderer.getVisualStage()).toBeLessThanOrEqual(1.55);
      expect(renderer.coreMaterial.uniforms.uAwakeningProgress.value).toBeCloseTo(renderer.getAwakeningProgress(), 2);

      // Advance remaining time to complete (total 1.0s)
      for (let i = 0; i < 35; i++) {
        renderer.update(0.016);
      }

      expect(renderer.isAwakeningPlaying).toBe(false);
      expect(renderer.getAwakeningProgress()).toBe(1.0);
      expect(renderer.getTargetStage()).toBe(2.0);
      expect(renderer.getVisualStage()).toBe(2.0);
      expect(renderer.getAwakeningPhase()).toBe('settled');
    });

    it('resetAwakening() returns renderer to dormant Stage 1 state immediately', () => {
      renderer.playAwakening(1.0);
      renderer.update(0.5); // mid-way
      expect(renderer.getAwakeningProgress()).toBeGreaterThan(0.4);

      renderer.resetAwakening();

      expect(renderer.isAwakeningPlaying).toBe(false);
      expect(renderer.getAwakeningProgress()).toBe(0.0);
      expect(renderer.getTargetStage()).toBe(1.0);
      expect(renderer.getVisualStage()).toBe(1.0);
      expect(renderer.getAwakeningPhase()).toBe('dormant');
      expect(renderer.coreMaterial.uniforms.uAwakeningProgress.value).toBe(0.0);
    });

    it('getAwakeningPhase() returns accurate choreography phases across progress timeline', () => {
      renderer.awakeningProgress = 0.0;
      expect(renderer.getAwakeningPhase()).toBe('dormant');

      renderer.awakeningProgress = 0.08;
      expect(renderer.getAwakeningPhase()).toBe('first_awakening');

      renderer.awakeningProgress = 0.28;
      expect(renderer.getAwakeningPhase()).toBe('golden_propagation');

      renderer.awakeningProgress = 0.52;
      expect(renderer.getAwakeningPhase()).toBe('secondary_ignition');

      renderer.awakeningProgress = 0.74;
      expect(renderer.getAwakeningPhase()).toBe('chain_reaction');

      renderer.awakeningProgress = 0.90;
      expect(renderer.getAwakeningPhase()).toBe('energy_peak');

      renderer.awakeningProgress = 1.0;
      expect(renderer.getAwakeningPhase()).toBe('settled');
    });

    it('transitionToStage(2) from Stage 1 initiates the cinematic awakening sequence', () => {
      renderer.setStage(1);
      expect(renderer.getVisualStage()).toBe(1.0);

      const success = renderer.transitionToStage(2);
      expect(success).toBe(true);
      expect(renderer.isAwakeningPlaying).toBe(true);
      expect(renderer.getTargetStage()).toBe(2.0);
      expect(renderer.getVisualStage()).toBe(1.0);

      // Advance frames
      renderer.update(0.1);
      expect(renderer.getAwakeningProgress()).toBeGreaterThan(0.0);
    });

    it('shader source includes all required awakening fault system and color definitions', () => {
      const fragmentShader = renderer.coreMaterial.fragmentShader;
      expect(fragmentShader).toContain('uniform float uAwakeningProgress;');
      expect(fragmentShader).toContain('struct PrimaryFaultSystem');
      expect(fragmentShader).toContain('evaluatePrimaryFaultSystem');
      expect(fragmentShader).toContain('vec3 cAmberIgnite');
      expect(fragmentShader).toContain('vec3 cChampagneGold');
      expect(fragmentShader).toContain('vec3 cBrightGold');
      expect(fragmentShader).toContain('vec3 cWhiteGoldPeak');
      expect(fragmentShader).toContain('rockWarmthMask');
      expect(fragmentShader).toContain('planetaryPulse');
    });

    it('global debug hook exposes all required awakening debug controls', () => {
      const dbg = (typeof window !== 'undefined' ? window : globalThis).__CELESTIAL_PLANETOID_DEBUG__;
      expect(dbg).toBeDefined();
      expect(typeof dbg.playAwakening).toBe('function');
      expect(typeof dbg.resetAwakening).toBe('function');
      expect(typeof dbg.getAwakeningProgress).toBe('function');
      expect(typeof dbg.getAwakeningPhase).toBe('function');

      dbg.playAwakening(0.5);
      expect(renderer.isAwakeningPlaying).toBe(true);
      expect(dbg.getAwakeningPhase()).toBe('first_awakening');

      dbg.resetAwakening();
      expect(renderer.isAwakeningPlaying).toBe(false);
      expect(dbg.getAwakeningProgress()).toBe(0.0);
      expect(dbg.getAwakeningPhase()).toBe('dormant');
    });
  });

  // ==========================================================================
  // 9. LIFECYCLE & DISPOSAL
  // ==========================================================================
  describe('Lifecycle & Disposal', () => {
    it('disposes all Three.js resources cleanly and removes from scene', () => {
      renderer.init(scene);
      expect(scene.children).toContain(renderer.group);

      renderer.dispose();

      expect(scene.children).not.toContain(renderer.group);
      expect(renderer.coreGeometry).toBeNull();
      expect(renderer.coreMaterial).toBeNull();
      expect(renderer.atmosphereGeometry).toBeNull();
      expect(renderer.atmosphereMaterial).toBeNull();
      expect(renderer.ringGeometry).toBeNull();
      expect(renderer.ringMaterial).toBeNull();
      expect(renderer.isDisposed).toBe(true);
    });

    it('safe to call dispose multiple times', () => {
      expect(() => {
        renderer.dispose();
        renderer.dispose();
      }).not.toThrow();
    });

    it('safe to call update after dispose', () => {
      renderer.dispose();
      expect(() => {
        renderer.update({ ballState: new BallState() });
      }).not.toThrow();
    });
  });
});
