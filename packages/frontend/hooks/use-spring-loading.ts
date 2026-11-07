import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createSpringTimer, type SpringTimer } from '@/lib/spring-loading';

/**
 * Spring-loading for one kind of drop target of the window (`lib/spring-loading`): the timer its
 * drag callbacks tell where the drag is, and whether the target held is drawn unlit as it blinks.
 * `onSpring` is read when the target springs, so it need not be memoised.
 */
export function useSpringLoading(onSpring: (key: string) => void): {
  spring: SpringTimer;
  isUnlit: boolean;
} {
  const [isUnlit, setUnlit] = useState(false);
  const latest = useRef(onSpring);
  useLayoutEffect(() => {
    latest.current = onSpring;
  });
  const [spring] = useState(() =>
    createSpringTimer({ onBlink: setUnlit, onSpring: (key) => latest.current(key) }),
  );
  // The timers are the one thing a drag leaves running past the view.
  useEffect(() => () => spring.cancel(), [spring]);
  return { spring, isUnlit };
}
