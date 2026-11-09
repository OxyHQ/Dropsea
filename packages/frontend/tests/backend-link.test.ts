import { describe, expect, test } from 'bun:test';
import {
  BackendError,
  BackendLink,
  FIRST_RETRY_DELAY_MS,
  LONGEST_RETRY_DELAY_MS,
  retryDelayAfter,
} from '@/lib/backend-link';

/** A backend that fails the way a host with no DNS record does, until it is told to answer. */
class FakeBackend {
  requests = 0;
  answer: 'unreachable' | 'ok' | 'not-found' | 'server-error' | 'rate-limited' = 'unreachable';
  pending: (() => void)[] = [];
  isHeld = false;

  async get(): Promise<string> {
    this.requests++;
    if (this.isHeld) await new Promise<void>((resolve) => this.pending.push(resolve));
    switch (this.answer) {
      case 'ok':
        return 'albums';
      case 'not-found':
        throw Object.assign(new Error('Not found'), { status: 404 });
      case 'server-error':
        throw Object.assign(new Error('Bad gateway'), { status: 502 });
      case 'rate-limited':
        throw Object.assign(new Error('Too many requests'), { status: 429 });
      default:
        throw Object.assign(
          new Error('network request 7 failed: io: failed to lookup address information'),
          { status: 0, code: 'NETWORK_ERROR' },
        );
    }
  }

  release(): void {
    this.isHeld = false;
    for (const resolve of this.pending.splice(0)) resolve();
  }
}

/** A clock and a timer the test moves by hand. */
class FakeTime {
  now = 1_000_000;
  timers: { at: number; run: () => void; isCancelled: boolean }[] = [];

  schedule = (run: () => void, delayMs: number): (() => void) => {
    const timer = { at: this.now + delayMs, run, isCancelled: false };
    this.timers.push(timer);
    return () => {
      timer.isCancelled = true;
    };
  };

  /** The live timers' times. */
  get due(): number[] {
    return this.timers.filter((timer) => !timer.isCancelled).map((timer) => timer.at);
  }

  advance(ms: number): void {
    this.now += ms;
    for (const timer of this.timers.splice(0)) {
      if (timer.isCancelled) continue;
      if (timer.at <= this.now) timer.run();
      else this.timers.push(timer);
    }
  }
}

function setUp(random = 0) {
  const backend = new FakeBackend();
  const time = new FakeTime();
  const link = new BackendLink(backend, {
    now: () => time.now,
    random: () => random,
    schedule: time.schedule,
  });
  let retriesDue = 0;
  link.onRetryDue(() => {
    retriesDue++;
  });
  return { backend, time, link, retriesDue: () => retriesDue };
}

async function failureOf(promise: Promise<unknown>): Promise<BackendError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BackendError) return error;
    throw error;
  }
  throw new Error('The request succeeded');
}

describe('retryDelayAfter', () => {
  test('doubles from 2 s with each failure in a row', () => {
    expect([1, 2, 3, 4, 5].map((failures) => retryDelayAfter(failures, 0))).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000,
    ]);
  });

  test('never waits longer than 5 minutes, however many failures', () => {
    expect(retryDelayAfter(9, 0)).toBe(LONGEST_RETRY_DELAY_MS);
    expect(retryDelayAfter(1_000, 0)).toBe(LONGEST_RETRY_DELAY_MS);
  });

  test('takes up to a quarter off at random, never adding to the wait', () => {
    expect(retryDelayAfter(1, 0.999)).toBeGreaterThan(1_500);
    expect(retryDelayAfter(1, 0.5)).toBe(1_750);
    expect(retryDelayAfter(20, 0.5)).toBe(LONGEST_RETRY_DELAY_MS * 0.875);
  });
});

