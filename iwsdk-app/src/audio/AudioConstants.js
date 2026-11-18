/**
 * Celestial Kendama Audio Constants
 *
 * Defines procedural audio synthesis parameters, tuning frequencies,
 * envelope durations, voice limits, and default gain staging.
 */

export const AudioDefaults = Object.freeze({
  MASTER_VOLUME: 1.0,
  SFX_VOLUME: 1.0,
  AMBIENT_VOLUME: 0.06,
  MAX_SFX_VOICES: 6,
  CATCH_DEBOUNCE_MS: 40,
});

export const Notes = Object.freeze({
  // Pad roots & fifths (A minor / modal cosmic pad)
  A2: 110.00,
  E3: 164.81,
  B3: 246.94,

  // Milestone chord (C major 7th / add 9)
  C4: 261.63,
  G4: 392.00,
  B4: 493.88,
  E5: 659.25,

  // Ascension pentatonic (Stage Ready)
  C5: 523.25,
  G5: 783.99,
  B5: 987.77,
  C6: 1046.50,

  // Resolution chime (Transformation Complete)
  A5: 880.00,
  E6: 1318.51,

  // Gold ignition cascade (Finale Trigger)
  G_SHARP_5: 830.61,
  G_SHARP_6: 1661.22,
});

export const CatchAudioParams = Object.freeze({
  CLEAN: {
    startFreq: 1200,
    endFreq: 320,
    durationSec: 0.035,
    peakGain: 0.35,
    overtoneFreq: 2400,
    overtoneGain: 0.10,
    waveType: 'sine',
  },
  ASSISTED: {
    startFreq: 420,
    endFreq: 160,
    durationSec: 0.045,
    peakGain: 0.30,
    filterCutoff: 650,
    waveType: 'triangle',
  },
  MISS: {
    startFreq: 120,
    endFreq: 55,
    durationSec: 0.050,
    peakGain: 0.15,
    waveType: 'sine',
  },
});

export const ChimeSequences = Object.freeze({
  STAGE_READY: [
    { freq: Notes.C5, delaySec: 0.000, durationSec: 0.18, gain: 0.22 },
    { freq: Notes.E5, delaySec: 0.065, durationSec: 0.18, gain: 0.22 },
    { freq: Notes.G5, delaySec: 0.130, durationSec: 0.18, gain: 0.22 },
    { freq: Notes.B5, delaySec: 0.195, durationSec: 0.18, gain: 0.24 },
    { freq: Notes.C6, delaySec: 0.260, durationSec: 0.25, gain: 0.26 },
  ],
  STAGE_COMPLETED: [
    { freq: Notes.C4, delaySec: 0.00, durationSec: 1.0, gain: 0.22 },
    { freq: Notes.G4, delaySec: 0.02, durationSec: 1.0, gain: 0.20 },
    { freq: Notes.B4, delaySec: 0.04, durationSec: 1.1, gain: 0.20 },
    { freq: Notes.E5, delaySec: 0.06, durationSec: 1.2, gain: 0.25 },
  ],
  TRANSFORMATION_COMPLETED: [
    { freq: Notes.A5, delaySec: 0.00, durationSec: 0.6, gain: 0.25 },
    { freq: Notes.E6, delaySec: 0.02, durationSec: 0.7, gain: 0.22 },
  ],
  GOLD_IGNITION: [
    { freq: Notes.E5, delaySec: 0.00, durationSec: 0.25, gain: 0.20 },
    { freq: Notes.G_SHARP_5, delaySec: 0.08, durationSec: 0.25, gain: 0.22 },
    { freq: Notes.B5, delaySec: 0.16, durationSec: 0.25, gain: 0.24 },
    { freq: Notes.E6, delaySec: 0.24, durationSec: 0.35, gain: 0.26 },
    { freq: Notes.G_SHARP_6, delaySec: 0.32, durationSec: 0.45, gain: 0.28 },
  ],
  UNLOCK_AFFIRMATION: [
    { freq: 587.33, delaySec: 0.00, durationSec: 0.12, gain: 0.18 }, // D5
    { freq: 880.00, delaySec: 0.09, durationSec: 0.25, gain: 0.20 }, // A5
  ],
});

export const AmbientParams = Object.freeze({
  FREQUENCIES: [Notes.A2, Notes.E3, Notes.B3],
  DETUNES: [-5, 0, 6], // subtle cents detune for rich celestial chorus
  FILTER_BASE_FREQ: 550,
  FILTER_LFO_RATE: 0.08, // Hz
  FILTER_LFO_DEPTH: 200, // 350Hz - 750Hz sweep
  FADE_IN_TIME: 2.5,     // seconds
  FADE_OUT_TIME: 0.8,    // seconds
});
