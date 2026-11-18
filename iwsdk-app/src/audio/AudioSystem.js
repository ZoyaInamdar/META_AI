/**
 * Celestial Kendama Audio System
 *
 * Provides procedural Web Audio synthesis for:
 * - Ceramic/wood catch taps (CLEAN vs ASSISTED)
 * - Miss drop thud
 * - Celestial progression chimes (STAGE_READY, STAGE_COMPLETED, TRANSFORMATION_COMPLETED, GOLD_IGNITION)
 * - Ambient cosmic background pad with slow LFO modulation
 * - Safe user gesture / first-pinch audio unlock
 * - Debouncing, voice budget management, and zero-error headless degradation
 */

import { Events, CatchType } from '../contracts/Interfaces.js';
import {
  AudioDefaults,
  CatchAudioParams,
  ChimeSequences,
  AmbientParams,
} from './AudioConstants.js';

export class AudioSystem {
  /**
   * @param {import('../contracts/EventBus.js').EventBus} [eventBus] - EventBus instance
   * @param {Object} [options] - Configuration options
   */
  constructor(eventBus = null, options = {}) {
    this.eventBus = eventBus;
    this.options = options;

    this.masterVolume = options.masterVolume ?? AudioDefaults.MASTER_VOLUME;
    this.sfxVolume = options.sfxVolume ?? AudioDefaults.SFX_VOLUME;
    this.ambientVolume = options.ambientVolume ?? AudioDefaults.AMBIENT_VOLUME;
    this.isMuted = !!options.muted;

    this.catchDebounceMs = options.catchDebounceMs ?? AudioDefaults.CATCH_DEBOUNCE_MS;
    this.maxSfxVoices = options.maxSfxVoices ?? AudioDefaults.MAX_SFX_VOICES;

    this.ctx = null;
    this.masterGainNode = null;
    this.sfxGainNode = null;
    this.ambientGainNode = null;
    this.ambientPad = null;

    this.isUnlocked = false;
    this._lastCatchTime = 0;
    this._activeVoices = new Set();
    this._unsubscribers = [];
    this._onVisibilityChange = null;
    this._unlockHandler = null;
  }

  /**
   * Initializes audio context (if available), audio routing graph, and event subscriptions.
   * Degrades cleanly with zero exceptions in environments without Web Audio.
   * @returns {AudioSystem}
   */
  init() {
    this._initAudioContext();
    this._subscribeEvents();
    this._setupVisibilityListener();

    if (typeof window !== 'undefined') {
      window.__AUDIO_SYSTEM__ = this;
    }

    return this;
  }

