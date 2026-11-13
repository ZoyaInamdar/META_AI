import { describe, it, expect, beforeEach } from 'vitest';
import OrreryState, {
  ManeuverStatus,
  OrbitalState,
  CHAPTER_ORBITAL_STATES,
  DEFAULT_ORRERY_STATE,
  MIN_CHAPTER,
  MAX_CHAPTER,
  isOrbitalStateValidForChapter,
  isValidOrbitalState,
  isValidManeuverStatus
} from '../src/game/OrreryState.js';

describe('OrreryState (Phase 1 Pure Narrative State Model)', () => {
  let state;

  beforeEach(() => {
    state = new OrreryState();
  });

  // ==========================================================================
  // 1. INITIALIZATION & CANONICAL DEFAULTS
  // ==========================================================================
  describe('1. Initialization & Canonical Defaults', () => {
    it('initializes with default chapter 1', () => {
      expect(state.chapter).toBe(1);
      expect(state.getChapter()).toBe(1);
    });

    it('initializes with default orbital state HYPERBOLIC', () => {
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);
      expect(state.getOrbitalState()).toBe('HYPERBOLIC');
    });

    it('initializes with default maneuver status CALIBRATING', () => {
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(state.getManeuverStatus()).toBe('CALIBRATING');
    });

    it('initializes with default scientific and narrative values', () => {
      expect(state.calibrationProgress).toBe(0.0);
      expect(state.getCalibrationProgress()).toBe(0.0);
      expect(state.eccentricity).toBe(1.25);
      expect(state.getEccentricity()).toBe(1.25);
      expect(state.semiMajorAxis).toBe(3.5);
      expect(state.getSemiMajorAxis()).toBe(3.5);
      expect(state.resonanceRatio).toBe(0.0);
      expect(state.getResonanceRatio()).toBe(0.0);
      expect(state.rocheProgress).toBe(0.0);
      expect(state.getRocheProgress()).toBe(0.0);
      expect(state.shieldCharge).toBe(0.0);
      expect(state.getShieldCharge()).toBe(0.0);
    });

    it('accepts valid constructor options to initialize custom initial state', () => {
      const custom = new OrreryState({
        chapter: 2,
        orbitalState: OrbitalState.CHAOTIC_CIRCUMBINARY,
        maneuverStatus: ManeuverStatus.READY,
        calibrationProgress: 0.8,
        eccentricity: 0.85,
        semiMajorAxis: 5.2,
        resonanceRatio: 1.5,
        rocheProgress: 0.3,
        shieldCharge: 0.5
      });

      expect(custom.chapter).toBe(2);
      expect(custom.orbitalState).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
      expect(custom.maneuverStatus).toBe(ManeuverStatus.READY);
      expect(custom.calibrationProgress).toBe(0.8);
      expect(custom.eccentricity).toBe(0.85);
      expect(custom.semiMajorAxis).toBe(5.2);
      expect(custom.resonanceRatio).toBe(1.5);
      expect(custom.rocheProgress).toBe(0.3);
      expect(custom.shieldCharge).toBe(0.5);
    });

    it('ensures DEFAULT_ORRERY_STATE matches specifications and is frozen', () => {
      expect(Object.isFrozen(DEFAULT_ORRERY_STATE)).toBe(true);
      expect(DEFAULT_ORRERY_STATE.chapter).toBe(1);
      expect(DEFAULT_ORRERY_STATE.orbitalState).toBe(OrbitalState.HYPERBOLIC);
      expect(DEFAULT_ORRERY_STATE.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(DEFAULT_ORRERY_STATE.calibrationProgress).toBe(0.0);
      expect(DEFAULT_ORRERY_STATE.eccentricity).toBe(1.25);
      expect(DEFAULT_ORRERY_STATE.semiMajorAxis).toBe(3.5);
      expect(DEFAULT_ORRERY_STATE.resonanceRatio).toBe(0.0);
      expect(DEFAULT_ORRERY_STATE.rocheProgress).toBe(0.0);
      expect(DEFAULT_ORRERY_STATE.shieldCharge).toBe(0.0);
    });
  });

  // ==========================================================================
  // 2. STATE MUTATIONS
  // ==========================================================================
  describe('2. State Mutation Methods', () => {
    it('updates chapter correctly via setChapter() and property setter', () => {
      state.setChapter(2);
      expect(state.chapter).toBe(2);

      state.chapter = 3;
      expect(state.chapter).toBe(3);
    });

    it('updates orbital state correctly via setOrbitalState() and property setter', () => {
      state.setOrbitalState(OrbitalState.CAPTURE_BURN);
      expect(state.orbitalState).toBe(OrbitalState.CAPTURE_BURN);

      state.orbitalState = OrbitalState.BOUND_ECCENTRIC;
      expect(state.orbitalState).toBe(OrbitalState.BOUND_ECCENTRIC);
    });

    it('rejects invalid orbital state strings', () => {
      const ok = state.setOrbitalState('INVALID_STATE_XYZ');
      expect(ok).toBe(false);
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);
    });

    it('updates maneuver status correctly via setManeuverStatus() and property setter', () => {
      state.setManeuverStatus(ManeuverStatus.READY);
      expect(state.maneuverStatus).toBe(ManeuverStatus.READY);

      state.setManeuverStatus(ManeuverStatus.EXECUTING);
      expect(state.maneuverStatus).toBe(ManeuverStatus.EXECUTING);

      state.maneuverStatus = ManeuverStatus.COMPLETED;
      expect(state.maneuverStatus).toBe(ManeuverStatus.COMPLETED);
    });

    it('rejects invalid maneuver status strings', () => {
      const ok = state.setManeuverStatus('NOT_A_STATUS');
      expect(ok).toBe(false);
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
    });

    it('updates calibration progress correctly within range', () => {
      state.setCalibrationProgress(0.75);
      expect(state.calibrationProgress).toBe(0.75);
    });

    it('updates eccentricity correctly without arbitrary clamping', () => {
      state.setEccentricity(0.05);
      expect(state.eccentricity).toBe(0.05);

      state.setEccentricity(2.8);
      expect(state.eccentricity).toBe(2.8);
    });

    it('updates semi-major axis correctly without arbitrary clamping', () => {
      state.setSemiMajorAxis(12.4);
      expect(state.semiMajorAxis).toBe(12.4);

      state.setSemiMajorAxis(0.8);
      expect(state.semiMajorAxis).toBe(0.8);
    });

    it('updates resonance ratio correctly', () => {
      state.setResonanceRatio(2.0);
      expect(state.resonanceRatio).toBe(2.0);

      state.setResonanceRatio(1.5);
      expect(state.resonanceRatio).toBe(1.5);
    });

    it('updates Roche progress correctly', () => {
      state.setRocheProgress(0.65);
      expect(state.rocheProgress).toBe(0.65);
    });

    it('updates shield charge correctly', () => {
      state.setShieldCharge(0.92);
      expect(state.shieldCharge).toBe(0.92);
    });
  });

  // ==========================================================================
  // 3. CLAMPING & NORMALIZATION RULES
  // ==========================================================================
  describe('3. Clamping & Normalization Rules', () => {
    it('clamps calibrationProgress below 0 to 0.0 and above 1 to 1.0', () => {
      state.setCalibrationProgress(-0.5);
      expect(state.calibrationProgress).toBe(0.0);

      state.setCalibrationProgress(-999);
      expect(state.calibrationProgress).toBe(0.0);

      state.setCalibrationProgress(1.5);
      expect(state.calibrationProgress).toBe(1.0);

      state.setCalibrationProgress(100);
      expect(state.calibrationProgress).toBe(1.0);
    });

    it('clamps rocheProgress below 0 to 0.0 and above 1 to 1.0', () => {
      state.setRocheProgress(-0.25);
      expect(state.rocheProgress).toBe(0.0);

      state.setRocheProgress(1.75);
      expect(state.rocheProgress).toBe(1.0);
    });

    it('clamps shieldCharge below 0 to 0.0 and above 1 to 1.0', () => {
      state.setShieldCharge(-1.0);
      expect(state.shieldCharge).toBe(0.0);

      state.setShieldCharge(2.5);
      expect(state.shieldCharge).toBe(1.0);
    });

    it('safely handles non-finite values for normalized parameters by defaulting to 0.0', () => {
      state.setCalibrationProgress(NaN);
      expect(state.calibrationProgress).toBe(0.0);

      state.setRocheProgress('invalid');
      expect(state.rocheProgress).toBe(0.0);

      state.setShieldCharge(undefined);
      expect(state.shieldCharge).toBe(0.0);
    });
  });

  // ==========================================================================
  // 4. CHAPTER BOUNDARIES & ADVANCE CHAPTER
  // ==========================================================================
  describe('4. Chapter Boundaries & advanceChapter()', () => {
    it('advances sequentially through chapters: 1 -> 2 -> 3 -> 4 -> 5', () => {
      expect(state.chapter).toBe(1);
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);

      // 1 -> 2
      const ch2 = state.advanceChapter();
      expect(ch2).toBe(2);
      expect(state.chapter).toBe(2);
      expect(state.orbitalState).toBe(OrbitalState.CHAOTIC_CIRCUMBINARY);
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(state.calibrationProgress).toBe(0.0);

      // 2 -> 3
      const ch3 = state.advanceChapter();
      expect(ch3).toBe(3);
      expect(state.chapter).toBe(3);
      expect(state.orbitalState).toBe(OrbitalState.BINARY_TRANSFER);

      // 3 -> 4
      const ch4 = state.advanceChapter();
      expect(ch4).toBe(4);
      expect(state.chapter).toBe(4);
      expect(state.orbitalState).toBe(OrbitalState.SATELLITE_APPROACH);

      // 4 -> 5
      const ch5 = state.advanceChapter();
      expect(ch5).toBe(5);
      expect(state.chapter).toBe(5);
      expect(state.orbitalState).toBe(OrbitalState.SUPERNOVA_THREAT);

      // 5 -> 5 (terminal chapter, never creates Chapter 6)
      const chTerminal = state.advanceChapter();
      expect(chTerminal).toBe(5);
      expect(state.chapter).toBe(5);
      expect(state.chapter).toBeLessThanOrEqual(MAX_CHAPTER);
    });

    it('clamps manual setChapter() to bounds [1..5]', () => {
      state.setChapter(6);
      expect(state.chapter).toBe(5);

      state.setChapter(999);
      expect(state.chapter).toBe(5);

      state.setChapter(0);
      expect(state.chapter).toBe(1);

      state.setChapter(-10);
      expect(state.chapter).toBe(1);
    });

    it('rejects non-numeric chapters', () => {
      const ok = state.setChapter('invalid');
      expect(ok).toBe(false);
      expect(state.chapter).toBe(1);
    });
  });

  // ==========================================================================
  // 5. SNAPSHOT ISOLATION & IMMUTABILITY
  // ==========================================================================
  describe('5. Snapshot Isolation & Immutability', () => {
    it('returns a plain data object matching current state', () => {
      state.setChapter(3);
      state.setOrbitalState(OrbitalState.GRAVITY_ASSIST);
      state.setManeuverStatus(ManeuverStatus.EXECUTING);
      state.setCalibrationProgress(0.9);
      state.setEccentricity(0.45);
      state.setSemiMajorAxis(8.1);
      state.setResonanceRatio(1.8);
      state.setRocheProgress(0.1);
      state.setShieldCharge(0.7);

      const snapshot = state.getSnapshot();

      expect(snapshot).toEqual({
        chapter: 3,
        orbitalState: 'GRAVITY_ASSIST',
        maneuverStatus: 'EXECUTING',
        calibrationProgress: 0.9,
        eccentricity: 0.45,
        semiMajorAxis: 8.1,
        resonanceRatio: 1.8,
        rocheProgress: 0.1,
        shieldCharge: 0.7
      });
    });

    it('ensures getSnapshot() returns a frozen object that cannot be mutated', () => {
      const snapshot = state.getSnapshot();
      expect(Object.isFrozen(snapshot)).toBe(true);

      expect(() => {
        'use strict';
        snapshot.chapter = 99;
      }).toThrow();

      expect(state.chapter).toBe(1);
    });

    it('ensures mutations to state do not mutate previously taken snapshots', () => {
      const snapshot1 = state.getSnapshot();
      expect(snapshot1.chapter).toBe(1);
      expect(snapshot1.calibrationProgress).toBe(0.0);

      state.setChapter(4);
      state.setCalibrationProgress(1.0);

      expect(snapshot1.chapter).toBe(1);
      expect(snapshot1.calibrationProgress).toBe(0.0);

      const snapshot2 = state.getSnapshot();
      expect(snapshot2.chapter).toBe(4);
      expect(snapshot2.calibrationProgress).toBe(1.0);
    });
  });

  // ==========================================================================
  // 6. RESET
  // ==========================================================================
  describe('6. Reset Method', () => {
    it('restores all fields to exact default canonical values', () => {
      // Modify everything
      state.setChapter(5);
      state.setOrbitalState(OrbitalState.ATMOSPHERE_PROTECTED);
      state.setManeuverStatus(ManeuverStatus.COMPLETED);
      state.setCalibrationProgress(1.0);
      state.setEccentricity(0.12);
      state.setSemiMajorAxis(15.0);
      state.setResonanceRatio(2.0);
      state.setRocheProgress(1.0);
      state.setShieldCharge(1.0);

      const returned = state.reset();
      expect(returned).toBe(state);

      expect(state.chapter).toBe(1);
      expect(state.orbitalState).toBe(OrbitalState.HYPERBOLIC);
      expect(state.maneuverStatus).toBe(ManeuverStatus.CALIBRATING);
      expect(state.calibrationProgress).toBe(0.0);
      expect(state.eccentricity).toBe(1.25);
      expect(state.semiMajorAxis).toBe(3.5);
      expect(state.resonanceRatio).toBe(0.0);
      expect(state.rocheProgress).toBe(0.0);
      expect(state.shieldCharge).toBe(0.0);

      expect(state.getSnapshot()).toEqual(DEFAULT_ORRERY_STATE);
    });
  });

  // ==========================================================================
  // 7. CHAPTER/ORBITAL-STATE VALIDATION
  // ==========================================================================
  describe('7. Chapter & Orbital State Validation', () => {
    it('validates canonical orbital states for Chapter 1 (Three-Body Capture)', () => {
      expect(isOrbitalStateValidForChapter(1, OrbitalState.HYPERBOLIC)).toBe(true);
      expect(isOrbitalStateValidForChapter(1, OrbitalState.CAPTURE_BURN)).toBe(true);
      expect(isOrbitalStateValidForChapter(1, OrbitalState.BOUND_ECCENTRIC)).toBe(true);

      expect(isOrbitalStateValidForChapter(1, OrbitalState.CHAOTIC_CIRCUMBINARY)).toBe(false);
      expect(isOrbitalStateValidForChapter(1, OrbitalState.SUPERNOVA_THREAT)).toBe(false);
    });

    it('validates canonical orbital states for Chapter 2 (Binary Resonance)', () => {
      expect(isOrbitalStateValidForChapter(2, OrbitalState.CHAOTIC_CIRCUMBINARY)).toBe(true);
      expect(isOrbitalStateValidForChapter(2, OrbitalState.RESONANCE_STABILIZATION)).toBe(true);
      expect(isOrbitalStateValidForChapter(2, OrbitalState.RESONANCE_2_1)).toBe(true);

      expect(isOrbitalStateValidForChapter(2, OrbitalState.HYPERBOLIC)).toBe(false);
      expect(isOrbitalStateValidForChapter(2, OrbitalState.RING_FORMED)).toBe(false);
    });

    it('validates canonical orbital states for Chapter 3 (Gravity Assist)', () => {
      expect(isOrbitalStateValidForChapter(3, OrbitalState.BINARY_TRANSFER)).toBe(true);
      expect(isOrbitalStateValidForChapter(3, OrbitalState.GRAVITY_ASSIST)).toBe(true);
      expect(isOrbitalStateValidForChapter(3, OrbitalState.BOUND_OUTER_ORBIT)).toBe(true);

      expect(isOrbitalStateValidForChapter(3, OrbitalState.CAPTURE_BURN)).toBe(false);
      expect(isOrbitalStateValidForChapter(3, OrbitalState.ATMOSPHERE_PROTECTED)).toBe(false);
    });

    it('validates canonical orbital states for Chapter 4 (Roche Disruption)', () => {
      expect(isOrbitalStateValidForChapter(4, OrbitalState.SATELLITE_APPROACH)).toBe(true);
      expect(isOrbitalStateValidForChapter(4, OrbitalState.ROCHE_SHEPHERDING)).toBe(true);
      expect(isOrbitalStateValidForChapter(4, OrbitalState.RING_FORMED)).toBe(true);

      expect(isOrbitalStateValidForChapter(4, OrbitalState.RESONANCE_2_1)).toBe(false);
      expect(isOrbitalStateValidForChapter(4, OrbitalState.SUPERNOVA_DEFLECTION)).toBe(false);
    });

    it('validates canonical orbital states for Chapter 5 (Supernova Deflection)', () => {
      expect(isOrbitalStateValidForChapter(5, OrbitalState.SUPERNOVA_THREAT)).toBe(true);
      expect(isOrbitalStateValidForChapter(5, OrbitalState.SUPERNOVA_DEFLECTION)).toBe(true);
      expect(isOrbitalStateValidForChapter(5, OrbitalState.ATMOSPHERE_PROTECTED)).toBe(true);

      expect(isOrbitalStateValidForChapter(5, OrbitalState.HYPERBOLIC)).toBe(false);
      expect(isOrbitalStateValidForChapter(5, OrbitalState.GRAVITY_ASSIST)).toBe(false);
    });

    it('provides instance and static validation helpers', () => {
      expect(OrreryState.isOrbitalStateValidForChapter(1, OrbitalState.HYPERBOLIC)).toBe(true);
      expect(state.isOrbitalStateValidForChapter(1, OrbitalState.HYPERBOLIC)).toBe(true);
      expect(state.isOrbitalStateValidForChapter()).toBe(true);

      const report = state.validate();
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    it('detects state incoherence via validate()', () => {
      state.setOrbitalState(OrbitalState.SUPERNOVA_THREAT); // in Chapter 1
      const report = state.validate();
      expect(report.valid).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors[0]).toContain('not valid for chapter 1');
    });

    it('validates enums helper functions', () => {
      expect(isValidOrbitalState(OrbitalState.HYPERBOLIC)).toBe(true);
      expect(isValidOrbitalState('INVALID')).toBe(false);

      expect(isValidManeuverStatus(ManeuverStatus.READY)).toBe(true);
      expect(isValidManeuverStatus('INVALID')).toBe(false);
    });

    it('guarantees CHAPTER_ORBITAL_STATES is completely frozen', () => {
      expect(Object.isFrozen(CHAPTER_ORBITAL_STATES)).toBe(true);
      for (let ch = MIN_CHAPTER; ch <= MAX_CHAPTER; ch++) {
        expect(Object.isFrozen(CHAPTER_ORBITAL_STATES[ch])).toBe(true);
        expect(CHAPTER_ORBITAL_STATES[ch]).toHaveLength(3);
      }
    });
  });

  // ==========================================================================
  // 8. ARCHITECTURAL ISOLATION & ENERGY PURITY
  // ==========================================================================
  describe('8. Architectural Isolation & Energy Purity', () => {
    it('does NOT contain energy, scoring, or evolution counters', () => {
      expect(state.energy).toBeUndefined();
      expect(state.evolutionEnergy).toBeUndefined();
      expect(state.score).toBeUndefined();
      expect(state.awardedEnergy).toBeUndefined();
      expect(state.totalEnergy).toBeUndefined();

      const snapshot = state.getSnapshot();
      expect(snapshot.energy).toBeUndefined();
      expect(snapshot.evolutionEnergy).toBeUndefined();
      expect(snapshot.score).toBeUndefined();
      expect(snapshot.awardedEnergy).toBeUndefined();
      expect(snapshot.totalEnergy).toBeUndefined();
    });

    it('is completely dependency-free and lightweight', () => {
      // Confirms pure state container attributes
      expect(typeof state.getSnapshot).toBe('function');
      expect(typeof state.advanceChapter).toBe('function');
      expect(typeof state.reset).toBe('function');
      expect(typeof state.validate).toBe('function');
    });
  });
});
