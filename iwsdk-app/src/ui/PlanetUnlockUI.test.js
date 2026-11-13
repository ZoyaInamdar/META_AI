/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetUnlockUI Unit Tests
 * ============================================================================
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import {
  PlanetUnlockUI,
  STAGE_UNLOCKS,
  UNLOCK_UI_PALETTE,
  UnlockUIState,
  UnlockUIPhase,
  DEFAULT_UNLOCK_DURATIONS,
  drawCelestialPlaque,
} from './PlanetUnlockUI.js';
import { EventBus } from '../contracts/EventBus.js';
import { Events } from '../contracts/Interfaces.js';

describe('PlanetUnlockUI - Stage 2 Planet Unlock / Achievement Reveal UI', () => {
  let eventBus;
  let parentGroup;
  let unlockUI;

  beforeEach(() => {
    eventBus = new EventBus();
    parentGroup = new Group();
  });

  afterEach(() => {
    if (unlockUI) {
      unlockUI.destroy();
      unlockUI = null;
    }
  });

  // ==========================================================================
  // 1. CONSTRUCTION & INITIAL STATE
  // ==========================================================================

  it('initializes in IDLE state with hidden scene objects', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    assert.equal(unlockUI.getState(), UnlockUIState.IDLE);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.IDLE);
    assert.equal(unlockUI.getProgress(), 0.0);
    assert.equal(unlockUI.isVisible(), false);
    assert.equal(unlockUI.group.visible, false);
    assert.equal(unlockUI.group.name, 'celestial-planet-unlock-ui');
    assert.equal(unlockUI.mesh.name, 'planet-unlock-card-mesh');
    assert.equal(parentGroup.children.includes(unlockUI.group), true);
  });

  it('defines the approved celestial palette and stage metadata contracts', () => {
    assert.equal(UNLOCK_UI_PALETTE.PEARL_WHITE, '#FFF8F2');
    assert.equal(UNLOCK_UI_PALETTE.SOFT_CHAMPAGNE, '#F6D58A');
    assert.equal(UNLOCK_UI_PALETTE.WARM_GOLD, '#E8B94F');
    assert.equal(UNLOCK_UI_PALETTE.PALE_ROSE, '#F4B8C8');
    assert.equal(UNLOCK_UI_PALETTE.SOFT_LILAC, '#CBB7F6');
    assert.equal(UNLOCK_UI_PALETTE.LAVENDER, '#AFA0E8');
    assert.equal(UNLOCK_UI_PALETTE.VERY_PALE_PINK, '#FFE4EC');

    // Stage 2: Awakened Golden Mineral World
    assert.deepEqual(STAGE_UNLOCKS[2], {
      stage: 2,
      title: 'PLANET AWAKENED',
      stageLabel: 'STAGE II',
      subtitle: 'AWAKENED MINERAL WORLD',
    });

    // Future stages 3, 4, 5
    assert.deepEqual(STAGE_UNLOCKS[3], {
      stage: 3,
      title: 'OCEANS AWAKENED',
      stageLabel: 'STAGE III',
      subtitle: 'BLUE OCEAN WORLD',
    });
    assert.deepEqual(STAGE_UNLOCKS[4], {
      stage: 4,
      title: 'LIFE AWAKENED',
      stageLabel: 'STAGE IV',
      subtitle: 'LIVING GREEN WORLD',
    });
    assert.deepEqual(STAGE_UNLOCKS[5], {
      stage: 5,
      title: 'CELESTIAL ASCENSION',
      stageLabel: 'STAGE V',
      subtitle: 'TRANSCENDENT CELESTIAL WORLD',
    });
  });

  // ==========================================================================
  // 2. EVENT INTEGRATION & SUBSCRIPTION
  // ==========================================================================

  it('subscribes to Events.TRANSFORMATION_COMPLETED and initiates Stage 2 unlock', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    assert.equal(unlockUI.isVisible(), false);

    // Emit transformation completion
    eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
      previousStage: 1,
      newStage: 2,
    });

    assert.equal(unlockUI.isVisible(), true);
    assert.equal(unlockUI.getState(), UnlockUIState.SHOWING);
    assert.equal(unlockUI.activeStage, 2);
    assert.equal(unlockUI.stageInfo.title, 'PLANET AWAKENED');
    assert.equal(unlockUI.stageInfo.stageLabel, 'STAGE II');
    assert.equal(unlockUI.stageInfo.subtitle, 'AWAKENED MINERAL WORLD');
  });

  it('supports future stage events dynamically from payload without code modifications', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
      previousStage: 2,
      newStage: 3,
    });

    assert.equal(unlockUI.isVisible(), true);
    assert.equal(unlockUI.activeStage, 3);
    assert.equal(unlockUI.stageInfo.title, 'OCEANS AWAKENED');
    assert.equal(unlockUI.stageInfo.stageLabel, 'STAGE III');
    assert.equal(unlockUI.stageInfo.subtitle, 'BLUE OCEAN WORLD');
  });

  // ==========================================================================
  // 3. DUPLICATE TRIGGER PROTECTION
  // ==========================================================================

  it('prevents duplicate triggers while presentation is actively showing', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    const firstResult = unlockUI.show(2);
    assert.equal(firstResult, true);
    assert.equal(unlockUI.isVisible(), true);

    // Secondary trigger while showing should be safely blocked
    const duplicateResult = unlockUI.show(2);
    assert.equal(duplicateResult, false);

    // Also via EventBus emission
    eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
    assert.equal(unlockUI.getState(), UnlockUIState.SHOWING);
  });

  // ==========================================================================
  // 4. LIFECYCLE & VISIBILITY: SHOW, HIDE, DESTROY
  // ==========================================================================

  it('showStage() and hide() toggle visibility and reset parameters', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    unlockUI.showStage(2);
    assert.equal(unlockUI.isVisible(), true);
    assert.equal(unlockUI.group.visible, true);

    unlockUI.hide();
    assert.equal(unlockUI.isVisible(), false);
    assert.equal(unlockUI.group.visible, false);
    assert.equal(unlockUI.getState(), UnlockUIState.IDLE);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.IDLE);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 0.0);
  });

  it('destroy() cleans up EventBus listeners, scene objects, and GPU resources', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    assert.equal(parentGroup.children.includes(unlockUI.group), true);

    unlockUI.destroy();

    assert.equal(unlockUI.getState(), UnlockUIState.DESTROYED);
    assert.equal(parentGroup.children.includes(unlockUI.group), false);

    // Emitting event after destroy should not trigger UI
    eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
    assert.equal(unlockUI.isVisible(), false);
  });

  // ==========================================================================
  // 5. ANIMATION CHOREOGRAPHY & SUSTAINED HOLDING
  // ==========================================================================

  it('progresses smoothly through all animation phases and sustains in HOLDING state indefinitely', () => {
    unlockUI = new PlanetUnlockUI({
      eventBus,
      parentGroup,
      durations: {
        [UnlockUIPhase.DELAY]: 0.1,
        [UnlockUIPhase.ARRIVAL]: 0.4,
        [UnlockUIPhase.TITLE_REVEAL]: 0.4,
        [UnlockUIPhase.STAGE_REVEAL]: 0.4,
        [UnlockUIPhase.SHIMMER]: 0.8,
      },
    });

    unlockUI.show(2);

    // 1. DELAY phase (t = 0.05s)
    unlockUI.update(0.05);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.DELAY);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 0.0);
    assert.equal(unlockUI.mesh.scale.x, 0.92);

    // 2. ARRIVAL phase (t = 0.1s + 0.2s = 0.3s)
    unlockUI.update(0.25);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.ARRIVAL);
    assert.ok(unlockUI.material.uniforms.uOpacity.value > 0.0);
    assert.ok(unlockUI.mesh.scale.x > 0.92 && unlockUI.mesh.scale.x <= 1.0);

    // 3. TITLE_REVEAL phase (t = 0.5s + 0.2s = 0.7s)
    unlockUI.update(0.40);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.TITLE_REVEAL);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 1.0);
    assert.equal(unlockUI.mesh.scale.x, 1.0);

    // 4. STAGE_REVEAL phase (t = 0.9s + 0.2s = 1.1s)
    unlockUI.update(0.40);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.STAGE_REVEAL);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 1.0);

    // 5. SHIMMER phase (t = 1.1s + 0.4s = 1.5s < 2.1s)
    unlockUI.update(0.40);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.SHIMMER);
    assert.ok(unlockUI.material.uniforms.uShimmerProgress.value > -0.2);

    // 6. HOLD phase (t = 1.5s + 0.7s = 2.2s > 2.1s total reveal duration)
    unlockUI.update(0.70);
    assert.equal(unlockUI.getState(), UnlockUIState.HOLDING);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.HOLD);
    assert.equal(unlockUI.isVisible(), true);
    assert.equal(unlockUI.group.visible, true);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 1.0);

    // Stays holding indefinitely (e.g. +10.0 seconds of gameplay)
    unlockUI.update(10.0);
    assert.equal(unlockUI.getState(), UnlockUIState.HOLDING);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.HOLD);
    assert.equal(unlockUI.isVisible(), true);
  });

  it('automatically hides the card when Events.TRANSFORMATION_STARTED is emitted', () => {
    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

    unlockUI.show(2);
    assert.equal(unlockUI.isVisible(), true);

    // Advance into HOLDING state
    unlockUI.update(3.0);
    assert.equal(unlockUI.getState(), UnlockUIState.HOLDING);
    assert.equal(unlockUI.isVisible(), true);

    // Next stage transformation begins
    eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 2, nextStage: 3 });

    assert.equal(unlockUI.isVisible(), false);
    assert.equal(unlockUI.group.visible, false);
    assert.equal(unlockUI.getState(), UnlockUIState.IDLE);
  });

  // ==========================================================================
  // 6. SPATIAL ANCHOR SYNCHRONIZATION
  // ==========================================================================

  it('aligns anchor beside planetoid position along X with safe depth along Z', () => {
    const mockRenderer = {
      getAnchorPosition: () => new Vector3(0.0, 1.48, -1.80),
      getScale: () => 17.0,
      radius: 0.035,
    };

    unlockUI = new PlanetUnlockUI({
      eventBus,
      parentGroup,
      planetoidRenderer: mockRenderer,
    });

    unlockUI.show(2);

    const anchor = unlockUI.getAnchorPosition();
    // Planet radius = 17.0 * 0.035 = 0.595.
    // Calibrated side offset X = 0.78
    assert.ok(Math.abs(anchor.x - 0.78) < 1e-4);
    // Vertical offset Y = 1.48 - 0.05 = 1.43
    assert.ok(Math.abs(anchor.y - 1.43) < 1e-4);
    // Forward offset Z = -1.80 + 0.595 + 0.08 = -1.125 (safely in front of planet front pole at -1.205)
    assert.ok(Math.abs(anchor.z - (-1.125)) < 1e-4);
    assert.equal(unlockUI.group.position.x, anchor.x);
    assert.equal(unlockUI.group.position.y, anchor.y);
    assert.equal(unlockUI.group.position.z, anchor.z);
  });

  // ==========================================================================
  // 7. DEBUG API
  // ==========================================================================

  it('exposes window.planetUnlockUI debug API with showStage, hide, and isVisible', () => {
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

    unlockUI = new PlanetUnlockUI({ eventBus, parentGroup, exposeGlobal: true });

    assert.ok(globalScope.planetUnlockUI);
    assert.equal(typeof globalScope.planetUnlockUI.showStage, 'function');
    assert.equal(typeof globalScope.planetUnlockUI.hide, 'function');
    assert.equal(typeof globalScope.planetUnlockUI.isVisible, 'function');
    assert.equal(typeof globalScope.planetUnlockUI.getDebugInfo, 'function');
    assert.equal(typeof globalScope.planetUnlockUI.debugForceVisible, 'function');

    // Test debug show
    globalScope.planetUnlockUI.showStage(2);
    assert.equal(unlockUI.isVisible(), true);
    assert.equal(globalScope.planetUnlockUI.isVisible(), true);

    // Test debug hide
    globalScope.planetUnlockUI.hide();
    assert.equal(unlockUI.isVisible(), false);
    assert.equal(globalScope.planetUnlockUI.isVisible(), false);
  });

  it('debugForceVisible() immediately forces card into visible HOLDING state with full opacity', () => {
    const mockRenderer = {
      getAnchorPosition: () => new Vector3(0.0, 1.48, -1.80),
      getScale: () => 17.0,
      radius: 0.035,
    };

    unlockUI = new PlanetUnlockUI({
      eventBus,
      parentGroup,
      planetoidRenderer: mockRenderer,
    });

    assert.equal(unlockUI.isVisible(), false);

    const result = unlockUI.debugForceVisible(2);
    assert.equal(result, true);
    assert.equal(unlockUI.isVisible(), true);
    assert.equal(unlockUI.getState(), UnlockUIState.HOLDING);
    assert.equal(unlockUI.getPhase(), UnlockUIPhase.HOLD);
    assert.equal(unlockUI.group.visible, true);
    assert.equal(unlockUI.mesh.visible, true);
    assert.equal(unlockUI.material.uniforms.uOpacity.value, 1.0);
    assert.equal(unlockUI.mesh.scale.x, 1.0);
    assert.equal(unlockUI.mesh.scale.y, 1.0);
    assert.equal(unlockUI.mesh.scale.z, 1.0);

    const debugInfo = unlockUI.getDebugInfo();
    assert.equal(debugInfo.state, UnlockUIState.HOLDING);
    assert.equal(debugInfo.phase, UnlockUIPhase.HOLD);
    assert.equal(debugInfo.visible, true);
    assert.equal(debugInfo.opacity, 1.0);
    assert.equal(debugInfo.groupVisible, true);
    assert.equal(debugInfo.meshVisible, true);
    assert.equal(debugInfo.renderOrder, 999);
    assert.equal(debugInfo.materialDepthTest, true);
    assert.equal(debugInfo.materialDepthWrite, false);
    assert.equal(debugInfo.materialTransparent, true);

    const worldPos = unlockUI.getWorldPosition();
    assert.ok(worldPos instanceof Vector3);
    const worldScale = unlockUI.getWorldScale();
    assert.ok(worldScale instanceof Vector3);
  });

  // ==========================================================================
  // 8. PROCEDURAL CANVAS DRAWING
  // ==========================================================================

  it('drawCelestialPlaque executes safely against a mock canvas context', () => {
    const calls = [];
    const mockCtx = {
      clearRect: (...args) => calls.push(['clearRect', args]),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      rect: () => {},
      roundRect: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: (...args) => calls.push(['fillText', args]),
      measureText: (txt) => ({ width: txt.length * 10 }),
    };

    const mockCanvas = {
      width: 1024,
      height: 704,
      getContext: () => mockCtx,
    };

    drawCelestialPlaque(mockCanvas, STAGE_UNLOCKS[2]);

    assert.ok(calls.length > 0);
    const hasTitle = calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'PLANET AWAKENED');
    assert.equal(hasTitle, true);
  });
});
