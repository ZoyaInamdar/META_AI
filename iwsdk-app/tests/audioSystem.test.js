/**
 * Unit Tests for Celestial Kendama AudioSystem
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem.js';
import { Events, CatchType } from '../src/contracts/Interfaces.js';
import { EventBus } from '../src/contracts/EventBus.js';
import { AudioDefaults } from '../src/audio/AudioConstants.js';
import { GameLoop } from '../src/game/GameLoop.js';

/**
 * Creates a mock Web Audio context conforming to the subset used by AudioSystem.
 */
function createMockAudioContext() {
  const destination = { id: 'destination' };

  function createMockAudioParam(initialValue = 1.0) {
    return {
      value: initialValue,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };
  }

  const createdNodes = {
    oscillators: [],
    gains: [],
    filters: [],
  };

  return {
    destination,
    currentTime: 10.0,
    state: 'suspended',
    createdNodes,
    resume: vi.fn(function () {
      this.state = 'running';
      return Promise.resolve();
    }),
    suspend: vi.fn(function () {
      this.state = 'suspended';
      return Promise.resolve();
    }),
    close: vi.fn(function () {
      this.state = 'closed';
      return Promise.resolve();
    }),
    createGain: vi.fn(() => {
      const node = {
        id: `gain_${createdNodes.gains.length}`,
        gain: createMockAudioParam(1.0),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      createdNodes.gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node = {
        id: `osc_${createdNodes.oscillators.length}`,
        type: 'sine',
        frequency: createMockAudioParam(440),
        detune: createMockAudioParam(0),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      createdNodes.oscillators.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = {
        id: `filter_${createdNodes.filters.length}`,
        type: 'lowpass',
        frequency: createMockAudioParam(350),
        Q: createMockAudioParam(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      createdNodes.filters.push(node);
      return node;
    }),
  };
}

describe('AudioSystem - Headless & Fallback Resilience', () => {
  it('constructs cleanly with no parameters in headless environment', () => {
    const audio = new AudioSystem();
    expect(audio).toBeDefined();
    expect(audio.isUnlocked).toBe(false);
    expect(audio.masterVolume).toBe(AudioDefaults.MASTER_VOLUME);
    expect(audio.sfxVolume).toBe(AudioDefaults.SFX_VOLUME);
    expect(audio.ambientVolume).toBe(AudioDefaults.AMBIENT_VOLUME);
  });

  it('runs all methods safely without throwing when AudioContext is unavailable', async () => {
    const eventBus = new EventBus();
    const audio = new AudioSystem(eventBus, { audioContext: null });
    audio.init();

    expect(audio.canPlayAudio()).toBe(false);

    // Methods must not throw in headless / no-audio mode
    await expect(audio.unlock()).resolves.toBe(true);
    expect(() => audio.playCleanCatch()).not.toThrow();
    expect(() => audio.playAssistedCatch()).not.toThrow();
    expect(() => audio.playMiss()).not.toThrow();
    expect(() => audio.playStageReady()).not.toThrow();
    expect(() => audio.playStageCompleted()).not.toThrow();
    expect(() => audio.playTransformationCompleted()).not.toThrow();
    expect(() => audio.playGoldIgnition()).not.toThrow();
    expect(() => audio.startAmbientPad()).not.toThrow();
    expect(() => audio.stopAmbientPad()).not.toThrow();
    expect(() => audio.setMasterVolume(0.5)).not.toThrow();
    expect(() => audio.setSfxVolume(0.5)).not.toThrow();
    expect(() => audio.setAmbientVolume(0.04)).not.toThrow();
    expect(() => audio.mute()).not.toThrow();
    expect(() => audio.unmute()).not.toThrow();
    expect(() => audio.destroy()).not.toThrow();
  });
});

describe('AudioSystem - Functional Web Audio Synthesis', () => {
  let eventBus;
  let mockCtx;
  let audio;

  beforeEach(() => {
    eventBus = new EventBus();
    mockCtx = createMockAudioContext();
    audio = new AudioSystem(eventBus, { audioContext: mockCtx });
    audio.init();
  });

  afterEach(() => {
    audio.destroy();
  });

  it('initializes audio routing graph (master, sfx, ambient)', () => {
    expect(mockCtx.createGain).toHaveBeenCalled();
    expect(audio.masterGainNode).toBeDefined();
    expect(audio.sfxGainNode).toBeDefined();
    expect(audio.ambientGainNode).toBeDefined();

    // SFX and ambient connect to master; master connects to destination
    expect(audio.sfxGainNode.connect).toHaveBeenCalledWith(audio.masterGainNode);
    expect(audio.ambientGainNode.connect).toHaveBeenCalledWith(audio.masterGainNode);
    expect(audio.masterGainNode.connect).toHaveBeenCalledWith(mockCtx.destination);
  });

  it('unlocks audio on user interaction and resumes suspended context', async () => {
    expect(mockCtx.state).toBe('suspended');
    expect(audio.isUnlocked).toBe(false);

    await audio.unlock();

    expect(mockCtx.resume).toHaveBeenCalled();
    expect(audio.isUnlocked).toBe(true);
    expect(audio.canPlayAudio()).toBe(true);
  });

  it('is idempotent on subsequent unlock() calls', async () => {
    await audio.unlock();
    const resumeCallCount = mockCtx.resume.mock.calls.length;

    await audio.unlock();
    expect(mockCtx.resume.mock.calls.length).toBe(resumeCallCount);
  });

  it('plays clean catch (ceramic tap) on Events.SCORE with CLEAN catchType', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.SCORE, {
      payload: { catchType: CatchType.CLEAN },
      awardedEnergy: 20,
    });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    // Clean catch creates fundamental + overtone oscillators (2 oscillators)
    expect(oscCountAfter).toBeGreaterThanOrEqual(oscCountBefore + 2);
  });

  it('plays assisted catch (wood tap) on Events.SCORE with ASSISTED catchType', async () => {
    await audio.unlock();
    const filterCountBefore = mockCtx.createdNodes.filters.length;

    eventBus.emit(Events.SCORE, {
      payload: { catchType: CatchType.ASSISTED },
      awardedEnergy: 15,
    });

    const filterCountAfter = mockCtx.createdNodes.filters.length;
    // Assisted catch routes through a lowpass filter
    expect(filterCountAfter).toBeGreaterThan(filterCountBefore);
  });

  it('debounces rapid catch taps within catchDebounceMs', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    // First catch
    eventBus.emit(Events.SCORE, {
      payload: { catchType: CatchType.CLEAN },
      awardedEnergy: 20,
    });
    const oscCountAfterFirst = mockCtx.createdNodes.oscillators.length;

    // Second immediate catch within debounce window
    eventBus.emit(Events.SCORE, {
      payload: { catchType: CatchType.CLEAN },
      awardedEnergy: 20,
    });
    const oscCountAfterSecond = mockCtx.createdNodes.oscillators.length;

    expect(oscCountAfterFirst).toBeGreaterThan(oscCountBefore);
    expect(oscCountAfterSecond).toBe(oscCountAfterFirst); // Debounced!
  });

  it('plays miss thud on Events.MISS', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.MISS, { flightId: 1 });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    expect(oscCountAfter).toBeGreaterThan(oscCountBefore);
  });

  it('plays stage ready pentatonic arpeggio on Events.STAGE_READY', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.STAGE_READY, { stage: 2 });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    // Stage ready has 5 ascending notes
    expect(oscCountAfter - oscCountBefore).toBe(5);
  });

  it('plays milestone chord on Events.STAGE_COMPLETED', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.STAGE_COMPLETED, { stage: 2 });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    // Stage completed has 4 chord notes
    expect(oscCountAfter - oscCountBefore).toBe(4);
  });

  it('plays resolution chime on Events.TRANSFORMATION_COMPLETED', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.TRANSFORMATION_COMPLETED, { stage: 2 });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    expect(oscCountAfter - oscCountBefore).toBe(2);
  });

  it('plays gold ignition chime cascade on Events.AUDIO_TRIGGER with gold_ignition_chime cue', async () => {
    await audio.unlock();
    const oscCountBefore = mockCtx.createdNodes.oscillators.length;

    eventBus.emit(Events.AUDIO_TRIGGER, { cue: 'gold_ignition_chime' });

    const oscCountAfter = mockCtx.createdNodes.oscillators.length;
    // Gold ignition cascade has 5 notes
    expect(oscCountAfter - oscCountBefore).toBe(5);
  });

  it('starts and stops ambient cosmic pad', async () => {
    await audio.unlock();
    expect(audio.ambientPad).toBeDefined();

    const oscCount = audio.ambientPad.oscillators.length;
    expect(oscCount).toBe(3); // A2, E3, B3

    audio.stopAmbientPad();
    expect(audio.ambientPad).toBeNull();
  });

  it('supports master, sfx, and ambient volume controls, and mute/unmute', () => {
    audio.setMasterVolume(0.75);
    expect(audio.masterVolume).toBe(0.75);
    expect(audio.masterGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.75, mockCtx.currentTime);

    audio.setSfxVolume(0.85);
    expect(audio.sfxVolume).toBe(0.85);
    expect(audio.sfxGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.85, mockCtx.currentTime);

    audio.setAmbientVolume(0.05);
    expect(audio.ambientVolume).toBe(0.05);
    expect(audio.ambientGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.05, mockCtx.currentTime);

    audio.mute();
    expect(audio.isMuted).toBe(true);
    expect(audio.masterGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0, mockCtx.currentTime);

    audio.unmute();
    expect(audio.isMuted).toBe(false);
    expect(audio.masterGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.75, mockCtx.currentTime);
  });

  it('enforces maximum simultaneous SFX voice budget', async () => {
    audio.maxSfxVoices = 2;
    await audio.unlock();

    // Trigger three distinct voices (e.g. miss, transformation completed, gold ignition)
    audio.playMiss();
    mockCtx.currentTime += 0.1;
    audio.playTransformationCompleted();
    mockCtx.currentTime += 0.1;
    audio.playGoldIgnition();

    // Voice pruning should keep active voices at or below maxSfxVoices
    expect(audio._activeVoices.size).toBeLessThanOrEqual(audio.maxSfxVoices);
  });

  it('cleans up on destroy() without leaking event subscriptions', () => {
    audio.destroy();
    expect(mockCtx.close).toHaveBeenCalled();
    expect(audio.ctx).toBeNull();
    expect(audio._unsubscribers.length).toBe(0);

    // Emitting on bus should not trigger any errors or actions
    expect(() => {
      eventBus.emit(Events.SCORE, { payload: { catchType: CatchType.CLEAN } });
    }).not.toThrow();
  });

  it('unlocks AudioSystem when GameLoop.launchBall() is triggered on first launch', () => {
    const unlockSpy = vi.spyOn(audio, 'unlock');
    const gameLoop = new GameLoop({
      eventBus,
      audioSystem: audio,
    });

    expect(audio.isUnlocked).toBe(false);
    const launched = gameLoop.launchBall('pinch');
    expect(launched).toBe(true);
    expect(unlockSpy).toHaveBeenCalled();
    expect(audio.isUnlocked).toBe(true);
  });
});
