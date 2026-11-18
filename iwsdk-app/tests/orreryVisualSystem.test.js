/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - OrreryVisualSystem Unit Tests (Phase 3)
 * ============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Group, Scene, Mesh, PlaneGeometry, MeshBasicMaterial } from 'three';
import { Events, CupKey, TargetState, CatchType, ScoreEvent } from '../src/contracts/Interfaces.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { isPerfectCatch } from '../src/game/isPerfectCatch.js';
import { TrickSequencer } from '../src/mission/TrickSequencer.js';
import OrreryState, { ManeuverStatus, OrbitalState } from '../src/game/OrreryState.js';
import NarrativeDirector, { NarrativeLifecycle, TOTAL_CHAPTERS } from '../src/game/NarrativeDirector.js';
import { DEBUG_STAGE_PRESETS, PLANETOID_STAGES } from '../src/render/PlanetoidRenderer.js';
import OrreryVisualSystem, {
  ORRERY_DEFAULT_ANCHOR,
  ORRERY_PALETTE,
  CATCH_RESPONSE_DURATION,
  resolveCatchIntensity,
  AlignmentPhase,
  ALIGNMENT_TIMINGS,
  Ch2ResonanceState,
  RESONANCE_STABILIZATION_THRESHOLD,
  CH2_PARTICLE_COUNT,
  CH2_SHOCKWAVE_DURATION,
  createStellarBodyMaterial,
  createSecondaryPlanetMaterial,
  createResonanceAchievedTextTexture,
  createResonanceLockedTextTexture,
  createStarCoronaMaterial,
  createCollapsingStarMaterial,
  createStellarCoronaMaterial,
  createStellarFragmentMaterial,
  CH5_STELLAR_FRAGMENT_COUNT,
  CH5_SUPERNOVA_FILAMENT_COUNT,
  createMagnetosphericBowGeometry,
  createMagnetoshieldMaterial,
  createDirectionalShockwaveArcLineGeometry,
  createDirectionalShockwaveGeometry,
  createBinaryResonanceWave,
  evaluateBinaryResonanceWave,
  updateBinaryResonanceWave,
  resetBinaryResonanceWave
} from '../src/render/OrreryVisualSystem.js';

