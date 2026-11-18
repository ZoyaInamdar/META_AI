/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - ProgressionFeedbackUI Unit Tests
 * ============================================================================
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import {
  ProgressionFeedbackUI,
  PROGRESSION_UI_PALETTE,
  PLANET_STAGE_NAMES,
  CHAPTER_ANNOUNCEMENT_DATA,
  TOAST_TIMING,
  CHAPTER_TIMING,
  drawCatchToast,
  drawEnergyProgressBar,
  drawChapterPlaque,
} from './ProgressionFeedbackUI.js';
import { EventBus } from '../contracts/EventBus.js';
import { Events } from '../contracts/Interfaces.js';

describe('ProgressionFeedbackUI - Player Progression Feedback System', () => {
  let eventBus;
  let parentGroup;
  let feedbackUI;

  beforeEach(() => {
    eventBus = new EventBus();
    parentGroup = new Group();
  });

  afterEach(() => {
    if (feedbackUI) {
      feedbackUI.destroy();
      feedbackUI = null;
    }
  });

  // ==========================================================================
  // 1. INITIALIZATION & SCENE GRAPH ATTACHMENT
  // ==========================================================================

  it('initializes with hidden group and correct hierarchy', () => {
    feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });

    assert.equal(feedbackUI.isVisible(), false);
    assert.equal(feedbackUI.group.visible, false);
    assert.equal(feedbackUI.group.name, 'celestial-progression-feedback-ui');
    assert.equal(parentGroup.children.includes(feedbackUI.group), true);

    // Verifies all three sub-elements are preallocated
    assert.equal(feedbackUI.group.children.length, 3);
    const toastMesh = feedbackUI.group.getObjectByName('progression-catch-toast-mesh');
    const progressMesh = feedbackUI.group.getObjectByName('progression-energy-progress-mesh');
    const chapterMesh = feedbackUI.group.getObjectByName('progression-chapter-announcement-mesh');

    assert.ok(toastMesh);
    assert.ok(progressMesh);
    assert.ok(chapterMesh);
    assert.equal(toastMesh.visible, false);
    assert.equal(chapterMesh.visible, false);
  });

  it('setVisible correctly toggles active visibility', () => {
    feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });

    feedbackUI.setVisible(true);
    assert.equal(feedbackUI.isVisible(), true);
    assert.equal(feedbackUI.group.visible, true);

    feedbackUI.setVisible(false);
    assert.equal(feedbackUI.isVisible(), false);
    assert.equal(feedbackUI.group.visible, false);
  });

  // ==========================================================================
  // 2. FEATURE 1: CATCH ENERGY FEEDBACK
  // ==========================================================================

  describe('Feature 1: Catch Energy Feedback', () => {
    it('reacts to Events.SCORE and extracts awardedEnergy from wrapped payload', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'CLEAN',
          awardedEnergy: 35,
          currentStreak: 2,
        },
      });

      const state = feedbackUI.getToastState();
      assert.equal(state.active, true);
      assert.equal(state.visible, true);
    });

    it('distinguishes CLEAN and ASSISTED catches accurately', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      // Assisted catch
      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'ASSISTED',
          awardedEnergy: 20,
        },
      });

      let state = feedbackUI.getToastState();
      assert.equal(state.active, true);

      // Fast forward past toast lifetime
      feedbackUI.update(TOAST_TIMING.TOTAL + 0.1);
      state = feedbackUI.getToastState();
      assert.equal(state.active, false);
      assert.equal(state.visible, false);

      // Clean catch
      eventBus.emit(Events.SCORE, {
        payload: {
          catchType: 'CLEAN',
          awardedEnergy: 42,
        },
      });
      state = feedbackUI.getToastState();
      assert.equal(state.active, true);
      assert.equal(state.visible, true);
    });

    it('consumes awardedEnergy directly without recalculating or creating a second score event', () => {
      let scoreEventsEmitted = 0;
      eventBus.on(Events.SCORE, () => {
        scoreEventsEmitted++;
      });

      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      // Emit canonical event with custom energy
      eventBus.emit(Events.SCORE, {
        awardedEnergy: 50,
        catchType: 'CLEAN',
      });

      // ProgressionFeedbackUI MUST NOT emit another Events.SCORE
      assert.equal(scoreEventsEmitted, 1);
    });

    it('fades in, holds, drifts, and automatically hides after TOAST_TIMING.TOTAL', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      eventBus.emit(Events.SCORE, { awardedEnergy: 35, catchType: 'CLEAN' });

      // In fade-in phase
      feedbackUI.update(TOAST_TIMING.FADE_IN / 2);
      let state = feedbackUI.getToastState();
      assert.equal(state.active, true);
      assert.ok(state.opacity > 0.0 && state.opacity < 1.0);

      // In hold phase
      feedbackUI.update(TOAST_TIMING.FADE_IN / 2 + 0.1);
      state = feedbackUI.getToastState();
      assert.equal(state.opacity, 1.0);

      // Advance past total duration
      feedbackUI.update(TOAST_TIMING.TOTAL);
      state = feedbackUI.getToastState();
      assert.equal(state.active, false);
      assert.equal(state.visible, false);
      assert.equal(state.opacity, 0.0);
    });

    it('handles multiple rapid score events safely without uncontrolled UI growth', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      const initialChildCount = feedbackUI.group.children.length;

      // Rapidly fire 10 score events
      for (let i = 0; i < 10; i++) {
        eventBus.emit(Events.SCORE, {
          payload: { catchType: 'CLEAN', awardedEnergy: 35 + i },
        });
        feedbackUI.update(0.05);
      }

      // Preallocated hierarchy must NOT have expanded
      assert.equal(feedbackUI.group.children.length, initialChildCount);
      assert.equal(feedbackUI.getToastState().active, true);
    });

    it('positions toast relative to kenGroup when provided', () => {
      const mockKenGroup = new Group();
      mockKenGroup.position.set(0.1, 1.30, -0.40);

      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup, kenGroup: mockKenGroup });
      feedbackUI.setVisible(true);

      eventBus.emit(Events.SCORE, { awardedEnergy: 35, catchType: 'CLEAN' });

      const toastMesh = feedbackUI.group.getObjectByName('progression-catch-toast-mesh');
      assert.ok(toastMesh);
      // y position should be around ken.y + 0.18
      assert.ok(Math.abs(toastMesh.position.y - (1.30 + 0.18)) < 0.01);
      assert.ok(Math.abs(toastMesh.position.x - 0.1) < 0.01);
    });
  });

  // ==========================================================================
  // 3. FEATURE 2: PERSISTENT ENERGY PROGRESS
  // ==========================================================================

  describe('Feature 2: Persistent Energy Progress', () => {
    it('initializes with default progression state (Stage 1, 0 / 100)', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });

      const progress = feedbackUI.getProgressState();
      assert.equal(progress.currentStage, 1);
      assert.equal(progress.currentEnergy, 0);
      assert.equal(progress.energyRequired, 100);
      assert.equal(progress.progress, 0.0);
    });

    it('syncs with authoritative evolutionController if passed in constructor', () => {
      const mockEvolutionController = {
        getSnapshot: () => ({
          currentStage: 2,
          evolutionEnergy: 45,
          evolutionEnergyRequired: 100,
          evolutionProgress: 0.45,
        }),
      };

      feedbackUI = new ProgressionFeedbackUI({
        eventBus,
        parentGroup,
        evolutionController: mockEvolutionController,
      });

      const progress = feedbackUI.getProgressState();
      assert.equal(progress.currentStage, 2);
      assert.equal(progress.currentEnergy, 45);
      assert.equal(progress.energyRequired, 100);
      assert.equal(progress.progress, 0.45);
    });

    it('updates state when Events.EVOLUTION_PROGRESS is emitted', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });

      eventBus.emit(Events.EVOLUTION_PROGRESS, {
        currentStage: 1,
        evolutionEnergy: 70,
        evolutionEnergyRequired: 100,
        evolutionProgress: 0.70,
      });

      const progress = feedbackUI.getProgressState();
      assert.equal(progress.currentEnergy, 70);
      assert.equal(progress.progress, 0.70);
    });

    it('updates stage on Events.STAGE_COMPLETED', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });

      eventBus.emit(Events.STAGE_COMPLETED, {
        previousStage: 1,
        currentStage: 2,
      });

      const progress = feedbackUI.getProgressState();
      assert.equal(progress.currentStage, 2);
      assert.equal(progress.currentEnergy, 0);
      assert.equal(progress.progress, 0.0);
    });
  });

  // ==========================================================================
  // 4. FEATURE 3: CHAPTER ANNOUNCEMENT & OBJECTIVES
  // ==========================================================================

  describe('Feature 3: Chapter Announcement', () => {
    it('reacts to Events.ORRERY_CHAPTER_CHANGED and presents the chapter announcement', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, {
        chapter: 2,
        previousChapter: 1,
      });

      const state = feedbackUI.getChapterState();
      assert.equal(state.active, true);
      assert.equal(state.visible, true);
      assert.equal(state.chapter, 2);
    });

    it('defines accurate canonical names and objectives for all 5 chapters', () => {
      // Chapter 1: Three-Body Capture
      assert.equal(CHAPTER_ANNOUNCEMENT_DATA[1].name, 'THREE-BODY CAPTURE');
      assert.ok(CHAPTER_ANNOUNCEMENT_DATA[1].objective.includes('capture burn'));

      // Chapter 2: Binary Resonance
      assert.equal(CHAPTER_ANNOUNCEMENT_DATA[2].name, 'BINARY RESONANCE');
      assert.ok(CHAPTER_ANNOUNCEMENT_DATA[2].objective.includes('resonance'));

      // Chapter 3: Gravity Assist
      assert.equal(CHAPTER_ANNOUNCEMENT_DATA[3].name, 'GRAVITY ASSIST');
      assert.ok(CHAPTER_ANNOUNCEMENT_DATA[3].objective.includes('gravity well'));

      // Chapter 4: Roche Disruption (satellite -> Roche limit -> crystalline debris -> ring)
      assert.equal(CHAPTER_ANNOUNCEMENT_DATA[4].name, 'ROCHE DISRUPTION');
      assert.ok(CHAPTER_ANNOUNCEMENT_DATA[4].objective.includes('Roche limit'));

      // Chapter 5: Supernova Deflection (Locked chapter action)
      assert.equal(CHAPTER_ANNOUNCEMENT_DATA[5].name, 'SUPERNOVA DEFLECTION');
      assert.ok(CHAPTER_ANNOUNCEMENT_DATA[5].objective.includes('Strike the celestial spike'));
    });

    it('Chapter 5 announcement displays accurately when Chapter 5 triggers', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, {
        chapter: 5,
        previousChapter: 4,
      });

      const state = feedbackUI.getChapterState();
      assert.equal(state.active, true);
      assert.equal(state.chapter, 5);
    });

    it('announcement fades in, holds, and automatically cleans up after CHAPTER_TIMING.TOTAL', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      feedbackUI.showChapterAnnouncement(2);

      // In fade in
      feedbackUI.update(CHAPTER_TIMING.FADE_IN / 2);
      let state = feedbackUI.getChapterState();
      assert.equal(state.active, true);
      assert.ok(state.opacity > 0.0 && state.opacity < 1.0);

      // In hold
      feedbackUI.update(CHAPTER_TIMING.FADE_IN / 2 + 1.0);
      state = feedbackUI.getChapterState();
      assert.equal(state.opacity, 1.0);

      // Past total duration
      feedbackUI.update(CHAPTER_TIMING.TOTAL);
      state = feedbackUI.getChapterState();
      assert.equal(state.active, false);
      assert.equal(state.visible, false);
      assert.equal(state.opacity, 0.0);
    });

    it('repeated chapter events reuse single mesh without duplicating scene objects', () => {
      feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      feedbackUI.setVisible(true);

      const initialCount = feedbackUI.group.children.length;

      feedbackUI.showChapterAnnouncement(1);
      feedbackUI.showChapterAnnouncement(2);
      feedbackUI.showChapterAnnouncement(3);

      assert.equal(feedbackUI.group.children.length, initialCount);
    });
  });

  // ==========================================================================
  // 5. PROCEDURAL CANVAS DRAWING SAFETY
  // ==========================================================================

  describe('Procedural Canvas Drawing Verification', () => {
    function createMockCanvas(width, height) {
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
        fill: () => {},
        stroke: () => {},
        fillText: (...args) => calls.push(['fillText', args]),
        measureText: (txt) => ({ width: txt.length * 10 }),
      };
      return {
        canvas: { width, height, getContext: () => mockCtx },
        calls,
      };
    }

    it('drawCatchToast executes safely with mock context', () => {
      const { canvas, calls } = createMockCanvas(512, 220);
      drawCatchToast(canvas, 'CLEAN CATCH', 35, false);

      const hasCatchText = calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'CLEAN CATCH');
      const hasEnergyText = calls.some(([fn, args]) => fn === 'fillText' && args[0] === '+35 ENERGY');
      assert.ok(hasCatchText);
      assert.ok(hasEnergyText);
    });

    it('drawEnergyProgressBar executes safely with mock context', () => {
      const { canvas, calls } = createMockCanvas(512, 140);
      drawEnergyProgressBar(canvas, 60, 100, 1, 0.60);

      const hasStage = calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'STAGE I: SEED');
      const hasNumbers = calls.some(([fn, args]) => fn === 'fillText' && args[0] === '60 / 100');
      assert.ok(hasStage);
      assert.ok(hasNumbers);
    });

    it('PLANET_STAGE_NAMES maps stages 1 to 5 canonically', () => {
      assert.equal(PLANET_STAGE_NAMES[1], 'SEED');
      assert.equal(PLANET_STAGE_NAMES[2], 'AWAKENING');
      assert.equal(PLANET_STAGE_NAMES[3], 'OCEANS');
      assert.equal(PLANET_STAGE_NAMES[4], 'LIFE & ATMOSPHERE');
      assert.equal(PLANET_STAGE_NAMES[5], 'CELESTIAL ALIGNMENT');
    });

    it('drawChapterPlaque executes safely with mock context', () => {
      const { canvas, calls } = createMockCanvas(1024, 460);
      drawChapterPlaque(canvas, CHAPTER_ANNOUNCEMENT_DATA[5]);

      const hasChapterRoman = calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'CHAPTER V');
      const hasChapterName = calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'SUPERNOVA DEFLECTION');
      const hasObjective = calls.some(([fn, args]) => fn === 'fillText' && args[0] === CHAPTER_ANNOUNCEMENT_DATA[5].objective);
      assert.ok(hasChapterRoman);
      assert.ok(hasChapterName);
      assert.ok(hasObjective);
    });
  });

  // ==========================================================================
  // 6. TEARDOWN & RESOURCE DISPOSAL
  // ==========================================================================

  it('destroys all meshes and unhooks event listeners without throwing', () => {
    feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
    feedbackUI.setVisible(true);

    assert.equal(parentGroup.children.includes(feedbackUI.group), true);

    feedbackUI.destroy();

    assert.equal(parentGroup.children.includes(feedbackUI.group), false);

    // After destroy, emitting events should not cause any error
    assert.doesNotThrow(() => {
      eventBus.emit(Events.SCORE, { awardedEnergy: 35 });
      eventBus.emit(Events.EVOLUTION_PROGRESS, { currentStage: 2 });
      eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, { chapter: 2 });
    });
  });
});
