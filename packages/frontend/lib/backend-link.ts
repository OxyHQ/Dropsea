/**
 * How Dropsea talks to its own backend when it cannot reach it, as a Mac's app
 * talks to its service: every request goes through one link, which keeps one
 * retry schedule for all of them.
 *
 * - A build without a backend never calls one: every request is refused at once
 *   (`not-configured`), and what needs the backend says it is not available yet.
 * - When a request cannot reach the backend (no answer, a 5xx, a 429), the link
 *   waits before trying again: 2 s, doubling to 5 min, less up to a quarter at
 *   random, so clients that failed together do not come back together. Meanwhile
 *   requests made in the background fail at once, without the network.
 * - When the wait is over, the link says a retry is due (`onRetryDue`); the first
 *   request made then goes out alone, and the others wait for its answer. One
 *   schedule, one request at a time: never several retry loops at once.
 * - A real signal brings the retry forward: the window coming back to the front
 *   or the network coming back (`resume`, never sooner than 2 s after the last
 *   try), or the person asking (`retryNow`, and every request a person's own
 *   action makes, which goes out whatever the schedule says).
 * - Any answer from the backend, an error of the request's own (a 4xx) as much as
 *   a success, ends the schedule: the next failure starts again at 2 s.
 */

/** The wait after the first failure. */
export const FIRST_RETRY_DELAY_MS = 2_000;
/** The longest wait between two tries. */
export const LONGEST_RETRY_DELAY_MS = 5 * 60_000;
/** The share of a wait that is taken off at random. */
const JITTER = 0.25;

/**
 * How long to wait after `failures` failures in a row (one or more): doubling
 * from 2 s to 5 min, less up to a quarter as `random` (in [0, 1)) says.
 */
export function retryDelayAfter(failures: number, random: number): number {
  const doubled = FIRST_RETRY_DELAY_MS * 2 ** Math.max(0, failures - 1);
  return Math.min(doubled, LONGEST_RETRY_DELAY_MS) * (1 - JITTER * random);
}

/**
 * Who makes a request: the app on its own (a query loading or refreshing), which
 * keeps to the schedule, or the person (a change they asked for), which goes out
 * at once.
 */
export type BackendIntent = 'background' | 'person';

/**
 * Why a request to the backend failed: this build has none, it could not be
 * reached (now, or recently enough that the link did not try), or it answered
 * with an error of the request's own.
 */
export type BackendErrorReason = 'not-configured' | 'unreachable' | 'refused';

export class BackendError extends Error {
  readonly reason: BackendErrorReason;
  /** When the link tries again, for an unreachable backend. */
  readonly retryAt: number | null;

  constructor(
    reason: BackendErrorReason,
    message: string,
    options: { cause?: unknown; retryAt?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'BackendError';
    this.reason = reason;
    this.retryAt = options.retryAt ?? null;
  }
}

type LinkState = { kind: 'reachable' } | { kind: 'unreachable'; failures: number; retryAt: number };

/** What a failed request says about the backend. */
type FailureKind = 'cancelled' | 'answered' | 'unreachable';

function fieldOf(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}

/** The HTTP status a request's error carries, as Oxy's clients set it (`status` or `response.status`). */
function statusOf(error: unknown): number | null {
  const flat = fieldOf(error, 'status');
  if (typeof flat === 'number' && flat > 0) return flat;
  const nested = fieldOf(fieldOf(error, 'response'), 'status');
  if (typeof nested === 'number' && nested > 0) return nested;
  return null;
}

function failureKindOf(error: unknown): FailureKind {
  if (fieldOf(error, 'cancelled') === true || fieldOf(error, 'name') === 'AbortError') {
    return 'cancelled';
  }
  const status = statusOf(error);
  // A 4xx is the backend answering about the request; a timeout or a rate limit is not.
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return 'answered';
  }
  return 'unreachable';
}

function messageOf(error: unknown): string {
  const message = fieldOf(error, 'message');
  return typeof message === 'string' && message !== '' ? message : String(error);
}

export interface BackendLinkOptions {
  now?: () => number;
  /** A number in [0, 1), the jitter of each wait. */
  random?: () => number;
  /** Runs `run` after `delayMs`; returns what cancels it. */
  schedule?: (run: () => void, delayMs: number) => () => void;
}

function scheduleWithTimer(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}

