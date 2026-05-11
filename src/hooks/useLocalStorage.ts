'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * useLocalStorage<T> — Generic hook for persisting state to localStorage.
 *
 * - SSR-safe: reads from localStorage only after mount (hydration).
 * - On first mount, uses initialValue if localStorage is empty or unreadable.
 * - Writes to localStorage on every state change.
 * - Handles JSON serialization/deserialization automatically.
 * - Returns [storedValue, setValue, isLoaded] where isLoaded indicates
 *   whether the initial localStorage read has completed (useful for SSR).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  // Read from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item) as T);
      }
    } catch (error) {
      console.warn(`useLocalStorage: failed to read key "${key}", using initial value`, error);
    }
    setIsLoaded(true);
  }, [key]);

  // Write to localStorage whenever storedValue changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return; // Don't write initialValue before reading localStorage
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`useLocalStorage: failed to write key "${key}"`, error);
    }
  }, [key, storedValue, isLoaded]);

  // Custom setter that supports both direct values and updater functions
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue(prev => {
        const newValue = value instanceof Function ? value(prev) : value;
        return newValue;
      });
    },
    []
  );

  return [storedValue, setValue, isLoaded];
}