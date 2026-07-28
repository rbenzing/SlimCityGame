import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './events';

// A `type` alias (not an `interface`) so it structurally satisfies the
// `Record<string, unknown>` constraint on EventBus's TMap — interfaces don't
// get TypeScript's implicit index signature the way object-literal type
// aliases do, so EventBus's real consumers must define their event maps the
// same way.
type TestEvents = {
  ping: number;
  named: { label: string };
};

describe('EventBus', () => {
  it('invokes a subscribed listener with the emitted payload, in emit order', () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    bus.on('ping', (n) => received.push(n));

    bus.emit('ping', 1);
    bus.emit('ping', 2);

    expect(received).toEqual([1, 2]);
  });

  it('supports multiple independent listeners on the same event', () => {
    const bus = new EventBus<TestEvents>();
    const a: number[] = [];
    const b: number[] = [];
    bus.on('ping', (n) => a.push(n));
    bus.on('ping', (n) => b.push(n));

    bus.emit('ping', 7);

    expect(a).toEqual([7]);
    expect(b).toEqual([7]);
  });

  it('keeps listeners for different events independent', () => {
    const bus = new EventBus<TestEvents>();
    const pings: number[] = [];
    const names: string[] = [];
    bus.on('ping', (n) => pings.push(n));
    bus.on('named', (payload) => names.push(payload.label));

    bus.emit('ping', 3);

    expect(pings).toEqual([3]);
    expect(names).toEqual([]);
  });

  it('emitting an event with no listeners is a silent no-op', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('ping', 5)).not.toThrow();
  });

  it('off() removes only the specified listener', () => {
    const bus = new EventBus<TestEvents>();
    const a: number[] = [];
    const b: number[] = [];
    const listenerA = (n: number): void => {
      a.push(n);
    };
    bus.on('ping', listenerA);
    bus.on('ping', (n) => b.push(n));

    bus.off('ping', listenerA);
    bus.emit('ping', 9);

    expect(a).toEqual([]);
    expect(b).toEqual([9]);
  });

  it('off() on a never-subscribed listener is a silent no-op', () => {
    const bus = new EventBus<TestEvents>();
    const listener = (): void => undefined;
    expect(() => bus.off('ping', listener)).not.toThrow();
  });

  it('the unsubscribe function returned by on() removes the listener', () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    const unsubscribe = bus.on('ping', (n) => received.push(n));

    unsubscribe();
    bus.emit('ping', 11);

    expect(received).toEqual([]);
  });

  it('calling the returned unsubscribe function twice is safe', () => {
    const bus = new EventBus<TestEvents>();
    const unsubscribe = bus.on('ping', () => undefined);

    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it('off() and the returned unsubscribe function are interchangeable for the same subscription', () => {
    const bus = new EventBus<TestEvents>();
    const received: number[] = [];
    const listener = (n: number): void => {
      received.push(n);
    };
    bus.on('ping', listener);

    bus.off('ping', listener); // remove via off(), not the returned closure
    bus.emit('ping', 1);

    expect(received).toEqual([]);
  });

  it('a listener that unsubscribes itself during emit does not disrupt the current dispatch pass', () => {
    const bus = new EventBus<TestEvents>();
    const order: string[] = [];
    const unsubscribeSelf = bus.on('ping', () => {
      order.push('self');
      unsubscribeSelf();
    });
    bus.on('ping', () => order.push('other'));

    bus.emit('ping', 1);
    expect(order).toEqual(['self', 'other']);

    order.length = 0;
    bus.emit('ping', 2);
    expect(order).toEqual(['other']);
  });

  it('works with vi.fn spies for call-count/argument assertions', () => {
    const bus = new EventBus<TestEvents>();
    const spy = vi.fn();
    bus.on('ping', spy);

    bus.emit('ping', 42);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(42);
  });
});
