import { describe, it, expect, beforeEach } from 'vitest';
import { Events } from '../src/contracts/Interfaces.js';
import { EventBus } from '../src/contracts/EventBus.js';
import OrreryState, { ManeuverStatus, OrbitalState } from '../src/game/OrreryState.js';
import NarrativeDirector, {
  NarrativeLifecycle,
  CHAPTER_DEFINITIONS,
  TOTAL_CHAPTERS
} from '../src/game/NarrativeDirector.js';

describe('NarrativeDirector (Phase 2)', () => {
  let eventBus;
  let orreryState;
  let director;

  beforeEach(() => {
    eventBus = new EventBus();
    orreryState = new OrreryState();
    director = new NarrativeDirector({ eventBus, orreryState });
  });

  // ==========================================================================
  // 1. CONSTRUCTION & INITIAL STATE
  // ==========================================================================
  describe('1. Construction & Initial State', () => {
    it('initializes with default chapter 1 and IDLE lifecycle', () => {
      expect(director.getChapter()).toBe(1);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.CALIBRATING);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
      expect(director.getCalibrationProgress()).toBe(0.0);
      expect(director.isReady()).toBe(false);
      expect(director.isExecuting()).toBe(false);
      expect(director.isComplete()).toBe(false);
    });

    it('works with default constructor without options', () => {
      const defaultDir = new NarrativeDirector();
      expect(defaultDir.getChapter()).toBe(1);
      expect(defaultDir.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
      expect(defaultDir.isReady()).toBe(false);
      defaultDir.destroy();
    });

    it('exposes a comprehensive immutable state snapshot via getState()', () => {
      const state = director.getState();
      expect(Object.isFrozen(state)).toBe(true);
      expect(state.chapter).toBe(1);
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);
      expect(state.calibrationProgress).toBe(0.0);
      expect(state.lifecycleState).toBe(NarrativeLifecycle.IDLE);
      expect(state.terminal).toBe(false);
      expect(state.isReady).toBe(false);
      expect(state.isExecuting).toBe(false);
      expect(state.isComplete).toBe(false);
      expect(state.chapterDefinition).toEqual(CHAPTER_DEFINITIONS[1]);
    });
  });

  // ==========================================================================
  // 2. CHAPTER DEFINITIONS & STAGE MAPPINGS
  // ==========================================================================
  describe('2. Chapter Definitions & Stage Mappings', () => {
    it('defines exactly five canonical chapters', () => {
      expect(Object.keys(CHAPTER_DEFINITIONS)).toHaveLength(5);
      expect(TOTAL_CHAPTERS).toBe(5);
    });

    it('defines Chapter 1: Three-Body Capture -> Stage 2', () => {
      const ch1 = director.getChapterDefinition(1);
      expect(ch1.name).toBe('Three-Body Capture');
      expect(ch1.initialState).toBe(OrbitalState.HYPERBOLIC);
      expect(ch1.executionState).toBe(OrbitalState.CAPTURE_BURN);
      expect(ch1.finalState).toBe(OrbitalState.BOUND_ECCENTRIC);
      expect(ch1.sourceStage).toBe(1);
      expect(ch1.targetStage).toBe(2);
      expect(ch1.terminal).toBe(false);
    });

    it('defines Chapter 2: Binary Resonance -> Stage 3', () => {
      const ch2 = director.getChapterDefinition(2);
      expect(ch2.name).toBe('Binary Resonance');
      expect(ch2.initialState).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
      expect(ch2.executionState).toBe(OrbitalState.RESONANCE_STABILIZATION);
      expect(ch2.finalState).toBe(OrbitalState.RESONANCE_2_1);
      expect(ch2.sourceStage).toBe(2);
      expect(ch2.targetStage).toBe(3);
      expect(ch2.terminal).toBe(false);
    });

    it('defines Chapter 3: Gravity Assist -> Stage 4', () => {
      const ch3 = director.getChapterDefinition(3);
      expect(ch3.name).toBe('Gravity Assist');
      expect(ch3.initialState).toBe(OrbitalState.BINARY_TRANSFER);
      expect(ch3.executionState).toBe(OrbitalState.GRAVITY_ASSIST);
      expect(ch3.finalState).toBe(OrbitalState.BOUND_OUTER_ORBIT);
      expect(ch3.sourceStage).toBe(3);
      expect(ch3.targetStage).toBe(4);
      expect(ch3.terminal).toBe(false);
    });

    it('defines Chapter 4: Roche Disruption -> Stage 5', () => {
      const ch4 = director.getChapterDefinition(4);
      expect(ch4.name).toBe('Roche Disruption');
      expect(ch4.initialState).toBe(OrbitalState.SATELLITE_APPROACH);
      expect(ch4.executionState).toBe(OrbitalState.ROCHE_SHEPHERDING);
      expect(ch4.finalState).toBe(OrbitalState.RING_FORMED);
      expect(ch4.sourceStage).toBe(4);
      expect(ch4.targetStage).toBe(5);
      expect(ch4.terminal).toBe(false);
    });

    it('defines Chapter 5: Supernova Deflection -> Stage 5 (Terminal)', () => {
      const ch5 = director.getChapterDefinition(5);
      expect(ch5.name).toBe('Supernova Deflection');
      expect(ch5.initialState).toBe(OrbitalState.SUPERNOVA_THREAT);
      expect(ch5.executionState).toBe(OrbitalState.SUPERNOVA_DEFLECTION);
      expect(ch5.finalState).toBe(OrbitalState.ATMOSPHERE_PROTECTED);
      expect(ch5.sourceStage).toBe(5);
      expect(ch5.targetStage).toBe(5);
      expect(ch5.terminal).toBe(true);
    });

    it('rejects invalid chapter numbers and confirms no Chapter 6 exists', () => {
      expect(director.getChapterDefinition(0)).toBeNull();
      expect(director.getChapterDefinition(6)).toBeNull();
      expect(director.getChapterDefinition(99)).toBeNull();
      expect(director.getChapterDefinition('invalid')).toBeNull();
    });
  });

  // ==========================================================================
  // 3. EVOLUTION_PROGRESS EVENT INGESTION
  // ==========================================================================
  describe('3. EVOLUTION_PROGRESS Event Ingestion', () => {
    it('updates calibrationProgress directly from payload without energy calculation', () => {
      eventBus.emit(Events.EVOLUTION_PROGRESS, {
        currentStage: 1,
        targetStage: 2,
        evolutionProgress: 0.65,
        evolutionEnergy: 65,
        evolutionEnergyRequired: 100,
        state: 'playing',
        visualStage: 1.65
      });

      expect(director.getCalibrationProgress()).toBe(0.65);
      expect(orreryState.calibrationProgress).toBe(0.65);
    });

    it('ignores non-numeric or malformed progress payloads gracefully', () => {
      director.orreryState.setCalibrationProgress(0.5);

      eventBus.emit(Events.EVOLUTION_PROGRESS, null);
      expect(director.getCalibrationProgress()).toBe(0.5);

      eventBus.emit(Events.EVOLUTION_PROGRESS, { evolutionProgress: 'invalid' });
      expect(director.getCalibrationProgress()).toBe(0.5);
    });
  });

  // ==========================================================================
  // 4. STAGE_READY EVENT INGESTION
  // ==========================================================================
  describe('4. STAGE_READY Event Ingestion', () => {
    it('transitions IDLE -> READY when receiving matching STAGE_READY event', () => {
      expect(director.isReady()).toBe(false);

      eventBus.emit(Events.STAGE_READY, {
        currentStage: 1,
        targetStage: 2,
        evolutionProgress: 1.0,
        state: 'ready-to-transform',
        visualStage: 2.0
      });

      expect(director.isReady()).toBe(true);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.READY);
    });

    it('ignores STAGE_READY with mismatched targetStage', () => {
      eventBus.emit(Events.STAGE_READY, {
        currentStage: 1,
        targetStage: 99,
        evolutionProgress: 1.0,
        state: 'ready-to-transform',
        visualStage: 2.0
      });

      expect(director.isReady()).toBe(false);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.CALIBRATING);
    });

    it('safely handles duplicate STAGE_READY without corrupting state', () => {
      const payload = {
        currentStage: 1,
        targetStage: 2,
        evolutionProgress: 1.0,
        state: 'ready-to-transform',
        visualStage: 2.0
      };

      eventBus.emit(Events.STAGE_READY, payload);
      expect(director.isReady()).toBe(true);

      // Duplicate delivery
      eventBus.emit(Events.STAGE_READY, payload);
      expect(director.isReady()).toBe(true);
      expect(director.getChapter()).toBe(1);
    });

    it('does not transition to READY if already EXECUTING', () => {
      director.startManeuver();
      expect(director.isExecuting()).toBe(true);

      eventBus.emit(Events.STAGE_READY, {
        currentStage: 1,
        targetStage: 2,
        evolutionProgress: 1.0,
        state: 'ready-to-transform'
      });

      expect(director.isExecuting()).toBe(true);
      expect(director.isReady()).toBe(false);
    });
  });

  // ==========================================================================
  // 5. TRANSFORMATION_STARTED EVENT INGESTION
  // ==========================================================================
  describe('5. TRANSFORMATION_STARTED Event Ingestion', () => {
    beforeEach(() => {
      // Move to READY first via matching STAGE_READY
      eventBus.emit(Events.STAGE_READY, {
        currentStage: 1,
        targetStage: 2,
        evolutionProgress: 1.0,
        state: 'ready-to-transform',
        visualStage: 2.0
      });
      expect(director.isReady()).toBe(true);
    });

    it('transitions READY -> EXECUTING and sets execution orbital state', () => {
      eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: 1,
        targetStage: 2,
        totalDuration: 6.8
      });

      expect(director.isExecuting()).toBe(true);
      expect(director.isReady()).toBe(false);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.EXECUTING);
      expect(director.getOrbitalState()).toBe(OrbitalState.CAPTURE_BURN);
    });

    it('ignores TRANSFORMATION_STARTED if targetStage does not match active chapter', () => {
      eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: 1,
        targetStage: 3,
        totalDuration: 6.8
      });

      expect(director.isReady()).toBe(true);
      expect(director.isExecuting()).toBe(false);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
    });

    it('ignores TRANSFORMATION_STARTED if director is not in READY state', () => {
      director.reset(); // Back to IDLE
      expect(director.isReady()).toBe(false);

      eventBus.emit(Events.TRANSFORMATION_STARTED, {
        currentStage: 1,
        targetStage: 2,
        totalDuration: 6.8
      });

      expect(director.isExecuting()).toBe(false);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
    });
  });

  // ==========================================================================
  // 6. TRANSFORMATION_COMPLETED & FULL PIPELINE PROGRESSION
  // ==========================================================================
  describe('6. TRANSFORMATION_COMPLETED & Progression Across Chapters 1..4', () => {
    it('executes full sequential progression from Chapter 1 to Chapter 5', () => {
      // CHAPTER 1 -> 2
      expect(director.getChapter()).toBe(1);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);

      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2, evolutionProgress: 1.0 });
      expect(director.isReady()).toBe(true);

      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2, totalDuration: 6.8 });
      expect(director.isExecuting()).toBe(true);
      expect(director.getOrbitalState()).toBe(OrbitalState.CAPTURE_BURN);

      // In Chapter 1, alignment completion + transformation completion together advance to Chapter 2
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      // Automatically transitions Chapter 1 to Chapter 2 initial state
      expect(director.getChapter()).toBe(2);
      expect(director.getOrbitalState()).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.CALIBRATING);
      expect(director.getCalibrationProgress()).toBe(0.0);
      expect(director.isReady()).toBe(false);
      expect(director.isExecuting()).toBe(false);

      // CHAPTER 2 -> 3
      eventBus.emit(Events.STAGE_READY, { currentStage: 2, targetStage: 3, evolutionProgress: 1.0 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 2, targetStage: 3, totalDuration: 7.2 });
      expect(director.getOrbitalState()).toBe(OrbitalState.RESONANCE_STABILIZATION);

      // In Chapter 2, resonance completion + transformation completion together advance to Chapter 3
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(3);
      expect(director.getOrbitalState()).toBe(OrbitalState.BINARY_TRANSFER);

      // CHAPTER 3 -> 4
      eventBus.emit(Events.STAGE_READY, { currentStage: 3, targetStage: 4, evolutionProgress: 1.0 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 3, targetStage: 4, totalDuration: 7.5 });
      expect(director.getOrbitalState()).toBe(OrbitalState.GRAVITY_ASSIST);

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 3, newStage: 4 });
      expect(director.getChapter()).toBe(4);
      expect(director.getOrbitalState()).toBe(OrbitalState.SATELLITE_APPROACH);

      // CHAPTER 4 -> 5
      eventBus.emit(Events.STAGE_READY, { currentStage: 4, targetStage: 5, evolutionProgress: 1.0 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 4, targetStage: 5, totalDuration: 8.0 });
      expect(director.getOrbitalState()).toBe(OrbitalState.ROCHE_SHEPHERDING);

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 4, newStage: 5 });
      expect(director.getChapter()).toBe(5);
      expect(director.getOrbitalState()).toBe(OrbitalState.SUPERNOVA_THREAT);
    });

    it('guards against duplicate TRANSFORMATION_COMPLETED (never advances twice)', () => {
      // Step to EXECUTING in Chapter 1
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2, evolutionProgress: 1.0 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2, totalDuration: 6.8 });

      // First completion with both alignment and transformation -> advances to Chapter 2
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2);

      // Duplicate delivery of the exact same event
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2); // Still 2, NOT 3!
    });

    it('guards against out-of-order TRANSFORMATION_COMPLETED while not executing', () => {
      expect(director.isExecuting()).toBe(false);

      // Spurious completion event
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(director.getChapter()).toBe(1);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
    });

    it('guards against mismatched previousStage or newStage', () => {
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2, evolutionProgress: 1.0 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2, totalDuration: 6.8 });
      expect(director.isExecuting()).toBe(true);

      // Wrong newStage
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 99 });
      expect(director.getChapter()).toBe(1);
      expect(director.isExecuting()).toBe(true);

      // Wrong previousStage
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 99, newStage: 2 });
      expect(director.getChapter()).toBe(1);
      expect(director.isExecuting()).toBe(true);
    });
  });

  // ==========================================================================
  // 7. CHAPTER 5 TERMINAL FINALE
  // ==========================================================================
  describe('7. Chapter 5 Terminal Finale & Boundary Enforcement', () => {
    beforeEach(() => {
      // Fast forward to Chapter 5
      for (let ch = 1; ch <= 4; ch++) {
        const def = director.getChapterDefinition(ch);
        eventBus.emit(Events.STAGE_READY, { currentStage: def.sourceStage, targetStage: def.targetStage });
        eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: def.sourceStage, targetStage: def.targetStage });
        if (ch === 1) {
          eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
        }
        if (ch === 2) {
          eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
        }
        eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: def.sourceStage, newStage: def.targetStage });
      }
      expect(director.getChapter()).toBe(5);
    });

    it('finalizes Chapter 5 into ATMOSPHERE_PROTECTED and terminal COMPLETED', () => {
      expect(director.getOrbitalState()).toBe(OrbitalState.SUPERNOVA_THREAT);

      // Stage ready for Chapter 5
      eventBus.emit(Events.STAGE_READY, { currentStage: 5, targetStage: 5, evolutionProgress: 1.0 });
      expect(director.isReady()).toBe(true);

      // Transformation starts
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 5, targetStage: 5, totalDuration: 10.0 });
      expect(director.isExecuting()).toBe(true);
      expect(director.getOrbitalState()).toBe(OrbitalState.SUPERNOVA_DEFLECTION);

      // Transformation completes
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 5, newStage: 5 });

      expect(director.getChapter()).toBe(5);
      expect(director.getOrbitalState()).toBe(OrbitalState.ATMOSPHERE_PROTECTED);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.COMPLETED);
      expect(director.isComplete()).toBe(true);
      expect(director.isExecuting()).toBe(false);
      expect(director.isReady()).toBe(false);
    });

    it('strictly enforces no Chapter 6 exists and subsequent events cannot re-advance', () => {
      // Complete Chapter 5
      eventBus.emit(Events.STAGE_READY, { currentStage: 5, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 5, targetStage: 5 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 5, newStage: 5 });

      expect(director.isComplete()).toBe(true);
      expect(director.getChapter()).toBe(5);

      // Attempting to emit additional events
      eventBus.emit(Events.STAGE_READY, { currentStage: 5, targetStage: 6 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 5, targetStage: 6 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 5, newStage: 6 });

      expect(director.getChapter()).toBe(5);
      expect(director.isComplete()).toBe(true);
      expect(director.getOrbitalState()).toBe(OrbitalState.ATMOSPHERE_PROTECTED);
    });
  });

  // ==========================================================================
  // 8. MANUAL TRANSITION OPERATIONS & DETERMINISM
  // ==========================================================================
  describe('8. Manual Transition Operations (prepareManeuver, startManeuver, completeManeuver)', () => {
    it('manually executes maneuver lifecycle cleanly', () => {
      expect(director.getChapter()).toBe(1);

      // prepareManeuver
      expect(director.prepareManeuver()).toBe(true);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);

      // startManeuver
      expect(director.startManeuver()).toBe(true);
      expect(director.isExecuting()).toBe(true);
      expect(director.getOrbitalState()).toBe(OrbitalState.CAPTURE_BURN);

      // completeManeuver
      expect(director.completeManeuver()).toBe(true);
      expect(director.getChapter()).toBe(2);
      expect(director.getOrbitalState()).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
    });

    it('rejects completeManeuver when not in executing state', () => {
      expect(director.isExecuting()).toBe(false);
      expect(director.completeManeuver()).toBe(false);
    });
  });

  // ==========================================================================
  // 9. RESET
  // ==========================================================================
  describe('9. Reset Method', () => {
    it('resets narrative director and underlying orreryState to Chapter 1 defaults', () => {
      // Advance to Chapter 2
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(director.getChapter()).toBe(2);

      director.reset();

      expect(director.getChapter()).toBe(1);
      expect(director.getOrbitalState()).toBe(OrbitalState.HYPERBOLIC);
      expect(director.getManeuverStatus()).toBe(ManeuverStatus.CALIBRATING);
      expect(director.getCalibrationProgress()).toBe(0.0);
      expect(director.isReady()).toBe(false);
      expect(director.isExecuting()).toBe(false);
      expect(director.isComplete()).toBe(false);
    });
  });

  // ==========================================================================
  // 10. DESTROY & IDEMPOTENCE
  // ==========================================================================
  describe('10. Destroy & Lifecycle Cleanup', () => {
    it('unsubscribes all event handlers and stops reacting to pipeline events', () => {
      director.destroy();

      // Emitting events after destroy
      eventBus.emit(Events.EVOLUTION_PROGRESS, { evolutionProgress: 0.85 });
      eventBus.emit(Events.STAGE_READY, { currentStage: 1, targetStage: 2 });
      eventBus.emit(Events.TRANSFORMATION_STARTED, { currentStage: 1, targetStage: 2 });

      expect(director.getCalibrationProgress()).toBe(0.0);
      expect(director.isReady()).toBe(false);
      expect(director.isExecuting()).toBe(false);
      expect(director.getChapter()).toBe(1);
    });

    it('allows destroy() and dispose() to be called repeatedly without throwing', () => {
      expect(() => {
        director.destroy();
        director.destroy();
        director.dispose();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // 11. PHASE 2C: CHAPTER 1 DUAL-CONDITION NARRATIVE GATE (STEPS 1-3)
  // ==========================================================================
  describe('11. Phase 2C: Chapter 1 Dual-Condition Narrative Gate', () => {
    it('TEST 5 — Transformation alone does NOT advance Chapter 1', () => {
      director._ch1EvolutionCompleted = true;
      director._ch1AlignmentCompleted = false;

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });

      expect(director.getChapter()).toBe(1);
      expect(director._ch1EvolutionCompleted).toBe(true);
      expect(director._ch1AlignmentCompleted).toBe(false);
    });

    it('TEST 6 — Alignment alone does NOT advance Chapter 1', () => {
      director._ch1AlignmentCompleted = true;
      director._ch1EvolutionCompleted = false;

      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });

      expect(director.getChapter()).toBe(1);
      expect(director._ch1AlignmentCompleted).toBe(true);
      expect(director._ch1EvolutionCompleted).toBe(false);
    });

    it('TEST 7 — Both conditions advance Chapter 1 → Chapter 2', () => {
      expect(director.getChapter()).toBe(1);

      // Alignment completes first
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      expect(director.getChapter()).toBe(1);
      expect(director._ch1AlignmentCompleted).toBe(true);

      // Transformation completes second
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2);
      expect(director.getOrbitalState()).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
    });

    it('TEST 8 — Reverse ordering also works (Transformation -> Alignment)', () => {
      expect(director.getChapter()).toBe(1);

      // Transformation completes first
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(1);
      expect(director._ch1EvolutionCompleted).toBe(true);

      // Alignment completes second
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      expect(director.getChapter()).toBe(2);
      expect(director.getOrbitalState()).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
    });

    it('TEST 9 — Reset restores the narrative gate', () => {
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2);

      director.reset();

      expect(director.getChapter()).toBe(1);
      expect(director._ch1AlignmentCompleted).toBe(false);
      expect(director._ch1EvolutionCompleted).toBe(false);
      expect(director.getState().ch1AlignmentCompleted).toBe(false);
      expect(director.getState().ch1EvolutionCompleted).toBe(false);
    });
  });

  // ==========================================================================
  // 12. PHASE 4A: CHAPTER 2 DUAL-CONDITION NARRATIVE GATE
  // ==========================================================================
  describe('12. Phase 4A: Chapter 2 Dual-Condition Narrative Gate', () => {
    beforeEach(() => {
      // Advance to Chapter 2
      eventBus.emit(Events.ORRERY_ALIGNMENT_COMPLETED, { chapter: 1 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 1, newStage: 2 });
      expect(director.getChapter()).toBe(2);
    });

    it('TEST 1 — Transformation alone does NOT advance Chapter 2', () => {
      director._ch2EvolutionCompleted = true;
      director._ch2ResonanceCompleted = false;

      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });

      expect(director.getChapter()).toBe(2);
      expect(director._ch2EvolutionCompleted).toBe(true);
      expect(director._ch2ResonanceCompleted).toBe(false);
      expect(director.isCh2EvolutionCompleted()).toBe(true);
      expect(director.isCh2ResonanceCompleted()).toBe(false);
    });

    it('TEST 2 — Resonance alone does NOT advance Chapter 2', () => {
      director._ch2ResonanceCompleted = true;
      director._ch2EvolutionCompleted = false;

      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });

      expect(director.getChapter()).toBe(2);
      expect(director._ch2ResonanceCompleted).toBe(true);
      expect(director._ch2EvolutionCompleted).toBe(false);
      expect(director.isCh2ResonanceCompleted()).toBe(true);
      expect(director.isCh2EvolutionCompleted()).toBe(false);
    });

    it('TEST 3 — Both conditions advance Chapter 2 → Chapter 3 (Resonance -> Transformation)', () => {
      expect(director.getChapter()).toBe(2);

      // Resonance completes first
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      expect(director.getChapter()).toBe(2);
      expect(director.isCh2ResonanceCompleted()).toBe(true);

      // Transformation completes second
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(3);
      expect(director.getOrbitalState()).toBe(OrbitalState.BINARY_TRANSFER);
    });

    it('TEST 4 — Reverse ordering also works (Transformation -> Resonance)', () => {
      expect(director.getChapter()).toBe(2);

      // Transformation completes first
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(2);
      expect(director.isCh2EvolutionCompleted()).toBe(true);

      // Resonance completes second
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      expect(director.getChapter()).toBe(3);
      expect(director.getOrbitalState()).toBe(OrbitalState.BINARY_TRANSFER);
    });

    it('TEST 5 — Reset restores Chapter 2 narrative gate state', () => {
      eventBus.emit(Events.ORRERY_RESONANCE_COMPLETED, { chapter: 2 });
      eventBus.emit(Events.TRANSFORMATION_COMPLETED, { previousStage: 2, newStage: 3 });
      expect(director.getChapter()).toBe(3);

      director.reset();

      expect(director.getChapter()).toBe(1);
      expect(director.isCh2ResonanceCompleted()).toBe(false);
      expect(director.isCh2EvolutionCompleted()).toBe(false);
      expect(director.getState().ch2ResonanceCompleted).toBe(false);
      expect(director.getState().ch2EvolutionCompleted).toBe(false);
    });
  });
});
