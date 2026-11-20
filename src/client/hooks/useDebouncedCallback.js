// useDebouncedCallback: returns a function that waits until it has not been called for `delay`
// milliseconds, then runs `callback` once. Used to batch bursts of live events into one reload.
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback(callback, delay = 300) {
  const callbackRef = useRef(callback);
  const timerRef = useRef(null);

  useEffect(() => {
    callbackRef.current = callback;
  });

  // Cancel a pending call when the component goes away
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return useCallback(
    (...args) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay]
  );
}
