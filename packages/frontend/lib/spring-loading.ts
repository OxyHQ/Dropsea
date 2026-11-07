/**
 * Spring-loaded folders, as Finder's (OxyOS ADR 0047, decision 14): a folder among the items, a
 * sidebar place or a path bar segment held under a drag Dropsea would take for half a second (lit
 * meanwhile) blinks twice and opens in its window, and the drag goes on over what it opened. When
 * the window's drag ends without a drop in it (it left the window, was dropped elsewhere or
 * cancelled), the window goes back to where it was when the first folder sprang open; a drop in it
 * keeps the window where it is.
 */

/** How long a drag is held over a folder before it springs open: half a second, a Mac's default. */
export const SPRING_DELAY_MS = 500;
/** Each half of a blink, the target unlit and lit again, twice, before it opens. */
export const BLINK_MS = 70;
const BLINKS = 2;

export interface SpringTimerOptions {
  delay?: number;
  blinkMs?: number;
  /** The target held is drawn unlit (true) or lit (false) as it blinks. */
  onBlink: (isUnlit: boolean) => void;
  /** The target held long enough opens. */
  onSpring: (key: string) => void;
}

export interface SpringTimer {
  /** The target the drag is over now, or null over none (or a drag that would drop nothing). */
  hover: (key: string | null) => void;
  /** The drag left a target: it springs no more, if it was the one held (each is its own zone). */
  leave: (key: string) => void;
  /** The drag left, or ended: nothing springs. */
  cancel: () => void;
}

/**
 * Times a drag held over one target of a kind (the items' folders, the sidebar's places, the path
 * bar's segments): a target held for `delay` blinks and springs; moving to another starts again.
 */
export function createSpringTimer({
  delay = SPRING_DELAY_MS,
  blinkMs = BLINK_MS,
  onBlink,
  onSpring,
}: SpringTimerOptions): SpringTimer {
  let held: string | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => {
    for (const timer of timers) clearTimeout(timer);
    const wasBlinking = timers.length > 1;
    timers = [];
    if (wasBlinking) onBlink(false);
  };
  const blinkThenSpring = (key: string) => {
    timers = [];
    for (let half = 0; half < BLINKS * 2; half++) {
      timers.push(setTimeout(() => onBlink(half % 2 === 0), half * blinkMs));
    }
    timers.push(
      setTimeout(
        () => {
          timers = [];
          held = null;
          onSpring(key);
        },
        BLINKS * 2 * blinkMs,
      ),
    );
  };
  return {
    hover: (key) => {
      if (key === held) return;
      clear();
      held = key;
      if (key !== null) timers = [setTimeout(() => blinkThenSpring(key), delay)];
    },
    leave: (key) => {
      if (key !== held) return;
      clear();
      held = null;
    },
    cancel: () => {
      clear();
      held = null;
    },
  };
}

/**
 * Where a window that sprang open goes back to: where it was when the first folder sprang open,
 * kept until its drag exits.
 */
export class SpringBack<Place> {
  private origin: { place: Place } | null = null;

  /** A folder sprang open in the window, which was at `current`. */
  opened(current: Place): void {
    if (!this.origin) this.origin = { place: current };
  }

  /** The window's drag exited: where to go back to (none after a drop in it, or nothing sprang). */
  exited(isDropped: boolean): Place | null {
    const origin = this.origin;
    this.origin = null;
    return origin && !isDropped ? origin.place : null;
  }
}
