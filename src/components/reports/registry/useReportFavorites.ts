import { useCallback, useEffect, useState } from 'react';

const FAVORITES_KEY = 'report-favorites';
const RECENTS_KEY = 'report-recents';
const MAX_RECENTS = 5;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

/**
 * Report favorites + recently-viewed lists, persisted in localStorage.
 * Favorites are user-toggled; recents are capped and most-recent-first.
 */
export function useReportFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAVORITES_KEY));
  const [recents, setRecents] = useState<string[]>(() => readList(RECENTS_KEY));

  useEffect(() => { writeList(FAVORITES_KEY, favorites); }, [favorites]);
  useEffect(() => { writeList(RECENTS_KEY, recents); }, [recents]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const pushRecent = useCallback((id: string) => {
    setRecents((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS));
  }, []);

  return { favorites, recents, toggleFavorite, isFavorite, pushRecent };
}
