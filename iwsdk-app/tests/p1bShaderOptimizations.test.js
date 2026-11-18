import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PLANETOID_CORE_FRAGMENT_SHADER,
  PLANETOID_CORE_VERTEX_SHADER,
  createPlanetoidCoreMaterial,
  PLANETOID_PALETTE,
} from '../src/render/PlanetoidShader.js';
import { PlanetoidRenderer, PLANETOID_STAGES } from '../src/render/PlanetoidRenderer.js';

describe('P1-B PlanetoidShader Safe GPU Guard Optimizations', () => {
  describe('Static Shader Code Verification', () => {
    it('contains the approved Stage 3 Surface Guard: if (uVisualStage > 2.0 || uOceanFill > 0.001)', () => {
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('if (uVisualStage > 2.0 || uOceanFill > 0.001)');
    });

    it('contains the approved Stage 4 Biosphere Guard: if (uVisualStage > 3.0)', () => {
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('if (uVisualStage > 3.0)');
    });

    it('contains the shared rawNdotV and NdotV common subexpression definitions', () => {
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float rawNdotV = dot(norm, viewDir);');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float NdotV = clamp(rawNdotV, 0.0, 1.0);');
    });

    it('reuses rawNdotV in pearlPhase, viewFresnel, and fresnelRim', () => {
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float pearlPhase = rawNdotV * 2.8 + sphereDir.y * 1.6 + uTime * 0.12;');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float viewFresnel = clamp(1.0 - abs(rawNdotV), 0.0, 1.0);');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float fresnelRim = pow(max(1.0 - abs(rawNdotV), 0.0), 4.5);');
    });

    it('reuses NdotV in centerLuminance', () => {
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('float centerLuminance = pow(NdotV, 1.8) * 0.18;');
    });

    it('preserves all required Stage 3 and Stage 4 symbols for downstream systems and test suites', () => {
      // Stage 3 symbols
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('stage3Land');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('stage3Ocean');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('stage3Surface');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cCoastSand');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cTemperateRock');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('s23Blend');

      // Stage 4 symbols
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('stage4Land');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('stage4Surface');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cDeepVeg');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cForest');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cGreen');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cEmerald');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cMoss');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cFreshVeg');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('s34Blend');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('cCeladon');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('biomeHue');
      expect(PLANETOID_CORE_FRAGMENT_SHADER).toContain('landColor');
    });
  });

  describe('Material Instantiation and Uniform Consistency', () => {
    it('creates core material with createPlanetoidCoreMaterial() without error', () => {
      const mat = createPlanetoidCoreMaterial();
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.vertexShader).toBe(PLANETOID_CORE_VERTEX_SHADER);
      expect(mat.fragmentShader).toBe(PLANETOID_CORE_FRAGMENT_SHADER);
      expect(mat.uniforms.uVisualStage).toBeDefined();
      expect(mat.uniforms.uOceanFill).toBeDefined();
      expect(mat.uniforms.uAtmosphereDensity).toBeDefined();
      expect(mat.uniforms.uKintsugiGlow).toBeDefined();
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.uniforms.uAwakeningProgress).toBeDefined();
    });

    it('supports runtime stage transitions across Stages 1 through 5 without throwing', () => {
      const mat = createPlanetoidCoreMaterial();
      const testStages = [
        { stage: 1.0, ocean: 0.0, kintsugi: 0.0 },
        { stage: 1.5, ocean: 0.0, kintsugi: 0.4 },
        { stage: 2.0, ocean: 0.0, kintsugi: 0.85 },
        { stage: 2.5, ocean: 0.45, kintsugi: 0.85 },
        { stage: 3.0, ocean: 0.85, kintsugi: 0.85 },
        { stage: 3.5, ocean: 0.85, kintsugi: 0.85 },
        { stage: 4.0, ocean: 0.85, kintsugi: 0.85 },
        { stage: 4.5, ocean: 0.95, kintsugi: 0.85 },
        { stage: 5.0, ocean: 1.0, kintsugi: 1.0 },
      ];

      for (const t of testStages) {
        expect(() => {
          mat.uniforms.uVisualStage.value = t.stage;
          mat.uniforms.uOceanFill.value = t.ocean;
          mat.uniforms.uKintsugiGlow.value = t.kintsugi;
          mat.uniforms.uTime.value += 0.016;
        }).not.toThrow();
      }
    });

    it('integrates seamlessly with PlanetoidRenderer across all PLANETOID_STAGES', () => {
      const scene = new THREE.Scene();
      const renderer = new PlanetoidRenderer(scene);

      expect(renderer.coreMaterial).toBeDefined();
      expect(renderer.coreMaterial.fragmentShader).toBe(PLANETOID_CORE_FRAGMENT_SHADER);

      const stages = [
        PLANETOID_STAGES.SEED,
        PLANETOID_STAGES.AWAKENING,
        PLANETOID_STAGES.OCEANS,
        PLANETOID_STAGES.LIFE_ATMOSPHERE,
        PLANETOID_STAGES.CELESTIAL_ALIGNMENT,
      ];

      for (const s of stages) {
        expect(() => renderer.setDebugStage(s)).not.toThrow();
      }
    });
  });
});
