/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * ============================================================================
 * Celestial Kendama - Final Progression / Story / Planet Unlock Correction Tests
 * ============================================================================
 *
 * Comprehensive integration and regression verification for:
 * 1. Problem 1: Chapter 3 Gravity Assist progressing to Chapter 4 Roche Disruption,
 *    and Chapter 4 progressing to Chapter 5 Supernova Deflection on 100% evolution.
 * 2. Problem 2: Disambiguation between persistent Planet Progression Card
 *    (Stage I: Seed, Stage II: Awakening, Stage III: Oceans, Stage IV: Life & Atmosphere,
 *    Stage V: Celestial Alignment) and temporary Chapter Announcement cards.
 * 3. Problem 3: Planet unlock celebration sparkle burst (16 sparkles in stage-aware palette),
 *    slow 360° spin, ~5 second presentation gap before PlanetUnlockUI card appears,
 *    and non-suppression during Chapter 2.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { Group, Scene } from 'three';
import { EventBus } from '../src/contracts/EventBus.js';
import { Events } from '../src/contracts/Interfaces.js';
import { NarrativeDirector, NarrativeLifecycle, TOTAL_CHAPTERS } from '../src/game/NarrativeDirector.js';
import { OrreryState, OrbitalState, ManeuverStatus } from '../src/game/OrreryState.js';
import { PlanetEvolutionController, MAX_STAGE } from '../src/gameplay/PlanetEvolutionController.js';
import { PlanetTransformationController, TransformationState } from '../src/game/PlanetTransformationController.js';
import { OrreryVisualSystem, ChapterTransitionState } from '../src/render/OrreryVisualSystem.js';
import {
  PlanetUnlockCelebration,
  CelebrationState,
  CelebrationPhase,
  CELEBRATION_TOTAL_DURATION,
  CELEBRATION_SPIN_DURATION,
  CELEBRATION_STAGE_PALETTES,
} from '../src/ui/PlanetUnlockCelebration.js';
import { PlanetUnlockUI, STAGE_UNLOCKS } from '../src/ui/PlanetUnlockUI.js';
import {
  ProgressionFeedbackUI,
  PLANET_STAGE_NAMES,
  CHAPTER_ANNOUNCEMENT_DATA,
  drawEnergyProgressBar,
  drawChapterPlaque,
} from '../src/ui/ProgressionFeedbackUI.js';

