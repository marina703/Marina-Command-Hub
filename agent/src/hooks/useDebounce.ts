import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value. Returns the debounced value after
 * `delay` ms of no changes. Used to prevent excessive re-renders from
 * range sliders during rapid dragging.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
