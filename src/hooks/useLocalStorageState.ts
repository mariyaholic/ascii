import { useEffect, useState } from 'react';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        return JSON.parse(raw) as T;
      }
    } catch {
      // Ignore corrupted localStorage values
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [key, state]);

  return [state, setState];
}