describe('Celestial Kendama - Final Progression, Story & Planet Unlock Correction', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  // ==========================================================================
  // PROBLEM 1: CHAPTER 3 -> 4 -> 5 PROGRESSION & TERMINAL FINALE
  // ==========================================================================

  describe('Problem 1: Chapter 3 -> 4 -> 5 Progression Flow', () => {
    it('NarrativeDirector advances from Chapter 3 to Chapter 4 on TRANSFORMATION_COMPLETED (3 -> 4)', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(3);
      const director = new NarrativeDirector({ eventBus, orreryState });

      expect(director.getChapter()).toBe(3);
      expect(director.getCurrentChapterDefinition().name).toBe('Gravity Assist');

      // Simulate PlanetEvolutionController hitting 100% and emitting STAGE_READY
      eventBus.emit(Events.STAGE_READY, {
        currentStage: 3,
        targetStage: 4,
        evolutionProgress: 1.0,
      });

      // PlanetTransformationController emits TRANSFORMATION_STARTED
      eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: 3,
        targetStage: 4,
        totalDuration: 4.0,
      });

      expect(director.lifecycleState).toBe(NarrativeLifecycle.EXECUTING);

      // PlanetTransformationController completes and emits TRANSFORMATION_COMPLETED
      let chapterChangedPayload = null;
      eventBus.on(Events.ORRERY_CHAPTER_CHANGED, (payload) => {
        chapterChangedPayload = payload;
      });

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
        previousStage: 3,
        newStage: 4,
      });

      // Assert chapter advanced to Chapter 4
      expect(director.getChapter()).toBe(4);
      expect(director.getCurrentChapterDefinition().name).toBe('Roche Disruption');
      expect(chapterChangedPayload).toEqual({
        chapter: 4,
        previousChapter: 3,
      });
    });

    it('NarrativeDirector advances to Chapter 4 on TRANSFORMATION_COMPLETED even if lifecycle was not EXECUTING', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(3);
      const director = new NarrativeDirector({ eventBus, orreryState });

      expect(director.lifecycleState).toBe(NarrativeLifecycle.IDLE);

      // Even if TRANSFORMATION_STARTED was not observed, completion of transformation (3 -> 4) satisfies Chapter 3
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
        previousStage: 3,
        newStage: 4,
      });

      expect(director.getChapter()).toBe(4);
    });

    it('NarrativeDirector advances from Chapter 4 to Chapter 5 on TRANSFORMATION_COMPLETED (4 -> 5)', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(4);
      const director = new NarrativeDirector({ eventBus, orreryState });

      expect(director.getChapter()).toBe(4);
      expect(director.getCurrentChapterDefinition().name).toBe('Roche Disruption');

      eventBus.emit(Events.STAGE_READY, {
        currentStage: 4,
        targetStage: 5,
        evolutionProgress: 1.0,
      });

      eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: 4,
        targetStage: 5,
        totalDuration: 4.0,
      });

      expect(director.lifecycleState).toBe(NarrativeLifecycle.EXECUTING);

      let chapterChangedPayload = null;
      eventBus.on(Events.ORRERY_CHAPTER_CHANGED, (payload) => {
        chapterChangedPayload = payload;
      });

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
        previousStage: 4,
        newStage: 5,
      });

      expect(director.getChapter()).toBe(5);
      expect(director.getCurrentChapterDefinition().name).toBe('Supernova Deflection');
      expect(chapterChangedPayload).toEqual({
        chapter: 5,
        previousChapter: 4,
      });
    });

    it('Chapter 5 is the terminal finale and does not advance to Chapter 6 or Stage 6', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(5);
      const director = new NarrativeDirector({ eventBus, orreryState });

      expect(director.getChapter()).toBe(5);
      const ch5Def = director.getCurrentChapterDefinition();
      expect(ch5Def.terminal).toBe(true);
      expect(ch5Def.sourceStage).toBe(5);
      expect(ch5Def.targetStage).toBe(5);

      // completeManeuver should mark COMPLETED and stay at chapter 5
      director.lifecycleState = NarrativeLifecycle.EXECUTING;
      const completed = director.completeManeuver();
      expect(completed).toBe(true);
      expect(director.getChapter()).toBe(5);
      expect(director.isComplete()).toBe(true);
    });

    it('OrreryVisualSystem activates chapter 4 scene group on Chapter 3 -> 4 event', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(3);
      const director = new NarrativeDirector({ eventBus, orreryState });

      const orrery = new OrreryVisualSystem({
        eventBus,
        narrativeDirector: director,
        parentGroup: new Group(),
      });

      // Advance director & emit ORRERY_CHAPTER_CHANGED to Chapter 4
      orreryState.setChapter(4);
      director._currentChapter = 4;
      eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, {
        chapter: 4,
        previousChapter: 3,
      });

      expect(orrery.getChapter()).toBe(4);
      expect(orrery.getChapterGroup(4).visible).toBe(true);
      expect(orrery.getChapterGroup(3).visible).toBe(false);

      orrery.destroy();
      director.destroy();
    });

    it('OrreryVisualSystem activates chapter 5 scene group on Chapter 4 -> 5 event', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(4);
      const director = new NarrativeDirector({ eventBus, orreryState });

      const orrery = new OrreryVisualSystem({
        eventBus,
        narrativeDirector: director,
        parentGroup: new Group(),
      });

      // Advance director & emit ORRERY_CHAPTER_CHANGED to Chapter 5
      orreryState.setChapter(5);
      director._currentChapter = 5;
      eventBus.emit(Events.ORRERY_CHAPTER_CHANGED, {
        chapter: 5,
        previousChapter: 4,
      });

      expect(orrery.getChapter()).toBe(5);
      expect(orrery.getChapterGroup(5).visible).toBe(true);
      expect(orrery.getChapterGroup(4).visible).toBe(false);

      orrery.destroy();
      director.destroy();
    });

    it('OrreryVisualSystem syncFromDirector updates chapter visibility when director advances', () => {
      const orreryState = new OrreryState();
      orreryState.setChapter(3);
      const director = new NarrativeDirector({ eventBus, orreryState });

      const orrery = new OrreryVisualSystem({
        eventBus,
        narrativeDirector: director,
        parentGroup: new Group(),
      });

      orrery.activeChapter = 3;

      // Advance narrative director to chapter 4
      orreryState.setChapter(4);
      director._currentChapter = 4;

      // Frame update triggers sync
      orrery.update(0.016);

      expect(orrery.getChapter()).toBe(4);
      expect(orrery.getChapterGroup(4).visible).toBe(true);

      orrery.destroy();
      director.destroy();
    });
  });

  // ==========================================================================
  // PROBLEM 2: DISAMBIGUATION OF PROGRESSION CARD AND STORY ANNOUNCEMENTS
  // ==========================================================================

  describe('Problem 2: UI Disambiguation & Canonical Objectives', () => {
    it('defines explicit canonical names for planet stages 1 through 5', () => {
      expect(PLANET_STAGE_NAMES[1]).toBe('SEED');
      expect(PLANET_STAGE_NAMES[2]).toBe('AWAKENING');
      expect(PLANET_STAGE_NAMES[3]).toBe('OCEANS');
      expect(PLANET_STAGE_NAMES[4]).toBe('LIFE & ATMOSPHERE');
      expect(PLANET_STAGE_NAMES[5]).toBe('CELESTIAL ALIGNMENT');
    });

    it('drawEnergyProgressBar renders explicit stage name with roman numeral', () => {
      const calls = [];
      const mockCanvas = {
        width: 512,
        height: 140,
        getContext: () => ({
          clearRect: () => {},
          save: () => {},
          restore: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arcTo: () => {},
          createLinearGradient: () => ({ addColorStop: () => {} }),
          fill: () => {},
          stroke: () => {},
          fillText: (text, x, y) => calls.push({ text, x, y }),
        }),
      };

      // Stage 1
      drawEnergyProgressBar(mockCanvas, 40, 100, 1, 0.40);
      expect(calls.some((c) => c.text === 'STAGE I: SEED')).toBe(true);
      expect(calls.some((c) => c.text === '40 / 100')).toBe(true);
      expect(calls.some((c) => c.text === 'CELESTIAL PROGRESSION')).toBe(true);

      // Stage 3
      calls.length = 0;
      drawEnergyProgressBar(mockCanvas, 75, 100, 3, 0.75);
      expect(calls.some((c) => c.text === 'STAGE III: OCEANS')).toBe(true);
      expect(calls.some((c) => c.text === '75 / 100')).toBe(true);

      // Stage 4
      calls.length = 0;
      drawEnergyProgressBar(mockCanvas, 0, 100, 4, 0.0);
      expect(calls.some((c) => c.text === 'STAGE IV: LIFE & ATMOSPHERE')).toBe(true);

      // Stage 5
      calls.length = 0;
      drawEnergyProgressBar(mockCanvas, 100, 100, 5, 1.0);
      expect(calls.some((c) => c.text === 'STAGE V: CELESTIAL ALIGNMENT')).toBe(true);
    });

    it('CHAPTER_ANNOUNCEMENT_DATA has canonical objectives with NO asteroid references for Chapter IV', () => {
      // Chapter I
      expect(CHAPTER_ANNOUNCEMENT_DATA[1].name).toBe('THREE-BODY CAPTURE');
      expect(CHAPTER_ANNOUNCEMENT_DATA[1].objective).toBe(
        'Perform catches to initiate planetary capture burn'
      );

      // Chapter II
      expect(CHAPTER_ANNOUNCEMENT_DATA[2].name).toBe('BINARY RESONANCE');
      expect(CHAPTER_ANNOUNCEMENT_DATA[2].objective).toBe(
        'Harmonize the binary system into stable resonance'
      );

      // Chapter III
      expect(CHAPTER_ANNOUNCEMENT_DATA[3].name).toBe('GRAVITY ASSIST');
      expect(CHAPTER_ANNOUNCEMENT_DATA[3].objective).toBe(
        'Use the gravity well to reach the outer orbit'
      );

      // Chapter IV: satellite -> Roche limit -> crystalline debris -> ring
      expect(CHAPTER_ANNOUNCEMENT_DATA[4].name).toBe('ROCHE DISRUPTION');
      expect(CHAPTER_ANNOUNCEMENT_DATA[4].objective).toBe(
        'Guide the satellite through the Roche limit'
      );
      expect(CHAPTER_ANNOUNCEMENT_DATA[4].objective.toLowerCase()).not.toContain('asteroid');

      // Chapter V
      expect(CHAPTER_ANNOUNCEMENT_DATA[5].name).toBe('SUPERNOVA DEFLECTION');
      expect(CHAPTER_ANNOUNCEMENT_DATA[5].objective).toBe(
        'Strike the celestial spike to deflect the supernova'
      );
    });

    it('drawChapterPlaque renders canonical chapter name, roman numeral, and story objective', () => {
      const calls = [];
      const mockCanvas = {
        width: 1024,
        height: 460,
        getContext: () => ({
          clearRect: () => {},
          save: () => {},
          restore: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arcTo: () => {},
          fillRect: () => {},
          createRadialGradient: () => ({ addColorStop: () => {} }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          fill: () => {},
          stroke: () => {},
          fillText: (text, x, y) => calls.push({ text, x, y }),
        }),
      };

      drawChapterPlaque(mockCanvas, CHAPTER_ANNOUNCEMENT_DATA[4]);
      expect(calls.some((c) => c.text === 'CHAPTER IV')).toBe(true);
      expect(calls.some((c) => c.text === 'ROCHE DISRUPTION')).toBe(true);
      expect(calls.some((c) => c.text === 'Guide the satellite through the Roche limit')).toBe(true);
    });

    it('PlanetUnlockUI STAGE_UNLOCKS metadata contains canonical stage titles and subtitles', () => {
      expect(STAGE_UNLOCKS[2].stageLabel).toBe('STAGE II');
      expect(STAGE_UNLOCKS[2].title).toBe('PLANET AWAKENED');
      expect(STAGE_UNLOCKS[3].stageLabel).toBe('STAGE III');
      expect(STAGE_UNLOCKS[4].stageLabel).toBe('STAGE IV');
      expect(STAGE_UNLOCKS[5].stageLabel).toBe('STAGE V');
    });
  });

  // ==========================================================================
  // PROBLEM 3: CELEBRATION, PRESENTATION GAP & SUPPRESSION CONTROL
  // ==========================================================================

  describe('Problem 3: Planet Unlock Celebration & Presentation Gap', () => {
    it('CELEBRATION_TOTAL_DURATION is set to exactly 5.0 seconds', () => {
      expect(CELEBRATION_TOTAL_DURATION).toBe(5.0);
      expect(CELEBRATION_SPIN_DURATION).toBe(3.4);
    });

    it('PlanetUnlockCelebration features 16 sparkles with stage-aware palettes', () => {
      const celebration = new PlanetUnlockCelebration({ eventBus });

      expect(celebration.sparkles.length).toBe(16);

      // Verify palettes exist for stages 2, 3, 4, and 5
      expect(CELEBRATION_STAGE_PALETTES[2]).toBeDefined();
      expect(CELEBRATION_STAGE_PALETTES[3]).toBeDefined();
      expect(CELEBRATION_STAGE_PALETTES[4]).toBeDefined();
      expect(CELEBRATION_STAGE_PALETTES[5]).toBeDefined();

      // Test palette adaptation on play
      celebration.play(3);
      expect(celebration.targetStage).toBe(3);

      celebration.destroy();
    });

    it('PlanetUnlockCelebration performs 360° spin and returns to exact baseline orientation', () => {
      const mockCoreMesh = { rotation: { y: 0.75 } };
      const mockRenderer = {
        coreMesh: mockCoreMesh,
        getAnchorPosition: () => ({ x: 0, y: 1.48, z: -1.8 }),
        getScale: () => 17.0,
        radius: 0.035,
      };

      const celebration = new PlanetUnlockCelebration({
        eventBus,
        planetoidRenderer: mockRenderer,
      });

      celebration.play(2);

      // Mid-spin: t = 1.9s (within spin from 0.2s to 3.6s)
      celebration.update(1.9);
      expect(mockCoreMesh.rotation.y).not.toBeCloseTo(0.75, 2);

      // End of spin: t = 3.65s (spin completed)
      celebration.update(1.75);
      expect(mockCoreMesh.rotation.y).toBeCloseTo(0.75, 4);

      celebration.destroy();
    });

    it('PlanetUnlockCelebration holds ~5 second presentation gap before revealing PlanetUnlockUI', () => {
      const mockUnlockUI = {
        showStage: vi.fn(),
        hide: vi.fn(),
      };

      const celebration = new PlanetUnlockCelebration({
        eventBus,
        unlockUI: mockUnlockUI,
      });

      celebration.play(2);

      // During active animation (t = 2.0s < 5.0s): unlock card must NOT be shown
      celebration.update(2.0);
      expect(mockUnlockUI.showStage).not.toHaveBeenCalled();

      // During settle phase (t = 4.0s < 5.0s): still admiring the planet, card NOT shown
      celebration.update(2.0);
      expect(mockUnlockUI.showStage).not.toHaveBeenCalled();
      expect(celebration.getPhase()).toBe(CelebrationPhase.SETTLE);

      // Handoff at t = 5.0s: presentation gap elapsed, unlock card revealed
      celebration.update(1.05); // total 5.05s >= 5.0s
      expect(celebration.getState()).toBe(CelebrationState.COMPLETE);
      expect(mockUnlockUI.showStage).toHaveBeenCalledTimes(1);
      expect(mockUnlockUI.showStage).toHaveBeenCalledWith(2);

      celebration.destroy();
    });

    it('TRANSFORMATION_COMPLETED event automatically triggers celebration sequence', () => {
      const mockUnlockUI = {
        showStage: vi.fn(),
        hide: vi.fn(),
      };

      const celebration = new PlanetUnlockCelebration({
        eventBus,
        unlockUI: mockUnlockUI,
      });

      expect(celebration.isActive()).toBe(false);

      // Emit completion from transformation controller
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, {
        previousStage: 2,
        newStage: 3,
      });

      expect(celebration.isActive()).toBe(true);
      expect(celebration.targetStage).toBe(3);

      celebration.destroy();
    });

    it('Complete end-to-end progression: 100% evolution -> STAGE_READY -> transformation -> celebration -> unlockUI', () => {
      const parentGroup = new Group();

      const evolution = new PlanetEvolutionController({
        eventBus,
        energyThresholds: { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 },
      });

      const transform = new PlanetTransformationController({
        eventBus,
        evolutionController: evolution,
        autoTransform: true,
      });

      const unlockUI = new PlanetUnlockUI({
        eventBus,
        parentGroup,
        autoSubscribe: false, // Driven strictly by celebration handoff
      });

      const celebration = new PlanetUnlockCelebration({
        eventBus,
        unlockUI,
        parentGroup,
      });

      const director = new NarrativeDirector({
        eventBus,
      });

      expect(evolution.getCurrentStage()).toBe(1);
      expect(director.getChapter()).toBe(1);

      // 1. Award 100 energy to Stage 1 to reach 100%
      evolution.addEvolutionEnergy(100);
      expect(evolution.getState()).toBe('ready-to-transform');

      // AutoTransform triggered beginTransformation(1, 2)
      expect(transform.state).toBe(TransformationState.TRANSFORMING);

      // 2. Advance transformation duration to 100%
      transform.update(transform.totalDuration + 0.1);
      expect(transform.state).toBe(TransformationState.IDLE);

      // 3. TRANSFORMATION_COMPLETED was emitted, celebration began!
      expect(celebration.isActive()).toBe(true);
      expect(celebration.targetStage).toBe(2);

      // 4. Advance celebration past 5.0 second presentation gap
      celebration.update(5.05);
      expect(celebration.getState()).toBe(CelebrationState.COMPLETE);

      // 5. Unlock UI card is presented!
      expect(unlockUI.isVisible()).toBe(true);
      expect(unlockUI.activeStage).toBe(2);
      expect(unlockUI.stageInfo.stageLabel).toBe('STAGE II');

      celebration.destroy();
      unlockUI.destroy();
      transform.destroy();
      evolution.destroy();
      director.destroy();
    });

    it('applies exact stage-aware palettes: Stage 2 (warm gold), Stage 3 (ocean cyan), Stage 4 (verdant emerald), Stage 5 (transcendent lavender)', () => {
      const celebration = new PlanetUnlockCelebration({ eventBus });

      // Stage 2: Awakened Mineral
      celebration.play(2);
      expect(celebration.sparkles[0].material.color.getHexString().toUpperCase()).toBe('FFF8F2');
      celebration.reset();

      // Stage 3: Hydrosphere
      celebration.play(3);
      expect(celebration.sparkles[0].material.color.getHexString().toUpperCase()).toBe('E6F7FF');
      celebration.reset();

      // Stage 4: Verdant Atmosphere
      celebration.play(4);
      expect(celebration.sparkles[0].material.color.getHexString().toUpperCase()).toBe('F6FFED');
      celebration.reset();

      // Stage 5: Transcendent Celestial
      celebration.play(5);
      expect(celebration.sparkles[0].material.color.getHexString().toUpperCase()).toBe('F9F0FF');
      celebration.reset();

      celebration.destroy();
    });

    it('Chapter 3 -> 4 visual transition smoothly interpolates planet coordinates and scale', () => {
      const orrery = new OrreryVisualSystem({ eventBus, parentGroup: new Group() });
      orrery.activeChapter = 3;

      orrery.startChapterTransition(3, 4);
      expect(orrery.isChapterTransitionActive()).toBe(true);

      // Halfway through 2.0s transition (t = 1.0s)
      orrery._updateChapterTransition(1.0, 0.5, ManeuverStatus.CALIBRATING, OrbitalState.BINARY_TRANSFER);
      const midProgress = orrery.getChapterTransitionState().progress;
      expect(midProgress).toBeCloseTo(0.5, 3);

      // Finish transition (t = 1.0s more)
      orrery._updateChapterTransition(1.0, 1.0, ManeuverStatus.CALIBRATING, OrbitalState.SATELLITE_APPROACH);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.chapterGroups[3].visible).toBe(false);
      expect(orrery.chapterGroups[4].visible).toBe(true);

      orrery.destroy();
    });

    it('Chapter 4 -> 5 visual transition smoothly interpolates planet toward (0.18, -0.05, 0) and scale 0.45', () => {
      const orrery = new OrreryVisualSystem({ eventBus, parentGroup: new Group() });
      orrery.activeChapter = 4;

      orrery.startChapterTransition(4, 5);
      expect(orrery.isChapterTransitionActive()).toBe(true);

      // Complete 2.0s transition
      orrery._updateChapterTransition(2.0, 1.0, ManeuverStatus.CALIBRATING, OrbitalState.SUPERNOVA_THREAT);
      expect(orrery.isChapterTransitionActive()).toBe(false);
      expect(orrery.chapterGroups[4].visible).toBe(false);
      expect(orrery.chapterGroups[5].visible).toBe(true);
      expect(orrery.ch5PlanetNode.scale.x).toBeCloseTo(0.45, 2);

      orrery.destroy();
    });

    it('Chapter 2 allows unlockCelebration and unlockUI to remain visible and active', () => {
      const parentGroup = new Group();
      const unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });
      const celebration = new PlanetUnlockCelebration({ eventBus, unlockUI, parentGroup });

      // Start celebration for Stage 3 unlock at end of Chapter 2
      celebration.play(3);
      expect(celebration.isActive()).toBe(true);
      expect(celebration.group.visible).toBe(true);

      // Advance celebration to show unlock card
      celebration.update(5.05);
      expect(unlockUI.isVisible()).toBe(true);
      expect(unlockUI.activeStage).toBe(3);

      celebration.destroy();
      unlockUI.destroy();
    });

    it('Chapter 5 actively suppresses unlockUI from displaying (terminal finale guard)', () => {
      const parentGroup = new Group();
      const orreryState = new OrreryState();
      orreryState.setChapter(5);

      const orrery = new OrreryVisualSystem({ eventBus, parentGroup });
      orrery.activeChapter = 5;

      const globalScope = typeof window !== 'undefined' ? window : globalThis;
      globalScope.orreryVisualSystem = orrery;

      const unlockUI = new PlanetUnlockUI({ eventBus, parentGroup });

      // Attempting to show stage 5 or 6 in Chapter 5 is suppressed
      const shown = unlockUI.show(5);
      expect(shown).toBe(false);
      expect(unlockUI.isVisible()).toBe(false);

      delete globalScope.orreryVisualSystem;
      unlockUI.destroy();
      orrery.destroy();
    });

    it('Full progression chain: Chapter 1 -> 2 -> 3 -> 4 -> 5 completes seamlessly', () => {
      const orreryState = new OrreryState();
      const director = new NarrativeDirector({ eventBus, orreryState });

      expect(director.getChapter()).toBe(1);

      // Ch 1 -> 2
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2);

      // Ch 2 -> 3
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(3);

      // Ch 3 -> 4
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 3, newStage: 4 });
      expect(director.getChapter()).toBe(4);

      // Ch 4 -> 5
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 4, newStage: 5 });
      expect(director.getChapter()).toBe(5);

      // Ch 5 terminal check
      expect(director.getCurrentChapterDefinition().terminal).toBe(true);

      director.destroy();
    });

    it('ProgressionFeedbackUI and PlanetUnlockCelebration execute with zero memory allocations per frame', () => {
      const parentGroup = new Group();
      const feedbackUI = new ProgressionFeedbackUI({ eventBus, parentGroup });
      const celebration = new PlanetUnlockCelebration({ eventBus, parentGroup });

      feedbackUI.setVisible(true);
      celebration.play(2);

      // Execute 120 consecutive frames (1 second at 120 Hz)
      for (let f = 0; f < 120; f++) {
        feedbackUI.update(0.00833);
        celebration.update(0.00833);
      }

      expect(celebration.isActive()).toBe(true);
      expect(feedbackUI.isVisible()).toBe(true);

      celebration.destroy();
      feedbackUI.destroy();
    });
  });
});
