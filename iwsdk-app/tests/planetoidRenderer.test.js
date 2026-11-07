/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import {
  PlanetoidRenderer,
  PLANETOID_STAGES,
  DEBUG_STAGE_PRESETS
} from '../src/render/PlanetoidRenderer.js';
import { BallState, PlanetState } from '../src/contracts/Interfaces.js';

describe('PlanetoidRenderer Architecture & Integration Tests (Person C)', () => {
  let renderer;
  let scene;

  beforeEach(() => {
    scene = new Scene();
    renderer = new PlanetoidRenderer();
    renderer.init(scene);
  });

  afterEach(() => {
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    scene = null;
  });

  it('initializes in scene with 3 child meshes in group', () => {
    expect(renderer.group.children.length).toBe(3);
    expect(renderer.group.children.map((c) => c.name)).toEqual([
      'planetoid-core',
      'planetoid-atmosphere',
      'planetoid-rings'
    ]);
  });

  it('consumes Stage 6 state snapshot without mutations', () => {
    const snapshot = Object.freeze({
      ballState: Object.freeze(new BallState({ x: 0.1, y: 1.1, z: -0.3 }, { x: 0, y: 0, z: 0 }, 'air')),
      planetState: Object.freeze(new PlanetState({
        kintsugiGlow: 0.85,
        atmosphereDensity: 0.45,
        oceanFill: 0.70,
        ringAlpha: 0.50,
        goldIgnited: false
      })),
      deltaTime: 0.016,
      elapsedTime: 1.5
    });

    expect(() => renderer.update(snapshot)).not.toThrow();

    // Planetoid position stays at independent celestial gameplay anchor
    expect(renderer.group.position.x).toBeCloseTo(0.0);
    expect(renderer.group.position.y).toBeCloseTo(1.48);
    expect(renderer.group.position.z).toBeCloseTo(-1.80);

    const u = renderer.coreMaterial.uniforms;
    expect(u.uKintsugiGlow.value).toBeCloseTo(0.85);
    expect(u.uAtmosphereDensity.value).toBeCloseTo(0.45);
    expect(u.uOceanFill.value).toBeCloseTo(0.70);
    expect(u.uTime.value).toBeCloseTo(1.5);
  });

  it('supports debug stages 1 through 5 seamlessly', () => {
    for (let stage = 1; stage <= 5; stage++) {
      expect(renderer.setDebugStage(stage)).toBe(true);
      expect(renderer.isDebugMode()).toBe(true);
    }
  });

  it('integrates seamlessly with Stage 6 WorldRenderer pattern', () => {
    const mockWorldRenderer = {
      planetoidRenderer: renderer,
      render(snapshot) {
        if (this.planetoidRenderer && snapshot) {
          this.planetoidRenderer.update({
            ballState: snapshot.ballState,
            planetState: snapshot.planetState,
            deltaTime: snapshot.dtClamped,
            elapsedTime: snapshot.timestamp ? snapshot.timestamp / 1000 : null
          });
        }
      }
    };

    const snapshot = Object.freeze({
      ballState: new BallState({ x: 0.2, y: 1.0, z: -0.4 }),
      planetState: new PlanetState({ kintsugiGlow: 0.95, atmosphereDensity: 0.5 }),
      dtClamped: 0.016,
      timestamp: 2000
    });

    mockWorldRenderer.render(snapshot);

    // Group position remains at celestial gameplay anchor, while shader reflects planetState
    expect(renderer.group.position.x).toBeCloseTo(0.0);
    expect(renderer.coreMaterial.uniforms.uKintsugiGlow.value).toBeCloseTo(0.95);
    expect(renderer.coreMaterial.uniforms.uTime.value).toBe(2.0);
  });
});
