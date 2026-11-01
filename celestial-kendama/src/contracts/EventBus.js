// src/contracts/EventBus.js

/**
 * ============================================================================
 * Celestial Kendama - Synchronous Event Bus
 * Role: Shared (Person B owns integration, Person A & C publish/subscribe)
 * ============================================================================
 *
 * Lightweight, zero-dependency synchronous EventBus.
 * Guaranteed in-order intra-frame delivery across stages.
 */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event topic.
   * @param {string} event - Topic name from Events enum
   * @param {Function} handler - Callback invoked synchronously on emit
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for event "${event}" must be a function`);
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event topic.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Synchronously publish payload to all active listeners.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    // Snapshot set to prevent concurrent mutation during iteration
    for (const handler of Array.from(handlers)) {
      handler(payload);
    }
  }

  /**
   * Clear listeners for a specific event or all events.
   * @param {string} [event]
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

/** Global singleton instance */
export const eventBus = new EventBus();