describe('BackendLink', () => {
  test('a build without a backend refuses every request without making one', async () => {
    const link = new BackendLink<FakeBackend>(null);
    expect(link.isConfigured).toBe(false);
    const background = await failureOf(link.call('background', (client) => client.get()));
    const person = await failureOf(link.call('person', (client) => client.get()));
    expect([background.reason, person.reason]).toEqual(['not-configured', 'not-configured']);
  });

  test('after an unreachable backend, background requests fail at once without the network until the wait is over', async () => {
    const { backend, time, link } = setUp();
    const first = await failureOf(link.call('background', (client) => client.get()));
    expect(first.reason).toBe('unreachable');
    expect(first.retryAt).toBe(time.now + FIRST_RETRY_DELAY_MS);
    for (let index = 0; index < 20; index++) {
      const again = await failureOf(link.call('background', (client) => client.get()));
      expect(again.reason).toBe('unreachable');
    }
    time.advance(FIRST_RETRY_DELAY_MS - 1);
    await failureOf(link.call('background', (client) => client.get()));
    expect(backend.requests).toBe(1);
  });

  test('backs off exponentially while the backend stays away, saying when each retry is due', async () => {
    const { backend, time, link, retriesDue } = setUp();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const failure = await failureOf(link.call('background', (client) => client.get()));
      const retryAt = failure.retryAt ?? 0;
      waits.push(retryAt - time.now);
      time.advance(retryAt - time.now);
    }
    expect(waits).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000,
    ]);
    expect(backend.requests).toBe(10);
    expect(retriesDue()).toBe(10);
  });

  test('requests that fail together count as one failure', async () => {
    const { backend, time, link } = setUp();
    backend.isHeld = true;
    const together = Array.from({ length: 5 }, () =>
      failureOf(link.call('background', (client) => client.get())),
    );
    backend.release();
    const failures = await Promise.all(together);
    expect(backend.requests).toBe(5);
    expect(failures.map((failure) => failure.retryAt)).toEqual(
      Array(5).fill(time.now + FIRST_RETRY_DELAY_MS),
    );
  });

  test('when a retry is due, one request tries and the others wait for its answer', async () => {
    const { backend, time, link } = setUp();
    await failureOf(link.call('background', (client) => client.get()));
    time.advance(FIRST_RETRY_DELAY_MS);
    backend.isHeld = true;
    backend.answer = 'ok';
    const waiting = Array.from({ length: 4 }, () =>
      link.call('background', (client) => client.get()),
    );
    await Promise.resolve();
    expect(backend.requests).toBe(2);
    backend.release();
    expect(await Promise.all(waiting)).toEqual(['albums', 'albums', 'albums', 'albums']);
    expect(backend.requests).toBe(5);
  });

  test('when the try fails, the requests that waited for it fail without the network', async () => {
    const { backend, time, link } = setUp();
    await failureOf(link.call('background', (client) => client.get()));
    time.advance(FIRST_RETRY_DELAY_MS);
    backend.isHeld = true;
    const waiting = Array.from({ length: 4 }, () =>
      failureOf(link.call('background', (client) => client.get())),
    );
    backend.release();
    const failures = await Promise.all(waiting);
    expect(backend.requests).toBe(2);
    expect(failures.map((failure) => failure.retryAt)).toEqual(
      Array(4).fill(time.now + 2 * FIRST_RETRY_DELAY_MS),
    );
  });

  test('an answer resets the schedule, and says what failed can load now', async () => {
    const { backend, time, link, retriesDue } = setUp();
    for (let attempt = 0; attempt < 4; attempt++) {
      const failure = await failureOf(link.call('background', (client) => client.get()));
      time.advance((failure.retryAt ?? 0) - time.now);
    }
    const dueBefore = retriesDue();
    backend.answer = 'ok';
    expect(await link.call('background', (client) => client.get())).toBe('albums');
    expect(retriesDue()).toBe(dueBefore + 1);
    backend.answer = 'unreachable';
    const failure = await failureOf(link.call('background', (client) => client.get()));
    expect((failure.retryAt ?? 0) - time.now).toBe(FIRST_RETRY_DELAY_MS);
  });

  test('a 4xx is an answer: refused, not retried, and the backend counts as reachable', async () => {
    const { backend, link } = setUp();
    backend.answer = 'not-found';
    const refused = await failureOf(link.call('background', (client) => client.get()));
    expect(refused.reason).toBe('refused');
    const again = await failureOf(link.call('background', (client) => client.get()));
    expect(again.reason).toBe('refused');
    expect(backend.requests).toBe(2);
  });

  test.each(['server-error', 'rate-limited'] as const)(
    '%s counts as unreachable',
    async (answer) => {
      const { backend, link } = setUp();
      backend.answer = answer;
      const failure = await failureOf(link.call('background', (client) => client.get()));
      expect(failure.reason).toBe('unreachable');
      await failureOf(link.call('background', (client) => client.get()));
      expect(backend.requests).toBe(1);
    },
  );

  test("a person's own request goes out whatever the schedule says", async () => {
    const { backend, link } = setUp();
    await failureOf(link.call('background', (client) => client.get()));
    backend.answer = 'ok';
    expect(await link.call('person', (client) => client.get())).toBe('albums');
    expect(await link.call('background', (client) => client.get())).toBe('albums');
    expect(backend.requests).toBe(3);
  });

  test('a sign the backend may be back brings the retry forward, never sooner than 2 s after the last try', async () => {
    const { time, link, retriesDue } = setUp();
    for (let attempt = 0; attempt < 6; attempt++) {
      const failure = await failureOf(link.call('background', (client) => client.get()));
      time.advance((failure.retryAt ?? 0) - time.now);
    }
    // The seventh try failed just now; the next is 128 s away.
    expect(time.due).toEqual([]);
    const failure = await failureOf(link.call('background', (client) => client.get()));
    expect((failure.retryAt ?? 0) - time.now).toBe(128_000);
    const dueBefore = retriesDue();
    link.resume();
    expect(time.due).toEqual([time.now + FIRST_RETRY_DELAY_MS]);
    time.advance(FIRST_RETRY_DELAY_MS);
    expect(retriesDue()).toBe(dueBefore + 1);
    // That try fails too: the window coming to the front again and again never tries sooner.
    await failureOf(link.call('background', (client) => client.get()));
    link.resume();
    link.resume();
    link.resume();
    expect(time.due).toEqual([time.now + FIRST_RETRY_DELAY_MS]);
  });

  test('the person asking to try again retries at once', async () => {
    const { backend, time, link, retriesDue } = setUp();
    await failureOf(link.call('background', (client) => client.get()));
    const dueBefore = retriesDue();
    link.retryNow();
    time.advance(0);
    expect(retriesDue()).toBe(dueBefore + 1);
    backend.answer = 'ok';
    expect(await link.call('background', (client) => client.get())).toBe('albums');
    expect(backend.requests).toBe(2);
  });

  test('a signal while the backend answers schedules nothing', () => {
    const { time, link } = setUp();
    link.resume();
    link.retryNow();
    expect(time.due).toEqual([]);
  });

  test('a cancelled request says nothing about the backend', async () => {
    const { time, link } = setUp();
    const cancelled = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    await expect(link.call('background', () => Promise.reject(cancelled))).rejects.toBe(cancelled);
    expect(time.due).toEqual([]);
  });
});
