/**
 * useDebouncedValue Hook
 *
 * Returns a debounced version of the input value that only updates
 * after the specified delay has passed without new changes.
 *
 * Useful for search inputs where you want to delay API calls until
 * the user stops typing.
 */

import { useState, useEffect } from 'react';

/**
 * Debounce a value by the specified delay in milliseconds.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before the value updates
 * @returns The debounced value
 *
 * @example
 * const [searchInput, setSearchInput] = useState('');
 * const debouncedSearch = useDebouncedValue(searchInput, 300);
 * // debouncedSearch updates 300ms after searchInput stops changing
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [value, delay]);

  return debouncedValue;
}
