import { describe, expect, test } from 'bun:test';
import { createSpringTimer, SpringBack } from '@/lib/spring-loading';

const DELAY = 40;
const BLINK = 5;

/** A timer whose blinks and springs are written down, in order. */
function recorded() {
  const events: string[] = [];
  const timer = createSpringTimer({
    delay: DELAY,
    blinkMs: BLINK,
    onBlink: (isUnlit) => events.push(isUnlit ? 'unlit' : 'lit'),
    onSpring: (key) => events.push(`spring ${key}`),
  });
  return { events, timer };
}

describe('spring-loaded folders', () => {
  test('a folder held for the delay blinks twice and opens', async () => {
    const { events, timer } = recorded();
    timer.hover('Projects');
    await Bun.sleep(DELAY / 2);
    expect(events).toEqual([]);
    await Bun.sleep(DELAY / 2 + BLINK * 4 + 30);
    expect(events).toEqual(['unlit', 'lit', 'unlit', 'lit', 'spring Projects']);
  });

  test('moving on to another folder starts again, and only the one held opens', async () => {
    const { events, timer } = recorded();
    timer.hover('Projects');
    await Bun.sleep(DELAY / 2);
    timer.hover('Documents');
    await Bun.sleep(DELAY / 2 + 5);
    expect(events).toEqual([]);
    await Bun.sleep(DELAY / 2 + BLINK * 4 + 30);
    expect(events.at(-1)).toBe('spring Documents');
    expect(events.filter((event) => event.startsWith('spring'))).toHaveLength(1);
  });

  test('a drag that leaves, or moves off the folder, opens nothing; one blinking is lit again', async () => {
    const { events, timer } = recorded();
    timer.hover('Projects');
    await Bun.sleep(DELAY + BLINK);
    timer.cancel();
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    expect(events.at(-1)).toBe('lit');
    expect(events.some((event) => event.startsWith('spring'))).toBe(false);

    timer.hover('Projects');
    timer.hover(null);
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    expect(events.some((event) => event.startsWith('spring'))).toBe(false);
  });

  test('leaving a target that is not the one held changes nothing', async () => {
    const { events, timer } = recorded();
    // The drag enters a place before it is told it left the one before.
    timer.hover('Documents');
    timer.leave('Desktop');
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    expect(events.at(-1)).toBe('spring Documents');
    timer.hover('Pictures');
    timer.leave('Pictures');
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    expect(events.at(-1)).toBe('spring Documents');
  });

  test('the folder now under a drag that sprang starts its own wait', async () => {
    const { events, timer } = recorded();
    timer.hover('Projects');
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    // The same place in the folder opened holds another folder, under the same key or not.
    timer.hover('Projects');
    await Bun.sleep(DELAY + BLINK * 4 + 30);
    expect(events.filter((event) => event.startsWith('spring'))).toEqual([
      'spring Projects',
      'spring Projects',
    ]);
  });
});

describe('spring-loading’s way back', () => {
  test('a drag that exits without a drop goes back to where the window was when the first folder sprang', () => {
    const back = new SpringBack<string>();
    back.opened('home');
    back.opened('home/Projects');
    expect(back.exited(false)).toBe('home');
    // Once gone back, a later exit goes nowhere.
    expect(back.exited(false)).toBeNull();
  });

  test('a drop in the window keeps it where it is', () => {
    const back = new SpringBack<string>();
    back.opened('home');
    expect(back.exited(true)).toBeNull();
    back.opened('home/Projects');
    expect(back.exited(false)).toBe('home/Projects');
  });

  test('a drag that sprang nothing goes nowhere', () => {
    expect(new SpringBack<string>().exited(false)).toBeNull();
  });
});