  /**
   * Sets up AudioContext and gain staging.
   * @private
   */
  _initAudioContext() {
    try {
      let AudioContextClass = this.options.audioContext;
      if (!AudioContextClass && typeof window !== 'undefined') {
        AudioContextClass = window.AudioContext || window.webkitAudioContext;
      }

      if (typeof AudioContextClass === 'function') {
        this.ctx = new AudioContextClass();
      } else if (typeof AudioContextClass === 'object' && AudioContextClass !== null) {
        this.ctx = AudioContextClass;
      }

      if (this.ctx && typeof this.ctx.createGain === 'function') {
        const t = this.ctx.currentTime || 0;

        // Master Gain
        this.masterGainNode = this.ctx.createGain();
        this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, t);
        if (this.ctx.destination) {
          this.masterGainNode.connect(this.ctx.destination);
        }

        // SFX Sub-bus
        this.sfxGainNode = this.ctx.createGain();
        this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, t);
        this.sfxGainNode.connect(this.masterGainNode);

        // Ambient Sub-bus
        this.ambientGainNode = this.ctx.createGain();
        this.ambientGainNode.gain.setValueAtTime(this.ambientVolume, t);
        this.ambientGainNode.connect(this.masterGainNode);
      }
    } catch (err) {
      console.warn('[AudioSystem] Failed to initialize AudioContext, running in silent mode:', err);
      this.ctx = null;
    }
  }

  /**
   * Subscribes to canonical EventBus events.
   * @private
   */
  _subscribeEvents() {
    if (!this.eventBus || typeof this.eventBus.on !== 'function') {
      return;
    }

    this._unsubscribers.push(
      this.eventBus.on(Events.SCORE, (payload) => this._handleScore(payload)),
      this.eventBus.on(Events.MISS, (payload) => this._handleMiss(payload)),
      this.eventBus.on(Events.STAGE_READY, () => this.playStageReady()),
      this.eventBus.on(Events.STAGE_COMPLETED, () => this.playStageCompleted()),
      this.eventBus.on(Events.TRANSFORMATION_COMPLETED, () => this.playTransformationCompleted()),
      this.eventBus.on(Events.AUDIO_TRIGGER, (payload) => this._handleAudioTrigger(payload))
    );
  }

  /**
   * Handles tab visibility changes to pause/resume audio.
   * @private
   */
  _setupVisibilityListener() {
    if (typeof document !== 'undefined') {
      this._onVisibilityChange = () => {
        if (document.hidden) {
          if (this.ctx && this.ctx.state === 'running' && typeof this.ctx.suspend === 'function') {
            try { this.ctx.suspend(); } catch (_) {}
          }
        } else {
          if (this.ctx && this.ctx.state === 'suspended' && this.isUnlocked && typeof this.ctx.resume === 'function') {
            try { this.ctx.resume(); } catch (_) {}
          }
        }
      };
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }
  }

  /**
   * Unlocks audio on first user gesture or pinch launch.
   * Idempotent. Resumes AudioContext, plays subtle affirmation chime, and starts cosmic pad.
   * @returns {Promise<boolean>}
   */
  async unlock() {
    if (this.isUnlocked) {
      if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        try { await this.ctx.resume(); } catch (_) {}
      }
      return true;
    }

    this.isUnlocked = true;

    if (this.ctx) {
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        try {
          await this.ctx.resume();
        } catch (err) {
          console.warn('[AudioSystem] AudioContext resume failed:', err);
        }
      }

      this.playUnlockAffirmation();
      this.startAmbientPad();
    }

    return true;
  }

  /**
   * Checks whether procedural audio is allowed to play.
   * @returns {boolean}
   */
  canPlayAudio() {
    return Boolean(
      this.ctx &&
      this.isUnlocked &&
      this.ctx.state !== 'closed' &&
      this.sfxGainNode
    );
  }

  /**
   * Routes Events.SCORE to appropriate procedural catch tap.
   * @private
   */
  _handleScore(eventData) {
    const rawCatchType =
      eventData?.payload?.catchType ||
      eventData?.catchType ||
      eventData?.scoreResult?.catchType ||
      CatchType.CLEAN;

    if (rawCatchType === CatchType.ASSISTED) {
      this.playAssistedCatch();
    } else {
      this.playCleanCatch();
    }
  }

  /**
   * Routes Events.MISS to drop thud.
   * @private
   */
  _handleMiss() {
    this.playMiss();
  }

  /**
   * Routes Events.AUDIO_TRIGGER cues.
   * @private
   */
  _handleAudioTrigger(payload) {
    if (payload?.cue === 'gold_ignition_chime') {
      this.playGoldIgnition();
    }
  }

  /**
   * Procedural Clean Catch (Ceramic Tap).
   * Sine wave rapid pitch drop (1200Hz -> 320Hz) with ceramic overtone click.
   */
  playCleanCatch() {
    if (!this.canPlayAudio()) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastCatchTime < this.catchDebounceMs) return;
    this._lastCatchTime = now;

    try {
      const t0 = this.ctx.currentTime;
      const { startFreq, endFreq, durationSec, peakGain, overtoneFreq, overtoneGain, waveType } = CatchAudioParams.CLEAN;

      this._pruneVoiceIfFull();

      // Fundamental oscillator
      const osc = this.ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.setValueAtTime(startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + durationSec);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peakGain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.connect(gain);
      gain.connect(this.sfxGainNode);

      // Ceramic overtone
      const overtoneOsc = this.ctx.createOscillator();
      overtoneOsc.type = 'sine';
      overtoneOsc.frequency.setValueAtTime(overtoneFreq, t0);
      overtoneOsc.frequency.exponentialRampToValueAtTime(overtoneFreq * 0.5, t0 + 0.015);

      const overtoneGainNode = this.ctx.createGain();
      overtoneGainNode.gain.setValueAtTime(overtoneGain, t0);
      overtoneGainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.015);

      overtoneOsc.connect(overtoneGainNode);
      overtoneGainNode.connect(this.sfxGainNode);

      osc.start(t0);
      overtoneOsc.start(t0);
      osc.stop(t0 + durationSec);
      overtoneOsc.stop(t0 + 0.015);

      const voice = {
        stop: () => {
          try { osc.stop(); overtoneOsc.stop(); } catch (_) {}
          try { osc.disconnect(); gain.disconnect(); overtoneOsc.disconnect(); overtoneGainNode.disconnect(); } catch (_) {}
        },
        startTime: t0,
      };
      this._registerVoice(voice);

      osc.onended = () => {
        voice.stop();
        this._unregisterVoice(voice);
      };
    } catch (_) {}
  }

  /**
   * Procedural Assisted Catch (Soft Wood Tap).
   * Triangle wave drop (420Hz -> 160Hz) through lowpass filter.
   */
  playAssistedCatch() {
    if (!this.canPlayAudio()) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastCatchTime < this.catchDebounceMs) return;
    this._lastCatchTime = now;

    try {
      const t0 = this.ctx.currentTime;
      const { startFreq, endFreq, durationSec, peakGain, filterCutoff, waveType } = CatchAudioParams.ASSISTED;

      this._pruneVoiceIfFull();

      const osc = this.ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.setValueAtTime(startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + durationSec);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterCutoff, t0);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peakGain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGainNode);

      osc.start(t0);
      osc.stop(t0 + durationSec);

      const voice = {
        stop: () => {
          try { osc.stop(); } catch (_) {}
          try { osc.disconnect(); filter.disconnect(); gain.disconnect(); } catch (_) {}
        },
        startTime: t0,
      };
      this._registerVoice(voice);

      osc.onended = () => {
        voice.stop();
        this._unregisterVoice(voice);
      };
    } catch (_) {}
  }

  /**
   * Procedural Miss (Soft Drop Thud).
   */
  playMiss() {
    if (!this.canPlayAudio()) return;

    try {
      const t0 = this.ctx.currentTime;
      const { startFreq, endFreq, durationSec, peakGain, waveType } = CatchAudioParams.MISS;

      this._pruneVoiceIfFull();

      const osc = this.ctx.createOscillator();
      osc.type = waveType;
      osc.frequency.setValueAtTime(startFreq, t0);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + durationSec);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peakGain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

      osc.connect(gain);
      gain.connect(this.sfxGainNode);

      osc.start(t0);
      osc.stop(t0 + durationSec);

      const voice = {
        stop: () => {
          try { osc.stop(); } catch (_) {}
          try { osc.disconnect(); gain.disconnect(); } catch (_) {}
        },
        startTime: t0,
      };
      this._registerVoice(voice);

      osc.onended = () => {
        voice.stop();
        this._unregisterVoice(voice);
      };
    } catch (_) {}
  }

  /**
   * Plays a sequence or chord of celestial chimes.
   * @private
   */
  _playChimeSequence(notes, options = {}) {
    if (!this.canPlayAudio() || !Array.isArray(notes) || notes.length === 0) return;

    try {
      const t0 = this.ctx.currentTime;
      const waveType = options.waveType || 'sine';
      const bus = options.bus || this.sfxGainNode;

      this._pruneVoiceIfFull();

      const oscList = [];
      const gainList = [];

      for (const n of notes) {
        const noteStart = t0 + (n.delaySec || 0);
        const noteDuration = n.durationSec || 0.2;
        const noteFreq = n.freq;
        const noteGain = n.gain || 0.2;

        const osc = this.ctx.createOscillator();
        osc.type = waveType;
        osc.frequency.setValueAtTime(noteFreq, noteStart);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(noteGain, noteStart + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

        osc.connect(gain);
        gain.connect(bus);

        osc.start(noteStart);
        osc.stop(noteStart + noteDuration);

        oscList.push(osc);
        gainList.push(gain);
      }

      const voice = {
        stop: () => {
          oscList.forEach((o) => { try { o.stop(); o.disconnect(); } catch (_) {} });
          gainList.forEach((g) => { try { g.disconnect(); } catch (_) {} });
        },
        startTime: t0,
      };
      this._registerVoice(voice);

      const lastOsc = oscList[oscList.length - 1];
      if (lastOsc) {
        lastOsc.onended = () => {
          voice.stop();
          this._unregisterVoice(voice);
        };
      }
    } catch (_) {}
  }

  /**
   * Stage Ready: Ascending pentatonic arpeggio (C5 -> E5 -> G5 -> B5 -> C6).
   */
  playStageReady() {
    this._playChimeSequence(ChimeSequences.STAGE_READY, { waveType: 'sine' });
  }

  /**
   * Stage Completed: Celestial milestone chord (C4, G4, B4, E5).
   */
  playStageCompleted() {
    this._playChimeSequence(ChimeSequences.STAGE_COMPLETED, { waveType: 'sine' });
  }

  /**
   * Transformation Completed: Resolution chime (A5 + E6).
   */
  playTransformationCompleted() {
    this._playChimeSequence(ChimeSequences.TRANSFORMATION_COMPLETED, { waveType: 'sine' });
  }

  /**
   * Gold Ignition: Cascading celestial chime arpeggio (E5, G#5, B5, E6, G#6).
   */
  playGoldIgnition() {
    this._playChimeSequence(ChimeSequences.GOLD_IGNITION, { waveType: 'sine' });
  }

  /**
   * Unlock Affirmation: Gentle two-tone chime upon audio initialization.
   */
  playUnlockAffirmation() {
    this._playChimeSequence(ChimeSequences.UNLOCK_AFFIRMATION, { waveType: 'sine' });
  }

  /**
   * Starts procedural ambient cosmic pad (A2, E3, B3 detuned chorus + slow lowpass filter sweep).
   */
  startAmbientPad() {
    if (!this.canPlayAudio() || this.ambientPad || !this.ambientGainNode) return;

    try {
      const t0 = this.ctx.currentTime;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(AmbientParams.FILTER_BASE_FREQ, t0);
      filter.Q.setValueAtTime(1.5, t0);

      // Slow LFO filter modulation
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(AmbientParams.FILTER_LFO_RATE, t0);

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(AmbientParams.FILTER_LFO_DEPTH, t0);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(t0);

      // 3 detuned oscillators
      const oscillators = [];
      for (let i = 0; i < AmbientParams.FREQUENCIES.length; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(AmbientParams.FREQUENCIES[i], t0);
        if (osc.detune) {
          osc.detune.setValueAtTime(AmbientParams.DETUNES[i] || 0, t0);
        }
        osc.connect(filter);
        osc.start(t0);
        oscillators.push(osc);
      }

      // Smooth fade-in gain node
      const padGain = this.ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, t0);
      padGain.gain.exponentialRampToValueAtTime(1.0, t0 + AmbientParams.FADE_IN_TIME);

      filter.connect(padGain);
      padGain.connect(this.ambientGainNode);

      this.ambientPad = {
        oscillators,
        filter,
        lfo,
        lfoGain,
        padGain,
        stop: () => {
          try {
            const tFade = this.ctx.currentTime;
            padGain.gain.setValueAtTime(Math.max(0.0001, padGain.gain.value), tFade);
            padGain.gain.exponentialRampToValueAtTime(0.0001, tFade + AmbientParams.FADE_OUT_TIME);
            setTimeout(() => {
              try {
                oscillators.forEach((o) => { o.stop(); o.disconnect(); });
                lfo.stop();
                lfo.disconnect();
                lfoGain.disconnect();
                filter.disconnect();
                padGain.disconnect();
              } catch (_) {}
            }, AmbientParams.FADE_OUT_TIME * 1000 + 50);
          } catch (_) {}
        },
      };
    } catch (_) {}
  }

  /**
   * Stops procedural ambient cosmic pad with smooth fade-out.
   */
  stopAmbientPad() {
    if (this.ambientPad) {
      this.ambientPad.stop();
      this.ambientPad = null;
    }
  }

  /**
   * Adjusts master volume (0.0 to 1.0).
   * @param {number} val
   */
  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 1.0));
    if (this.masterGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(t);
      this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, t);
    }
  }

  /**
   * Adjusts SFX sub-bus volume (0.0 to 1.0).
   * @param {number} val
   */
  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 1.0));
    if (this.sfxGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.sfxGainNode.gain.cancelScheduledValues(t);
      this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, t);
    }
  }

  /**
   * Adjusts ambient sub-bus volume (0.0 to 1.0).
   * @param {number} val
   */
  setAmbientVolume(val) {
    this.ambientVolume = Math.max(0, Math.min(1, Number.isFinite(val) ? val : 0.06));
    if (this.ambientGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.ambientGainNode.gain.cancelScheduledValues(t);
      this.ambientGainNode.gain.setValueAtTime(this.ambientVolume, t);
    }
  }

  /**
   * Mutes audio output without losing volume configuration.
   */
  mute() {
    this.isMuted = true;
    if (this.masterGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(t);
      this.masterGainNode.gain.setValueAtTime(0, t);
    }
  }

  /**
   * Unmutes audio output restoring previous volume.
   */
  unmute() {
    this.isMuted = false;
    if (this.masterGainNode && this.ctx) {
      const t = this.ctx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(t);
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, t);
    }
  }

  /**
   * @private
   */
  _registerVoice(voice) {
    this._activeVoices.add(voice);
  }

  /**
   * @private
   */
  _unregisterVoice(voice) {
    this._activeVoices.delete(voice);
  }

  /**
   * Enforces voice limits by discarding oldest voice.
   * @private
   */
  _pruneVoiceIfFull() {
    if (this._activeVoices.size >= this.maxSfxVoices) {
      let oldest = null;
      for (const v of this._activeVoices) {
        if (!oldest || v.startTime < oldest.startTime) {
          oldest = v;
        }
      }
      if (oldest) {
        oldest.stop();
        this._activeVoices.delete(oldest);
      }
    }
  }

  /**
   * Destroys AudioSystem, unsubscribes event listeners, and closes audio resources.
   */
  destroy() {
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (_) {}
    }
    this._unsubscribers = [];

    if (typeof document !== 'undefined' && this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      this._onVisibilityChange = null;
    }

    this.stopAmbientPad();

    for (const v of this._activeVoices) {
      try { v.stop(); } catch (_) {}
    }
    this._activeVoices.clear();

    if (this.ctx && typeof this.ctx.close === 'function') {
      try { this.ctx.close(); } catch (_) {}
    }
    this.ctx = null;
    this.masterGainNode = null;
    this.sfxGainNode = null;
    this.ambientGainNode = null;

    if (typeof window !== 'undefined' && window.__AUDIO_SYSTEM__ === this) {
      delete window.__AUDIO_SYSTEM__;
    }
  }
}
