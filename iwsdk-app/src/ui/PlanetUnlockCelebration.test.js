/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - PlanetUnlockCelebration Unit Tests
 * ============================================================================
 */

import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { Group, Vector3, Euler } from 'three';
import {
  PlanetUnlockCelebration,
  CelebrationState,
  CelebrationPhase,
  CELEBRATION_TOTAL_DURATION,
  CELEBRATION_PARTICLE_COUNT,
  createSparkleTexture,
} from './PlanetUnlockCelebration.js';
import { EventBus } from '../contracts/EventBus.js';
import { Events } from '../contracts/Interfaces.js';

describe('PlanetUnlockCelebration - Pre-Unlock Spin & Sparkles', () => {
  let eventBus;
  let parentGroup;
  let mockRenderer;
  let mockUnlockUI;
  let celebration;

  beforeEach(() => {
    eventBus = new EventBus();
    parentGroup = new Group();

    mockRenderer = {
      coreMesh: {
        rotation: new Euler(0, 0, 0),
      },
      getAnchorPosition: () => new Vector3(0, 1.48, -1.80),
      getScale: () => 17.0,
      scaleFactor: 17.0,
      radius: 0.035,
    };

    mockUnlockUI = {
      showStage: vi.fn(),
      isVisible: vi.fn(() => false),
    };
  });

  afterEach(() => {
    if (celebration) {
      celebration.destroy();
      celebration = null;
    }
  });

  // ==========================================================================
  // 1. INITIALIZATION
  // ==========================================================================

  it('initializes in IDLE state with hidden sparkles and zero progress', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    assert.equal(celebration.getState(), CelebrationState.IDLE);
    assert.equal(celebration.getPhase(), CelebrationPhase.IDLE);
    assert.equal(celebration.getProgress(), 0.0);
    assert.equal(celebration.isActive(), false);
    assert.equal(celebration.group.visible, false);
    assert.equal(celebration.sparkles.length, CELEBRATION_PARTICLE_COUNT);
    assert.equal(celebration.sparkles.length, 16);
    assert.equal(parentGroup.children.includes(celebration.group), true);
  });

  // ==========================================================================
  // 2. EVENT SUBSCRIPTION & STAGE PROPAGATION
  // ==========================================================================

  it('subscribes to Events.TRANSFORMATION_COMPLETED and starts celebration', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
      previousStage: 1,
      newStage: 2,
    });

    assert.equal(celebration.isActive(), true);
    assert.equal(celebration.targetStage, 2);
    assert.equal(celebration.getState(), CelebrationState.SPINNING);
  });

  // ==========================================================================
  // 3. ORDERING: CELEBRATION RUNS BEFORE UNLOCK UI
  // ==========================================================================

  it('does NOT invoke PlanetUnlockUI before the celebration completes', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    celebration.play(2);

    // During celebration (e.g. t = 1.5s)
    celebration.update(1.5);
    assert.equal(mockUnlockUI.showStage.mock.calls.length, 0);

    // Nearly finished (e.g. t = 3.5s < 3.80s)
    celebration.update(2.0); // total 3.5s < 3.80s
    assert.equal(mockUnlockUI.showStage.mock.calls.length, 0);

    // Concludes at t >= 3.80s
    celebration.update(0.35); // total 3.85s >= 3.80s
    assert.equal(mockUnlockUI.showStage.mock.calls.length, 1);
    assert.equal(mockUnlockUI.showStage.mock.calls[0][0], 2);
    assert.equal(celebration.getState(), CelebrationState.COMPLETE);
    assert.equal(celebration.getPhase(), CelebrationPhase.COMPLETE);
  });

  // ==========================================================================
  // 4. PLANET CELEBRATORY SPIN
  // ==========================================================================

  it('rotates the hero planet visual during the spin phase and returns to baseline orientation', () => {
    mockRenderer.coreMesh.rotation.y = 0.5; // authored initial orientation

    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    celebration.play(2);

    // t = 1.90s (near midpoint of 3.4s spin from 0.20s to 3.60s)
    celebration.update(1.90);
    // Rotation should have advanced significantly from initial (approx PI radians = ~3.14 rads)
    const midRotation = mockRenderer.coreMesh.rotation.y;
    assert.ok(midRotation > 0.5 + 2.0, `Expected rotation around peak, got ${midRotation}`);

    // t = 3.65s (past end of spin phase at 3.60s)
    celebration.update(1.75);
    // Planet returns exactly to initial baseline orientation
    assert.ok(
      Math.abs(mockRenderer.coreMesh.rotation.y - 0.5) < 1e-4,
      `Expected rotation to return to 0.5, got ${mockRenderer.coreMesh.rotation.y}`
    );
  });

  // ==========================================================================
  // 5. SPARKLE ACTIVATION & DISSOLUTION
  // ==========================================================================

  it('activates sparkles during the sparkle phase and dissolves them before completion', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    celebration.play(2);

    // At t = 0.10s, sparkles should not have spawned yet
    celebration.update(0.10);
    assert.equal(celebration.group.visible, false);

    // At t = 1.80s, sparkle activity is strong and in SPARKLE phase
    celebration.update(1.70);
    assert.equal(celebration.group.visible, true);
    assert.equal(celebration.getPhase(), CelebrationPhase.SPARKLE);
    const visibleSparkles = celebration.sparkles.filter((s) => s.mesh.visible);
    assert.ok(visibleSparkles.length >= 6, `Expected visible sparkles at peak, got ${visibleSparkles.length}`);

    // At t = 3.65s (after 3.4s spin and sparkle dissolve), sparkles dissolve
    celebration.update(1.85);
    const lateSparkles = celebration.sparkles.filter((s) => s.mesh.visible);
    assert.equal(lateSparkles.length, 0);
  });

  // ==========================================================================
  // 6. DUPLICATE TRIGGER PROTECTION
  // ==========================================================================

  it('prevents overlapping duplicate celebrations while actively playing', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    const first = celebration.play(2);
    assert.equal(first, true);

    const duplicate = celebration.play(2);
    assert.equal(duplicate, false);
  });

  // ==========================================================================
  // 7. RESET & DISPOSAL
  // ==========================================================================

  it('reset() stops celebration and restores baseline planet orientation', () => {
    mockRenderer.coreMesh.rotation.y = 0.75;

    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    celebration.play(2);
    celebration.update(0.4);

    // Mid-animation
    assert.ok(mockRenderer.coreMesh.rotation.y !== 0.75);

    celebration.reset();
    assert.equal(celebration.getState(), CelebrationState.IDLE);
    assert.equal(celebration.getPhase(), CelebrationPhase.IDLE);
    assert.equal(celebration.group.visible, false);
    assert.equal(mockRenderer.coreMesh.rotation.y, 0.75);
  });

  it('destroy() unlinks from scene and unregisters EventBus listeners', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    assert.equal(parentGroup.children.includes(celebration.group), true);

    celebration.destroy();
    assert.equal(celebration.getState(), CelebrationState.DESTROYED);
    assert.equal(parentGroup.children.includes(celebration.group), false);

    // Event should not trigger destroyed celebration
    eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
    assert.equal(celebration.isActive(), false);
  });

  // ==========================================================================
  // 8. DEBUG API
  // ==========================================================================

  it('exposes window.planetUnlockCelebration debug API with all required functions', () => {
    const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
      exposeGlobal: true,
    });

    assert.ok(globalScope.planetUnlockCelebration);
    assert.equal(typeof globalScope.planetUnlockCelebration.play, 'function');
    assert.equal(typeof globalScope.planetUnlockCelebration.debugShow, 'function');
    assert.equal(typeof globalScope.planetUnlockCelebration.getState, 'function');
    assert.equal(typeof globalScope.planetUnlockCelebration.getPhase, 'function');
    assert.equal(typeof globalScope.planetUnlockCelebration.getProgress, 'function');
    assert.equal(typeof globalScope.planetUnlockCelebration.reset, 'function');

    globalScope.planetUnlockCelebration.play(2);
    assert.equal(celebration.isActive(), true);

    globalScope.planetUnlockCelebration.reset();
    assert.equal(celebration.isActive(), false);
  });

  it('debugShow(stage) immediately triggers celebration for stages 2, 3, 4, 5 and resets active state', () => {
    celebration = new PlanetUnlockCelebration({
      eventBus,
      planetoidRenderer: mockRenderer,
      unlockUI: mockUnlockUI,
      parentGroup,
    });

    assert.equal(typeof celebration.debugShow, 'function');

    // Stage 2
    const res2 = celebration.debugShow(2);
    assert.equal(res2, true);
    assert.equal(celebration.isActive(), true);
    assert.equal(celebration.targetStage, 2);
    assert.equal(celebration.getState(), CelebrationState.SPINNING);

    // Stage 3 while active - resets and starts stage 3
    const res3 = celebration.debugShow(3);
    assert.equal(res3, true);
    assert.equal(celebration.isActive(), true);
    assert.equal(celebration.targetStage, 3);

    // Stage 4
    const res4 = celebration.debugShow(4);
    assert.equal(res4, true);
    assert.equal(celebration.targetStage, 4);

    // Stage 5
    const res5 = celebration.debugShow(5);
    assert.equal(res5, true);
    assert.equal(celebration.targetStage, 5);
  });
});