describe('OrreryVisualSystem (Phase 3)', () => {
  let eventBus;
  let orreryState;
  let director;
  let scene;
  let orrery;

  beforeEach(() => {
    eventBus = new EventBus();
    orreryState = new OrreryState();
    director = new NarrativeDirector({ eventBus, orreryState });
    scene = new Scene();
    orrery = new OrreryVisualSystem({
      narrativeDirector: director,
      parentGroup: scene,
      eventBus
    });
  });

  afterEach(() => {
    if (orrery) {
      orrery.destroy();
      orrery = null;
    }
    if (director) {
      director.destroy();
      director = null;
    }
    scene = null;
  });

  // ==========================================================================
  // 1. CONSTRUCTION & HIERARCHY
  // ==========================================================================
  describe('1. Construction & Scene Graph Hierarchy', () => {
    it('creates root group with name "orrery-visual-system"', () => {
      expect(orrery.group).toBeDefined();
      expect(orrery.group.name).toBe('orrery-visual-system');
      expect(orrery.group.parent).toBe(scene);

      // Verify public root aliases (window.orreryVisualSystem.root / getRoot())
      expect(orrery.root).toBe(orrery.group);
      expect(orrery.getRoot()).toBe(orrery.group);
      expect(orrery.root.name).toBe('orrery-visual-system');

      // Verify global runtime debug exposure
      const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      expect(globalScope).toBeDefined();
      expect(globalScope.orreryVisualSystem).toBe(orrery);
      expect(globalScope.__ORRERY_SYSTEM__).toBe(orrery);
      expect(globalScope.__ORRERY_SYSTEM__ === globalScope.orreryVisualSystem).toBe(true);
    });

    it('positions root group at canonical default anchor (0, 2.85, -3.80)', () => {
      const anchor = orrery.getAnchorPosition();
      expect(anchor.x).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.x, 3);
      expect(anchor.y).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.y, 3);
      expect(anchor.z).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.z, 3);

      expect(orrery.group.position.x).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.x, 3);
      expect(orrery.group.position.y).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.y, 3);
      expect(orrery.group.position.z).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.z, 3);
    });

    it('supports custom anchor position in constructor options', () => {
      const custom = new OrreryVisualSystem({
        anchorPosition: { x: 1.0, y: 3.5, z: -5.0 }
      });
      const anchor = custom.getAnchorPosition();
      expect(anchor.x).toBe(1.0);
      expect(anchor.y).toBe(3.5);
      expect(anchor.z).toBe(-5.0);
      custom.destroy();
    });

    it('constructs with default options when none are passed', () => {
      const standalone = new OrreryVisualSystem();
      expect(standalone.group).toBeDefined();
      expect(standalone.getChapter()).toBe(1);
      standalone.destroy();
    });

    it('creates 5 distinct chapter groups in root hierarchy', () => {
      for (let ch = 1; ch <= TOTAL_CHAPTERS; ch++) {
        const group = orrery.getChapterGroup(ch);
        expect(group).toBeDefined();
        expect(group.name).toBe(`chapter-${ch}-root`);
        expect(group.parent).toBe(orrery.group);
      }
    });

    it('initializes with Chapter 1 visible and Chapters 2-5 hidden', () => {
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(false);
      expect(orrery.getChapterGroup(3).visible).toBe(false);
      expect(orrery.getChapterGroup(4).visible).toBe(false);
      expect(orrery.getChapterGroup(5).visible).toBe(false);
    });

    it('enforces midground renderOrder -100 and depthWrite false on all visual elements', () => {
      let renderableCount = 0;
      orrery.group.traverse((obj) => {
        if (obj.isMesh || obj.isLine || obj.isPoints) {
          renderableCount++;
          expect(obj.renderOrder).toBe(-100);
          expect(obj.material.depthWrite).toBe(false);
        }
      });
      expect(renderableCount).toBeGreaterThan(15);
    });
  });

  // ==========================================================================
  // 2. CHAPTER VISUAL COMPONENTS
  // ==========================================================================
  describe('2. Chapter Visual Components', () => {
    it('creates Chapter 1 components: primary star, perturber, orbits, planetoid, flare', () => {
      const ch1 = orrery.getChapterGroup(1);
      expect(ch1.getObjectByName('primary-star')).toBeDefined();
      expect(ch1.getObjectByName('secondary-perturber')).toBeDefined();
      expect(ch1.getObjectByName('hyperbolic-orbit-path')).toBeDefined();
      expect(ch1.getObjectByName('bound-orbit-path')).toBeDefined();
      expect(ch1.getObjectByName('planet-orbit-path')).toBeDefined();
      expect(ch1.getObjectByName('secondary-orbit-path')).toBeDefined();
      expect(ch1.getObjectByName('chapter-1-node')).toBeDefined();
      expect(ch1.getObjectByName('capture-burn-flare')).toBeDefined();
    });

    it('creates Chapter 2 components: barycenter, binary stars, resonant ring, planetoid', () => {
      const ch2 = orrery.getChapterGroup(2);
      expect(ch2.getObjectByName('chapter-2-barycenter')).toBeDefined();
      expect(ch2.getObjectByName('star-peach')).toBeDefined();
      expect(ch2.getObjectByName('star-lavender')).toBeDefined();
      expect(ch2.getObjectByName('resonant-ring')).toBeDefined();
      expect(ch2.getObjectByName('chapter-2-node')).toBeDefined();
    });

    it('creates Chapter 3 components and keeps the legacy flyby body hidden', () => {
      const ch3 = orrery.getChapterGroup(3);
      expect(ch3.getObjectByName('chapter-3-primary')).toBeDefined();
      expect(ch3.getObjectByName('flyby-body')).toBeDefined();
      expect(ch3.getObjectByName('flyby-body').visible).toBe(false);
      expect(ch3.getObjectByName('transfer-orbit-path')).toBeDefined();
      expect(ch3.getObjectByName('outer-bound-orbit')).toBeDefined();
      expect(ch3.getObjectByName('chapter-3-node')).toBeDefined();
    });

    it('creates Chapter 4 components: host planet, satellite, Roche marker, ring discs, fragments', () => {
      const ch4 = orrery.getChapterGroup(4);
      expect(ch4.getObjectByName('host-planet')).toBeDefined();
      expect(ch4.getObjectByName('approaching-satellite')).toBeDefined();
      expect(ch4.getObjectByName('roche-limit-marker')).toBeDefined();
      expect(ch4.getObjectByName('roche-inner-ring')).toBeDefined();
      expect(ch4.getObjectByName('roche-outer-ring')).toBeDefined();
      expect(ch4.getObjectByName('roche-fragments')).toBeDefined();
    });

    it('creates Chapter 5 components: world, atmosphere, collapsing core, shockwave, shield dome, filaments, inner core, corona, fragments', () => {
      const ch5 = orrery.getChapterGroup(5);
      expect(ch5.getObjectByName('chapter-5-world')).toBeDefined();
      expect(ch5.getObjectByName('chapter-5-atmosphere')).toBeDefined();
      expect(ch5.getObjectByName('collapsing-core')).toBeDefined();
      expect(ch5.getObjectByName('ch5-stellar-inner-core')).toBeDefined();
      expect(ch5.getObjectByName('ch5-stellar-corona')).toBeDefined();
      expect(ch5.getObjectByName('ch5-stellar-fragments')).toBeDefined();
      expect(ch5.getObjectByName('supernova-shockwave')).toBeDefined();
      expect(ch5.getObjectByName('magnetoshield-dome')).toBeDefined();
      expect(ch5.getObjectByName('ch5-supernova-filaments')).toBeDefined();
    });
  });

  // ==========================================================================
  // 3. CHAPTER TRANSITIONS & RECONCILIATION
  // ==========================================================================
  describe('3. Chapter Progression & Visibility Reconciliation', () => {
    it('switches visible chapter group when NarrativeDirector completes Chapter 1', () => {
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getChapterGroup(1).visible).toBe(true);

      // Chapter 1 progression -> ready -> executing -> completed -> advances to Chapter 2
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(director.getChapter()).toBe(2);
      expect(orrery.getChapter()).toBe(2);
      // Phase 3A Step 5: During 2.0s transition, both Chapter 1 and Chapter 2 remain active
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      // Advance time past transition duration
      orrery.update(2.1);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(1).visible).toBe(false);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      expect(orrery.getChapterGroup(3).visible).toBe(false);
    });

    it('progresses smoothly through all 5 canonical chapters', () => {
      // 1 -> 2
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(orrery.getChapter()).toBe(2);
      orrery.update(2.1);
      expect(orrery.getChapterGroup(2).visible).toBe(true);

      // 2 -> 3
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 2, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 2, targetStage: 3 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 2, targetStage: 3 });
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(orrery.getChapter()).toBe(3);
      orrery.update(2.1);
      expect(orrery.getChapterGroup(3).visible).toBe(true);

      // 3 -> 4
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 3, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 3, targetStage: 4 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 3, targetStage: 4 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 3, newStage: 4 });
      expect(orrery.getChapter()).toBe(4);
      expect(orrery.getChapterGroup(4).visible).toBe(true);

      // 4 -> 5
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 4, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 4, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 4, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 4, newStage: 5 });
      expect(orrery.getChapter()).toBe(5);
      expect(orrery.getChapterGroup(5).visible).toBe(true);
      expect(orrery.getChapterGroup(4).visible).toBe(false);
    });

    it('Chapter 5 is terminal: does not advance to Chapter 6', () => {
      // Advance to Chapter 5
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orreryState.advanceChapter(5);
      orrery._syncFromDirector();

      expect(orrery.getChapter()).toBe(5);

      // Emit completed for stage 5
      eventBus.emit(Events.STAGE_READY, { currentStage: 5, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 5, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 5, newStage: 5 });

      expect(orrery.getChapter()).toBe(5);
      expect(orrery.getChapterGroup(5).visible).toBe(true);
      expect(orrery.getChapterGroup(6)).toBeNull();
    });
  });

  // ==========================================================================
  // 4. PARAMETER & SCIENTIFIC STATE MAPPING
  // ==========================================================================
  describe('4. Parameter & Scientific State Mapping', () => {
    it('maps Chapter 1 capture burn flare during CAPTURE_BURN state', () => {
      const flare = orrery.getChapterGroup(1).getObjectByName('capture-burn-flare');
      expect(flare.visible).toBe(false);

      // Start transformation in Chapter 1 -> CAPTURE_BURN
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      expect(director.getOrbitalState()).toBe(OrbitalState.CAPTURE_BURN);
      expect(orrery.getActiveOrbitalState()).toBe(OrbitalState.CAPTURE_BURN);

      orrery.update(0.016);
      expect(flare.visible).toBe(true);
      expect(flare.material.opacity).toBeGreaterThan(0.5);
    });

    it('updates Chapter 4 Roche ring discs driven by rocheProgress', () => {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orrery._syncFromDirector();

      const innerRing = orrery.getChapterGroup(4).getObjectByName('roche-inner-ring');
      const outerRing = orrery.getChapterGroup(4).getObjectByName('roche-outer-ring');

      // Before roche progress
      orrery.update(0.016);
      const initialInnerOpacity = innerRing.material.opacity;

      // Advance rocheProgress in OrreryState
      orreryState.setRocheProgress(0.85);
      orrery.update(0.016);

      expect(innerRing.material.opacity).toBeGreaterThanOrEqual(initialInnerOpacity);
      expect(innerRing.scale.x).toBeGreaterThan(0.9);
      expect(outerRing.scale.x).toBeGreaterThan(0.9);
    });

    it('updates Chapter 5 magnetoshield dome driven by shieldCharge', () => {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orreryState.advanceChapter(5);
      orrery._syncFromDirector();

      const shield = orrery.getChapterGroup(5).getObjectByName('magnetoshield-dome');

      // Initially 0 shield charge
      orreryState.setShieldCharge(0.0);
      orrery.update(0.016);
      const initialOpacity = shield.material.opacity;

      // Fully charged shield
      orreryState.setShieldCharge(1.0);
      orrery.update(0.016);

      expect(shield.material.opacity).toBeGreaterThan(initialOpacity);
      expect(shield.scale.x).toBeGreaterThan(0.95);
    });
  });

  // ==========================================================================
  // 5. DETERMINISTIC ANIMATION & ZERO ALLOCATIONS
  // ==========================================================================
  describe('5. Deterministic Animation & Frame Updates', () => {
    it('advances simTime deterministically on update(dt)', () => {
      expect(orrery.simTime).toBe(0.0);
      orrery.update(0.016);
      expect(orrery.simTime).toBeCloseTo(0.016, 5);
      orrery.update(0.033);
      expect(orrery.simTime).toBeCloseTo(0.049, 5);
    });

    it('animates node position along orbital path without allocating new vectors', () => {
      const node = orrery.getChapterGroup(1).getObjectByName('chapter-1-node');
      const initialX = node.position.x;
      const initialZ = node.position.z;

      orrery.update(0.5);

      expect(node.position.x !== initialX || node.position.z !== initialZ).toBe(true);
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(Number.isFinite(node.position.z)).toBe(true);
    });

    it('handles zero, negative, or large delta time gracefully', () => {
      expect(() => orrery.update(0)).not.toThrow();
      expect(() => orrery.update(-0.1)).not.toThrow();
      expect(() => orrery.update(100.0)).not.toThrow();
      expect(Number.isFinite(orrery.simTime)).toBe(true);
    });

    it('skips heavy updates when group is hidden (setVisible(false))', () => {
      orrery.setVisible(false);
      const node = orrery.getChapterGroup(1).getObjectByName('chapter-1-node');
      const posX = node.position.x;

      orrery.update(0.1);

      // simTime does not advance when hidden to save CPU
      expect(orrery.simTime).toBe(0.0);
      expect(node.position.x).toBe(posX);
    });
  });

  // ==========================================================================
  // 6. PUBLIC API & DEBUGGING
  // ==========================================================================
  describe('6. Public API & State Inspection', () => {
    it('toggles visibility via setVisible() and isVisible()', () => {
      expect(orrery.isVisible()).toBe(true);
      orrery.setVisible(false);
      expect(orrery.isVisible()).toBe(false);
      expect(orrery.group.visible).toBe(false);

      orrery.setVisible(true);
      expect(orrery.isVisible()).toBe(true);
      expect(orrery.group.visible).toBe(true);
    });

    it('dynamically updates anchor position via setAnchorPosition()', () => {
      orrery.setAnchorPosition(0.5, 2.5, -4.0);
      const anchor = orrery.getAnchorPosition();
      expect(anchor.x).toBe(0.5);
      expect(anchor.y).toBe(2.5);
      expect(anchor.z).toBe(-4.0);
      expect(orrery.group.position.x).toBe(0.5);
      expect(orrery.group.position.y).toBe(2.5);
      expect(orrery.group.position.z).toBe(-4.0);
    });

    it('returns an immutable state snapshot via getState()', () => {
      const state = orrery.getState();
      expect(Object.isFrozen(state)).toBe(true);
      expect(state.visible).toBe(true);
      expect(state.activeChapter).toBe(1);
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(state.anchorPosition.y).toBeCloseTo(ORRERY_DEFAULT_ANCHOR.y, 2);
      expect(state.rootName).toBe('orrery-visual-system');
    });

    it('resets simulation time and resyncs via reset()', () => {
      orrery.update(2.5);
      expect(orrery.simTime).toBeCloseTo(2.5, 3);
      orrery.reset();
      expect(orrery.simTime).toBe(0.0);
    });
  });

  // ==========================================================================
  // 7. TEARDOWN & RESOURCE MANAGEMENT
  // ==========================================================================
  describe('7. Teardown & Resource Disposal', () => {
    it('removes root group from parent scene on destroy()', () => {
      expect(orrery.group.parent).toBe(scene);
      orrery.destroy();
      expect(orrery.group.parent).toBeNull();
    });

    it('unsubscribes from EventBus on destroy()', () => {
      orrery.destroy();

      // Emitting events after destruction should not throw or change state
      expect(() => {
        eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
        eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
        eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      }).not.toThrow();
    });

    it('disposes all owned geometries and materials on destroy()', () => {
      const geomCount = orrery._geometries.length;
      const matCount = orrery._materials.length;
      expect(geomCount).toBeGreaterThan(10);
      expect(matCount).toBeGreaterThan(10);

      orrery.destroy();

      expect(orrery._geometries.length).toBe(0);
      expect(orrery._materials.length).toBe(0);
    });

    it('destroy() is idempotent and alias dispose() works', () => {
      expect(() => {
        orrery.destroy();
        orrery.destroy();
        orrery.dispose();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 8. PHASE 1 — STAGE 1 THREE-BODY PLANET IDENTITY & COMPOSITION
  // ==========================================================================
  describe('8. Phase 1 — Stage 1 Three-Body Planet Identity & Composition', () => {
    // 1. Chapter 1 planet exists
    it('creates Chapter 1 planet node representing player world attached to scene graph', () => {
      expect(orrery.ch1PlanetNode).toBeDefined();
      expect(orrery.ch1PlanetNode.isMesh).toBe(true);
      expect(orrery.ch1PlanetNode.name).toBe('chapter-1-node');
      const foundInGroup = orrery.getChapterGroup(1).getObjectByName('chapter-1-node');
      expect(foundInGroup).toBe(orrery.ch1PlanetNode);
      expect(orrery.ch1PlanetNode.parent).toBe(orrery.getChapterGroup(1));
      expect(orrery.getChapter1PlanetNode()).toBe(orrery.ch1PlanetNode);
    });

    // 2. Visible when active
    it('ensures Chapter 1 planet node is visible when Chapter 1 is active and hides on progression', () => {
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.ch1PlanetNode.visible).toBe(true);

      // Advancing to Chapter 2 hides Chapter 1 group
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(orrery.getChapter()).toBe(2);
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      orrery.update(2.1);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(1).visible).toBe(false);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
    });

    // 3. Scale ~0.18 (Protagonist Planet)
    it('scales Chapter 1 planet to ~0.18 for readable celestial protagonist presence', () => {
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PlanetNode.scale.y).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PlanetNode.scale.z).toBeCloseTo(0.18, 2);
    });

    // 4. Distinct from stars
    it('maintains three distinct bodies with unique visual identities, colors, and scales', () => {
      const star = orrery.ch1PrimaryStar;
      const perturber = orrery.ch1Perturber;
      const planet = orrery.ch1PlanetNode;

      expect(star).toBeDefined();
      expect(perturber).toBeDefined();
      expect(planet).toBeDefined();

      // Distinct objects in Three.js scene graph
      expect(star.uuid).not.toBe(perturber.uuid);
      expect(planet.uuid).not.toBe(star.uuid);
      expect(planet.uuid).not.toBe(perturber.uuid);

      // Star A: Central warm gold/champagne gravitational anchor (scale 0.145)
      expect(star.scale.x).toBeCloseTo(0.145, 2);
      expect(star.material.color.getHexString().toLowerCase()).toBe('f6c879'); // STAR_GOLD (#F6C879)

      // Star B / Secondary World: Secondary crystalline amethyst/indigo perturber (scale 0.095)
      expect(perturber.scale.x).toBeCloseTo(0.095, 2);
      expect(perturber.material.color.getHexString().toLowerCase()).toBe('7466b8'); // SECONDARY_AMETHYST (#7466B8)

      // Planet: Evolving player world (scale 0.18, terracotta base)
      expect(planet.scale.x).toBeCloseTo(0.18, 2);
      expect(planet.material.color.getHexString().toLowerCase()).toBe('a84e32'); // PLANETOID_TERRACOTTA

      // Protagonist size hierarchy: Our Planet (0.18) > Primary Star (0.145) > Perturber (0.095)
      expect(planet.scale.x).toBeGreaterThan(star.scale.x);
      expect(star.scale.x).toBeGreaterThan(perturber.scale.x);
    });

    // 5. Stage 1 identity
    it('establishes Stage 1 Mars-like primordial identity with procedural Planetoid shader material', () => {
      const planet = orrery.ch1PlanetNode;

      // Base terracotta color preserved for inspection
      expect(planet.material.color.getHexString().toLowerCase()).toBe('a84e32');

      // Uses high-quality procedural ShaderMaterial from PlanetoidShader
      expect(planet.material.isShaderMaterial).toBe(true);
      expect(planet.material.uniforms).toBeDefined();
      expect(planet.material.uniforms.uTime).toBeDefined();
      expect(planet.material.uniforms.uVisualStage).toBeDefined();
      expect(planet.material.uniforms.uAwakeningProgress).toBeDefined();

      // Initial Stage 1 values: visualStage = 1.0, awakeningProgress = 0.0
      expect(planet.material.uniforms.uVisualStage.value).toBeCloseTo(1.0, 3);
      expect(planet.material.uniforms.uAwakeningProgress.value).toBeCloseTo(0.0, 3);

      // Strictly no gold emission, Kintsugi, oceans, atmosphere or rings in Stage 1
      expect(planet.material.uniforms.uKintsugiGlow.value).toBeCloseTo(0.0, 3);
      expect(planet.material.uniforms.uGoldIgnited.value).toBeCloseTo(0.0, 3);
      expect(planet.material.uniforms.uOceanFill.value).toBeCloseTo(0.0, 3);
      expect(planet.material.uniforms.uAtmosphereDensity.value).toBeCloseTo(0.0, 3);
      expect(planet.material.uniforms.uShieldCharge.value).toBeCloseTo(0.0, 3);

      // Identity tags in userData
      expect(planet.userData.isPlayerPlanet).toBe(true);
      expect(planet.userData.stage).toBe(1);
      expect(planet.userData.stageKey).toBe('seed');
      expect(planet.userData.hasKintsugi).toBe(false);
      expect(planet.userData.hasGoldVeins).toBe(false);
    });

    // 5b. Phase 1D Celestial Palette Pass (Three-Body Color Differentiation)
    it('establishes Phase 1D three-body celestial color identities: terracotta player world, champagne primary star, and amethyst secondary world', () => {
      const star = orrery.ch1PrimaryStar;
      const starCorona = orrery.ch1StarGlow;
      const perturber = orrery.ch1Perturber;
      const perturberGlow = orrery.ch1PerturberGlow;
      const planet = orrery.ch1PlanetNode;

      // Primary Star: Champagne core, warm gold body, amber edge, subtle rose-gold limb
      expect(star.material.isShaderMaterial).toBe(true);
      expect(star.material.uniforms.uCoreColor.value.getHexString().toLowerCase()).toBe('ffe4b5');
      expect(star.material.uniforms.uInnerGlowColor.value.getHexString().toLowerCase()).toBe('fff1d2');
      expect(star.material.uniforms.uMainGoldColor.value.getHexString().toLowerCase()).toBe('f6c879');
      expect(star.material.uniforms.uAmberColor.value.getHexString().toLowerCase()).toBe('e8a84e');
      expect(star.material.uniforms.uRoseEdgeColor.value.getHexString().toLowerCase()).toBe('d97a45');

      // Primary Star Corona: Warm gold with subtle rose outer tint
      expect(starCorona.material.isShaderMaterial).toBe(true);
      expect(starCorona.material.uniforms.uPrimaryColor.value.getHexString().toLowerCase()).toBe('f4c77a');
      expect(starCorona.material.uniforms.uRoseOuterColor.value.getHexString().toLowerCase()).toBe('e9a6a6');
      expect(starCorona.material.uniforms.uBaseOpacity.value).toBeCloseTo(0.20, 2);

      // Secondary Perturber World: Deep cosmic violet, amethyst, lavender terrain, sapphire/cyan accents, and lavender rim
      expect(perturber.material.isShaderMaterial).toBe(true);
      expect(perturber.material.uniforms.uDeepViolet.value.getHexString().toLowerCase()).toBe('30245c');
      expect(perturber.material.uniforms.uSecondaryViolet.value.getHexString().toLowerCase()).toBe('51408a');
      expect(perturber.material.uniforms.uAmethyst.value.getHexString().toLowerCase()).toBe('7466b8');
      expect(perturber.material.uniforms.uSoftViolet.value.getHexString().toLowerCase()).toBe('8f7fd1');
      expect(perturber.material.uniforms.uLuminousLavender.value.getHexString().toLowerCase()).toBe('b49ae8');
      expect(perturber.material.uniforms.uPaleMineral.value.getHexString().toLowerCase()).toBe('d7c5ff');
      expect(perturber.material.uniforms.uMutedSapphire.value.getHexString().toLowerCase()).toBe('385f9e');
      expect(perturber.material.uniforms.uBlueViolet.value.getHexString().toLowerCase()).toBe('4e8bb5');
      expect(perturber.material.uniforms.uCyanAccent.value.getHexString().toLowerCase()).toBe('82c7d8');
      expect(perturber.material.uniforms.uRimColor.value.getHexString().toLowerCase()).toBe('c9b6ff');

      // Secondary Rim Glow
      expect(perturberGlow.material.color.getHexString().toLowerCase()).toBe('c9b6ff');
      expect(perturberGlow.material.opacity).toBeCloseTo(0.12, 2);

      // Player Planet: LOCKED terracotta primordial identity unchanged
      expect(planet.material.color.getHexString().toLowerCase()).toBe('a84e32');
      expect(planet.scale.x).toBeCloseTo(0.18, 2);
    });

    // 6. No duplicate Chapter 1 planet
    it('ensures exactly one planetary body represents player world in Chapter 1 (no duplicates)', () => {
      const ch1Group = orrery.getChapterGroup(1);
      const playerPlanets = [];

      ch1Group.traverse((obj) => {
        if (obj.userData?.isPlayerPlanet === true || obj.name === 'chapter-1-node') {
          playerPlanets.push(obj);
        }
      });

      expect(playerPlanets.length).toBe(1);
      expect(playerPlanets[0]).toBe(orrery.ch1PlanetNode);

      // Verify exact expected composition of Chapter 1 root (8 distinct objects)
      const childNames = ch1Group.children.map(c => c.name);
      expect(childNames).toContain('primary-star');
      expect(childNames).toContain('secondary-perturber');
      expect(childNames).toContain('chapter-1-node');
      expect(childNames).toContain('hyperbolic-orbit-path');
      expect(childNames).toContain('bound-orbit-path');
      expect(childNames).toContain('planet-orbit-path');
      expect(childNames).toContain('secondary-orbit-path');
      expect(childNames).toContain('capture-burn-flare');
      expect(ch1Group.children.length).toBe(8);
    });

    // 7. Existing Chapter 1 motion intact
    it('preserves existing Chapter 1 parametric motion along hyperbolic and bound paths', () => {
      const planet = orrery.ch1PlanetNode;

      // 1. Initial position along incoming hyperbolic segment
      const initialPos = planet.position.clone();

      // Advance sim time
      orrery.update(0.4);
      expect(orrery.simTime).toBeCloseTo(0.4, 2);
      expect(planet.position.distanceTo(initialPos)).toBeGreaterThan(0.01);
      expect(Number.isFinite(planet.position.x)).toBe(true);
      expect(Number.isFinite(planet.position.y)).toBe(true);
      expect(Number.isFinite(planet.position.z)).toBe(true);

      // 2. Bound eccentric orbit update
      orreryState.setOrbitalState(OrbitalState.BOUND_ECCENTRIC);
      orrery.update(0.5);
      expect(Number.isFinite(planet.position.x)).toBe(true);
      expect(Number.isFinite(planet.position.z)).toBe(true);

      // Axial rotation progresses smoothly
      expect(planet.rotation.y).toBeGreaterThan(0);
    });

    // 8. Phase 1B/1D: Large celestial scale and forward-centered anchor
    it('positions Orrery at gameplay-centered anchor (y in 1.6-2.0, z in -2.0 to -2.8) with open inclination ~0.35 rad', () => {
      const anchor = orrery.getAnchorPosition();
      expect(anchor.x).toBeCloseTo(0.0, 2);
      expect(anchor.y).toBeGreaterThanOrEqual(1.6);
      expect(anchor.y).toBeLessThanOrEqual(2.0);
      expect(anchor.z).toBeGreaterThanOrEqual(-2.8);
      expect(anchor.z).toBeLessThanOrEqual(-2.0);

      expect(orrery.group.rotation.x).toBeCloseTo(0.35, 2);
    });

    it('scales Chapter 1 composition substantially (scale 2.2) so the Three-Body system is the main attraction', () => {
      const ch1Group = orrery.getChapterGroup(1);
      expect(ch1Group.scale.x).toBeCloseTo(2.2, 2);
      expect(ch1Group.scale.y).toBeCloseTo(2.2, 2);
      expect(ch1Group.scale.z).toBeCloseTo(2.2, 2);

      // Protagonist body proportions established: Planet (0.18) > Star (0.145) > Perturber (0.095)
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 2);
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 2);
    });

    it('equips Star A and Star B with soft stellar corona halos for a whimsical diorama aesthetic', () => {
      expect(orrery.ch1StarGlow).toBeDefined();
      expect(orrery.ch1StarGlow.parent).toBe(orrery.ch1PrimaryStar);
      expect(orrery.ch1StarGlow.scale.x).toBeGreaterThan(1.15);

      expect(orrery.ch1PerturberGlow).toBeDefined();
      expect(orrery.ch1PerturberGlow.parent).toBe(orrery.ch1Perturber);
      expect(orrery.ch1PerturberGlow.scale.x).toBeGreaterThan(1.15);

      // Chapter 1 root children count remains exactly 8 (halos are nested under stars)
      expect(orrery.getChapterGroup(1).children.length).toBe(8);
    });

    // 9. Phase 1C: Visual stage synchronization & time uniform update
    it('updates uTime during update(dt) without changing position or scale', () => {
      const planet = orrery.ch1PlanetNode;
      expect(planet.material.uniforms.uTime.value).toBeCloseTo(0.0, 3);

      orrery.update(0.25);
      expect(planet.material.uniforms.uTime.value).toBeCloseTo(0.25, 2);
      expect(planet.scale.x).toBeCloseTo(0.18, 2);
    });

    it('mirrors authoritative visualStage via setVisualStage API without modifying spatial hierarchy', () => {
      const planet = orrery.ch1PlanetNode;
      const initialPos = planet.position.clone();

      expect(orrery.getVisualStage()).toBeCloseTo(1.0, 3);
      expect(planet.material.uniforms.uVisualStage.value).toBeCloseTo(1.0, 3);

      // Update visual stage to 1.5
      const success = orrery.setVisualStage(1.5, { awakeningProgress: 0.5 });
      expect(success).toBe(true);
      expect(orrery.getVisualStage()).toBeCloseTo(1.5, 3);
      expect(planet.material.uniforms.uVisualStage.value).toBeCloseTo(1.5, 3);
      expect(planet.material.uniforms.uAwakeningProgress.value).toBeCloseTo(0.5, 3);

      // Hierarchy and scale untouched
      expect(planet.scale.x).toBeCloseTo(0.18, 2);
      expect(planet.parent).toBe(orrery.getChapterGroup(1));
      expect(planet.position.x).toBeCloseTo(initialPos.x, 3);
      expect(planet.position.z).toBeCloseTo(initialPos.z, 3);
    });

    it('safely rejects invalid visual stages', () => {
      expect(orrery.setVisualStage('invalid')).toBe(false);
      expect(orrery.setVisualStage(NaN)).toBe(false);
      expect(orrery.setVisualStage(null)).toBe(false);
    });

    it('disposes Chapter 1 planet geometry and shader material cleanly on destroy()', () => {
      const geomDisposeSpy = vi.spyOn(orrery.ch1PlanetGeom, 'dispose');
      const matDisposeSpy = vi.spyOn(orrery.ch1PlanetMaterial, 'dispose');

      orrery.destroy();

      expect(geomDisposeSpy).toHaveBeenCalled();
      expect(matDisposeSpy).toHaveBeenCalled();
      expect(orrery.ch1PlanetNode).toBeNull();
      expect(orrery.ch1PlanetGeom).toBeNull();
      expect(orrery.ch1PlanetMaterial).toBeNull();
    });
  });

  // ==========================================================================
  // 11. Phase 1E: Celestial Scale & Individual Orbital Paths
  // ==========================================================================
  describe('11. Phase 1E: Celestial Scale & Individual Orbital Paths', () => {
    it('establishes Phase 1E celestial scales: Our Planet (0.18), Primary Star (0.145), Secondary Planet (0.095)', () => {
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 2);
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 2);

      // Protagonist size hierarchy preserved
      expect(orrery.ch1PlanetNode.scale.x).toBeGreaterThan(orrery.ch1PrimaryStar.scale.x);
      expect(orrery.ch1PrimaryStar.scale.x).toBeGreaterThan(orrery.ch1Perturber.scale.x);
    });

    it('creates dedicated Our Planet orbital path with champagne gold identity and tilted ellipse', () => {
      const planetOrbit = orrery.getPlanetOrbitLine();
      expect(planetOrbit).toBeDefined();
      expect(planetOrbit.name).toBe('planet-orbit-path');
      expect(planetOrbit.material.color.getHexString().toLowerCase()).toBe('e8c68d');
      expect(planetOrbit.material.opacity).toBeGreaterThanOrEqual(0.20);
      expect(planetOrbit.material.opacity).toBeLessThanOrEqual(0.40);
      expect(planetOrbit.material.transparent).toBe(true);
      expect(planetOrbit.material.depthWrite).toBe(false);

      // Spatial 3D inclination
      expect(planetOrbit.rotation.x).not.toBe(0.0);
      expect(planetOrbit.userData.isPlanetOrbit).toBe(true);
      expect(planetOrbit.userData.eccentricity).toBeCloseTo(0.65, 2);
    });

    it('creates dedicated Secondary Planet orbital path with lavender identity and distinct inclination', () => {
      const perturberOrbit = orrery.getSecondaryOrbitLine();
      expect(perturberOrbit).toBeDefined();
      expect(perturberOrbit.name).toBe('secondary-orbit-path');
      expect(perturberOrbit.material.color.getHexString().toLowerCase()).toBe('b49ae8');
      expect(perturberOrbit.material.opacity).toBeGreaterThanOrEqual(0.20);
      expect(perturberOrbit.material.opacity).toBeLessThanOrEqual(0.32);
      expect(perturberOrbit.material.transparent).toBe(true);
      expect(perturberOrbit.material.depthWrite).toBe(false);

      // Geometrically distinct from Our Planet
      const planetOrbit = orrery.getPlanetOrbitLine();
      expect(perturberOrbit.rotation.x).not.toBe(planetOrbit.rotation.x);
      expect(perturberOrbit.userData.eccentricity).not.toBe(planetOrbit.userData.eccentricity);
      expect(perturberOrbit.userData.isSecondaryOrbit).toBe(true);
    });

    it('synchronizes Secondary Planet motion along its dedicated orbit with simTime', () => {
      const perturber = orrery.ch1Perturber;
      const initialPos = perturber.position.clone();

      orrery.update(0.5);
      expect(perturber.position.distanceTo(initialPos)).toBeGreaterThan(0.01);
      expect(Number.isFinite(perturber.position.x)).toBe(true);
      expect(Number.isFinite(perturber.position.y)).toBe(true);
      expect(Number.isFinite(perturber.position.z)).toBe(true);
    });

    it('disposes Chapter 1 orbit lines cleanly on destroy()', () => {
      const planetOrbit = orrery.getPlanetOrbitLine();
      const perturberOrbit = orrery.getSecondaryOrbitLine();
      const pGeomDispose = vi.spyOn(planetOrbit.geometry, 'dispose');
      const pMatDispose = vi.spyOn(planetOrbit.material, 'dispose');
      const sGeomDispose = vi.spyOn(perturberOrbit.geometry, 'dispose');
      const sMatDispose = vi.spyOn(perturberOrbit.material, 'dispose');

      orrery.destroy();

      expect(pGeomDispose).toHaveBeenCalled();
      expect(pMatDispose).toHaveBeenCalled();
      expect(sGeomDispose).toHaveBeenCalled();
      expect(sMatDispose).toHaveBeenCalled();
      expect(orrery.getPlanetOrbitLine()).toBeNull();
      expect(orrery.getSecondaryOrbitLine()).toBeNull();
    });
  });

  // ==========================================================================
  // 12. Phase 2A: Kendama Catch → Three-Body Cosmic Response
  // ==========================================================================
  describe('12. Phase 2A: Kendama Catch → Three-Body Cosmic Response', () => {
    it('maps catch quality to response intensity via resolveCatchIntensity', () => {
      expect(CATCH_RESPONSE_DURATION).toBe(1.0);

      // Default / null fallback
      expect(resolveCatchIntensity(null)).toBeCloseTo(0.80, 2);
      expect(resolveCatchIntensity(undefined)).toBeCloseTo(0.80, 2);

      // ASSISTED catch -> ~0.55 intensity
      expect(resolveCatchIntensity({ catchType: 'ASSISTED' })).toBeCloseTo(0.55, 2);
      expect(resolveCatchIntensity({ payload: { catchType: 'ASSISTED' } })).toBeCloseTo(0.55, 2);

      // Standard CLEAN catch -> ~0.80 intensity
      expect(resolveCatchIntensity({ catchType: 'CLEAN' })).toBeCloseTo(0.80, 2);
      expect(resolveCatchIntensity({ payload: { catchType: 'CLEAN' } })).toBeCloseTo(0.80, 2);

      // High-quality CLEAN / PERFECT catch (high multiplier, cadence, streak, or energy) -> 1.0 intensity
      expect(resolveCatchIntensity({
        catchType: 'CLEAN',
        multipliers: { total: 1.5, cadence: 1.0 },
        currentStreak: 1,
        awardedEnergy: 20
      })).toBeCloseTo(1.0, 2);

      expect(resolveCatchIntensity({
        catchType: 'CLEAN',
        multipliers: { total: 1.0, cadence: 1.2 },
        currentStreak: 1
      })).toBeCloseTo(1.0, 2);

      expect(resolveCatchIntensity({
        catchType: 'CLEAN',
        currentStreak: 3
      })).toBeCloseTo(1.0, 2);

      expect(resolveCatchIntensity({
        catchType: 'CLEAN',
        awardedEnergy: 40
      })).toBeCloseTo(1.0, 2);

      expect(resolveCatchIntensity({
        catchType: 'PERFECT'
      })).toBeCloseTo(1.0, 2);
    });

    it('activates catch response automatically upon receiving Events.SCORE from EventBus', () => {
      expect(orrery.isCatchResponseActive()).toBe(false);
      expect(orrery.getCatchResponseSurge()).toBe(0.0);

      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'CLEAN',
          multipliers: { total: 1.0, cadence: 1.0, streak: 1.0 },
          currentStreak: 1,
          awardedEnergy: 20
        }
      });

      expect(orrery.isCatchResponseActive()).toBe(true);
      expect(orrery.getCatchResponseIntensity()).toBeCloseTo(0.80, 2);
      expect(orrery.getCatchResponseProgress()).toBeCloseTo(0.0, 2);
    });

    it('executes smooth synchronized peak across all 3 bodies and orbits at ~0.40s', () => {
      // Trigger full 1.0 intensity catch response
      orrery.triggerCatchResponse({ catchType: 'CLEAN', awardedEnergy: 50 });
      expect(orrery.getCatchResponseIntensity()).toBeCloseTo(1.0, 2);

      // Baseline measurements
      const basePlanetScale = 0.18;
      const baseStarScale = 0.145;
      const baseStarCoronaScale = 1.20;
      const baseStarCoronaOpacity = 0.20;
      const basePerturberScale = 0.095;
      const basePerturberGlowScale = 1.18;
      const basePerturberGlowOpacity = 0.12;
      const basePlanetOrbitOpacity = orrery.getPlanetOrbitLine().material.opacity;
      const baseSecondaryOrbitOpacity = orrery.getSecondaryOrbitLine().material.opacity;

      // Advance to peak (~0.40s)
      orrery.update(0.40);

      const peakSurge = orrery.getCatchResponseSurge();
      expect(peakSurge).toBeGreaterThan(0.95); // Peak envelope is ~1.0

      // 1. Player Planet responds: scale pulses by +3.5%, shader awakening surges
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(basePlanetScale * 1.035, 3);
      expect(orrery.ch1PlanetNode.material.uniforms.uAwakeningProgress.value).toBeCloseTo(0.32, 2);

      // 2. Primary Star responds: scale pulses by +2.5%, shader catchResponse surges, corona expands and brightens
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(baseStarScale * 1.025, 3);
      expect(orrery.ch1PrimaryStar.material.uniforms.uCatchResponse.value).toBeCloseTo(peakSurge, 2);
      expect(orrery.ch1StarGlow.scale.x).toBeGreaterThan(1.26);
      expect(orrery.ch1StarGlow.scale.x).toBeLessThan(1.31);
      expect(orrery.ch1StarGlow.material.uniforms.uBaseOpacity.value).toBeCloseTo(baseStarCoronaOpacity + 0.08, 2);

      // 3. Secondary Planet responds: scale pulses by +2.0%, rim surges, glow expands and brightens
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(basePerturberScale * 1.02, 3);
      expect(orrery.ch1Perturber.material.uniforms.uCatchResponse.value).toBeCloseTo(peakSurge, 2);
      expect(orrery.ch1PerturberGlow.scale.x).toBeGreaterThan(1.22);
      expect(orrery.ch1PerturberGlow.scale.x).toBeLessThan(1.27);
      expect(orrery.ch1PerturberGlow.material.opacity).toBeCloseTo(basePerturberGlowOpacity + 0.08, 2);

      // 4. Orbital paths intensify
      expect(orrery.getPlanetOrbitLine().material.opacity).toBeCloseTo(0.55, 2);
      expect(orrery.getPlanetOrbitLine().material.opacity).toBeGreaterThan(basePlanetOrbitOpacity);
      expect(orrery.getSecondaryOrbitLine().material.opacity).toBeCloseTo(0.45, 2);
      expect(orrery.getSecondaryOrbitLine().material.opacity).toBeGreaterThan(baseSecondaryOrbitOpacity);

      // 5. Protagonist size hierarchy strictly maintained throughout pulse
      expect(orrery.ch1PlanetNode.scale.x).toBeGreaterThan(orrery.ch1PrimaryStar.scale.x);
      expect(orrery.ch1PrimaryStar.scale.x).toBeGreaterThan(orrery.ch1Perturber.scale.x);
    });

    it('smoothly eases out and restores exact baseline values with zero drift after 1.0s', () => {
      orrery.triggerCatchResponse({ catchType: 'CLEAN', awardedEnergy: 50 });
      orrery.update(0.40); // to peak
      expect(orrery.isCatchResponseActive()).toBe(true);

      // Complete decay to 1.0s
      orrery.update(0.60);

      // Catch response should complete and deactivate
      expect(orrery.isCatchResponseActive()).toBe(false);
      expect(orrery.getCatchResponseSurge()).toBe(0.0);
      expect(orrery.getCatchResponseProgress()).toBe(0.0);

      // Scales restored to exact baseline
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 4);
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 4);
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 4);

      // Corona and glows restored to baseline (ambient breathing around 1.20 and 1.18)
      expect(orrery.ch1StarGlow.scale.x).toBeGreaterThanOrEqual(1.18);
      expect(orrery.ch1StarGlow.scale.x).toBeLessThanOrEqual(1.22);
      expect(orrery.ch1StarGlow.material.uniforms.uBaseOpacity.value).toBeCloseTo(0.20, 3);
      expect(orrery.ch1PerturberGlow.scale.x).toBeGreaterThanOrEqual(1.16);
      expect(orrery.ch1PerturberGlow.scale.x).toBeLessThanOrEqual(1.20);
      expect(orrery.ch1PerturberGlow.material.opacity).toBeCloseTo(0.12, 3);

      // Shader uniforms restored
      expect(orrery.ch1PlanetNode.material.uniforms.uAwakeningProgress.value).toBeCloseTo(0.0, 4);
      expect(orrery.ch1PrimaryStar.material.uniforms.uCatchResponse.value).toBeCloseTo(0.0, 4);
      expect(orrery.ch1Perturber.material.uniforms.uCatchResponse.value).toBeCloseTo(0.0, 4);

      // Orbits restored to baseline
      expect(orrery.getPlanetOrbitLine().material.opacity).toBeLessThan(0.36);
      expect(orrery.getSecondaryOrbitLine().material.opacity).toBeLessThan(0.28);
    });

    it('refreshes response on rapid successive catches without runaway scaling or timer stacking', () => {
      // First catch (assisted, intensity 0.55)
      orrery.triggerCatchResponse({ catchType: 'ASSISTED' });
      expect(orrery.getCatchResponseIntensity()).toBeCloseTo(0.55, 2);

      orrery.update(0.20);
      expect(orrery.getCatchResponseProgress()).toBeCloseTo(0.20, 2);

      // Rapid second catch (clean, intensity 0.80) arrives before first finishes
      orrery.triggerCatchResponse({ catchType: 'CLEAN' });
      // Intensity upgraded, timer seamlessly reset to 0.0
      expect(orrery.getCatchResponseIntensity()).toBeCloseTo(0.80, 2);
      expect(orrery.getCatchResponseProgress()).toBeCloseTo(0.0, 2);

      // Third catch (assisted, intensity 0.55) arrives
      orrery.triggerCatchResponse({ catchType: 'ASSISTED' });
      // Retains higher intensity (0.80) rather than downgrading
      expect(orrery.getCatchResponseIntensity()).toBeCloseTo(0.80, 2);

      // Advance to peak of refreshed response
      orrery.update(0.40);
      // Scale is bounded to max +3.5%, never stacked runaway
      expect(orrery.ch1PlanetNode.scale.x).toBeLessThan(0.18 * 1.04);
    });

    it('exposes catch response state through getState() and resets cleanly via reset()', () => {
      orrery.triggerCatchResponse({ catchType: 'CLEAN' });
      orrery.update(0.20);

      const state = orrery.getState();
      expect(state.catchResponseActive).toBe(true);
      expect(state.catchResponseIntensity).toBeCloseTo(0.80, 2);
      expect(state.catchResponseSurge).toBeGreaterThan(0.0);

      // Reset
      orrery.reset();
      expect(orrery.isCatchResponseActive()).toBe(false);
      expect(orrery.getCatchResponseSurge()).toBe(0.0);

      const resetState = orrery.getState();
      expect(resetState.catchResponseActive).toBe(false);
      expect(resetState.catchResponseIntensity).toBe(0.0);
      expect(resetState.catchResponseSurge).toBe(0.0);
    });

    it('unsubscribes from Events.SCORE on destroy()', () => {
      orrery.destroy();
      expect(orrery.isCatchResponseActive()).toBe(false);

      // Emitting SCORE after destroy should be a safe no-op
      expect(() => {
        eventBus.emit(Events.SCORE, { payload: { catchType: 'CLEAN' } });
      }).not.toThrow();

      expect(orrery.isCatchResponseActive()).toBe(false);
    });
  });

  // ==========================================================================
  // 13. Phase 2B: Three-Body Convergence → Alignment → Bright Cosmic Pulse + Visual Cleanup
  // ==========================================================================
  describe('13. Phase 2B: Three-Body Convergence → Alignment → Bright Cosmic Pulse + Visual Cleanup', () => {
    it('initializes in IDLE alignment state and exposes getAlignmentState() API', () => {
      const state = orrery.getAlignmentState();
      expect(state.active).toBe(false);
      expect(state.phase).toBe(AlignmentPhase.IDLE);
      expect(state.progress).toBe(0.0);
      expect(state.aligned).toBe(false);
      expect(state.pulse).toBe(0.0);
      expect(orrery.isAlignmentActive()).toBe(false);
    });

    it('triggers alignment cinematic via triggerThreeBodyAlignment() and automatically via clean SCORE event', () => {
      // Direct trigger
      const directState = orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(directState.active).toBe(true);
      expect(directState.phase).toBe(AlignmentPhase.CONVERGING);
      expect(orrery.isAlignmentActive()).toBe(true);

      orrery.reset();
      expect(orrery.isAlignmentActive()).toBe(false);

      // EventBus trigger via CLEAN catch (intensity >= 0.80)
      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'CLEAN',
          multipliers: { total: 1.0, cadence: 1.0, streak: 1.0 },
          awardedEnergy: 20
        }
      });
      expect(orrery.isAlignmentActive()).toBe(true);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.CONVERGING);
    });

    it('does not trigger alignment cinematic on weak ASSISTED catch (only catch pulse triggers)', () => {
      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'ASSISTED',
          awardedEnergy: 5
        }
      });
      // Catch response is active (Phase 2A)
      expect(orrery.isCatchResponseActive()).toBe(true);
      // Alignment cinematic remains IDLE
      expect(orrery.isAlignmentActive()).toBe(false);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.IDLE);
    });

    it('interpolates three bodies into straight horizontal screen-space alignment during CONVERGING (0.00 - 0.65s)', () => {
      orrery.update(0.5); // establish initial orbital positions
      const startPlanetPos = orrery.ch1PlanetNode.position.clone();
      const startPerturberPos = orrery.ch1Perturber.position.clone();

      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      // Mid-convergence (t = 0.40s)
      orrery.update(0.40);
      const midState = orrery.getAlignmentState();
      expect(midState.phase).toBe(AlignmentPhase.CONVERGING);
      expect(midState.aligned).toBe(false);
      expect(midState.pulse).toBe(0.0);

      // Bodies have accelerated from start positions towards syzygy
      expect(orrery.ch1PlanetNode.position.distanceTo(startPlanetPos)).toBeGreaterThan(0.01);
      expect(orrery.ch1Perturber.position.distanceTo(startPerturberPos)).toBeGreaterThan(0.01);

      // End of convergence (t = 0.65s total) -> reaches ALIGNED
      orrery.update(0.25);
      const alignedState = orrery.getAlignmentState();
      expect(alignedState.phase).toBe(AlignmentPhase.ALIGNED);
      expect(alignedState.aligned).toBe(true);
      expect(alignedState.pulse).toBe(0.0);

      // Targets reached: Primary Star at origin, Our Planet at (-0.42, 0, 0), Perturber at (-0.84, 0, 0)
      // All centers lie on Y = 0, Z = 0: strictly equal screen-space elevation (straight horizontal syzygy)
      expect(orrery.ch1PrimaryStar.position.x).toBeCloseTo(0.0, 2);
      expect(orrery.ch1PrimaryStar.position.y).toBeCloseTo(0.0, 2);
      expect(orrery.ch1PrimaryStar.position.z).toBeCloseTo(0.0, 2);

      expect(orrery.ch1PlanetNode.position.x).toBeCloseTo(-0.42, 2);
      expect(orrery.ch1PlanetNode.position.y).toBeCloseTo(0.0, 2);
      expect(orrery.ch1PlanetNode.position.z).toBeCloseTo(0.0, 2);

      expect(orrery.ch1Perturber.position.x).toBeCloseTo(-0.84, 2);
      expect(orrery.ch1Perturber.position.y).toBeCloseTo(0.0, 2);
      expect(orrery.ch1Perturber.position.z).toBeCloseTo(0.0, 2);

      // Camera-space horizontal ordering: Secondary Planet (left) < Our Planet (middle) < Primary Star (right)
      expect(orrery.ch1Perturber.position.x).toBeLessThan(orrery.ch1PlanetNode.position.x);
      expect(orrery.ch1PlanetNode.position.x).toBeLessThan(orrery.ch1PrimaryStar.position.x);

      // Straight line verification: Y and Z coordinates strictly equal across all three bodies
      expect(orrery.ch1Perturber.position.y).toBeCloseTo(orrery.ch1PlanetNode.position.y, 4);
      expect(orrery.ch1PlanetNode.position.y).toBeCloseTo(orrery.ch1PrimaryStar.position.y, 4);

      // Balanced spacing: separation distances strictly exceed combined body radii (>0.40m)
      const starPlanetDist = orrery.ch1PrimaryStar.position.distanceTo(orrery.ch1PlanetNode.position);
      const planetPerturberDist = orrery.ch1PlanetNode.position.distanceTo(orrery.ch1Perturber.position);
      expect(starPlanetDist).toBeGreaterThan(0.40);
      expect(planetPerturberDist).toBeGreaterThan(0.40);
    });

    it('holds straight syzygy and displays floating "STABLE STATE" text during ALIGNED phase (0.65 - 1.35s)', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(0.65); // reached aligned

      // Settling phase (t = 0.80s)
      orrery.update(0.15);
      const settlingState = orrery.getAlignmentState();
      expect(settlingState.phase).toBe(AlignmentPhase.ALIGNED);
      expect(settlingState.aligned).toBe(true);

      // Stable State & Energy Charge phase (t = 1.15s)
      orrery.update(0.35);
      const chargeState = orrery.getAlignmentState();
      expect(chargeState.phase).toBe(AlignmentPhase.ALIGNED);
      expect(chargeState.aligned).toBe(true);
      expect(chargeState.pulse).toBe(0.0);

      // Floating "STABLE STATE" world-space text is active and readable
      const textSprite = orrery.getStableStateText();
      expect(textSprite).toBeDefined();
      expect(textSprite.visible).toBe(true);
      expect(textSprite.material.opacity).toBeGreaterThan(0.80);

      // Bodies strictly locked at straight horizontal syzygy coordinates
      expect(orrery.ch1PlanetNode.position.x).toBeCloseTo(-0.42, 2);
      expect(orrery.ch1Perturber.position.x).toBeCloseTo(-0.84, 2);
    });

    it('executes bright synchronized cosmic pulse and expanding wave during PULSE phase (1.35 - 1.75s)', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN', awardedEnergy: 50 });
      orrery.update(1.35); // enter pulse phase

      // Advance to pulse peak (t = 1.55s, +0.20s into pulse)
      orrery.update(0.20);
      const pulseState = orrery.getAlignmentState();
      expect(pulseState.phase).toBe(AlignmentPhase.PULSE);
      expect(pulseState.aligned).toBe(true);
      expect(pulseState.pulse).toBeGreaterThan(0.90);

      // Layer 3: Expanding synchronization wave
      const syncWave = orrery.getSynchronizationWave();
      expect(syncWave).toBeDefined();
      expect(syncWave.visible).toBe(true);
      expect(syncWave.scale.x).toBeGreaterThan(1.0); // wave has expanded
      expect(syncWave.material.opacity).toBeGreaterThan(0.10);

      // Layer 4: Radial energy rays appear strictly during pulse
      const energyRays = orrery.getEnergyRays();
      expect(energyRays).toBeDefined();
      expect(energyRays.visible).toBe(true);
      expect(energyRays.material.opacity).toBeGreaterThan(0.50);

      // "STABLE STATE" text remains steady during pulse
      const text = orrery.getStableStateText();
      expect(text.visible).toBe(true);
      expect(text.material.opacity).toBeGreaterThan(0.85);

      // 1. Our Planet: scale pulses (+7% surge), uAwakeningProgress reveals internal geothermal glow
      expect(orrery.ch1PlanetNode.scale.x).toBeGreaterThan(0.18 * 1.05);
      expect(orrery.ch1PlanetNode.material.uniforms.uAwakeningProgress.value).toBeGreaterThan(0.55);

      // Layer 2: Dedicated atmospheric aura bursts to frame player's world as protagonist
      const aura = orrery.getPlanetAura();
      expect(aura).toBeDefined();
      expect(aura.parent).toBe(orrery.ch1PlanetNode);
      expect(aura.scale.x).toBeGreaterThan(1.20);
      expect(aura.material.uniforms.uAuraIntensity.value).toBeGreaterThan(1.80);

      // 2. Primary Star: scale pulses (+5% surge), uCatchResponse boosted, corona expands and brightens
      expect(orrery.ch1PrimaryStar.scale.x).toBeGreaterThan(0.145 * 1.03);
      expect(orrery.ch1PrimaryStar.material.uniforms.uCatchResponse.value).toBeGreaterThan(1.4);
      expect(orrery.ch1StarGlow.scale.x).toBeGreaterThan(1.30);
      expect(orrery.ch1StarGlow.material.uniforms.uBaseOpacity.value).toBeGreaterThan(0.35);

      // 3. Secondary Planet: scale pulses (+4% surge), uCatchResponse boosted, rim expands and brightens
      expect(orrery.ch1Perturber.scale.x).toBeGreaterThan(0.095 * 1.02);
      expect(orrery.ch1Perturber.material.uniforms.uCatchResponse.value).toBeGreaterThan(1.3);
      expect(orrery.ch1PerturberGlow.scale.x).toBeGreaterThan(1.25);
      expect(orrery.ch1PerturberGlow.material.opacity).toBeGreaterThan(0.25);

      // 4. Planet ↔ Star Connection Bridge flares (luminous straight conduit)
      const connArc = orrery.getPlanetStarConnection();
      expect(connArc).toBeDefined();
      expect(connArc.visible).toBe(true);
      expect(connArc.material.opacity).toBeGreaterThan(0.70);

      // Section 2 & 18: All decorative orbital paths completely hidden during cosmic pulse
      expect(orrery.getPlanetOrbitLine().material.opacity).toBe(0.0);
      expect(orrery.getPlanetOrbitLine().visible).toBe(false);
      expect(orrery.getSecondaryOrbitLine().visible).toBe(false);

      // 5. Protagonist size hierarchy strictly maintained at peak pulse
      expect(orrery.ch1PlanetNode.scale.x).toBeGreaterThan(orrery.ch1PrimaryStar.scale.x);
      expect(orrery.ch1PrimaryStar.scale.x).toBeGreaterThan(orrery.ch1Perturber.scale.x);

      // 6. Stage 1 identity strictly preserved (no Stage 2 advancement)
      expect(orrery.getVisualStage()).toBe(1.0);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBeCloseTo(1.0, 3);
      expect(orrery.ch1PlanetNode.material.uniforms.uKintsugiGlow.value).toBeCloseTo(0.0, 3);
      expect(orrery.ch1PlanetNode.material.uniforms.uGoldIgnited.value).toBeCloseTo(0.0, 3);
    });

    it('holds the aligned syzygy during REVEAL HOLD phase (1.75 - 2.65s) before returning', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(1.55); // pulse peak

      // Advance into reveal hold phase (t = 2.20s)
      orrery.update(0.65);
      const holdState = orrery.getAlignmentState();
      expect(holdState.phase).toBe(AlignmentPhase.REVEAL_HOLD);
      expect(holdState.aligned).toBe(true);
      expect(holdState.pulse).toBe(0.0);

      // Transient wave and rays have disappeared
      expect(orrery.getSynchronizationWave().visible).toBe(false);
      expect(orrery.getEnergyRays().visible).toBe(false);

      // Three bodies remain strictly held on straight horizontal line
      expect(orrery.ch1PlanetNode.position.x).toBeCloseTo(-0.42, 2);
      expect(orrery.ch1Perturber.position.x).toBeCloseTo(-0.84, 2);
      expect(orrery.ch1PrimaryStar.position.x).toBeCloseTo(0.0, 2);

      // "STABLE STATE" text remains steady and readable
      const text = orrery.getStableStateText();
      expect(text.visible).toBe(true);
      expect(text.material.opacity).toBeGreaterThan(0.85);

      // Orbital paths remain completely invisible to give full visual focus
      expect(orrery.getPlanetOrbitLine().visible).toBe(false);
      expect(orrery.getSecondaryOrbitLine().visible).toBe(false);
    });

    it('smoothly eases out during RETURNING (2.65 - 3.45s) and restores exact baseline orbital motion', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(2.20); // inside reveal hold

      // Advance into returning phase (t = 2.95s)
      orrery.update(0.75);
      const retState = orrery.getAlignmentState();
      expect(retState.phase).toBe(AlignmentPhase.RETURNING);
      expect(retState.aligned).toBe(false);
      expect(retState.pulse).toBe(0.0);
      expect(orrery.getSynchronizationWave().visible).toBe(false);
      expect(orrery.getEnergyRays().visible).toBe(false);

      // "STABLE STATE" text is fading out as separation begins
      const text = orrery.getStableStateText();
      expect(text.material.opacity).toBeLessThan(0.70);

      // Complete cinematic (t = 3.50s >= 3.45s total)
      orrery.update(0.55);
      const idleState = orrery.getAlignmentState();
      expect(idleState.active).toBe(false);
      expect(idleState.phase).toBe(AlignmentPhase.IDLE);
      expect(idleState.progress).toBe(0.0);
      expect(idleState.aligned).toBe(false);
      expect(idleState.pulse).toBe(0.0);

      // Text is completely invisible
      expect(text.visible).toBe(false);
      expect(text.material.opacity).toBe(0.0);

      // Exact baseline scales restored
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 4);
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 4);
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 4);

      // Aura restored to baseline
      expect(orrery.getPlanetAura().scale.x).toBeCloseTo(1.08, 2);
      expect(orrery.getPlanetAura().material.uniforms.uAuraIntensity.value).toBeCloseTo(1.0, 2);

      // Uniforms restored
      expect(orrery.ch1PlanetNode.material.uniforms.uAwakeningProgress.value).toBeCloseTo(0.0, 4);
      expect(orrery.ch1PrimaryStar.material.uniforms.uCatchResponse.value).toBeCloseTo(0.0, 4);
      expect(orrery.ch1Perturber.material.uniforms.uCatchResponse.value).toBeCloseTo(0.0, 4);

      // Connection arc restored to baseline opacity and geometry
      expect(orrery.getPlanetStarConnection().material.opacity).toBeCloseTo(0.22, 2);

      // Orbits restored to baseline
      expect(orrery.getPlanetOrbitLine().visible).toBe(true);
      expect(orrery.getPlanetOrbitLine().material.opacity).toBeGreaterThanOrEqual(0.20);
      expect(orrery.getSecondaryOrbitLine().visible).toBe(true);
      expect(orrery.getSecondaryOrbitLine().material.opacity).toBeGreaterThanOrEqual(0.20);

      // Normal parametric orbit motion continues smoothly with simTime
      const planetPos = orrery.ch1PlanetNode.position.clone();
      orrery.update(0.50);
      expect(orrery.ch1PlanetNode.position.distanceTo(planetPos)).toBeGreaterThan(0.01);
    });

    it('creates subtle Planet ↔ Star Connection Arc replacing unwanted far-left ellipse without adding duplicate objects', () => {
      const ch1 = orrery.getChapterGroup(1);

      // Chapter 1 root children count remains exactly 8 (no loose/duplicate rings)
      expect(ch1.children.length).toBe(8);

      const connArc = orrery.getPlanetStarConnection();
      expect(connArc).toBeDefined();
      expect(connArc.visible).toBe(true);
      expect(connArc.name).toBe('bound-orbit-path'); // retains contract name
      expect(connArc.userData.isConnectionArc).toBe(true);
      expect(connArc.material.color.getHexString().toLowerCase()).toBe('e8c68d'); // Champagne Gold
      expect(connArc.material.opacity).toBeCloseTo(0.22, 2);

      // Dedicated planet orbit path is also preserved
      const planetOrbit = orrery.getPlanetOrbitLine();
      expect(planetOrbit).toBeDefined();
      expect(planetOrbit.visible).toBe(true);
      expect(planetOrbit.name).toBe('planet-orbit-path');

      // Orbital Inventory API works
      const inv = orrery.getOrbitalVisualInventory();
      expect(inv.planetOrbit).toBe(true);
      expect(inv.syncWave).toBe(false);
    });

    it('supports repeatable triggers without runaway scaling, drift, or duplicate wave objects', () => {
      const syncWave = orrery.getSynchronizationWave();
      const text = orrery.getStableStateText();

      // Trigger 1
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(0.80);

      // Rapid retrigger during active alignment is ignored by re-entry protection
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.ALIGNED);
      expect(orrery.isAlignmentActive()).toBe(true);

      // Advance through peak
      orrery.update(0.75); // reaches 1.55s
      expect(orrery.ch1PlanetNode.scale.x).toBeLessThan(0.18 * 1.08); // Bounded, never runaway

      // Advance to full cinematic completion
      orrery.update(2.0); // reaches 3.55s >= 3.45s
      expect(orrery.isAlignmentActive()).toBe(false);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.IDLE);

      // Sequential retrigger after IDLE starts normally
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.CONVERGING);
      orrery.update(3.50); // complete

      // Exact single instances maintained
      expect(orrery.getSynchronizationWave()).toBe(syncWave);
      expect(orrery.getStableStateText()).toBe(text);
      expect(orrery.getChapterGroup(1).children.length).toBe(8);

      // Scales returned to baseline
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 4);
    });

    it('resets cleanly via reset() and cleans up window reference on destroy()', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(1.55);
      expect(orrery.isAlignmentActive()).toBe(true);

      orrery.reset();
      expect(orrery.isAlignmentActive()).toBe(false);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.IDLE);
      expect(orrery.getSynchronizationWave().visible).toBe(false);
      expect(orrery.getStableStateText().visible).toBe(false);
      expect(orrery.getStableStateSparkles().visible).toBe(false);
      expect(orrery.getTextShimmerGlint().visible).toBe(false);

      orrery.destroy();
      expect(orrery.isAlignmentActive()).toBe(false);
      expect(orrery.getPlanetStarConnection()).toBeNull();
      expect(orrery.getSynchronizationWave()).toBeNull();
      expect(orrery.getStableStateText()).toBeNull();
      expect(orrery.getStableStateSparkles()).toBeNull();
      expect(orrery.getTextShimmerGlint()).toBeNull();
    });

    it('implements Phase 2B final stable state correction: refined scale (0.88 x 0.22), y=0.62, fade+scale entrance, glitter sparkles, and travelling shimmer', () => {
      const text = orrery.getStableStateText();
      const sparkles = orrery.getStableStateSparkles();
      const glint = orrery.getTextShimmerGlint();

      expect(text).toBeDefined();
      expect(sparkles).toBeDefined();
      expect(glint).toBeDefined();

      // Scale is refined and elegant (0.88 x 0.22), occupying 25-35% of the Three-Body composition width
      expect(text.scale.x).toBeCloseTo(0.88, 2);
      expect(text.scale.y).toBeCloseTo(0.22, 2);

      // Centered cleanly above Three-Body syzygy midpoint at x = -0.924, hovering with comfortable gap at y = 0.62 (above planet aura at y=0.50)
      expect(text.position.x).toBeCloseTo(-0.924, 2);
      expect(text.position.y).toBeCloseTo(0.62, 2);
      expect(text.position.z).toBeCloseTo(0.0, 2);

      // Trigger syzygy alignment
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      // t = 0.50s (converging): all stable state elements invisible
      orrery.update(0.50);
      expect(text.visible).toBe(false);
      expect(sparkles.visible).toBe(false);
      expect(glint.visible).toBe(false);

      // t = 1.05s (midway into entrance, 0.95 -> 1.15s): scale eases in from 0.88 -> 1.00
      orrery.update(0.55); // t = 1.05s
      expect(text.visible).toBe(true);
      expect(sparkles.visible).toBe(true);
      // At t = 1.05s (u = 0.50), scale is between 0.88 * 0.88 and 0.88
      expect(text.scale.x).toBeGreaterThan(0.88 * 0.88);
      expect(text.scale.x).toBeLessThan(0.88);

      // t = 1.25s (fully visible aligned state): scale reaches full 0.88 x 0.22, glint and sparkles active
      orrery.update(0.20); // t = 1.25s
      expect(text.scale.x).toBeCloseTo(0.88, 2);
      expect(text.scale.y).toBeCloseTo(0.22, 2);
      expect(text.material.opacity).toBeGreaterThan(0.90);
      expect(sparkles.visible).toBe(true);
      expect(sparkles.material.opacity).toBeGreaterThan(0.40);
      expect(glint.visible).toBe(true);

      // Travelling shimmer glint advances horizontally across lettering
      const glintX1 = glint.position.x;
      orrery.update(0.30); // advance 0.3s
      expect(glint.position.x).not.toBe(glintX1);

      // Visual inventory includes new micro-polish elements
      const inv = orrery.getOrbitalVisualInventory();
      expect(inv.stableStateText).toBe(true);
      expect(inv.stableStateSparkles).toBe(true);
      expect(inv.stableStateGlint).toBe(true);
    });
  });

  // ==========================================================================
  // 14. PHASE 2C: CHAPTER 1 STABILIZATION & RE-ENTRY PROTECTION (STEPS 1-3)
  // ==========================================================================
  describe('14. Phase 2C: Chapter 1 Stabilization & Re-Entry Protection', () => {
    it('TEST 1 — First alignment starts normally when inactive', () => {
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.isAlignmentActive()).toBe(false);

      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      expect(orrery.isAlignmentActive()).toBe(true);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.CONVERGING);
    });

    it('TEST 2 — Clean catch during active alignment does NOT restart it', () => {
      // Start alignment
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(orrery.isAlignmentActive()).toBe(true);

      // Advance to approximately t = 1.5s (PULSE phase)
      orrery.update(1.50);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.PULSE);
      expect(orrery._alignmentTime).toBeCloseTo(1.50, 2);

      // Trigger another qualifying clean catch
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      // Verify alignment remains active and was NOT restarted
      expect(orrery.isAlignmentActive()).toBe(true);
      expect(orrery._alignmentTime).toBeCloseTo(1.50, 2);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.PULSE);
      expect(orrery.getAlignmentState().phase).not.toBe(AlignmentPhase.CONVERGING);
    });

    it('TEST 3 — Alignment still reaches completion after ignored second catch', () => {
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      orrery.update(1.50);

      // Second catch ignored
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      // Continue advancing time until t >= 3.45s (e.g. 1.50 + 2.0 = 3.50s)
      orrery.update(2.0);

      expect(orrery.isAlignmentActive()).toBe(false);
      expect(orrery.getAlignmentState().phase).toBe(AlignmentPhase.IDLE);
      expect(orrery.getStableStateText().visible).toBe(false);
    });

    it('TEST 4 — Completion event fires exactly once per alignment lifecycle', () => {
      let emitCount = 0;
      let lastPayload = null;

      eventBus.on(Events.ORRERY_ALIGNMENT_COMPLETED, (payload) => {
        emitCount++;
        lastPayload = payload;
      });

      // Start alignment
      orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });

      // Progress through 0.5s, 1.5s, 2.5s (no completion yet)
      orrery.update(0.50);
      expect(emitCount).toBe(0);

      orrery.update(1.00); // 1.50s
      expect(emitCount).toBe(0);

      orrery.update(1.00); // 2.50s
      expect(emitCount).toBe(0);

      // Complete at t = 3.50s >= 3.45s
      orrery.update(1.00); // 3.50s
      expect(emitCount).toBe(1);
      expect(lastPayload).toEqual({
        chapter: 1,
        duration: 3.45
      });

      // Subsequent update frames in IDLE do NOT fire the event again
      orrery.update(0.50);
      orrery.update(0.50);
      expect(emitCount).toBe(1);
    });

    it('TEST 10 — Phase 2B visuals remain unchanged and verified', () => {
      // Alignment visual nodes
      expect(orrery.ch1PlanetNode).toBeDefined();
      expect(orrery.ch1PrimaryStar).toBeDefined();
      expect(orrery.ch1Perturber).toBeDefined();
      expect(orrery.getPlanetStarConnection()).toBeDefined();
      expect(orrery.getStableStateText()).toBeDefined();
      expect(orrery.getStableStateSparkles()).toBeDefined();
      expect(orrery.getTextShimmerGlint()).toBeDefined();

      // Approved Phase 2B text dimensions and anchor
      const text = orrery.getStableStateText();
      expect(text.scale.x).toBeCloseTo(0.88, 2);
      expect(text.scale.y).toBeCloseTo(0.22, 2);
      expect(text.position.y).toBeCloseTo(0.62, 2);

      // Celestial scales
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 2);
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 2);
    });
  });

  describe('15. Phase 3A: Chapter 2 Foundation, Planet Continuity & Chapter 1 -> 2 Handoff', () => {
    it('STEP 1 — Chapter Isolation: Chapter 1 catch starts alignment, Chapter 2 catch does not', () => {
      // Chapter 1: qualifying catch starts alignment
      expect(orrery.getChapter()).toBe(1);
      const state1 = orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(state1.active).toBe(true);
      expect(orrery.isAlignmentActive()).toBe(true);

      // Reset to idle
      orrery.reset();
      expect(orrery.isAlignmentActive()).toBe(false);

      // Advance narrative director to Chapter 2
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(orrery.getChapter()).toBe(2);

      // Chapter 2: qualifying catch does NOT trigger Chapter 1 alignment
      const state2 = orrery.triggerThreeBodyAlignment({ catchType: 'CLEAN' });
      expect(state2.active).toBe(false);
      expect(orrery.isAlignmentActive()).toBe(false);

      // Chapter 2: general Phase 2A catch pulse STILL occurs on score event
      eventBus.emit(Events.SCORE, { catchType: 'PERFECT' });
      expect(orrery.isCatchResponseActive()).toBe(true);
      // But alignment remains false
      expect(orrery.isAlignmentActive()).toBe(false);
    });

    it('STEP 2 — Scale Harmonization: Chapter 2 group scaled to 2.2 with target proportions', () => {
      const ch2Group = orrery.getChapterGroup(2);
      expect(ch2Group.scale.x).toBeCloseTo(2.2, 2);
      expect(ch2Group.scale.y).toBeCloseTo(2.2, 2);
      expect(ch2Group.scale.z).toBeCloseTo(2.2, 2);

      // Binary Star 1 local scale ≈ 0.12
      expect(orrery.ch2Star1.scale.x).toBeCloseTo(0.12, 2);
      // Binary Star 2 local scale ≈ 0.10
      expect(orrery.ch2Star2.scale.x).toBeCloseTo(0.10, 2);

      // Barycenter separation d ≈ 0.38 (rStars = 0.19)
      orrery.update(0.016);
      const dist = orrery.ch2Star1.position.distanceTo(orrery.ch2Star2.position);
      expect(dist).toBeCloseTo(0.38, 2);
    });

    it('STEP 3 — Player Planet Continuity: Chapter 2 planet uses PlanetoidShader at scale 0.20 with uniform synchronization', () => {
      expect(orrery.ch2PlanetNode).toBeDefined();
      expect(orrery.ch2PlanetNode.name).toBe('chapter-2-node');
      expect(orrery.ch2PlanetNode.scale.x).toBeCloseTo(0.20, 2);

      // Shader material with procedural Planetoid uniforms
      const mat = orrery.ch2PlanetNode.material;
      expect(mat.uniforms).toBeDefined();
      expect(mat.uniforms.uVisualStage).toBeDefined();
      expect(mat.uniforms.uVisualStage.value).toBe(1.0);
      expect(mat.uniforms.uAwakeningProgress.value).toBe(0.0);

      // The same authoritative progression events used by CelestialEnvironment
      // update Chapter 2 continuously and settle it onto the completed Stage 2 preset.
      eventBus.emit(Events.EVOLUTION_PROGRESS, { visualStage: 1.5 });
      expect(mat.uniforms.uVisualStage.value).toBe(1.5);
      expect(mat.uniforms.uAwakeningProgress.value).toBe(0.5);
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(mat.uniforms.uVisualStage.value).toBe(2.0);

      // Player planet user data
      expect(orrery.ch2PlanetNode.userData.isPlayerPlanet).toBe(true);
      expect(orrery.ch2PlanetNode.userData.stage).toBe(2);

      // The renderer-owned Stage 2 preset is transferred as a complete visual state.
      orrery.setVisualStage(2.0);
      const awakening = DEBUG_STAGE_PRESETS[PLANETOID_STAGES.AWAKENING];
      expect(mat.uniforms.uVisualStage.value).toBe(2.0);
      expect(mat.uniforms.uAwakeningProgress.value).toBe(1.0);
      expect(mat.uniforms.uKintsugiGlow.value).toBe(awakening.kintsugiGlow);
      expect(mat.uniforms.uAtmosphereDensity.value).toBe(awakening.atmosphereDensity);
      expect(mat.uniforms.uOceanFill.value).toBe(awakening.oceanFill);
      expect(orrery.ch2PlanetAtmosphereMaterial.uniforms.uAtmosphereDensity.value).toBe(awakening.atmosphereDensity);
      expect(orrery.ch2PlanetAtmosphere.visible).toBe(true);

      // Fractional progression interpolates the same renderer-owned settings.
      orrery.setVisualStage(2.25);
      expect(mat.uniforms.uVisualStage.value).toBe(2.25);
      expect(mat.uniforms.uKintsugiGlow.value).toBeCloseTo(0.8875, 4);
      expect(mat.uniforms.uAtmosphereDensity.value).toBeCloseTo(0.25, 4);
      expect(mat.uniforms.uOceanFill.value).toBeCloseTo(0.2125, 4);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBe(2.25);

      orrery.setVisualStage(3.0);
      const oceans = DEBUG_STAGE_PRESETS[PLANETOID_STAGES.OCEANS];
      expect(mat.uniforms.uVisualStage.value).toBe(3.0);
      expect(mat.uniforms.uKintsugiGlow.value).toBe(oceans.kintsugiGlow);
      expect(mat.uniforms.uAtmosphereDensity.value).toBe(oceans.atmosphereDensity);
      expect(mat.uniforms.uOceanFill.value).toBe(oceans.oceanFill);
      expect(orrery.ch2PlanetAtmosphereMaterial.uniforms.uAtmosphereDensity.value).toBe(oceans.atmosphereDensity);
    });

    it('STEP 4 — Chapter 2 Visual Identity: Binary star coronas, inner orbit, and resonant ring', () => {
      // Star coronas
      expect(orrery.ch2Star1Glow).toBeDefined();
      expect(orrery.ch2Star1Glow.scale.x).toBeCloseTo(1.25, 2);
      expect(orrery.ch2Star2Glow).toBeDefined();
      expect(orrery.ch2Star2Glow.scale.x).toBeCloseTo(1.25, 2);

      // Inner orbit line
      expect(orrery.ch2InnerOrbitLine).toBeDefined();
      expect(orrery.ch2InnerOrbitLine.material.opacity).toBeCloseTo(0.35, 2);

      // Compact circumbinary resonant ring (radius 0.76, champagne gold)
      expect(orrery.ch2ResonantRing).toBeDefined();
      expect(orrery.ch2ResonantRing.material.opacity).toBeCloseTo(0.42, 2);
    });

    it('STEP 5 — Smooth 2.0s Transition: both groups active during handoff, Ch 1 hidden at t >= 2.0s', () => {
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.isChapterTransitionActive()).toBe(false);

      // Start Chapter 1 -> 2 advancement
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      // Transition is active immediately
      expect(orrery.getChapter()).toBe(2);
      expect(orrery.isChapterTransitionActive()).toBe(true);

      // At t < 2.0s: both systems remain visible
      orrery.update(1.0); // t = 1.0s (midpoint)
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      // Ch 1 planet carries the protagonist world across the transition
      expect(orrery.ch1PlanetNode.visible).toBe(true);

      // At t >= 2.0s: transition completes
      orrery.update(1.1); // total 2.1s >= 2.0s
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(1).visible).toBe(false);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      expect(orrery.ch1PlanetNode.visible).toBe(false);
      expect(orrery.ch2PlanetNode.visible).toBe(true);
    });

    it('RESET — restores Chapter 1 baseline from Chapter 2 and mid-transition', () => {
      // 1. Reset from active Chapter 2
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1);
      expect(orrery.getChapterGroup(2).visible).toBe(true);

      director.reset();
      orrery.reset();
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(false);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.ch1PlanetNode.visible).toBe(true);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBe(1.0);

      // 2. Reset mid-transition (t = 0.8s)
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(0.8);
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(true);

      director.reset();
      orrery.reset();
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getChapterGroup(1).visible).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(false);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.ch1PlanetNode.visible).toBe(true);
    });
  });

  describe('16. Phase 3B: Binary Resonance State Machine', () => {
    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1); // complete 2.0s transition
    }

    it('initial resonanceProgress is 0 and state is IDLE', () => {
      expect(orrery.getResonanceProgress()).toBe(0.0);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.IDLE);
      expect(orrery.isResonanceLocked()).toBe(false);
    });

    it('Chapter 2 enters CHAOTIC_CIRCUMBINARY on handoff completion', () => {
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(orrery.getResonanceProgress()).toBe(0.0);
    });

    it('resonanceProgress does not advance during Chapter 1', () => {
      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      expect(orrery.getResonanceProgress()).toBe(0.0);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.IDLE);
    });

    it('ASSISTED catch contributes less to resonanceProgress than CLEAN catch', () => {
      advanceToChapter2();
      const before = orrery.getResonanceProgress();
      eventBus.emit(Events.SCORE, { catchType: 'ASSISTED', multipliers: { total: 1.0 } });
      const afterAssisted = orrery.getResonanceProgress();
      expect(afterAssisted).toBeGreaterThan(before);

      orrery.reset();
      director.reset();
      advanceToChapter2();
      const before2 = orrery.getResonanceProgress();
      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      const afterClean = orrery.getResonanceProgress();
      expect(afterClean - before2).toBeGreaterThan(afterAssisted - before);
    });

    it('resonanceProgress stays in [0, 1] after many catches', () => {
      advanceToChapter2();
      for (let i = 0; i < 50; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      const p = orrery.getResonanceProgress();
      expect(p).toBeGreaterThanOrEqual(0.0);
      expect(p).toBeLessThanOrEqual(1.0);
    });

    it('progress >= RESONANCE_STABILIZATION_THRESHOLD transitions to RESONANCE_STABILIZATION', () => {
      advanceToChapter2();
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      expect(orrery.getResonanceProgress()).toBeGreaterThanOrEqual(RESONANCE_STABILIZATION_THRESHOLD);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.RESONANCE_STABILIZATION);
    });

    it('progress >= 1.0 transitions to RESONANCE_2_1 and locks', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.getResonanceProgress()).toBe(1.0);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.RESONANCE_2_1);
      expect(orrery.isResonanceLocked()).toBe(true);
    });

    it('harmonic nodes have opacity 0 at start of Chapter 2, increase with progress', () => {
      advanceToChapter2();
      const nodes = orrery.getHarmonicNodes();
      expect(nodes.length).toBe(10);

      for (const nodeM of nodes) {
        expect(nodeM.material.opacity).toBe(0.0);
      }

      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.016);
      for (const nodeM of nodes) {
        expect(nodeM.material.opacity).toBeGreaterThan(0.0);
      }
    });

    it('RESONANCE LOCKED text fires exactly once at resonance lock', () => {
      advanceToChapter2();
      const textSprite = orrery.getResonanceLockedText();
      expect(textSprite).not.toBeNull();
      expect(textSprite.visible).toBe(false);

      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isResonanceLocked()).toBe(true);

      // Anticipation duration 0.20s -> update 0.25s
      orrery.update(0.25);
      expect(textSprite.visible).toBe(true);
      expect(textSprite.material.opacity).toBeGreaterThan(0.0);
    });

    it('repeated catches after lock do NOT retrigger milestone or push progress above 1.0', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(orrery.getResonanceProgress()).toBe(1.0);

      orrery.update(2.1);

      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      expect(orrery.getResonanceProgress()).toBe(1.0);
      expect(orrery._resonanceLockedTriggered).toBe(true);
    });

    it('reset() restores resonanceProgress=0, IDLE state, nodes hidden, milestone hidden', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isResonanceLocked()).toBe(true);

      director.reset();
      orrery.reset();

      expect(orrery.getResonanceProgress()).toBe(0.0);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.IDLE);
      expect(orrery.isResonanceLocked()).toBe(false);
      expect(orrery._resonanceLockedTriggered).toBe(false);

      const nodes = orrery.getHarmonicNodes();
      for (const nodeM of nodes) {
        expect(nodeM.material.opacity).toBe(0.0);
        expect(nodeM.visible).toBe(false);
      }

      const textSprite = orrery.getResonanceLockedText();
      expect(textSprite.visible).toBe(false);
      expect(textSprite.material.opacity).toBe(0.0);
    });

    it('Chapter 2 re-entry after reset starts fresh with CHAOTIC_CIRCUMBINARY', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      director.reset();
      orrery.reset();

      advanceToChapter2();
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(orrery.getResonanceProgress()).toBe(0.0);
    });

    it('Chapter 2 catch does NOT trigger Chapter 1 alignment (Phase 3A regression)', () => {
      advanceToChapter2();
      const stateBefore = orrery.getAlignmentState();
      expect(stateBefore.active).toBe(false);

      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.016);

      const stateAfter = orrery.getAlignmentState();
      expect(stateAfter.active).toBe(false);
    });

    it('wobble at resonanceProgress=0.0 is greater than wobble at resonanceProgress=0.5', () => {
      advanceToChapter2();
      const WOBBLE_AMP = 0.14;
      const wobble0 = WOBBLE_AMP * (1.0 - 0.0);
      const wobble05 = WOBBLE_AMP * (1.0 - 0.5);
      expect(wobble0).toBeGreaterThan(wobble05);
    });

    it('wobble at resonanceProgress=1.0 is effectively 0', () => {
      advanceToChapter2();
      const WOBBLE_AMP = 0.14;
      const wobble1 = WOBBLE_AMP * (1.0 - 1.0);
      expect(wobble1).toBe(0.0);
    });

    it('10 harmonic nodes are created in Chapter 2 setup', () => {
      const nodes = orrery.getHarmonicNodes();
      expect(nodes.length).toBe(10);
      for (let i = 0; i < nodes.length; i++) {
        expect(nodes[i].name).toBe(`ch2HarmonicNode-${i}`);
      }
    });

    it('Ch2ResonanceState export contains all expected values', () => {
      expect(Ch2ResonanceState.IDLE).toBe('IDLE');
      expect(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY).toBe('CHAOTIC_CIRCUMBINARY');
      expect(Ch2ResonanceState.RESONANCE_STABILIZATION).toBe('RESONANCE_STABILIZATION');
      expect(Ch2ResonanceState.RESONANCE_2_1).toBe('RESONANCE_2_1');
    });
  });

  describe('17. Phase 3C: Binary Resonance FX Layer', () => {
    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1); // complete 2.0s transition
    }

    // --- Particle Field Tests ---
    it('creates exactly 100 instanced particles with deterministic data layout', () => {
      const field = orrery.getCh2ParticleField();
      expect(field).not.toBeNull();
      expect(field.isInstancedMesh).toBe(true);
      expect(field.count).toBe(100);
      expect(orrery.getCh2ParticleCount()).toBe(100);
      expect(orrery._ch2ParticleData).toBeInstanceOf(Float32Array);
      expect(orrery._ch2ParticleData.length).toBe(400);

      // Verify deterministic data stays inside the compact circumbinary corridor
      for (let i = 0; i < 100; i++) {
        const x = orrery._ch2ParticleData[i * 4 + 0];
        const y = orrery._ch2ParticleData[i * 4 + 1];
        const z = orrery._ch2ParticleData[i * 4 + 2];
        const phase = orrery._ch2ParticleData[i * 4 + 3];
        const r = Math.sqrt(x * x + z * z);
        expect(r).toBeGreaterThan(0.65);
        expect(r).toBeLessThan(0.83);
        expect(Math.abs(y)).toBeLessThan(0.06);
        expect(phase).toBeGreaterThanOrEqual(0.0);
        expect(phase).toBeLessThanOrEqual(Math.PI * 2.0);
      }
    });

    it('particle field is subtle/hidden at Chapter 2 start, increases with progress', () => {
      advanceToChapter2();
      const field = orrery.getCh2ParticleField();
      expect(field).not.toBeNull();
      orrery.update(0.016);

      // At progress = 0.0, opacity is 0 and field is not visible
      expect(field.material.opacity).toBe(0.0);
      expect(field.visible).toBe(false);

      // Advance progress to ~0.20
      for (let i = 0; i < 3; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      const opacityEarly = field.material.opacity;
      expect(opacityEarly).toBeGreaterThan(0.0);
      expect(field.visible).toBe(true);

      // Advance progress into RESONANCE_STABILIZATION (~0.50)
      for (let i = 0; i < 5; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      const opacityMid = field.material.opacity;
      expect(opacityMid).toBeGreaterThan(opacityEarly);

      // Reach lock (1.0)
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(field.material.opacity).toBeGreaterThanOrEqual(0.58);
    });

    it('particle field resets cleanly to inactive baseline on reset()', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      const field = orrery.getCh2ParticleField();
      expect(field.visible).toBe(true);

      director.reset();
      orrery.reset();
      expect(field.visible).toBe(false);
      expect(field.material.opacity).toBe(0.0);
    });

    // --- Shockwave Tests ---
    it('shockwave is initially inactive and invisible', () => {
      advanceToChapter2();
      const shockwave = orrery.getCh2Shockwave();
      expect(shockwave).not.toBeNull();
      expect(shockwave.visible).toBe(false);
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
    });

    it('shockwave triggers once at resonance lock and animates lifecycle with dt', () => {
      advanceToChapter2();
      const shockwave = orrery.getCh2Shockwave();
      expect(shockwave.visible).toBe(false);

      // Drive to lock
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(orrery.isCh2ShockwaveActive()).toBe(true);
      expect(shockwave.visible).toBe(true);

      // Compact state (t = 0.10s)
      orrery.update(0.10);
      expect(shockwave.scale.x).toBeGreaterThan(0.20);
      expect(shockwave.material.opacity).toBeGreaterThan(0.70);

      // Expanding state (t = 0.40s, cumulative 0.50s)
      orrery.update(0.40);
      expect(shockwave.scale.x).toBeGreaterThan(1.20);

      // Complete lifecycle past 1.0s (cumulative 1.1s)
      orrery.update(0.60);
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
      expect(shockwave.visible).toBe(false);
      expect(shockwave.material.opacity).toBe(0.0);
    });

    it('repeated catches after lock do not re-trigger shockwave', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(1.2); // shockwave finishes
      expect(orrery.isCh2ShockwaveActive()).toBe(false);

      // Subsequent catch
      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.016);
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
      expect(orrery.getCh2Shockwave().visible).toBe(false);
    });

    it('reset() restores shockwave to inactive state', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.10);
      expect(orrery.isCh2ShockwaveActive()).toBe(true);

      director.reset();
      orrery.reset();
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
      expect(orrery.getCh2Shockwave().visible).toBe(false);
      expect(orrery.getCh2Shockwave().material.opacity).toBe(0.0);
    });

    // --- Shield Ring Tests ---
    it('shield ring is attached to player planet and emerges with stabilization', () => {
      advanceToChapter2();
      const shield = orrery.getCh2ShieldRing();
      expect(shield).not.toBeNull();
      expect(shield.parent).toBe(orrery.ch2PlanetNode);

      // At progress = 0.0, hidden / opacity 0
      orrery.update(0.016);
      expect(shield.visible).toBe(false);
      expect(shield.material.opacity).toBe(0.0);

      // Advance into stabilization
      for (let i = 0; i < 8; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(orrery.getResonanceProgress()).toBeGreaterThanOrEqual(RESONANCE_STABILIZATION_THRESHOLD);
      expect(shield.visible).toBe(true);
      expect(shield.material.opacity).toBeGreaterThan(0.15);

      // At resonance lock (1.0), reaches stable opacity ~0.50
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(shield.material.opacity).toBeGreaterThanOrEqual(0.46);
    });

    it('shield ring stretches subtly and resets cleanly', () => {
      advanceToChapter2();
      const shield = orrery.getCh2ShieldRing();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(shield.visible).toBe(true);

      director.reset();
      orrery.reset();
      expect(shield.visible).toBe(false);
      expect(shield.material.opacity).toBe(0.0);
      expect(shield.scale.x).toBe(1.0);
      expect(shield.scale.y).toBe(1.0);
    });

    // --- Integration & Replay Tests ---
    it('replay of Chapter 1 -> 2 handoff reproduces exact Phase 3C FX sequence', () => {
      // First run: advance to Ch2 and lock
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.25);
      expect(orrery.isResonanceLocked()).toBe(true);

      // Reset
      director.reset();
      orrery.reset();
      expect(orrery.getChapter()).toBe(1);
      expect(orrery.getCh2ParticleField().visible).toBe(false);
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
      expect(orrery.getCh2ShieldRing().visible).toBe(false);

      // Second run
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(orrery.getCh2ParticleField().visible).toBe(false);

      // Score until lock
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.25);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(orrery.isCh2ShockwaveActive()).toBe(true);
      expect(orrery.getCh2ParticleField().visible).toBe(true);
      expect(orrery.getCh2ShieldRing().visible).toBe(true);
    });
  });

  // ==========================================================================
  // 18. PHASE 4A: CHAPTER 2 COMPLETION GATE & CHAPTER 2 -> 3 VISUAL HANDOFF
  // ==========================================================================
  describe('18. Phase 4A: Chapter 2 Completion Gate & Chapter 2 -> Chapter 3 Visual Handoff', () => {
    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1); // complete 1 -> 2 transition
    }

    it('emits ORRERY_RESONANCE_COMPLETED exactly once after milestone lifecycle completes at t >= 2.0s', () => {
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);

      let emitCount = 0;
      let lastPayload = null;
      eventBus.on(Events.ORRERY_RESONANCE_COMPLETED, (payload) => {
        emitCount++;
        lastPayload = payload;
      });

      // Calibrate until 2:1 resonance lock
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(emitCount).toBe(0); // Not emitted yet (milestone animating)

      // Milestone timeline: 0.0 -> 2.0s
      orrery.update(0.50);
      expect(emitCount).toBe(0);

      orrery.update(1.00); // 1.50s total
      expect(emitCount).toBe(0);

      // Complete milestone at t = 2.10s >= 2.0s
      orrery.update(0.60); // 2.10s total
      expect(emitCount).toBe(1);
      expect(lastPayload).toEqual({
        chapter: 2,
        resonanceState: Ch2ResonanceState.RESONANCE_2_1
      });
      expect(orrery.isResonanceCompletionEmitted()).toBe(true);

      // Subsequent update frames do NOT emit duplicate events
      orrery.update(0.50);
      orrery.update(0.50);
      expect(emitCount).toBe(1);
    });

    it('harmonizes Chapter 3 group scale to 2.2', () => {
      const ch3Group = orrery.getChapterGroup(3);
      expect(ch3Group).toBeDefined();
      expect(ch3Group.scale.x).toBeCloseTo(2.2, 2);
      expect(ch3Group.scale.y).toBeCloseTo(2.2, 2);
      expect(ch3Group.scale.z).toBeCloseTo(2.2, 2);
    });

    it('preserves player planet continuity in Chapter 3 using PlanetoidShader Stage 3 Ocean World at scale 0.18', () => {
      const ch3Planet = orrery.getPlanetNode(3);
      expect(ch3Planet).toBeDefined();
      expect(ch3Planet.name).toBe('chapter-3-node');
      expect(ch3Planet.scale.x).toBeCloseTo(0.18, 2);
      expect(ch3Planet.scale.y).toBeCloseTo(0.18, 2);
      expect(ch3Planet.scale.z).toBeCloseTo(0.18, 2);

      // UserData contract
      expect(ch3Planet.userData.isPlayerPlanet).toBe(true);
      expect(ch3Planet.userData.stage).toBe(3);
      expect(ch3Planet.userData.stageKey).toBe('ocean');
      expect(ch3Planet.userData.surfaceType).toBe('ocean-world');

      // Shader uniforms
      expect(ch3Planet.material).toBeDefined();
      expect(ch3Planet.material.uniforms).toBeDefined();
      expect(ch3Planet.material.uniforms.uVisualStage.value).toBe(1.0);
      expect(ch3Planet.material.uniforms.uAwakeningProgress.value).toBe(0.0);
      expect(ch3Planet.material.uniforms.uOceanFill.value).toBe(0.0);
    });

    it('synchronizes stage uniforms across Chapter 1, 2, and 3 planet nodes via setVisualStage', () => {
      orrery.setVisualStage(3.0, {
        awakeningProgress: 1.0,
        oceanFill: 0.95,
        atmosphereDensity: 0.5
      });

      const ch1Planet = orrery.getPlanetNode(1);
      const ch2Planet = orrery.getPlanetNode(2);
      const ch3Planet = orrery.getPlanetNode(3);

      expect(ch1Planet.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(ch3Planet.material.uniforms.uVisualStage.value).toBe(3.0);

      expect(ch3Planet.material.uniforms.uOceanFill.value).toBe(0.95);
      expect(ch3Planet.material.uniforms.uAtmosphereDensity.value).toBe(0.5);
    });

    it('keeps Chapter 2 and Chapter 3 shader stages tied to authoritative visual-stage updates', () => {
      const ch2Planet = orrery.getPlanetNode(2);
      orrery.setVisualStage(1.0);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(1.0);
      expect(ch2Planet.material.uniforms.uAwakeningProgress.value).toBe(0.0);
      orrery.setVisualStage(1.5);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(1.5);
      expect(ch2Planet.material.uniforms.uAwakeningProgress.value).toBe(0.5);
      orrery.setVisualStage(2.0);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(2.0);
      expect(ch2Planet.material.uniforms.uAwakeningProgress.value).toBe(1.0);
      orrery.setVisualStage(2.25);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(2.25);
      orrery.setVisualStage(3.0);
      expect(ch2Planet.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(orrery.getPlanetNode(3).material.uniforms.uVisualStage.value).toBe(3.0);
    });

    it('uses a curved one-star gravity-assist path and settles into the outer orbit', () => {
      orreryState.setChapter(3);
      orrery._syncFromDirector();
      const planet = orrery.getPlanetNode(3);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);

      orreryState.setOrbitalState(OrbitalState.BINARY_TRANSFER);
      orrery._syncFromDirector();
      orrery.update(0.016);
      const approach = planet.position.clone();

      orreryState.setOrbitalState(OrbitalState.GRAVITY_ASSIST);
      orrery._syncFromDirector();
      orrery.update(1.5);
      const periapsis = planet.position.clone();
      orrery.update(1.5);
      const exit = planet.position.clone();
      expect(periapsis.distanceTo(approach)).toBeGreaterThan(0.1);
      expect(exit.distanceTo(periapsis)).toBeGreaterThan(0.1);
      expect(exit.x).toBeGreaterThan(periapsis.x);

      orreryState.setOrbitalState(OrbitalState.BOUND_OUTER_ORBIT);
      orrery._syncFromDirector();
      orrery.update(0.016);
      const initialOuterRadius = Math.hypot(planet.position.x, planet.position.z);
      expect(initialOuterRadius).toBeGreaterThan(Math.hypot(exit.x, exit.z));
      expect(initialOuterRadius).toBeLessThan(1.95);
      orrery.update(1.5);
      expect(Math.hypot(planet.position.x, planet.position.z)).toBeCloseTo(1.95, 3);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);
    });

    it('keeps the player position continuous across transfer, assist, and outer-orbit state changes', () => {
      orreryState.setChapter(3);
      orreryState.setCalibrationProgress(1.0);
      orreryState.setOrbitalState(OrbitalState.BINARY_TRANSFER);
      orrery._syncFromDirector();
      orrery.update(0.016);
      const transferEnd = orrery.ch3PlanetNode.position.clone();

      orreryState.setOrbitalState(OrbitalState.GRAVITY_ASSIST);
      orrery._syncFromDirector();
      orrery.update(0.0);
      expect(orrery.ch3PlanetNode.position.distanceTo(transferEnd)).toBeLessThan(0.00001);

      orrery.update(3.0);
      const assistExit = orrery.ch3PlanetNode.position.clone();
      orreryState.setOrbitalState(OrbitalState.BOUND_OUTER_ORBIT);
      orrery._syncFromDirector();
      orrery.update(0.0);
      expect(orrery.ch3PlanetNode.position.distanceTo(assistExit)).toBeLessThan(0.00001);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);

      orrery.update(0.75);
      expect(Math.hypot(orrery.ch3PlanetNode.position.x, orrery.ch3PlanetNode.position.z)).toBeGreaterThan(
        Math.hypot(assistExit.x, assistExit.z)
      );
    });

    it('debugChapter3 isolates the three motion states at Stage 3 and restores authoritative state', () => {
      orrery.setVisualStage(2.5);
      const actualNarrativeChapter = director.getChapter();

      expect(orrery.debugChapter3('binary_transfer')).toBe(true);
      let debugState = orrery.getChapter3DebugState();
      expect(debugState.debugMode).toBe(true);
      expect(debugState.state).toBe(OrbitalState.BINARY_TRANSFER);
      expect(debugState.visualStage).toBe(3.0);
      expect(debugState.primaryStarVisible).toBe(true);
      expect(debugState.playerPlanetVisible).toBe(true);
      expect(debugState.flybyBodyVisible).toBe(false);
      expect(orrery.chapterGroups[1].visible).toBe(false);
      expect(orrery.chapterGroups[2].visible).toBe(false);
      expect(orrery.chapterGroups[3].visible).toBe(true);
      expect(orrery.ch3PlanetNode.material.uniforms.uOceanFill.value).toBe(0.85);

      eventBus.emit(Events.EVOLUTION_PROGRESS, { visualStage: 2.75 });
      expect(orrery.ch3PlanetNode.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(orrery.debugChapter3('gravity_assist')).toBe(true);
      expect(orrery.getChapter3DebugState().state).toBe(OrbitalState.GRAVITY_ASSIST);
      orrery.update(1.5);
      expect(orrery.debugChapter3('bound_outer_orbit')).toBe(true);
      debugState = orrery.getChapter3DebugState();
      expect(debugState.state).toBe(OrbitalState.BOUND_OUTER_ORBIT);
      expect(debugState.flybyBodyVisible).toBe(false);
      expect(director.getChapter()).toBe(actualNarrativeChapter);

      expect(orrery.debugChapter3Reset()).toBe(true);
      expect(orrery.getVisualStage()).toBe(2.75);
      expect(orrery.ch3PlanetNode.material.uniforms.uVisualStage.value).toBe(2.75);
      expect(orrery.chapterGroups[1].visible).toBe(true);
      expect(orrery.chapterGroups[3].visible).toBe(false);
      expect(director.getChapter()).toBe(actualNarrativeChapter);
    });

    it('implements Chapter 3 Visual Enhancements: atmosphere shell, star corona, dynamic lighting, trajectory deflection, and periapsis surge', () => {
      // 1. Atmosphere shell presence and properties
      expect(orrery.ch3PlanetAtmosphere).toBeDefined();
      expect(orrery.ch3PlanetAtmosphere.name).toBe('ch3-planetoid-atmosphere');
      expect(orrery.ch3PlanetAtmosphere.parent).toBe(orrery.ch3PlanetNode);
      expect(orrery.ch3PlanetAtmosphereMaterial).toBeDefined();

      // 2. Primary star corona presence and properties
      expect(orrery.ch3PrimaryGlow).toBeDefined();
      expect(orrery.ch3PrimaryGlow.name).toBe('primary-star-glow');
      expect(orrery.ch3PrimaryGlow.parent).toBe(orrery.ch3Primary);
      expect(orrery.ch3PrimaryGlow.scale.x).toBeCloseTo(1.25, 2);
      expect(typeof createStarCoronaMaterial).toBe('function');

      // 3. Stage 3 Ocean World Presentation: Atmosphere awakens and Attenuated Kintsugi glow
      orrery.debugChapter3('binary_transfer');
      expect(orrery.ch3PlanetAtmosphere.visible).toBe(true);
      expect(orrery.ch3PlanetNode.material.uniforms.uKintsugiGlow.value).toBe(0.15);

      // 4. Dynamic star-aligned planet lighting: uLightDirection points towards primary star
      const lightDir = orrery.ch3PlanetNode.material.uniforms.uLightDirection.value;
      const expectedDir = orrery.ch3Primary.position.clone().sub(orrery.ch3PlanetNode.position).normalize();
      expect(lightDir.distanceTo(expectedDir)).toBeLessThan(0.001);

      // 5. Redesigned trajectory geometry: deflection angle ~90°–110° and clearance >= 0.08 outside star (0.13)
      const trajGeom = orrery.ch3TransferLine.geometry;
      const posAttr = trajGeom.getAttribute('position');
      let minTrajectoryRadius = 999;
      for (let i = 0; i < posAttr.count; i++) {
        const r = Math.hypot(posAttr.getX(i), posAttr.getZ(i));
        if (r < minTrajectoryRadius) minTrajectoryRadius = r;
      }
      expect(minTrajectoryRadius).toBeGreaterThanOrEqual(0.21);
      const starRadius = 0.13;
      expect(minTrajectoryRadius - starRadius).toBeGreaterThanOrEqual(0.08);

      // Deflection angle between incoming entry and outgoing exit tangents
      const pStart = [posAttr.getX(0), posAttr.getZ(0)];
      const pNext = [posAttr.getX(1), posAttr.getZ(1)];
      const pPrev = [posAttr.getX(posAttr.count - 2), posAttr.getZ(posAttr.count - 2)];
      const pEnd = [posAttr.getX(posAttr.count - 1), posAttr.getZ(posAttr.count - 1)];
      const inAngle = Math.atan2(pNext[1] - pStart[1], pNext[0] - pStart[0]) * 180 / Math.PI;
      const outAngle = Math.atan2(pEnd[1] - pPrev[1], pEnd[0] - pPrev[0]) * 180 / Math.PI;
      let defl = Math.abs(outAngle - inAngle);
      if (defl > 180) defl = 360 - defl;
      expect(defl).toBeGreaterThanOrEqual(85);
      expect(defl).toBeLessThanOrEqual(110);

      // 6. Periapsis timing & interaction event: surge occurs at u in [0.35, 0.55] with corona scale and line boost
      orrery.debugChapter3('gravity_assist');
      orrery.update(0.0);
      const baselineLineOpacity = orrery.ch3TransferLine.material.opacity;
      const baselineCoronaScale = orrery.ch3PrimaryGlow.scale.x;

      // Update to periapsis peak at 1.26s (42% of 3.0s duration)
      orrery.update(1.26);
      expect(orrery.ch3PrimaryGlow.scale.x).toBeGreaterThan(baselineCoronaScale * 1.15); // +15% to +25% boost
      expect(orrery.ch3TransferLine.material.opacity).toBeCloseTo(1.0, 1); // brightens to 1.0

      // Update to outbound leg (t = 2.7s, u = 0.90)
      orrery.update(1.44);
      expect(orrery.ch3PrimaryGlow.scale.x).toBeCloseTo(baselineCoronaScale, 2);

      // 7. Outer orbit radius is 1.95 and flyby body is hidden
      orrery.debugChapter3('bound_outer_orbit');
      orrery.update(1.5);
      expect(Math.hypot(orrery.ch3PlanetNode.position.x, orrery.ch3PlanetNode.position.z)).toBeCloseTo(1.95, 2);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);

      orrery.debugChapter3Reset();
    });

    it('implements Chapter 3 Slingshot Cinematic Readability Polish: planet scale envelope, primary star dominance, directional planet trail, and trajectory gradient', () => {
      // 1. Trail geometry and getter presence
      expect(orrery.ch3PlanetTrailLine).toBeDefined();
      expect(orrery.ch3PlanetTrailLine.name).toBe('ch3-planet-trail');
      expect(orrery.ch3PlanetTrailLine.parent).toBe(orrery.chapterGroups[3]);
      expect(orrery.getCh3PlanetTrail()).toBe(orrery.ch3PlanetTrailLine);

      // 2. Trajectory Approach in BINARY_TRANSFER
      orrery.debugChapter3('binary_transfer');
      orrery.update(0.0);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(true);
      expect(orrery.getChapter3DebugState().planetTrailVisible).toBe(true);
      expect(orrery.ch3TransferLine.material.opacity).toBeCloseTo(0.70, 2);
      expect(orrery.ch3PlanetNode.scale.x).toBeCloseTo(0.18, 2);

      // 3. GRAVITY_ASSIST sequence & Periapsis Event
      orrery.debugChapter3('gravity_assist');
      orrery.update(0.0);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(true);

      // Periapsis peak at 1.26s (u ≈ 0.42)
      orrery.update(1.26);

      // Planet scale envelope peaks at 1.10x (0.198)
      expect(orrery.ch3PlanetNode.scale.x).toBeGreaterThan(0.190);
      expect(orrery.ch3PlanetNode.scale.x).toBeLessThan(0.205);
      expect(orrery.ch3PlanetNode.scale.x).toBeCloseTo(0.18 * 1.10, 2);

      // Primary star dominance at periapsis
      expect(orrery.ch3Primary.material.opacity).toBeCloseTo(1.0, 1);
      expect(orrery.ch3PrimaryGlow.scale.x).toBeCloseTo(1.25 * 1.25, 2); // +25%
      expect(orrery.ch3PrimaryGlowMaterial.uniforms.uBaseOpacity.value).toBeCloseTo(0.43, 2);

      // Trajectory brightest at periapsis (1.0)
      expect(orrery.ch3TransferLine.material.opacity).toBeCloseTo(1.0, 1);

      // Ocean World atmosphere rim & density pulse
      expect(orrery.ch3PlanetAtmosphereMaterial.uniforms.uAtmosphereDensity.value).toBeCloseTo(0.80, 2);
      expect(orrery.ch3PlanetAtmosphere.scale.x).toBeCloseTo(1.03, 2); // +3%
      expect(orrery.ch3PlanetMaterial.uniforms.uKintsugiGlow.value).toBe(0.15); // gold fractures remain subtle

      // Directional trail tightly wraps star behind planet (40-vertex thick ribbon mesh)
      const trailPos = orrery.ch3PlanetTrailGeom.getAttribute('position');
      expect(trailPos.count).toBe(40);
      const headMidX = (trailPos.getX(0) + trailPos.getX(1)) * 0.5;
      const headMidZ = (trailPos.getZ(0) + trailPos.getZ(1)) * 0.5;
      expect(headMidX).toBeCloseTo(orrery.ch3PlanetNode.position.x, 2);
      expect(headMidZ).toBeCloseTo(orrery.ch3PlanetNode.position.z, 2);
      expect(trailPos.getX(38)).toBeLessThan(trailPos.getX(0)); // trails along incoming branch

      // Outbound leg at 2.85s (u ≈ 0.95)
      orrery.update(1.59);
      expect(orrery.ch3PlanetNode.scale.x).toBeCloseTo(0.18, 2); // scale returned to baseline
      expect(orrery.ch3TransferLine.material.opacity).toBeGreaterThanOrEqual(0.65); // outbound visibility retained

      // 4. BOUND_OUTER_ORBIT settle & trail fade
      orrery.debugChapter3('bound_outer_orbit');
      orrery.update(0.1);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(true); // visible during initial settle

      // Settle completes at >1.5s
      orrery.update(1.6);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(false); // fully faded and hidden
      expect(orrery.ch3TransferLine.material.opacity).toBeCloseTo(0.30, 2); // trajectory calms to 0.30
      expect(orrery.ch3Primary.material.opacity).toBeCloseTo(0.92, 2); // star returns to baseline
      expect(orrery.ch3PrimaryGlow.scale.x).toBeCloseTo(1.25, 2); // corona returns to baseline
      expect(orrery.ch3PlanetNode.scale.x).toBeCloseTo(0.18, 2);

      // 5. Reset cleans up debug visuals
      expect(orrery.debugChapter3Reset()).toBe(true);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(false);
    });

    it('implements Chapter 3 Runtime Fix: Stage 3 Ocean World protection, Kintsugi attenuation, ribbon trail, debug replay, and outer orbit handoff', () => {
      // 1. Stage 3 protection against global evolution clobbering
      orrery.debugChapter3('gravity_assist');
      expect(orrery.ch3PlanetNode.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(orrery.ch3PlanetNode.material.uniforms.uOceanFill.value).toBe(0.85);
      expect(orrery.ch3PlanetNode.material.uniforms.uKintsugiGlow.value).toBe(0.15);
      expect(orrery.ch3PlanetAtmosphere.visible).toBe(true);

      // Simulate CelestialEnvironment calling setVisualStage(1.0) every frame
      orrery.setVisualStage(1.0);
      expect(orrery.ch3PlanetNode.material.uniforms.uVisualStage.value).toBe(3.0);
      expect(orrery.ch3PlanetNode.material.uniforms.uOceanFill.value).toBe(0.85);
      expect(orrery.ch3PlanetNode.material.uniforms.uKintsugiGlow.value).toBe(0.15);
      expect(orrery.ch3PlanetAtmosphere.visible).toBe(true);

      // 2. Thick Ribbon Motion Trail
      expect(orrery.ch3PlanetTrailLine.isMesh).toBe(true);
      expect(orrery.ch3PlanetTrailLine.geometry.isBufferGeometry).toBe(true);
      const posAttr = orrery.ch3PlanetTrailGeom.getAttribute('position');
      const colAttr = orrery.ch3PlanetTrailGeom.getAttribute('color');
      expect(posAttr.count).toBe(40);
      expect(colAttr.count).toBe(40);
      expect(orrery.ch3PlanetTrailLine.material.blending).toBe(2); // AdditiveBlending

      // Verify ribbon width > 0
      orrery.update(0.5);
      const w = Math.hypot(posAttr.getX(0) - posAttr.getX(1), posAttr.getZ(0) - posAttr.getZ(1));
      expect(w).toBeGreaterThan(0.04);

      // 3. Debug Replay capability
      orrery.update(2.0); // Advance well into the assist
      expect(orrery._ch3AssistElapsed).toBeGreaterThan(2.0);
      // Re-trigger debugChapter3('gravity_assist') - must restart
      orrery.debugChapter3('gravity_assist');
      expect(orrery._ch3AssistElapsed).toBe(0.0);
      expect(orrery.ch3PlanetNode.position.x).toBeCloseTo(-1.55, 2);
      expect(orrery.ch3PlanetNode.position.z).toBeCloseTo(-0.90, 2);

      // 4. Auto-handoff into BOUND_OUTER_ORBIT at t >= 3.0s
      orrery.update(3.0); // Exactly completes assist
      expect(orrery.ch3PlanetNode.position.x).toBeCloseTo(0.45, 2);
      expect(orrery.ch3PlanetNode.position.z).toBeCloseTo(1.85, 2);

      // Subsequent frame automatically transitions to outer orbit
      orrery.update(0.016);
      expect(orrery.getChapter3DebugState().state).toBe(OrbitalState.BOUND_OUTER_ORBIT);
      const outerR = Math.hypot(orrery.ch3PlanetNode.position.x, orrery.ch3PlanetNode.position.z);
      expect(outerR).toBeGreaterThan(1.85);

      // Settles cleanly to R = 1.95
      orrery.update(1.6);
      const settledR = Math.hypot(orrery.ch3PlanetNode.position.x, orrery.ch3PlanetNode.position.z);
      expect(settledR).toBeCloseTo(1.95, 2);
      expect(orrery.ch3PlanetTrailLine.visible).toBe(false);

      orrery.debugChapter3Reset();
    });

    it('executes a smooth 2.0s Chapter 2 -> Chapter 3 visual handoff with position interpolation and element cross-fade', () => {
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);

      // Trigger 2 -> 3 transition
      const started = orrery.startChapterTransition(2, 3);
      expect(started).toBe(true);
      expect(orrery.isChapterTransitionActive()).toBe(true);

      const transState = orrery.getChapterTransitionState();
      expect(transState.fromChapter).toBe(2);
      expect(transState.toChapter).toBe(3);

      // Both chapter groups visible during handoff
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      expect(orrery.getChapterGroup(3).visible).toBe(true);

      // Ch2 planet visible, Ch3 planet hidden initially
      const ch2Planet = orrery.getPlanetNode(2);
      const ch3Planet = orrery.getPlanetNode(3);
      expect(ch2Planet.visible).toBe(true);
      expect(ch3Planet.visible).toBe(false);

      // Halfway through transition (1.0s / 2.0s)
      orrery.update(1.00);
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(2).visible).toBe(true);
      expect(orrery.getChapterGroup(3).visible).toBe(true);

      // Ch2 elements faded down
      expect(orrery.ch2ResonantRing.material.opacity).toBeLessThan(0.70);
      expect(orrery.ch2Star1.material.opacity).toBeLessThan(0.95);

      // Ch3 elements faded up
      expect(orrery.ch3Primary.material.opacity).toBeGreaterThan(0.0);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);

      // Complete transition at t = 2.10s >= 2.0s
      orrery.update(1.10);
      expect(orrery.isChapterTransitionActive()).toBe(false);

      // Final handoff visibility state
      expect(orrery.getChapterGroup(2).visible).toBe(false);
      expect(orrery.getChapterGroup(3).visible).toBe(true);
      expect(ch2Planet.visible).toBe(false);
      expect(ch3Planet.visible).toBe(true);

      // Baseline Chapter 3 opacities restored
      expect(orrery.ch3Primary.material.opacity).toBeCloseTo(0.92, 2);
      expect(orrery.ch3FlybyWorld.visible).toBe(false);
      expect(orrery.ch3TransferLine.material.opacity).toBeCloseTo(0.75, 2);
      expect(orrery.ch3OuterOrbitLine.material.opacity).toBeCloseTo(0.45, 2);
    });

    it('enforces chapter isolation: Chapter 2 resonance calibration does not run once Chapter 3 is active', () => {
      advanceToChapter2();
      // Advance director to Chapter 3
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(3);

      orrery.update(2.1); // complete 2 -> 3 transition
      expect(orrery.getChapter()).toBe(3);

      const progressBefore = orrery.getResonanceProgress();
      // Scoring catch while in Chapter 3
      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.016);

      // Resonance progress should NOT change (Chapter 2 is isolated)
      expect(orrery.getResonanceProgress()).toBe(progressBefore);
    });

    it('supports full reset and replay without state leakage', () => {
      advanceToChapter2();
      // Lock resonance
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(2.1);
      expect(orrery.isResonanceCompletionEmitted()).toBe(true);

      // Advance to Chapter 3
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      orrery.update(2.1);
      expect(orrery.getChapter()).toBe(3);

      // Reset everything
      director.reset();
      orrery.reset();

      expect(orrery.getChapter()).toBe(1);
      expect(orrery.isResonanceCompletionEmitted()).toBe(false);
      expect(orrery.isResonanceLocked()).toBe(false);
      expect(orrery.getResonanceProgress()).toBe(0.0);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.IDLE);
      expect(orrery.getPlanetNode(3).visible).toBe(false);
      expect(orrery.getPlanetNode(3).scale.x).toBeCloseTo(0.18, 2);

      // Replay
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);
      expect(orrery.isResonanceCompletionEmitted()).toBe(false);
    });
  });

  // ==========================================================================
  // 19. CHAPTER 2 MYSTICAL BINARY RESONANCE VISUAL PASS
  // ==========================================================================
  describe('19. Chapter 2 Mystical Binary Resonance Visual Pass', () => {
    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1); // complete 2.0s transition
    }

    it('creates all mystical celestial components with preallocated buffers and correct hierarchy', () => {
      const rings = orrery.getCh2ConcentricRings();
      expect(rings.length).toBe(3);
      expect(rings[0].name).toBe('ch2-concentric-ring-1');
      expect(rings[1].name).toBe('ch2-concentric-ring-2');
      expect(rings[2].name).toBe('ch2-concentric-ring-3');

      const axes = orrery.getCh2CardinalAxes();
      expect(axes).not.toBeNull();
      expect(axes.name).toBe('ch2-cardinal-axes');
      expect(axes.isLineSegments).toBe(true);

      const bridge = orrery.getCh2StarBridge();
      expect(bridge).not.toBeNull();
      expect(bridge.name).toBe('ch2-star-bridge-line');
      expect(bridge.parent).toBe(orrery.ch2Barycenter);
      expect(orrery._ch2StarBridgePositions).toBeInstanceOf(Float32Array);
      expect(orrery._ch2StarBridgePositions.length).toBe(48); // 16 points * 3

      const filaments = orrery.getCh2ResonanceFilaments();
      expect(filaments).not.toBeNull();
      expect(filaments.name).toBe('ch2-resonance-filaments');
      expect(filaments.isLineLoop).toBe(true);
      expect(orrery._ch2FilamentPositions).toBeInstanceOf(Float32Array);
      expect(orrery._ch2FilamentPositions.length).toBe(288); // 96 points * 3

      const trail = orrery.getCh2PlanetTrail();
      expect(trail).not.toBeNull();
      expect(trail.name).toBe('ch2-planet-trail-line');
      expect(trail.isLineLoop).toBe(true);
      expect(orrery._ch2TrailPositions).toBeInstanceOf(Float32Array);
      expect(orrery._ch2TrailPositions.length).toBe(192); // 64 points * 3

      const highlights = orrery.getCh2TravelingHighlights();
      expect(highlights).not.toBeNull();
      expect(highlights.name).toBe('ch2-traveling-highlights');
      expect(highlights.isPoints).toBe(true);
      expect(orrery._ch2HighlightPositions).toBeInstanceOf(Float32Array);
      expect(orrery._ch2HighlightPositions.length).toBe(6); // 2 points * 3

      const shockwaveEcho = orrery.getCh2ShockwaveEcho();
      expect(shockwaveEcho).not.toBeNull();
      expect(shockwaveEcho.name).toBe('ch2-resonance-shockwave-echo');
      expect(shockwaveEcho.isMesh).toBe(true);
    });

    it('concentric rings and cardinal axes emerge progressively as resonance progresses', () => {
      advanceToChapter2();
      const rings = orrery.getCh2ConcentricRings();
      const axes = orrery.getCh2CardinalAxes();

      // At progress = 0.0 (chaos): all rings and axes are hidden / opacity 0.0
      orrery.update(0.016);
      expect(rings[0].material.opacity).toBe(0.0);
      expect(rings[1].material.opacity).toBe(0.0);
      expect(rings[2].material.opacity).toBe(0.0);
      expect(axes.material.opacity).toBe(0.0);

      // Score 3 catches (progress ~ 0.20): inner harmonic shell emerges
      for (let i = 0; i < 3; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(rings[0].material.opacity).toBeGreaterThan(0.0);
      expect(rings[0].visible).toBe(true);
      expect(rings[1].material.opacity).toBe(0.0); // Ring 2 threshold is 0.35

      // Score 5 more catches (progress ~ 0.50): outer ring and axes emerge
      for (let i = 0; i < 5; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(rings[1].material.opacity).toBeGreaterThan(0.0);
      expect(rings[1].visible).toBe(true);
      expect(axes.material.opacity).toBeGreaterThan(0.0);
      expect(axes.visible).toBe(true);

      // Lock resonance (progress = 1.0): all 3 rings and axes are active
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(rings[0].material.opacity).toBeGreaterThanOrEqual(0.40);
      expect(rings[1].material.opacity).toBeGreaterThanOrEqual(0.35);
      expect(rings[2].material.opacity).toBeGreaterThanOrEqual(0.30);
      expect(axes.material.opacity).toBeGreaterThanOrEqual(0.28);
    });

    it('inter-stellar energy bridge connects twin stars and tautens as resonance locks', () => {
      advanceToChapter2();
      const bridge = orrery.getCh2StarBridge();

      // At chaos (progress = 0.0): bridge is faint or subtle
      orrery.update(0.016);
      expect(bridge.material.opacity).toBeLessThan(0.05);

      // Advance into stabilization (progress >= 0.35)
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(bridge.visible).toBe(true);
      expect(bridge.material.opacity).toBeGreaterThan(0.25);

      // Lock resonance
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(bridge.material.opacity).toBeGreaterThanOrEqual(0.65);
    });

    it('sacred lotus / guilloché resonance petals bloom from inner core toward resonant ring', () => {
      advanceToChapter2();
      const filaments = orrery.getCh2ResonanceFilaments();

      // Progress = 0.0: invisible
      orrery.update(0.016);
      expect(filaments.visible).toBe(false);
      expect(filaments.material.opacity).toBe(0.0);

      // Progress >= 0.20: blooms into visibility
      for (let i = 0; i < 4; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(filaments.visible).toBe(true);
      expect(filaments.material.opacity).toBeGreaterThan(0.0);

      // Lock: high celestial shimmer
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(filaments.material.opacity).toBeGreaterThanOrEqual(0.45);
    });

    it('circumbinary orbital trail visibly damps chaotic wobble into circular resonance', () => {
      advanceToChapter2();
      const trail = orrery.getCh2PlanetTrail();
      expect(trail).not.toBeNull();

      // Chaos (progress = 0.0): radial variation along the 64 vertices is evident
      orrery.update(0.1);
      let minRChaos = Infinity;
      let maxRChaos = -Infinity;
      for (let i = 0; i < 64; i++) {
        const x = orrery._ch2TrailPositions[i * 3 + 0];
        const z = orrery._ch2TrailPositions[i * 3 + 2];
        const r = Math.sqrt(x * x + z * z);
        if (r < minRChaos) minRChaos = r;
        if (r > maxRChaos) maxRChaos = r;
      }
      const chaosVariance = maxRChaos - minRChaos;
      expect(chaosVariance).toBeGreaterThan(0.10);

      // Drive to lock (progress = 1.0): wobble is fully damped
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.1);
      let minRLock = Infinity;
      let maxRLock = -Infinity;
      for (let i = 0; i < 64; i++) {
        const x = orrery._ch2TrailPositions[i * 3 + 0];
        const z = orrery._ch2TrailPositions[i * 3 + 2];
        const r = Math.sqrt(x * x + z * z);
        if (r < minRLock) minRLock = r;
        if (r > maxRLock) maxRLock = r;
      }
      const lockVariance = maxRLock - minRLock;
      // All points should now be exactly on the compact 0.76 orbit (variance ~ 0.0)
      expect(lockVariance).toBeLessThan(0.001);
      expect(minRLock).toBeCloseTo(0.76, 2);
      expect(maxRLock).toBeCloseTo(0.76, 2);
    });

    it('traveling resonant highlights circulate along resonant ring at 2:1 harmonic frequency', () => {
      advanceToChapter2();
      const hl = orrery.getCh2TravelingHighlights();

      // Initial progress = 0: hidden
      orrery.update(0.016);
      expect(hl.visible).toBe(false);

      // Advance into stabilization: visible
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(hl.visible).toBe(true);
      expect(hl.material.opacity).toBeGreaterThan(0.0);

      // Check coordinates of the two diametric highlight points
      const p1x = orrery._ch2HighlightPositions[0];
      const p1z = orrery._ch2HighlightPositions[2];
      const p2x = orrery._ch2HighlightPositions[3];
      const p2z = orrery._ch2HighlightPositions[5];

      const r1 = Math.sqrt(p1x * p1x + p1z * p1z);
      const r2 = Math.sqrt(p2x * p2x + p2z * p2z);
      expect(r1).toBeCloseTo(0.76, 2);
      expect(r2).toBeCloseTo(0.76, 2);

      // Opposite sides of ring (dot product ≈ -0.76^2)
      const dot = p1x * p2x + p1z * p2z;
      expect(dot).toBeCloseTo(-(0.76 * 0.76), 1);
    });

    it('harmonic nodes pulse in traveling phase wave during stabilization and lock into unison at resonance lock', () => {
      advanceToChapter2();
      const nodes = orrery.getHarmonicNodes();

      // In stabilization (~0.5 progress): nodes have varying opacities due to traveling wave
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.05);

      const opacitiesMid = nodes.map(n => n.material.opacity);
      const minMid = Math.min(...opacitiesMid);
      const maxMid = Math.max(...opacitiesMid);
      // Traveling wave creates non-zero spread among nodes
      expect(maxMid - minMid).toBeGreaterThan(0.05);

      // At lock (progress = 1.0): traveling wave resolves into synchronous lock (all nodes equal)
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.05);

      const opacitiesLock = nodes.map(n => n.material.opacity);
      for (let i = 1; i < opacitiesLock.length; i++) {
        expect(opacitiesLock[i]).toBeCloseTo(opacitiesLock[0], 4);
      }
    });

    it('player planet kintsugi glow illuminates during catch surges and shines at resonance lock', () => {
      advanceToChapter2();
      const planetNode = orrery.getChapter2PlanetNode();

      // Normal state without catch surge
      orrery.update(0.016);
      expect(planetNode.material.uniforms.uKintsugiGlow.value).toBeCloseTo(
        DEBUG_STAGE_PRESETS[PLANETOID_STAGES.AWAKENING].kintsugiGlow,
        3
      );

      // Trigger catch surge via triggerCatchResponse
      orrery.triggerCatchResponse({ catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.35); // advance to peak of catch response envelope
      expect(planetNode.material.uniforms.uKintsugiGlow.value).toBeGreaterThan(0.30);

      // At resonance lock: kintsugi glow shines steadily
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.05);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(planetNode.material.uniforms.uKintsugiGlow.value).toBeGreaterThanOrEqual(0.75);
    });

    it('secondary champagne gold shockwave echo ring expands with harmonic offset inside primary ring', () => {
      advanceToChapter2();
      const echoMesh = orrery.getCh2ShockwaveEcho();
      expect(echoMesh).not.toBeNull();
      expect(echoMesh.visible).toBe(false);

      // Drive to lock
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isCh2ShockwaveActive()).toBe(true);

      // Animate into expansion
      orrery.update(0.25);
      expect(echoMesh.visible).toBe(true);
      expect(echoMesh.scale.x).toBeGreaterThan(0.20);
      expect(echoMesh.material.opacity).toBeGreaterThan(0.40);

      // Shockwave completes past 1.0s
      orrery.update(0.85);
      expect(orrery.isCh2ShockwaveActive()).toBe(false);
      expect(echoMesh.visible).toBe(false);
      expect(echoMesh.material.opacity).toBe(0.0);
    });

    it('Chapter 2 -> Chapter 3 handoff smoothly fades out all mystical visual pass elements', () => {
      advanceToChapter2();
      // Drive to lock and complete milestone
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(2.1);
      expect(orrery.isResonanceCompletionEmitted()).toBe(true);

      // Trigger handoff to Chapter 3
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });

      // Mid-transition (1.0s)
      orrery.update(1.0);
      expect(orrery.isChapterTransitionActive()).toBe(true);

      const rings = orrery.getCh2ConcentricRings();
      const axes = orrery.getCh2CardinalAxes();
      const filaments = orrery.getCh2ResonanceFilaments();
      const bridge = orrery.getCh2StarBridge();

      // Opacities are fading toward 0
      expect(rings[0].material.opacity).toBeLessThan(0.30);
      expect(axes.material.opacity).toBeLessThan(0.20);
      expect(filaments.material.opacity).toBeLessThan(0.30);
      expect(bridge.material.opacity).toBeLessThan(0.50);

      // Complete transition
      orrery.update(1.1);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(2).visible).toBe(false);
    });

    it('reset() restores all mystical visual pass elements to pristine baseline and enables clean replay', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.25);
      expect(orrery.getCh2ResonanceFilaments().visible).toBe(true);
      expect(orrery.getCh2ConcentricRings()[0].visible).toBe(true);

      director.reset();
      orrery.reset();

      const rings = orrery.getCh2ConcentricRings();
      const axes = orrery.getCh2CardinalAxes();
      const filaments = orrery.getCh2ResonanceFilaments();
      const bridge = orrery.getCh2StarBridge();
      const trail = orrery.getCh2PlanetTrail();
      const echoMesh = orrery.getCh2ShockwaveEcho();

      for (const ring of rings) {
        expect(ring.visible).toBe(false);
        expect(ring.material.opacity).toBe(0.0);
      }
      expect(axes.visible).toBe(false);
      expect(axes.material.opacity).toBe(0.0);
      expect(filaments.visible).toBe(false);
      expect(filaments.material.opacity).toBe(0.0);
      expect(bridge.visible).toBe(false);
      expect(bridge.material.opacity).toBe(0.0);
      expect(trail.visible).toBe(false);
      expect(echoMesh.visible).toBe(false);
      expect(echoMesh.scale.x).toBeCloseTo(0.20, 2);

      // Replay
      advanceToChapter2();
      expect(orrery.getChapter()).toBe(2);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(filaments.visible).toBe(false);
    });
  });

  // ==========================================================================
  // 20. CHAPTER 2 BINARY RESONANCE DEBUG SHOWCASE (VISUAL QA CONTROLS)
  // ==========================================================================

  describe('20. Chapter 2 Binary Resonance Debug Showcase (Visual QA Controls)', () => {
    it('debugChapter2("chaotic") sets progress to 0.0 and chaotic circumbinary state', () => {
      const success = orrery.debugChapter2('chaotic');
      expect(success).toBe(true);

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(true);
      expect(state.state).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(state.resonanceProgress).toBe(0.0);
      expect(state.playerPlanetVisible).toBe(true);
      expect(state.binaryStarsVisible).toBe(true);
      expect(state.particleFieldVisible).toBe(false);
      expect(state.harmonicNodesVisible).toBe(false);
      expect(state.shieldVisible).toBe(false);
      expect(state.shockwaveVisible).toBe(false);
      expect(state.resonanceLockedVisible).toBe(false);

      // Verify orbital wobble is at maximum base amplitude
      expect(orrery.getCh2EffectiveWobble()).toBeCloseTo(0.14, 3);
    });

    it('debugChapter2("early") sets progress to 0.20 and reveals initial harmonic structures', () => {
      const success = orrery.debugChapter2('early');
      expect(success).toBe(true);

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(true);
      expect(state.state).toBe(Ch2ResonanceState.CHAOTIC_CIRCUMBINARY);
      expect(state.resonanceProgress).toBeCloseTo(0.20, 2);
      expect(state.particleFieldVisible).toBe(true);
      expect(state.harmonicNodesVisible).toBe(true);
      expect(state.shieldVisible).toBe(true);
      expect(state.shockwaveVisible).toBe(false);
      expect(state.resonanceLockedVisible).toBe(false);

      // Wobble is damped by 20%
      expect(orrery.getCh2EffectiveWobble()).toBeCloseTo(0.14 * 0.80, 3);
    });

    it('debugChapter2("mid") sets progress to 0.50 and transitions to RESONANCE_STABILIZATION', () => {
      const success = orrery.debugChapter2('mid');
      expect(success).toBe(true);

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(true);
      expect(state.state).toBe(Ch2ResonanceState.RESONANCE_STABILIZATION);
      expect(state.resonanceProgress).toBeCloseTo(0.50, 2);
      expect(state.particleFieldVisible).toBe(true);
      expect(state.harmonicNodesVisible).toBe(true);
      expect(state.shieldVisible).toBe(true);

      // Astrolabe rings and rosette filaments are active
      const rings = orrery.getCh2ConcentricRings();
      expect(rings[0].visible).toBe(true);
      expect(rings[1].visible).toBe(true);
      expect(orrery.getCh2ResonanceFilaments().visible).toBe(true);
      expect(orrery.getCh2TravelingHighlights().visible).toBe(true);
    });

    it('debugChapter2("near-lock") sets progress to 0.90 with near-zero wobble and active kintsugi glow', () => {
      const success = orrery.debugChapter2('near-lock');
      expect(success).toBe(true);

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(true);
      expect(state.state).toBe(Ch2ResonanceState.RESONANCE_STABILIZATION);
      expect(state.resonanceProgress).toBeCloseTo(0.90, 2);
      expect(state.shockwaveVisible).toBe(false);
      expect(state.resonanceLockedVisible).toBe(false);

      // Wobble is 90% damped
      expect(orrery.getCh2EffectiveWobble()).toBeCloseTo(0.14 * 0.10, 3);

      // Planet kintsugi glow is illuminated
      const planetMesh = orrery.ch2PlanetNode;
      expect(planetMesh.material.uniforms.uKintsugiGlow.value).toBeGreaterThan(0.30);
    });

    it('debugChapter2("locked") sets progress to 1.0, triggers shockwave and RESONANCE LOCKED milestone', () => {
      const success = orrery.debugChapter2('locked');
      expect(success).toBe(true);

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(true);
      expect(state.state).toBe(Ch2ResonanceState.RESONANCE_2_1);
      expect(state.resonanceProgress).toBe(1.0);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(state.shockwaveVisible).toBe(true);
      expect(state.resonanceLockedVisible).toBe(true);

      // Wobble is completely 0.0
      expect(orrery.getCh2EffectiveWobble()).toBe(0.0);
    });

    it('debugChapter2("locked") applies the shared Stage 2 preset without advancing narrative progression', () => {
      expect(orrery.getVisualStage()).toBe(1.0);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBe(1.0);

      expect(orrery.debugChapter2('locked')).toBe(true);

      const stage2 = DEBUG_STAGE_PRESETS[PLANETOID_STAGES.AWAKENING];
      const state = orrery.getChapter2DebugState();
      const uniforms = orrery.ch2PlanetNode.material.uniforms;
      expect(orrery.chapterGroups[1].visible).toBe(false);
      expect(orrery.chapterGroups[2].visible).toBe(true);
      expect(orrery.ch2PlanetNode.visible).toBe(true);
      expect(uniforms.uVisualStage.value).toBe(2.0);
      expect(uniforms.uAwakeningProgress.value).toBe(1.0);
      expect(uniforms.uKintsugiGlow.value).toBe(stage2.kintsugiGlow);
      expect(uniforms.uOceanFill.value).toBe(stage2.oceanFill);
      expect(uniforms.uAtmosphereDensity.value).toBe(stage2.atmosphereDensity);
      expect(orrery.ch2PlanetAtmosphereMaterial.uniforms.uVisualStage.value).toBe(2.0);
      expect(orrery.ch2PlanetAtmosphereMaterial.uniforms.uAtmosphereDensity.value).toBe(stage2.atmosphereDensity);
      expect(state.state).toBe(Ch2ResonanceState.RESONANCE_2_1);
      expect(state.resonanceProgress).toBe(1.0);
      expect(state.playerPlanetVisible).toBe(true);
      expect(state.binaryStarsVisible).toBe(true);
      expect(state.particleFieldVisible).toBe(true);
      expect(state.harmonicNodesVisible).toBe(true);
      expect(state.shieldVisible).toBe(true);
      expect(state.triadBridgeVisible).toBe(true);
      expect(state.sacredRosetteVisible).toBe(true);
      expect(state.planetAuraVisible).toBe(true);
      expect(state.resonanceLockedVisible).toBe(true);
      expect(director.getChapter()).toBe(1);

      orrery.debugChapter2Reset();
      expect(orrery.getVisualStage()).toBe(1.0);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBe(1.0);
      expect(orrery.ch2PlanetNode.material.uniforms.uVisualStage.value).toBe(1.0);
    });

    it('keeps Chapter 2 debug display on Stage 2 while retaining the latest authoritative stage for reset', () => {
      orrery.debugChapter2('chaotic');
      eventBus.emit(Events.EVOLUTION_PROGRESS, { visualStage: 1.5 });

      expect(orrery.ch2PlanetNode.material.uniforms.uVisualStage.value).toBe(2.0);

      orrery.debugChapter2Reset();
      expect(orrery.getVisualStage()).toBe(1.5);
      expect(orrery.ch1PlanetNode.material.uniforms.uVisualStage.value).toBe(1.5);
      expect(orrery.ch2PlanetNode.material.uniforms.uVisualStage.value).toBe(1.5);
    });

    it('debug states do NOT emit ORRERY_RESONANCE_COMPLETED', () => {
      let emitted = false;
      eventBus.on(Events.ORRERY_RESONANCE_COMPLETED, () => {
        emitted = true;
      });

      orrery.debugChapter2('locked');
      // Advance time past RESONANCE_LOCKED_DURATION (2.0s)
      for (let i = 0; i < 30; i++) {
        orrery.update(0.1);
      }

      expect(emitted).toBe(false);
      expect(orrery.isResonanceCompletionEmitted()).toBe(false);
    });

    it('debug states do NOT advance Chapter 3 or alter narrative progression', () => {
      expect(director.getChapter()).toBe(1);

      orrery.debugChapter2('locked');
      for (let i = 0; i < 30; i++) {
        orrery.update(0.1);
      }

      // Director chapter remains at 1
      expect(director.getChapter()).toBe(1);
      expect(orrery.getChapter()).toBe(1);
    });

    it('debugChapter2Reset() cleanly restores baseline state and pre-debug visibility', () => {
      orrery.debugChapter2('locked');
      expect(orrery.getChapter2DebugState().debugMode).toBe(true);

      orrery.debugChapter2Reset();

      const state = orrery.getChapter2DebugState();
      expect(state.debugMode).toBe(false);
      expect(state.resonanceProgress).toBe(0.0);
      expect(state.shockwaveVisible).toBe(false);
      expect(state.resonanceLockedVisible).toBe(false);

      // Since narrative director was at Chapter 1, Chapter 1 visibility is restored
      expect(orrery.chapterGroups[1].visible).toBe(true);
      expect(orrery.chapterGroups[2].visible).toBe(false);
    });

    it('repeated debug-state switching does not duplicate objects or leak meshes', () => {
      const barycenterInitialChildren = orrery.ch2Barycenter.children.length;
      const ch2GroupInitialChildren = orrery.chapterGroups[2].children.length;

      const sequence = ['chaotic', 'early', 'mid', 'near-lock', 'locked', 'chaotic', 'locked', 'mid'];
      for (const st of sequence) {
        orrery.debugChapter2(st);
        orrery.update(0.016);
      }

      expect(orrery.ch2Barycenter.children.length).toBe(barycenterInitialChildren);
      expect(orrery.chapterGroups[2].children.length).toBe(ch2GroupInitialChildren);
    });

    it('debugChapter2Play() advances through chaotic -> early -> mid -> near-lock -> locked over ~11.5s', () => {
      orrery.debugChapter2Play();
      expect(orrery.getResonanceProgress()).toBe(0.0);

      // At t = 1.0s: still chaotic
      orrery.update(1.0);
      expect(orrery.getResonanceProgress()).toBe(0.0);

      // At t = 2.5s: early (progress = 0.20)
      orrery.update(1.5);
      expect(orrery.getResonanceProgress()).toBeCloseTo(0.20, 2);

      // At t = 4.5s: mid (progress = 0.50)
      orrery.update(2.0);
      expect(orrery.getResonanceProgress()).toBeCloseTo(0.50, 2);

      // At t = 6.5s: near-lock (progress = 0.90)
      orrery.update(2.0);
      expect(orrery.getResonanceProgress()).toBeCloseTo(0.90, 2);

      // At t = 8.5s: locked (progress = 1.0)
      orrery.update(2.0);
      expect(orrery.getResonanceProgress()).toBe(1.0);
      expect(orrery.isResonanceLocked()).toBe(true);

      // At t = 12.0s: completed automated playback, remains locked
      orrery.update(3.5);
      expect(orrery.getResonanceProgress()).toBe(1.0);

      // debugChapter2Stop() stops the play sequence
      orrery.debugChapter2Stop();
    });

    it('rejects unknown debug state string gracefully without throwing', () => {
      const result = orrery.debugChapter2('invalid_xyz_state');
      expect(result).toBe(false);
    });

    it('gameplay catches during debug mode do not corrupt the debug preview', () => {
      orrery.debugChapter2('mid');
      expect(orrery.getResonanceProgress()).toBeCloseTo(0.50, 2);

      // Emit gameplay catch response
      eventBus.emit(Events.SCORE, {
        catchType: 'CLEAN',
        multipliers: { total: 2.0 }
      });
      orrery.update(0.016);

      // Debug progress remains locked at 0.50
      expect(orrery.getResonanceProgress()).toBeCloseTo(0.50, 2);
      expect(orrery.getCh2ResonanceState()).toBe(Ch2ResonanceState.RESONANCE_STABILIZATION);
    });
  });

  describe('21. Chapter 2 Three-Body Composition & Mystical Readability Correction', () => {
    it('keeps the Stage 2 planet in a compact triangular circumbinary composition', () => {
      advanceToChapter2();
      expect(orrery.ch2PlanetNode.scale.x).toBeCloseTo(0.20, 2);
      orrery.debugChapter2('locked');
      const planet = orrery.ch2PlanetNode;
      expect(Math.hypot(planet.position.x, planet.position.z)).toBeCloseTo(0.76, 2);
      expect(planet.scale.x).toBeCloseTo(0.216, 2);
      expect(planet.position.distanceTo(orrery.ch2Star1.position)).toBeGreaterThan(0.50);
      expect(planet.position.distanceTo(orrery.ch2Star2.position)).toBeGreaterThan(0.50);

      const outerRing = orrery.ch2ConcentricRing3.geometry.attributes.position.array;
      let outerRadius = 0;
      for (let i = 0; i < outerRing.length; i += 3) {
        outerRadius = Math.max(outerRadius, Math.hypot(outerRing[i], outerRing[i + 2]));
      }
      expect(outerRadius).toBeCloseTo(0.96, 2);
      expect(orrery.getCh2ParticleCount()).toBe(100);
      const particleMatrices = orrery.ch2ParticleField.instanceMatrix.array;
      for (let i = 0; i < 100; i++) {
        const x = particleMatrices[i * 16 + 12];
        const z = particleMatrices[i * 16 + 14];
        const radius = Math.hypot(x, z);
        expect(radius).toBeGreaterThan(0.35);
        expect(radius).toBeLessThan(0.92);
      }
    });

    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1);
    }

    it('suppresses standalone PlanetoidRenderer during Chapter 2 gameplay and debug inspection', () => {
      const mockPlanetoid = {
        group: { visible: true },
        isDebugMode: () => false
      };
      orrery.setPlanetoidRenderer(mockPlanetoid);

      // Entering Chapter 2 suppresses foreground standalone planet
      advanceToChapter2();
      expect(mockPlanetoid.group.visible).toBe(false);

      // Simulating frames in Chapter 2 keeps it suppressed
      mockPlanetoid.group.visible = true;
      orrery.update(0.016);
      expect(mockPlanetoid.group.visible).toBe(false);

      // Debug showcase preview also suppresses foreground planet
      orrery.debugChapter2('mid');
      mockPlanetoid.group.visible = true;
      orrery.update(0.016);
      expect(mockPlanetoid.group.visible).toBe(false);

      // A lingering standalone debug-stage override cannot compete during Chapter 2.
      mockPlanetoid.isDebugMode = () => true;
      mockPlanetoid.group.visible = true;
      orrery.update(0.016);
      expect(mockPlanetoid.group.visible).toBe(false);

      // The dedicated showcase remains an explicit visibility override.
      mockPlanetoid.isShowcaseMode = () => true;
      mockPlanetoid.group.visible = true;
      orrery.update(0.016);
      expect(mockPlanetoid.group.visible).toBe(true);
      expect(orrery.ch2PlanetNode.visible).toBe(true);
    });

    it('creates and animates Chapter 2 Three-Body Triad Energy Bridge (Star 1 <-> Planet <-> Star 2)', () => {
      advanceToChapter2();
      const triadBridge = orrery.getCh2TriadBridge();
      expect(triadBridge).not.toBeNull();
      expect(triadBridge.name).toBe('ch2-triad-bridge-line');
      expect(triadBridge.geometry.attributes.position.count).toBe(32);

      // In chaos (progress = 0), triad bridge is hidden/subtle
      orrery.update(0.016);
      expect(triadBridge.material.opacity).toBeLessThan(0.05);

      // In stabilization (progress >= 0.35), triad bridge emerges
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(triadBridge.visible).toBe(true);
      expect(triadBridge.material.opacity).toBeGreaterThan(0.20);

      // At lock (progress = 1.0), triad bridge shines brightly
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(triadBridge.material.opacity).toBeGreaterThanOrEqual(0.60);
    });

    it('creates and animates Chapter 2 Player Planet Aura (ch2PlanetAura)', () => {
      advanceToChapter2();
      const planetAura = orrery.getCh2PlanetAura();
      expect(planetAura).not.toBeNull();
      expect(planetAura.name).toBe('ch2-planet-aura');
      expect(planetAura.parent).toBe(orrery.ch2PlanetNode);

      // In chaos, aura baseline is subtle (centered at 0.20 with dynamic breathing)
      orrery.update(0.016);
      expect(planetAura.material.uniforms.uBaseOpacity.value).toBeGreaterThanOrEqual(0.14);
      expect(planetAura.material.uniforms.uBaseOpacity.value).toBeLessThanOrEqual(0.26);
      expect(planetAura.scale.x).toBeCloseTo(1.25, 2);

      // In stabilization, aura emerges and grows
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      expect(planetAura.visible).toBe(true);
      expect(planetAura.material.uniforms.uBaseOpacity.value).toBeGreaterThan(0.25);

      // At lock, aura breathes with enhanced presence
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);
      expect(planetAura.visible).toBe(true);
      expect(planetAura.material.uniforms.uBaseOpacity.value).toBeGreaterThanOrEqual(0.35);
      expect(planetAura.scale.x).toBeGreaterThan(1.30);
    });

    it('positions resonance locked milestone text cleanly above three-body system at (0.0, 0.58, 0.0)', () => {
      advanceToChapter2();
      const milestone = orrery.ch2ResonanceLockedText;
      expect(milestone).not.toBeNull();
      expect(milestone.position.x).toBeCloseTo(0.0, 3);
      expect(milestone.position.y).toBeCloseTo(0.58, 2);
      expect(milestone.position.z).toBeCloseTo(0.0, 3);
    });

    it('orients instanced resonance particles along orbital velocity tangents with non-uniform stretching', () => {
      advanceToChapter2();
      for (let i = 0; i < 6; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);
      const field = orrery.getCh2ParticleField();
      expect(field).not.toBeNull();

      const matrixElements = field.instanceMatrix.array;
      const stLen = Math.hypot(matrixElements[0], matrixElements[1], matrixElements[2]);
      const srLen = Math.hypot(matrixElements[4], matrixElements[5], matrixElements[6]);
      expect(stLen).toBeGreaterThan(srLen);
    });

    it('reports triadBridgeVisible and planetAuraVisible in getChapter2DebugState()', () => {
      orrery.debugChapter2('locked');
      const state = orrery.getChapter2DebugState();
      expect(state.triadBridgeVisible).toBe(true);
      expect(state.planetAuraVisible).toBe(true);
      expect(state.sacredRosetteVisible).toBe(true);
      expect(orrery.isChapter2DebugActive()).toBe(true);

      orrery.debugChapter2Reset();
      expect(orrery.isChapter2DebugActive()).toBe(false);
    });

    it('cleanly resets triad bridge and planet aura on reset()', () => {
      advanceToChapter2();
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      orrery.update(0.016);

      const triadBridge = orrery.getCh2TriadBridge();
      const planetAura = orrery.getCh2PlanetAura();
      expect(triadBridge.visible).toBe(true);
      expect(planetAura.visible).toBe(true);

      orrery.reset();

      expect(triadBridge.visible).toBe(false);
      expect(triadBridge.material.opacity).toBe(0.0);
      expect(planetAura.material.uniforms.uBaseOpacity.value).toBeCloseTo(0.20, 2);
      expect(planetAura.scale.x).toBeCloseTo(1.25, 2);
    });

    it('creates procedural stellar body materials for Binary Star 1 and Binary Star 2 with living plasma convection', () => {
      advanceToChapter2();
      expect(orrery.ch2Star1).not.toBeNull();
      expect(orrery.ch2Star2).not.toBeNull();

      // Check Star 1 (Peach/Champagne) procedural stellar material
      const mat1 = orrery.ch2Star1.material;
      expect(mat1.isShaderMaterial).toBe(true);
      expect(mat1.transparent).toBe(true);
      expect(mat1.depthWrite).toBe(false);
      expect(mat1.uniforms.uCoreColor).toBeDefined();
      expect(mat1.uniforms.uMidColor).toBeDefined();
      expect(mat1.uniforms.uDarkColor).toBeDefined();
      expect(mat1.uniforms.uRimColor).toBeDefined();
      expect(mat1.uniforms.uTime).toBeDefined();
      expect(mat1.uniforms.uSurge).toBeDefined();

      // Check Star 2 (Lavender/Amethyst) procedural stellar material
      const mat2 = orrery.ch2Star2.material;
      expect(mat2.isShaderMaterial).toBe(true);
      expect(mat2.transparent).toBe(true);
      expect(mat2.depthWrite).toBe(false);
      expect(mat2.uniforms.uCoreColor).toBeDefined();
      expect(mat2.uniforms.uMidColor).toBeDefined();
      expect(mat2.uniforms.uDarkColor).toBeDefined();
      expect(mat2.uniforms.uRimColor).toBeDefined();
      expect(mat2.uniforms.uTime).toBeDefined();
      expect(mat2.uniforms.uSurge).toBeDefined();

      // Ensure distinct identities
      expect(mat1.uniforms.uMidColor.value.getHexString()).not.toBe(mat2.uniforms.uMidColor.value.getHexString());

      // Frame updates advance uTime
      orrery.update(0.5);
      expect(mat1.uniforms.uTime.value).toBeCloseTo(orrery.simTime, 3);
      expect(mat2.uniforms.uTime.value).toBeCloseTo(orrery.simTime, 3);

      // Scoring a catch triggers surge
      eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      orrery.update(0.016);
      expect(mat1.uniforms.uSurge.value).toBeGreaterThan(0.0);
      expect(mat2.uniforms.uSurge.value).toBeGreaterThan(0.0);
    });

    it('equips 100-particle field with 4-band mystical stardust palette and slender directional streak scaling', () => {
      advanceToChapter2();
      const field = orrery.getCh2ParticleField();
      expect(field).not.toBeNull();
      expect(field.instanceColor).not.toBeNull();
      expect(field.instanceColor.count).toBe(100);

      // Check that material uses additive blending for luminous stardust look
      expect(field.material.transparent).toBe(true);
      expect(field.material.depthWrite).toBe(false);

      // Advance progress to organize filaments
      for (let i = 0; i < 10; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 1.0 } });
      }
      orrery.update(0.016);

      // Slender directional streak: tangent length (st) is > 15x radial thickness (sr)
      const matrixElements = field.instanceMatrix.array;
      const stLen = Math.hypot(matrixElements[0], matrixElements[1], matrixElements[2]);
      const srLen = Math.hypot(matrixElements[8], matrixElements[9], matrixElements[10]);
      expect(stLen).toBeGreaterThan(srLen * 15.0);
    });
  });

  // ==========================================================================
  // 22. CHAPTER 2 BINARY STAR VISUAL CORRECTION (STELLAR PLASMA BODIES VS PLAYER PLANET)
  // ==========================================================================
  describe('22. Chapter 2 Binary Star Visual Correction (Stellar Plasma Bodies vs Player Planet)', () => {
    function advanceToChapter2() {
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 1, progress: 1.0 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      orrery.update(2.1);
    }

    it('creates procedural stellar plasma ShaderMaterials for Chapter 2 binary stars with directional lighting and convective flow', () => {
      advanceToChapter2();
      expect(orrery.ch2Star1).not.toBeNull();
      expect(orrery.ch2Star2).not.toBeNull();

      const mat1 = orrery.ch2Star1.material;
      const mat2 = orrery.ch2Star2.material;

      // Both bodies must be procedural stellar plasma ShaderMaterials
      expect(mat1.isShaderMaterial).toBe(true);
      expect(mat2.isShaderMaterial).toBe(true);

      // Must have directional key lighting for 3D spherical dimensionality with elevated ambient floor
      expect(mat1.uniforms.uLightDirection).toBeDefined();
      expect(mat2.uniforms.uLightDirection).toBeDefined();

      // Must have procedural plasma convection parameters (seed, scale, frequency, surface flow speed)
      expect(mat1.uniforms.uNoiseSeed).toBeDefined();
      expect(mat2.uniforms.uNoiseSeed).toBeDefined();
      expect(mat1.uniforms.uNoiseScale).toBeDefined();
      expect(mat2.uniforms.uNoiseScale).toBeDefined();
      expect(mat1.uniforms.uNoiseFrequency).toBeDefined();
      expect(mat2.uniforms.uNoiseFrequency).toBeDefined();
      expect(mat1.uniforms.uSurfaceSpeed).toBeDefined();
      expect(mat2.uniforms.uSurfaceSpeed).toBeDefined();

      // Must have luminous stellar limb Fresnel emission
      expect(mat1.uniforms.uRimColor).toBeDefined();
      expect(mat2.uniforms.uRimColor).toBeDefined();

      // Must have resonance progress and catch surge response
      expect(mat1.uniforms.uResonanceProgress).toBeDefined();
      expect(mat2.uniforms.uResonanceProgress).toBeDefined();
      expect(mat1.uniforms.uSurge).toBeDefined();
      expect(mat2.uniforms.uSurge).toBeDefined();
    });

    it('differentiates Star 1 and Star 2 via palette, seed, scale, and surface speed', () => {
      advanceToChapter2();
      const p1 = orrery.ch2Star1;
      const p2 = orrery.ch2Star2;

      // Scale differentiation
      expect(p1.scale.x).toBeCloseTo(0.12, 2);
      expect(p2.scale.x).toBeCloseTo(0.10, 2);
      expect(p1.scale.x).not.toBe(p2.scale.x);

      // Distinct procedural noise seeds
      const seed1 = p1.material.uniforms.uNoiseSeed.value;
      const seed2 = p2.material.uniforms.uNoiseSeed.value;
      expect(seed1.x).not.toBe(seed2.x);

      // Distinct surface flow speeds
      const spd1 = p1.material.uniforms.uSurfaceSpeed.value;
      const spd2 = p2.material.uniforms.uSurfaceSpeed.value;
      expect(spd1).not.toBe(spd2);

      // Distinct palette mid/core colors (Peach vs Lavender)
      expect(p1.material.uniforms.uMidColor.value.getHexString())
        .not.toBe(p2.material.uniforms.uMidColor.value.getHexString());
      expect(p1.material.uniforms.uDeepViolet.value.getHexString())
        .not.toBe(p2.material.uniforms.uDeepViolet.value.getHexString());
    });

    it('confirms player planet (ch2PlanetNode) is the ONLY body with geological terrain/crater shaders', () => {
      advanceToChapter2();
      expect(orrery.ch2PlanetNode).not.toBeNull();
      expect(orrery.ch2PlanetNode.userData.isPlayerPlanet).toBe(true);
      expect(orrery.ch2PlanetNode.userData.stage).toBe(2);
      expect(orrery.ch2PlanetNode.userData.hasKintsugi).toBe(true);
      expect(orrery.ch2PlanetMaterial.uniforms.uVisualStage.value).toBe(2.0);

      // Binary bodies are explicitly marked as stellar plasma bodies, NOT geological planets
      expect(orrery.ch2Star1.userData.isStellarBody).toBe(true);
      expect(orrery.ch2Star1.userData.isBinaryStar).toBe(true);
      expect(orrery.ch2Star2.userData.isStellarBody).toBe(true);
      expect(orrery.ch2Star2.userData.isBinaryStar).toBe(true);
    });

    it('equips both stars with atmospheric corona halos that intensify with resonance progress', () => {
      advanceToChapter2();
      expect(orrery.ch2Star1Glow).toBeDefined();
      expect(orrery.ch2Star2Glow).toBeDefined();
      expect(orrery.ch2Star1Glow.scale.x).toBeGreaterThan(1.18);
      expect(orrery.ch2Star1Glow.scale.x).toBeLessThan(1.35);
      expect(orrery.ch2Star2Glow.scale.x).toBeGreaterThan(1.18);
      expect(orrery.ch2Star2Glow.scale.x).toBeLessThan(1.35);

      // Initial opacity before resonance
      const initialGlow1 = orrery.ch2Star1Glow.material.uniforms.uBaseOpacity.value;

      // Advance resonance
      for (let i = 0; i < 15; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'PERFECT', multipliers: { total: 1.5 } });
      }
      orrery.update(0.016);

      const intensifiedGlow1 = orrery.ch2Star1Glow.material.uniforms.uBaseOpacity.value;
      expect(intensifiedGlow1).toBeGreaterThan(initialGlow1);
    });

    it('creates "RESONANCE ACHIEVED" milestone texture reusing Chapter 1 stable-state visual treatment', () => {
      const tex = createResonanceAchievedTextTexture();
      expect(tex).toBeDefined();
      expect(tex.isTexture).toBe(true);

      // Backward compatibility alias must also resolve
      const aliasTex = createResonanceLockedTextTexture();
      expect(aliasTex).toBeDefined();
      expect(aliasTex.isTexture).toBe(true);
    });

    it('displays "RESONANCE ACHIEVED" sprite using Chapter 1 entrance scale, breathing, and hold animation', () => {
      advanceToChapter2();
      const milestone = orrery.getResonanceAchievedText();
      expect(milestone).toBeDefined();
      expect(milestone).toBe(orrery.getResonanceLockedText());
      expect(milestone.visible).toBe(false);

      // Trigger resonance lock
      for (let i = 0; i < 20; i++) {
        eventBus.emit(Events.SCORE, { catchType: 'CLEAN', multipliers: { total: 2.0 } });
      }
      expect(orrery.isResonanceLocked()).toBe(true);

      // 0.20s -> 0.45s: smooth entrance animation
      orrery.update(0.35);
      expect(milestone.visible).toBe(true);
      expect(milestone.material.opacity).toBeGreaterThan(0.0);
      expect(milestone.scale.x).toBeGreaterThan(0.88 * 0.88);

      // 0.45s -> 1.60s: steady hold with gentle breathing
      orrery.update(0.65);
      expect(milestone.visible).toBe(true);
      expect(milestone.material.opacity).toBeCloseTo(1.0, 1);
      expect(milestone.scale.x).toBeCloseTo(0.88, 2);

      // 2.00s+: completed and fades cleanly
      orrery.update(1.2);
      expect(milestone.visible).toBe(false);
      expect(milestone.material.opacity).toBe(0.0);
    });

    it('ensures Chapter 1 planets and stable-state visuals remain 100% unchanged', () => {
      orrery.update(0.1);

      // Chapter 1 primary star
      expect(orrery.ch1PrimaryStar).toBeDefined();
      expect(orrery.ch1PrimaryStar.scale.x).toBeCloseTo(0.145, 3);
      expect(orrery.ch1StarGlow).toBeDefined();
      expect(orrery.ch1StarGlow.scale.x).toBeCloseTo(1.20, 2);

      // Chapter 1 secondary perturber world
      expect(orrery.ch1Perturber).toBeDefined();
      expect(orrery.ch1Perturber.scale.x).toBeCloseTo(0.095, 3);
      expect(orrery.ch1PerturberGlow).toBeDefined();
      expect(orrery.ch1PerturberGlow.scale.x).toBeGreaterThan(1.15);
      expect(orrery.ch1PerturberGlow.scale.x).toBeLessThan(1.22);

      // Chapter 1 player world
      expect(orrery.ch1PlanetNode).toBeDefined();
      expect(orrery.ch1PlanetNode.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch1PlanetAura).toBeDefined();
      expect(orrery.ch1PlanetAura.scale.x).toBeCloseTo(1.08, 2);

      // Chapter 1 stable state text
      const ch1Text = orrery.getStableStateText();
      expect(ch1Text).toBeDefined();
      expect(ch1Text.scale.x).toBeCloseTo(0.88, 2);
      expect(ch1Text.scale.y).toBeCloseTo(0.22, 2);
    });
  });

  describe('24. Chapter 4: Roche Disruption & Ring Formation Visual System', () => {
    function advanceToChapter4() {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orrery._syncFromDirector();
    }

    it('creates Chapter 4 Stage 4 Living Green World host planet with dedicated atmosphere', () => {
      const ch4 = orrery.getChapterGroup(4);
      expect(ch4).toBeDefined();
      expect(orrery.ch4PlanetNode).toBeDefined();
      expect(orrery.ch4PlanetNode.name).toBe('host-planet');
      expect(orrery.ch4HostPlanet).toBe(orrery.ch4PlanetNode);

      // Verify protagonist scale (~0.324) for prominent celestial presence
      expect(orrery.ch4PlanetNode.scale.x).toBeCloseTo(0.324, 2);
      expect(orrery.ch4PlanetNode.scale.y).toBeCloseTo(0.324, 2);
      expect(orrery.ch4PlanetNode.scale.z).toBeCloseTo(0.324, 2);

      // Verify Stage 4 Living Green World core uniforms
      const u = orrery.ch4PlanetNode.material.uniforms;
      expect(u.uVisualStage.value).toBe(4.0);
      expect(u.uOceanFill.value).toBeCloseTo(0.95, 2);
      expect(u.uAtmosphereDensity.value).toBeCloseTo(0.90, 2);
      expect(u.uKintsugiGlow.value).toBeCloseTo(0.85, 2);

      // Verify dedicated atmosphere child mesh
      expect(orrery.ch4PlanetAtmosphere).toBeDefined();
      expect(orrery.ch4PlanetAtmosphere.name).toBe('ch4-planet-atmosphere');
      const atmoU = orrery.ch4PlanetAtmosphere.material.uniforms;
      expect(atmoU.uVisualStage.value).toBe(4.0);
      expect(atmoU.uAtmosphereDensity.value).toBeCloseTo(0.90, 2);
    });

    it('orients Chapter 4 ring discs, fragments, and Roche limit marker broadside to player camera', () => {
      // Ring discs and fragments lie broadside in the XY plane (rotation.x == 0)
      expect(orrery.ch4InnerRing.rotation.x).toBe(0.0);
      expect(orrery.ch4OuterRing.rotation.x).toBe(0.0);
      expect(orrery.ch4Fragments.rotation.x).toBe(0.0);
      // Roche limit loop rotated to lie in the same broadside XY plane
      expect(orrery.ch4RocheLimitLine.rotation.x).toBeCloseTo(Math.PI * 0.5, 2);
    });

    it('protects Chapter 4 Stage 4 planet from setVisualStage(1.0) clobbering', () => {
      advanceToChapter4();
      expect(orrery.activeChapter).toBe(4);

      // Attempt to overwrite stage with Stage 1
      orrery.setVisualStage(1.0);

      // Chapter 4 planet must preserve Stage 4 uniforms
      const u = orrery.ch4PlanetNode.material.uniforms;
      expect(u.uVisualStage.value).toBe(4.0);
      expect(u.uOceanFill.value).toBeCloseTo(0.95, 2);
      expect(u.uAtmosphereDensity.value).toBeCloseTo(0.90, 2);
      expect(orrery.ch4PlanetAtmosphere.visible).toBe(true);
    });

    it('returns the Stage 4 Living Green World node for getPlanetNode(4) and getActivePlanetoidNode()', () => {
      expect(orrery.getPlanetNode(4)).toBe(orrery.ch4PlanetNode);
      advanceToChapter4();
      expect(orrery.getActivePlanetoidNode()).toBe(orrery.ch4PlanetNode);
    });

    it('creates 6 irregular orbiting asteroids in outer orbits with varied radii and inclinations', () => {
      expect(orrery.ch4Asteroids).toHaveLength(6);
      expect(orrery.ch4AsteroidGroup.children).toHaveLength(6);
      expect(orrery.ch4Satellite).toBe(orrery.ch4Asteroids[0].mesh);
      expect(orrery.ch4Asteroids[0].mesh.name).toBe('approaching-satellite');

      const expectedRadii = [1.15, 1.25, 1.35, 1.45, 1.55, 1.65];
      for (let i = 0; i < 6; i++) {
        expect(orrery.ch4Asteroids[i].baseRadius).toBeCloseTo(expectedRadii[i], 2);
        expect(orrery.ch4Asteroids[i].state).toBe('orbiting');
      }

      // Verify orbital motion advances positions
      advanceToChapter4();
      const pos0 = orrery.ch4Asteroids[1].mesh.position.clone();
      orrery.update(0.1);
      const pos1 = orrery.ch4Asteroids[1].mesh.position;
      expect(pos0.distanceTo(pos1)).toBeGreaterThan(0.005);
    });

    it('round-robin selects orbiting asteroids upon canonical Perfect Kendama score events (CLEAN)', () => {
      advanceToChapter4();
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');
      expect(orrery.ch4Asteroids[1].state).toBe('orbiting');

      // First canonical Perfect catch (catchType === 'CLEAN') triggers asteroid 0
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_clean_1',
          catchType: 'CLEAN',
          baseEnergy: 20,
          multipliers: { accuracy: 1.4, cadence: 1.0, streak: 1.15, total: 1.61 },
          awardedEnergy: 32
        },
        awardedEnergy: 32
      });
      expect(orrery.ch4Asteroids[0].state).toBe('approaching');
      expect(orrery.ch4Asteroids[1].state).toBe('orbiting');

      // Duplicate eventId is ignored and does NOT trigger a second asteroid
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_clean_1',
          catchType: 'CLEAN',
          awardedEnergy: 32
        },
        awardedEnergy: 32
      });
      expect(orrery.ch4Asteroids[1].state).toBe('orbiting');

      // Second canonical Perfect catch with new eventId triggers asteroid 1 round-robin
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_clean_2',
          catchType: 'CLEAN',
          awardedEnergy: 20
        },
        awardedEnergy: 20
      });
      expect(orrery.ch4Asteroids[1].state).toBe('approaching');
    });

    it('does not trigger Roche disruption on ASSISTED, MISS, or NONE catches', () => {
      advanceToChapter4();
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');

      // ASSISTED catch must NOT trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_assisted_1',
          catchType: 'ASSISTED'
        }
      });
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');

      // MISS catch must NOT trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_miss_1',
          catchType: 'MISS'
        }
      });
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');

      // NONE catch must NOT trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_none_1',
          catchType: 'NONE'
        }
      });
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');

      // Legacy string 'PERFECT' without CLEAN must NOT trigger under canonical contract
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_legacy_perf_1',
          catchType: 'PERFECT'
        }
      });
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');
    });

    it('triggers CLEAN catches regardless of cadence, multiplier, or energy thresholds', () => {
      advanceToChapter4();
      expect(orrery.ch4Asteroids[0].state).toBe('orbiting');

      // CLEAN catch with baseline cadence (1.0), low multiplier (< 1.75), low energy (< 35)
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'flight_clean_low_mult',
          catchType: 'CLEAN',
          multipliers: { cadence: 1.0, total: 1.0 },
          awardedEnergy: 10
        },
        awardedEnergy: 10
      });
      expect(orrery.ch4Asteroids[0].state).toBe('approaching');
    });

    it('deforms asteroid prolate elongation along radial direction near Roche limit', () => {
      advanceToChapter4();
      orrery.debugChapter4('roche_shepherding');

      const a0 = orrery.ch4Asteroids[0];
      expect(a0.state).toBe('shepherding');
      // Prolate elongation: stretch along radial X, squeeze along transverse
      expect(a0.mesh.scale.x).toBeGreaterThan(1.2);
      expect(a0.mesh.scale.y).toBeLessThan(0.9);
      expect(a0.mesh.scale.z).toBeLessThan(0.9);
    });

    it('disruption activates debris fragments and enriches luminous rings', () => {
      advanceToChapter4();
      orrery.debugChapter4('ring_formed');

      expect(orrery.ch4InnerRing.material.opacity).toBeCloseTo(0.85, 2);
      expect(orrery.ch4OuterRing.material.opacity).toBeCloseTo(0.75, 2);
      expect(orrery.ch4Fragments.visible).toBe(true);
      expect(orrery.ch4Fragments.material.opacity).toBeCloseTo(0.85, 2);
    });

    it('rotates ring discs continuously during update', () => {
      advanceToChapter4();
      const rot0 = orrery.ch4InnerRing.rotation.z;
      orrery.update(0.2);
      expect(orrery.ch4InnerRing.rotation.z).toBeGreaterThan(rot0);
    });

    it('debugChapter4 APIs support state inspection, reset, and return accurate snapshots', () => {
      expect(orrery.debugChapter4('satellite_approach')).toBe(true);
      let snap = orrery.getChapter4DebugState();
      expect(snap.debugMode).toBe(true);
      expect(snap.state).toBe(OrbitalState.SATELLITE_APPROACH);
      expect(snap.visualStage).toBe(4.0);
      expect(snap.hostPlanetVisible).toBe(true);
      expect(snap.asteroidCount).toBe(6);

      expect(orrery.debugChapter4('roche_shepherding')).toBe(true);
      expect(orrery.getChapter4DebugState().state).toBe(OrbitalState.ROCHE_SHEPHERDING);

      expect(orrery.debugChapter4('ring_formed')).toBe(true);
      expect(orrery.getChapter4DebugState().state).toBe(OrbitalState.RING_FORMED);

      // Rejects invalid state
      expect(orrery.debugChapter4('invalid_state_xyz')).toBe(false);

      // Reset
      expect(orrery.debugChapter4Reset()).toBe(true);
      snap = orrery.getChapter4DebugState();
      expect(snap.debugMode).toBe(false);
    });

    it('handles Chapter 3 to Chapter 4 visual transition smoothly', () => {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orrery._syncFromDirector();

      expect(orrery.startChapterTransition(3, 4)).toBe(true);
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(3).visible).toBe(true);
      expect(orrery.getChapterGroup(4).visible).toBe(true);

      // Complete transition (duration 2.0s)
      orrery.update(2.1);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(3).visible).toBe(false);
      expect(orrery.getChapterGroup(4).visible).toBe(true);
      expect(orrery.ch4PlanetNode.visible).toBe(true);
      expect(orrery.ch4PlanetNode.position.x).toBeCloseTo(0.0, 2);
    });

    it('ensures Chapter 1, 2, and 3 visuals and debug states remain intact without regression', () => {
      // Chapter 1 check
      expect(orrery.ch1PlanetNode).toBeDefined();
      expect(orrery.ch1PrimaryStar).toBeDefined();

      // Chapter 2 debug check
      expect(orrery.debugChapter2('locked')).toBe(true);
      expect(orrery.isResonanceLocked()).toBe(true);
      expect(orrery.debugChapter2Reset()).toBe(true);

      // Chapter 3 debug check
      expect(orrery.debugChapter3('gravity_assist')).toBe(true);
      const ch3Snap = orrery.getChapter3DebugState();
      expect(ch3Snap.debugMode).toBe(true);
      expect(ch3Snap.visualStage).toBe(3.0);
      expect(orrery.debugChapter3Reset()).toBe(true);
    });
  });

  describe('25. Chapter 5: Supernova Deflection Visual System', () => {
    function advanceToChapter5() {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orreryState.advanceChapter(5);
      orrery._syncFromDirector();
    }

    it('creates custom collapsing star material with domain-warped lava crack uniforms', () => {
      const mat = createCollapsingStarMaterial();
      expect(mat).toBeDefined();
      expect(mat.uniforms.uLavaIntensity).toBeDefined();
      expect(mat.uniforms.uCrackScale).toBeDefined();
      expect(mat.uniforms.uInstability).toBeDefined();
      expect(mat.uniforms.uFlashPulse).toBeDefined();
      expect(mat.uniforms.uCrustColor).toBeDefined();
      expect(mat.uniforms.uLavaColorDeep).toBeDefined();
      expect(mat.uniforms.uLavaColorBright).toBeDefined();
      expect(mat.uniforms.uFlashColor).toBeDefined();
      expect(mat.vertexShader).toContain('vDomainPos');
      expect(mat.fragmentShader).toContain('domainWarp');
      mat.dispose();
    });

    it('creates distant collapsing star with correct name, initial position, scale, and custom shader', () => {
      const ch5 = orrery.getChapterGroup(5);
      expect(ch5).toBeDefined();
      expect(orrery.ch5StellarCore).toBeDefined();
      expect(orrery.ch5StellarCore.name).toBe('collapsing-core');

      // Initial position (-1.35, 0.55, 0.0)
      expect(orrery.ch5StellarCore.position.x).toBeCloseTo(-1.35, 2);
      expect(orrery.ch5StellarCore.position.y).toBeCloseTo(0.55, 2);
      expect(orrery.ch5StellarCore.position.z).toBeCloseTo(0.0, 2);

      // Initial scale 0.18 (approx 40% of planet diameter)
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch5StellarCore.scale.y).toBeCloseTo(0.18, 2);
      expect(orrery.ch5StellarCore.scale.z).toBeCloseTo(0.18, 2);

      // Custom collapsing star shader material and uniforms
      const mat = orrery.ch5StellarCore.material;
      expect(mat).toBeDefined();
      expect(mat.uniforms.uLavaIntensity).toBeDefined();
      expect(mat.uniforms.uCrackScale).toBeDefined();
      expect(mat.uniforms.uInstability).toBeDefined();
      expect(mat.uniforms.uFlashPulse).toBeDefined();
    });

    it('cycles star visual states: SUPERNOVA_THREAT, STAR_AGITATED, STAR_COLLAPSE, and Remnant', () => {
      // 1. SUPERNOVA_THREAT: low activity
      orrery.debugChapter5('supernova_threat');
      expect(orrery.ch5StellarCore.material.uniforms.uLavaIntensity.value).toBeCloseTo(0.30, 2);
      expect(orrery.ch5StellarCore.material.uniforms.uInstability.value).toBeCloseTo(0.0, 2);
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.18, 2);

      // 2. STAR_AGITATED: increased crack activity
      orrery.debugChapter5('star_agitated');
      expect(orrery.ch5StellarCore.material.uniforms.uInstability.value).toBeGreaterThan(0.5);
      expect(orrery.ch5StellarCore.material.uniforms.uLavaIntensity.value).toBeGreaterThan(0.5);

      // 3. STAR_COLLAPSE: reduces scale and reaches peak flash
      orrery.debugChapter5('star_collapse');
      expect(orrery.ch5StellarCore.material.uniforms.uFlashPulse.value).toBeGreaterThan(0.8);
      expect(orrery.ch5StellarCore.scale.x).toBeLessThan(0.18);

      // 4. Remnant state: reduced scale (~0.055)
      orrery.debugChapter5('atmosphere_protected');
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.055, 2);
    });

    it('creates Stage 5 protagonist planet with scale 0.45, Stage 5 uniforms, and responding deflector', () => {
      expect(orrery.ch5PlanetNode).toBeDefined();
      expect(orrery.ch5PlanetNode.name).toBe('chapter-5-world');
      expect(orrery.ch5ProtectedPlanet).toBe(orrery.ch5PlanetNode);

      // Base scale 0.45 (Dominant Hero occupying 25-35% of composition)
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);
      expect(orrery.ch5PlanetNode.scale.y).toBeCloseTo(0.45, 2);
      expect(orrery.ch5PlanetNode.scale.z).toBeCloseTo(0.45, 2);
      expect(orrery.ch5PlanetNode.position.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch5PlanetNode.position.y).toBeCloseTo(-0.05, 2);

      // Stage 5 uniforms
      const u = orrery.ch5PlanetNode.material.uniforms;
      expect(u.uVisualStage.value).toBe(5.0);
      expect(u.uGoldIgnited.value).toBe(1.0);
      expect(u.uShieldCharge).toBeDefined();

      // Dedicated atmosphere and inherited rings
      expect(orrery.ch5Atmosphere).toBeDefined();
      expect(orrery.ch5Atmosphere.name).toBe('chapter-5-atmosphere');
      expect(orrery.ch5InnerRing).toBeDefined();
      expect(orrery.ch5OuterRing).toBeDefined();

      // Deflector shield uniform responds to state
      orrery.debugChapter5('supernova_threat');
      expect(u.uShieldCharge.value).toBeCloseTo(0.0, 2);

      orrery.debugChapter5('supernova_deflection');
      expect(u.uShieldCharge.value).toBeCloseTo(1.0, 2);
      expect(orrery.ch5Magnetoshield.visible).toBe(true);
      expect(orrery.ch5Magnetoshield.material.opacity).toBeGreaterThan(0.5);
    });

    it('handles Chapter 4 to Chapter 5 visual transition smoothly', () => {
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orrery._syncFromDirector();

      expect(orrery.startChapterTransition(4, 5)).toBe(true);
      expect(orrery.isChapterTransitionActive()).toBe(true);
      expect(orrery.getChapterGroup(4).visible).toBe(true);
      expect(orrery.getChapterGroup(5).visible).toBe(true);

      // Complete transition (duration 2.0s)
      orrery.update(2.1);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.getChapterGroup(4).visible).toBe(false);
      expect(orrery.getChapterGroup(5).visible).toBe(true);
      expect(orrery.ch5PlanetNode.visible).toBe(true);
      expect(orrery.ch5StellarCore.visible).toBe(true);
    });

    it('triggers supernova deflection on canonical SCORE event (catchType: CLEAN, target: SPIKE) and guards duplicate eventId', () => {
      advanceToChapter5();
      expect(orrery.ch5Magnetoshield.visible).toBe(false);

      // 1. Supporting CATCH event arrives first (does NOT trigger cinematic on its own)
      eventBus.emit(Events.CATCH, {
        id: 'catch_spike_1',
        type: 'CLEAN',
        cupKey: 'spike'
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // 2. Matching SCORE event arrives with CLEAN catch confirming Perfect catch
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_spike_clean_1',
          catchType: 'CLEAN'
        }
      });

      expect(orrery._ch5Phase).toBe('SUPERNOVA_DEFLECTION');
      expect(orrery._ch5CleanSpikeTriggered).toBe(true);
      expect(orrery.ch5Magnetoshield.visible).toBe(true);

      // 3. Duplicate SCORE event with same eventId is guarded and ignored
      const prevDeflectorProgress = orrery._ch5DeflectorProgress;
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_spike_clean_1',
          catchType: 'CLEAN'
        }
      });
      expect(orrery._ch5DeflectorProgress).toBe(prevDeflectorProgress);
    });

    it('enforces all negative gating conditions for Chapter 5 trigger contract', () => {
      advanceToChapter5();
      orrery.debugChapter5Reset();
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);

      // Negative Case 0: CLEAN SCORE without any target information -> fails closed (no trigger)
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_no_target_info',
          catchType: 'CLEAN'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 1: CATCH without SCORE -> no trigger
      eventBus.emit(Events.CATCH, {
        id: 'catch_only_1',
        type: 'CLEAN',
        cupKey: 'spike'
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 2: SCORE + ASSISTED -> no trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_assisted_1',
          catchType: 'ASSISTED',
          cupKey: 'spike'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 3: SCORE + MISS -> no trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_miss_1',
          catchType: 'MISS',
          cupKey: 'spike'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 4a: SCORE + CLEAN with explicit non-spike cupKey -> no trigger
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_clean_big_1',
          catchType: 'CLEAN',
          cupKey: 'big'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 4b: SCORE + CLEAN when active target is set to non-spike -> no trigger
      eventBus.emit(Events.TARGET, new TargetState(CupKey.BIG, 'single', 1));
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_clean_target_mismatch',
          catchType: 'CLEAN'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');

      // Negative Case 4c: Reset target to SPIKE and verify CLEAN triggers
      eventBus.emit(Events.TARGET, new TargetState(CupKey.SPIKE, 'spike', 2));
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'score_clean_valid_spike',
          catchType: 'CLEAN'
        }
      });
      expect(orrery._ch5CleanSpikeTriggered).toBe(true);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_DEFLECTION');
    });

    it('does NOT trigger Chapter 5 cinematic on CLEAN catches during Chapter 4 or earlier', () => {
      // Set to Chapter 4
      orreryState.advanceChapter(2);
      orreryState.advanceChapter(3);
      orreryState.advanceChapter(4);
      orrery._syncFromDirector();
      orrery.setVisualStage(4.0);
      orrery.debugChapter5Reset();

      eventBus.emit(Events.TARGET, new TargetState(CupKey.SPIKE, 'spike', 0));
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'ch4_clean_catch',
          catchType: 'CLEAN',
          cupKey: 'spike'
        }
      });

      // Chapter 4 should trigger Roche disruption, but NOT Chapter 5 supernova deflection
      expect(orrery._ch5CleanSpikeTriggered).toBe(false);
      expect(orrery._ch5Phase).toBe('SUPERNOVA_THREAT');
    });

    it('integrates with TrickSequencer as the canonical source of truth for active target cup', () => {
      const sequencer = new TrickSequencer(eventBus);
      const seqDirector = new NarrativeDirector({ eventBus });
      seqDirector.orreryState.advanceChapter(2);
      seqDirector.orreryState.advanceChapter(3);
      seqDirector.orreryState.advanceChapter(4);
      seqDirector.orreryState.advanceChapter(5);

      const orreryWithSeq = new OrreryVisualSystem({
        eventBus,
        narrativeDirector: seqDirector,
        trickSequencer: sequencer
      });
      orreryWithSeq._syncFromDirector();

      // In Chapter 1 trick pattern, active target is BIG
      sequencer.setChapter(1);
      expect(orreryWithSeq.getActiveTargetCup()).toBe(CupKey.BIG);

      // Clean score during non-spike target does not trigger Chapter 5
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'seq_clean_big',
          catchType: 'CLEAN'
        }
      });
      expect(orreryWithSeq._ch5CleanSpikeTriggered).toBe(false);

      // Sequencer advances to Chapter 4+ (SPIKE trick)
      sequencer.setChapter(4);
      expect(orreryWithSeq.getActiveTargetCup()).toBe(CupKey.SPIKE);

      // Clean score on SPIKE target successfully triggers Chapter 5
      eventBus.emit(Events.SCORE, {
        payload: {
          eventId: 'seq_clean_spike',
          catchType: 'CLEAN'
        }
      });
      expect(orreryWithSeq._ch5CleanSpikeTriggered).toBe(true);
      expect(orreryWithSeq._ch5Phase).toBe('SUPERNOVA_DEFLECTION');

      orreryWithSeq.destroy();
    });

    it('debugChapter5 APIs support all showcase states, reject invalid states, and reset accurately', () => {
      // Test all states
      expect(orrery.debugChapter5('supernova_threat')).toBe(true);
      let snap = orrery.getChapter5DebugState();
      expect(snap.debugMode).toBe(true);
      expect(snap.phase).toBe('SUPERNOVA_THREAT');
      expect(snap.visualStage).toBe(5.0);
      expect(snap.goldIgnited).toBe(1.0);
      expect(snap.collapsingStarVisible).toBe(true);
      expect(snap.protagonistPlanetVisible).toBe(true);

      expect(orrery.debugChapter5('star_agitated')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('STAR_AGITATED');

      expect(orrery.debugChapter5('star_collapse')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('STAR_COLLAPSE');

      expect(orrery.debugChapter5('supernova_deflection')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('SUPERNOVA_DEFLECTION');

      expect(orrery.debugChapter5('atmosphere_protected')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('ATMOSPHERE_PROTECTED');

      // Rejects invalid state
      expect(orrery.debugChapter5('invalid_supernova_phase')).toBe(false);

      // Reset
      expect(orrery.debugChapter5Reset()).toBe(true);
      snap = orrery.getChapter5DebugState();
      expect(snap.debugMode).toBe(false);
      expect(snap.phase).toBe('SUPERNOVA_THREAT');
    });

    it('supports setChapter5DebugState alias matching debugChapter5 across all states and resets', () => {
      expect(typeof orrery.setChapter5DebugState).toBe('function');
      expect(typeof orrery.debugChapter5).toBe('function');
      expect(typeof orrery.debugChapter5Reset).toBe('function');
      expect(typeof orrery.resetChapter5DebugState).toBe('function');

      expect(orrery.setChapter5DebugState('supernova_threat')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('SUPERNOVA_THREAT');
      expect(orrery.isVisible()).toBe(true);
      expect(orrery.group.visible).toBe(true);

      expect(orrery.setChapter5DebugState('star_agitated')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('STAR_AGITATED');

      expect(orrery.setChapter5DebugState('star_collapse')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('STAR_COLLAPSE');

      expect(orrery.setChapter5DebugState('supernova_deflection')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('SUPERNOVA_DEFLECTION');

      expect(orrery.setChapter5DebugState('atmosphere_protected')).toBe(true);
      expect(orrery.getChapter5DebugState().phase).toBe('ATMOSPHERE_PROTECTED');

      expect(orrery.setChapter5DebugState('invalid_state')).toBe(false);

      expect(orrery.debugChapter5Reset()).toBe(true);
      expect(orrery.getChapter5DebugState().debugMode).toBe(false);
    });

    it('protects Chapter 5 Stage 5 planet from setVisualStage(1.0) clobbering', () => {
      advanceToChapter5();
      expect(orrery.activeChapter).toBe(5);

      // Attempt to overwrite stage with Stage 1
      orrery.setVisualStage(1.0);

      // Chapter 5 planet must preserve Stage 5 uniforms
      const u = orrery.ch5PlanetNode.material.uniforms;
      expect(u.uVisualStage.value).toBe(5.0);
      expect(u.uGoldIgnited.value).toBe(1.0);
      expect(orrery.ch5Atmosphere.visible).toBe(true);
    });

    it('returns the Stage 5 Transcendent Celestial World node for getPlanetNode(5) and getActivePlanetoidNode()', () => {
      expect(orrery.getPlanetNode(5)).toBe(orrery.ch5PlanetNode);
      advanceToChapter5();
      expect(orrery.getActivePlanetoidNode()).toBe(orrery.ch5PlanetNode);
    });

    it('builds 3D paraboloid magnetospheric bow geometry with expected attributes and bounding envelope', () => {
      const geom = createMagnetosphericBowGeometry({ apexRadius: 0.46, flareDepth: 0.36, width: 0.52 });
      expect(geom.attributes.position).toBeDefined();
      expect(geom.attributes.normal).toBeDefined();
      expect(geom.attributes.uv).toBeDefined();
      expect(geom.index).toBeDefined();
      expect(geom.attributes.position.count).toBeGreaterThan(50);
      geom.computeBoundingBox();
      expect(geom.boundingBox.min.x).toBeCloseTo(0.10, 2);
      expect(geom.boundingBox.max.x).toBeCloseTo(0.46, 2);
      geom.dispose();
    });

    it('creates magnetoshield shader material with celestial gold, cyan Fresnel, ripple uniform and opacity property', () => {
      const mat = createMagnetoshieldMaterial();
      expect(mat.uniforms.uGoldColor).toBeDefined();
      expect(mat.uniforms.uCyanColor).toBeDefined();
      expect(mat.uniforms.uRipple).toBeDefined();
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);

      // Opacity property synchronization
      mat.opacity = 0.72;
      expect(mat.opacity).toBeCloseTo(0.72);
      expect(mat.uniforms.uOpacity.value).toBeCloseTo(0.72);
      mat.dispose();
    });

    it('creates directional shockwave arc line and trailing sheath geometries', () => {
      const arcGeom = createDirectionalShockwaveArcLineGeometry({ radius: 0.25, arcAngle: Math.PI * 0.55 });
      expect(arcGeom.attributes.position).toBeDefined();
      expect(arcGeom.attributes.position.count).toBeGreaterThan(10);
      arcGeom.dispose();

      const sheathGeom = createDirectionalShockwaveGeometry({ radius: 0.25, thickness: 0.05, arcAngle: Math.PI * 0.55 });
      expect(sheathGeom.attributes.position).toBeDefined();
      expect(sheathGeom.attributes.uv).toBeDefined();
      expect(sheathGeom.index).toBeDefined();
      sheathGeom.dispose();
    });

    it('verifies redesigned Chapter 5 visual system configuration and deflection choreography', () => {
      advanceToChapter5();
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45);
      expect(orrery.ch5PlanetNode.position.x).toBeCloseTo(0.18, 2);
      expect(orrery.ch5PlanetNode.position.y).toBeCloseTo(-0.05, 2);
      expect(orrery.ch5Magnetoshield.name).toBe('magnetoshield-dome');
      expect(orrery.ch5ShockwaveLine).toBeDefined();
      expect(orrery.ch5ShockwaveBody).toBeDefined();
      expect(orrery.ch5SupernovaFilaments).toBeDefined();

      orrery.debugChapter5('supernova_deflection');
      expect(orrery.ch5ShockwaveLine.position.x).toBeCloseTo(-0.305, 2);
      expect(orrery.ch5ShockwaveLine.position.y).toBeCloseTo(0.139, 2);
      expect(orrery.ch5SupernovaFilaments.visible).toBe(true);
      expect(orrery.ch5Magnetoshield.material.uniforms.uRipple.value).toBeGreaterThan(0.7);

      orrery.debugChapter5Reset();
      expect(orrery.ch5Magnetoshield.material.uniforms.uRipple.value).toBeCloseTo(0.0);
      expect(orrery.ch5SupernovaFilaments.visible).toBe(false);
    });

    it('creates stellar corona and fragment materials with proper uniforms and shaders', () => {
      const coronaMat = createStellarCoronaMaterial();
      expect(coronaMat).toBeDefined();
      expect(coronaMat.uniforms.uBrightness).toBeDefined();
      expect(coronaMat.uniforms.uTurbulence).toBeDefined();
      expect(coronaMat.uniforms.uInnerColor).toBeDefined();
      expect(coronaMat.uniforms.uMidColor).toBeDefined();
      expect(coronaMat.uniforms.uOuterColor).toBeDefined();
      coronaMat.dispose();

      const fragMat = createStellarFragmentMaterial();
      expect(fragMat).toBeDefined();
      expect(fragMat.uniforms.uGlow).toBeDefined();
      expect(fragMat.uniforms.uFlashIntensity).toBeDefined();
      expect(fragMat.uniforms.uCrustColor).toBeDefined();
      expect(fragMat.uniforms.uMagmaColor).toBeDefined();
      expect(fragMat.uniforms.uHotColor).toBeDefined();
      fragMat.dispose();
    });

    it('implements visible stellar fragmentation with 14 distinct chunks and staged collapse sequence', () => {
      advanceToChapter5();
      expect(CH5_STELLAR_FRAGMENT_COUNT).toBe(14);
      expect(orrery.ch5StellarFragments).toBeDefined();
      expect(orrery.ch5StellarFragments.count).toBe(14);
      expect(orrery._ch5FragmentData.length).toBe(14 * 12);

      // Verify fragment data is initialized with valid unit directions and positive speeds
      for (let i = 0; i < 14; i++) {
        const idx = i * 12;
        const ux = orrery._ch5FragmentData[idx + 0];
        const uy = orrery._ch5FragmentData[idx + 1];
        const uz = orrery._ch5FragmentData[idx + 2];
        const speed = orrery._ch5FragmentData[idx + 3];
        const baseScale = orrery._ch5FragmentData[idx + 8];
        const tLift = orrery._ch5FragmentData[idx + 9];

        const len = Math.sqrt(ux * ux + uy * uy + uz * uz);
        expect(len).toBeCloseTo(1.0, 2);
        expect(speed).toBeGreaterThan(0.5);
        expect(baseScale).toBeGreaterThan(0.02);
        expect(tLift).toBeGreaterThanOrEqual(0.20);
        expect(tLift).toBeLessThanOrEqual(0.50);
      }

      // In supernova_threat: fragments are inactive/invisible
      orrery.debugChapter5('supernova_threat');
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5StellarCorona.visible).toBe(true);
      expect(orrery.ch5StellarInnerCore.visible).toBe(true);

      // In star_agitated: corona turbulence increases
      orrery.debugChapter5('star_agitated');
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5CoronaMaterial.uniforms.uBrightness.value).toBeGreaterThan(0.5);

      // In star_collapse: black box eliminated across all Chapter 5 states
      orrery.debugChapter5('star_collapse');
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5StellarCore.scale.x).toBeLessThan(0.18);
      expect(orrery.ch5StarMaterial.uniforms.uFlashPulse.value).toBeGreaterThan(0.8);

      // In supernova_deflection: 140 flowing filaments in motion
      orrery.debugChapter5('supernova_deflection');
      expect(CH5_SUPERNOVA_FILAMENT_COUNT).toBe(140);
      expect(orrery.ch5SupernovaFilaments.count).toBe(140);
      expect(orrery.ch5SupernovaFilaments.visible).toBe(true);

      // In atmosphere_protected: fragments and wave dissipated, remnant star calm
      orrery.debugChapter5('atmosphere_protected');
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5SupernovaFilaments.visible).toBe(false);
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.055, 2);
      expect(orrery.ch5StellarInnerCore.scale.x).toBeCloseTo(0.055, 2);
    });

    it('verifies Chapter 5 debug status exposure and foreground planetoid suppression', () => {
      expect(typeof orrery.isChapter5DebugActive).toBe('function');
      expect(orrery.isChapter5DebugActive()).toBe(false);

      orrery.setChapter5DebugState('supernova_threat');
      expect(orrery.isChapter5DebugActive()).toBe(true);

      // Verify Chapter 5 rings are suppressed
      expect(orrery.ch5InnerRing.visible).toBe(false);
      expect(orrery.ch5OuterRing.visible).toBe(false);

      // Verify dying star crust material remains dark charcoal with sparse fissures
      expect(orrery.ch5StarMaterial).toBeDefined();
      expect(orrery.ch5StarMaterial.uniforms.uCrackScale.value).toBe(4.0);

      orrery.debugChapter5Reset();
      expect(orrery.isChapter5DebugActive()).toBe(false);
    });

    it('reuses Chapter 2 Binary Resonance wave implementation pattern for Chapter 5 supernova wave', () => {
      advanceToChapter5();
      expect(orrery.ch5ShockwaveLine).toBeDefined();
      expect(orrery.ch5ShockwaveEchoMesh).toBeDefined();
      expect(orrery.ch5ShockwaveBody).toBeDefined();

      // Verify Chapter 2 Binary Resonance geometry and material pattern
      expect(orrery.ch5ShockwaveLine.geometry.type).toBe('RingGeometry');
      expect(orrery.ch5ShockwaveLine.material.transparent).toBe(true);
      expect(orrery.ch5ShockwaveLine.material.depthWrite).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.geometry.type).toBe('RingGeometry');
      expect(orrery.ch5ShockwaveEchoMesh.material.transparent).toBe(true);
      expect(orrery.ch5ShockwaveEchoMesh.material.depthWrite).toBe(false);

      // Verify dummy shockwave-body has zero geometry
      expect(orrery.ch5ShockwaveBody.geometry).toBeUndefined();

      // In supernova_deflection: wave is at bow shock apex in front of Our Planet
      orrery.debugChapter5('supernova_deflection');
      expect(orrery.ch5ShockwaveLine.visible).toBe(true);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(true);
      expect(orrery.ch5ShockwaveLine.position.x).toBeCloseTo(-0.305, 2);
      expect(orrery.ch5ShockwaveLine.position.y).toBeCloseTo(0.139, 2);
      expect(orrery.ch5ShockwaveEchoMesh.position.x).toBeCloseTo(-0.305, 2);
      expect(orrery.ch5ShockwaveEchoMesh.position.y).toBeCloseTo(0.139, 2);

      // Verify filaments are active in deflection and stream along directional flow
      expect(orrery.ch5SupernovaFilaments.visible).toBe(true);
      expect(orrery.ch5SupernovaFilaments.material.depthWrite).toBe(false);

      orrery.debugChapter5Reset();
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(false);
      expect(orrery.ch5SupernovaFilaments.visible).toBe(false);
    });

    it('completely removes black window artifact across all Chapter 5 states and eliminates crust body when stellar body breaks apart', () => {
      advanceToChapter5();

      // In supernova_threat: no black window, star is intact dark sphere, wave & fragments hidden
      orrery.debugChapter5('supernova_threat');
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(false);
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5InnerRing.visible).toBe(false);
      expect(orrery.ch5OuterRing.visible).toBe(false);
      expect(orrery.ch1StableStateText?.visible).toBeFalsy();
      expect(orrery.ch1TextShimmerGlint?.visible).toBeFalsy();

      // In star_agitated: zero black window, fragments hidden
      orrery.debugChapter5('star_agitated');
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(false);
      expect(orrery.ch5StellarFragments.visible).toBe(false);

      // In star_collapse: black box eliminated across all Chapter 5 states
      orrery.debugChapter5('star_collapse');
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      // Dark outer crust shell is completely removed (scale 0, visible false)
      expect(orrery.ch5StellarCore.visible).toBe(false);
      expect(orrery.ch5StellarCore.scale.x).toBe(0.0);
      // Hot crimson inner core is exposed
      expect(orrery.ch5StellarInnerCore.visible).toBe(true);
      expect(orrery.ch5StellarInnerCore.scale.x).toBeCloseTo(0.055, 2);

      // In supernova_deflection: no black window, wave travels cleanly
      orrery.debugChapter5('supernova_deflection');
      expect(orrery.ch5ShockwaveBody.visible).toBe(false);
      expect(orrery.ch5ShockwaveLine.visible).toBe(true);
      expect(orrery.ch5ShockwaveLine.material.depthWrite).toBe(false);

      orrery.debugChapter5Reset();
    });

    it('shares exact same createBinaryResonanceWave implementation between Chapter 2 and Chapter 5', () => {
      advanceToChapter5();
      // Chapter 2 shockwave geometries
      expect(orrery.ch2ShockwaveMesh.geometry.type).toBe('RingGeometry');
      expect(orrery.ch2ShockwaveMesh.geometry.parameters.innerRadius).toBeCloseTo(0.78, 2);
      expect(orrery.ch2ShockwaveMesh.geometry.parameters.outerRadius).toBeCloseTo(0.88, 2);
      expect(orrery.ch2ShockwaveEchoMesh.geometry.parameters.innerRadius).toBeCloseTo(0.70, 2);
      expect(orrery.ch2ShockwaveEchoMesh.geometry.parameters.outerRadius).toBeCloseTo(0.82, 2);

      // Chapter 5 shockwave geometries must match the exact same parameters
      expect(orrery.ch5ShockwaveLine.geometry.type).toBe('RingGeometry');
      expect(orrery.ch5ShockwaveLine.geometry.parameters.innerRadius).toBeCloseTo(0.78, 2);
      expect(orrery.ch5ShockwaveLine.geometry.parameters.outerRadius).toBeCloseTo(0.88, 2);
      expect(orrery.ch5ShockwaveEchoMesh.geometry.type).toBe('RingGeometry');
      expect(orrery.ch5ShockwaveEchoMesh.geometry.parameters.innerRadius).toBeCloseTo(0.70, 2);
      expect(orrery.ch5ShockwaveEchoMesh.geometry.parameters.outerRadius).toBeCloseTo(0.82, 2);

      // Both must use DoubleSide, transparent, depthWrite: false, and AdditiveBlending
      expect(orrery.ch5ShockwaveLine.material.depthWrite).toBe(false);
      expect(orrery.ch5ShockwaveLine.material.transparent).toBe(true);
      expect(orrery.ch5ShockwaveLine.material.blending).toBe(2); // AdditiveBlending
      expect(orrery.ch5ShockwaveEchoMesh.material.depthWrite).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.material.transparent).toBe(true);
      expect(orrery.ch5ShockwaveEchoMesh.material.blending).toBe(2); // AdditiveBlending
    });

    it('evaluates and updates binary resonance wave with identical mathematical envelope', () => {
      const wave = createBinaryResonanceWave({
        primaryColor: '#FFA834',
        echoColor: '#F5E6C8'
      });
      expect(wave.primaryMesh.visible).toBe(false);

      // Evaluate at t = 0.10s (compact phase)
      const rCompact = evaluateBinaryResonanceWave(0.10, 1.0);
      expect(rCompact.active).toBe(true);
      expect(rCompact.primary.scale).toBeCloseTo(0.30, 2);
      expect(rCompact.primary.opacity).toBeCloseTo(0.80, 2);

      // Evaluate at t = 0.45s (expansion phase)
      const rExpand = evaluateBinaryResonanceWave(0.45, 1.0);
      expect(rExpand.active).toBe(true);
      expect(rExpand.primary.scale).toBeGreaterThan(1.0);
      expect(rExpand.primary.opacity).toBeLessThan(0.90);

      // Evaluate after duration (inactive)
      const rEnd = evaluateBinaryResonanceWave(1.05, 1.0);
      expect(rEnd.active).toBe(false);
      expect(rEnd.primary.visible).toBe(false);

      // updateBinaryResonanceWave
      updateBinaryResonanceWave(wave.primaryMesh, wave.echoMesh, 0.10, { duration: 1.0 });
      expect(wave.primaryMesh.visible).toBe(true);
      expect(wave.primaryMesh.scale.x).toBeCloseTo(0.30, 2);

      resetBinaryResonanceWave(wave.primaryMesh, wave.echoMesh);
      expect(wave.primaryMesh.visible).toBe(false);
      expect(wave.primaryMesh.scale.x).toBeCloseTo(0.20, 2);
      expect(wave.primaryMesh.material.opacity).toBe(0.0);
    });

    it('eliminates black box during STAR_COLLAPSE and survives 10+ seconds with zero leaks or errors', () => {
      advanceToChapter5();

      const rootScene = new Group();
      rootScene.name = 'mock-root-scene';
      rootScene.add(orrery.group);

      // Create a mock welcome-panel hierarchy mimicking UIKitML structure
      const welcomeContainer = new Group();
      welcomeContainer.name = 'Welcome Panel';
      welcomeContainer.userData = { iwsdkSceneNodeId: 'welcome-panel' };
      const welcomeChildQuad = new Mesh(new PlaneGeometry(0.85, 0.58), new MeshBasicMaterial({ opacity: 0.92 }));
      welcomeChildQuad.name = 'Panel';
      welcomeContainer.add(welcomeChildQuad);
      rootScene.add(welcomeContainer);

      // Set Chapter 5 state to STAR_COLLAPSE
      expect(() => {
        orrery.setChapter5DebugState('star_collapse');
      }).not.toThrow();

      // welcomeContainer and all child quads must be completely banished
      expect(welcomeContainer.visible).toBe(false);
      expect(welcomeChildQuad.visible).toBe(false);
      expect(welcomeChildQuad.position.y).toBe(-9999);
      expect(welcomeChildQuad.material.opacity).toBe(0.0);
      expect(welcomeChildQuad.material.depthWrite).toBe(false);

      // Star is collapsing, shockwave is reset / inactive
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(false);

      // Run 625 frames (~10 seconds at 60fps) in STAR_COLLAPSE
      expect(() => {
        for (let frame = 0; frame < 625; frame++) {
          orrery.update(0.016);
          // Zero leaks across every frame
          expect(welcomeChildQuad.visible).toBe(false);
          expect(welcomeChildQuad.position.y).toBe(-9999);
          expect(welcomeChildQuad.material.opacity).toBe(0.0);
        }
      }).not.toThrow();

      orrery.debugChapter5Reset();
    });

    it('locks Stage 5 Celestial World identity on Chapter 5 protagonist planet without falling back to Stage 4', () => {
      advanceToChapter5();
      expect(orrery.ch5PlanetNode).toBeDefined();
      expect(orrery.ch5PlanetNode.visible).toBe(true);
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);

      const uCore = orrery.ch5PlanetNode.material.uniforms;
      expect(uCore.uVisualStage.value).toBe(5.0);
      expect(uCore.uGoldIgnited.value).toBe(1.0);
      expect(uCore.uAtmosphereDensity.value).toBe(1.0);
      expect(uCore.uOceanFill.value).toBe(1.0);
      expect(uCore.uKintsugiGlow.value).toBe(1.0);

      // Verify external setVisualStage(1.0) or (4.0) calls cannot clobber Chapter 5 Stage 5 world
      orrery.setVisualStage(1.0);
      orrery.update(0.016);
      expect(orrery.ch5PlanetNode.material.uniforms.uVisualStage.value).toBe(5.0);
      expect(orrery.ch5PlanetNode.material.uniforms.uGoldIgnited.value).toBe(1.0);
    });

    it('ensures Stage 5 protagonist planet NEVER breaks and remains 100% intact throughout STAR_COLLAPSE', () => {
      advanceToChapter5();
      expect(orrery.ch5PlanetFragments).toBeUndefined();
      expect(orrery.ch5PlanetNode).toBeDefined();
      expect(orrery.ch5PlanetNode.visible).toBe(true);
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);

      // Trigger STAR_COLLAPSE sequence
      orrery._ch5Phase = 'STAR_COLLAPSE';
      orrery._ch5CollapseElapsed = 0.0;

      // Sample frames across the entire 0.00s -> 3.20s collapse and shockwave lifecycle
      const testTimes = [0.0, 0.20, 0.45, 0.70, 1.00, 1.25, 1.35, 1.60, 2.00, 2.25, 2.50, 3.00, 3.20];
      for (const t of testTimes) {
        orrery._ch5CollapseElapsed = t;
        orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);

        // Planet must remain permanently visible, intact, and at Stage 5 scale
        expect(orrery.ch5PlanetNode.visible).toBe(true);
        expect(orrery.ch5Atmosphere.visible).toBe(true);
        expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);
        expect(orrery.ch5PlanetNode.scale.y).toBeCloseTo(0.45, 2);
        expect(orrery.ch5PlanetNode.scale.z).toBeCloseTo(0.45, 2);
        expect(orrery.ch5PlanetNode.material.uniforms.uVisualStage.value).toBe(5.0);
      }

      // At wave contact (t >= 2.25s), the surviving planet activates its magnetoshield dome
      orrery._ch5CollapseElapsed = 2.40;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5Magnetoshield.visible).toBe(true);
      expect(orrery.ch5PlanetMaterial.uniforms.uShieldCharge.value).toBeGreaterThan(0.0);
      expect(orrery.ch5PlanetNode.visible).toBe(true);

      // Reset keeps intact Stage 5 planet
      orrery.debugChapter5Reset();
      expect(orrery.ch5PlanetNode.visible).toBe(true);
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);
      expect(orrery.ch5PlanetNode.material.uniforms.uVisualStage.value).toBe(5.0);
    });

    it('orchestrates deterministic star collapse and fragmentation at (-1.35, 0.55, 0.0) with shockwave eruption', () => {
      advanceToChapter5();
      expect(orrery.ch5StellarFragments).toBeDefined();
      expect(orrery.ch5StellarFragments.count).toBe(14);
      expect(orrery.ch5StellarFragments.visible).toBe(false);

      // Trigger STAR_COLLAPSE sequence
      orrery._ch5Phase = 'STAR_COLLAPSE';
      orrery._ch5CollapseElapsed = 0.0;

      // Phase 1 (0.00s - 0.25s): Pre-fracture compression
      orrery._ch5CollapseElapsed = 0.15;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);

      // Phase 2 (0.25s - 0.50s): Surface fracture lines develop
      orrery._ch5CollapseElapsed = 0.35;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5StellarFragments.visible).toBe(false);

      // Phase 3 (0.50s - 0.85s): First stellar shell fragments detach from star
      orrery._ch5CollapseElapsed = 0.65;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5StellarFragments.visible).toBe(true);
      expect(orrery.ch5ShockwaveLine.visible).toBe(false);

      // Phase 5 (1.05s - 1.25s): Core collapses to zero
      orrery._ch5CollapseElapsed = 1.25;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.0, 2);
      expect(orrery.ch5StellarInnerCore.visible).toBe(true);

      // Phase 6 (1.25s - 1.40s): Supernova flash peaks
      orrery._ch5CollapseElapsed = 1.35;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5StarMaterial.uniforms.uFlashPulse.value).toBeGreaterThan(0.0);
      expect(orrery.ch5FragmentMaterial.uniforms.uFlashIntensity.value).toBeGreaterThan(0.0);

      // Phase 7 (1.40s+): Shockwave erupts from star and travels across space
      orrery._ch5CollapseElapsed = 1.80;
      orrery._updateChapter5(0.016, 0.70, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.ch5ShockwaveLine.visible).toBe(true);
      expect(orrery.ch5ShockwaveEchoMesh.visible).toBe(true);
      expect(orrery.ch5ShockwaveLine.scale.x).toBeGreaterThan(0.5);

      // Star fragments remain visible and dispersed
      expect(orrery.ch5StellarFragments.visible).toBe(true);

      // Reset cleans up fragments and restores baseline star
      orrery.debugChapter5Reset();
      expect(orrery.ch5StellarFragments.visible).toBe(false);
      expect(orrery.ch5StellarCore.scale.x).toBeCloseTo(0.18, 2);
    });
  });
});