/** One backend's requests, under one retry schedule. `client` is null in a build without a backend. */
export class BackendLink<Client> {
  private readonly client: Client | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly schedule: (run: () => void, delayMs: number) => () => void;
  private state: LinkState = { kind: 'reachable' };
  /** Changes whenever a failure is counted or the backend answers: a failure counts once per change, however many requests it failed together. */
  private epoch = 0;
  /** The background request trying the backend again, which the others wait for. */
  private probe: Promise<void> | null = null;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private cancelRetry: (() => void) | null = null;
  private readonly retryListeners = new Set<() => void>();

  constructor(client: Client | null, options: BackendLinkOptions = {}) {
    this.client = client;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? scheduleWithTimer;
  }

  /** Whether this build has a backend at all. */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Calls `listener` whenever what failed should be tried again: the wait is
   * over, a signal brought it forward, or the backend answered again.
   */
  onRetryDue(listener: () => void): () => void {
    this.retryListeners.add(listener);
    return () => {
      this.retryListeners.delete(listener);
    };
  }

  /** A request to the backend, kept to the schedule unless the person made it. */
  async call<T>(intent: BackendIntent, request: (client: Client) => Promise<T>): Promise<T> {
    const client = this.client;
    if (client === null) {
      throw new BackendError('not-configured', 'This build of Dropsea has no backend');
    }
    if (intent === 'background') {
      // After the try in flight, and once the wait is over. Nothing is awaited between this check
      // and the request going out, so two requests never both take the next try.
      while (this.probe) await this.probe;
      if (this.state.kind === 'unreachable' && this.now() < this.state.retryAt) {
        throw new BackendError(
          'unreachable',
          "Dropsea's backend could not be reached; waiting to try again",
          { retryAt: this.state.retryAt },
        );
      }
    }
    const epoch = this.epoch;
    const isProbe = intent === 'background' && this.state.kind === 'unreachable';
    this.lastAttemptAt = this.now();
    const attempt = request(client);
    const settled = isProbe
      ? attempt.then(
          () => undefined,
          () => undefined,
        )
      : null;
    if (settled) this.probe = settled;
    try {
      const result = await attempt;
      this.answered();
      return result;
    } catch (error) {
      const kind = failureKindOf(error);
      if (kind === 'cancelled') throw error;
      if (kind === 'answered') {
        this.answered();
        throw new BackendError(
          'refused',
          `Dropsea's backend refused a request: ${messageOf(error)}`,
          {
            cause: error,
          },
        );
      }
      const retryAt = this.failed(epoch);
      throw new BackendError(
        'unreachable',
        `Dropsea's backend could not be reached: ${messageOf(error)}`,
        { cause: error, retryAt },
      );
    } finally {
      if (settled && this.probe === settled) this.probe = null;
    }
  }

  /**
   * A sign the backend may be back (the window came to the front, the network
   * came back): try again now, though never sooner than 2 s after the last try.
   */
  resume(): void {
    this.retryBy(Math.max(this.now(), this.lastAttemptAt + FIRST_RETRY_DELAY_MS));
  }

  /** The person asked to try again: try now. */
  retryNow(): void {
    this.retryBy(this.now());
  }

  private retryBy(time: number): void {
    if (this.state.kind !== 'unreachable') return;
    const retryAt = Math.min(this.state.retryAt, time);
    this.state = { ...this.state, retryAt };
    this.scheduleRetry(retryAt);
  }

  private answered(): void {
    if (this.state.kind === 'reachable') return;
    this.state = { kind: 'reachable' };
    this.epoch++;
    this.cancelRetry?.();
    this.cancelRetry = null;
    // What failed while the backend was away loads now.
    this.notifyRetryDue();
  }

  /** Counts a failure (once for the requests that failed together) and returns when to try again. */
  private failed(epoch: number): number {
    if (epoch !== this.epoch && this.state.kind === 'unreachable') return this.state.retryAt;
    const failures = this.state.kind === 'unreachable' ? this.state.failures + 1 : 1;
    const retryAt = this.now() + retryDelayAfter(failures, this.random());
    this.state = { kind: 'unreachable', failures, retryAt };
    this.epoch++;
    this.scheduleRetry(retryAt);
    return retryAt;
  }

  private scheduleRetry(retryAt: number): void {
    this.cancelRetry?.();
    this.cancelRetry = this.schedule(
      () => {
        this.cancelRetry = null;
        this.notifyRetryDue();
      },
      Math.max(0, retryAt - this.now()),
    );
  }

  private notifyRetryDue(): void {
    for (const listener of this.retryListeners) listener();
  }
}
