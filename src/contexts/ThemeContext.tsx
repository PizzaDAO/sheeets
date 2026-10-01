'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { ThemeId, DEFAULT_THEME, THEME_OPTIONS } from '@/lib/themes';

const STORAGE_KEY = 'user-theme-override';
const validIds = THEME_OPTIONS.map(t => t.id) as string[];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  adminConfig?: Record<string, unknown> | null;
  conference?: string;
}

function readStoredTheme(): ThemeId | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validIds.includes(stored)) return stored as ThemeId;
  } catch {}
  return null;
}

export function ThemeProvider({ children, adminConfig, conference }: ThemeProviderProps) {
  // Theme the user picked manually (persisted); wins over the admin config.
  const [userTheme, setUserTheme] = useState<ThemeId | null>(readStoredTheme);

  // Otherwise use the per-conference theme from admin config (derived during render).
  const configTheme = adminConfig && conference
    ? (adminConfig[`theme:${conference}`] as string | undefined)
    : undefined;
  const theme: ThemeId = userTheme
    ?? (configTheme && validIds.includes(configTheme) ? (configTheme as ThemeId) : DEFAULT_THEME);

  // Apply data-theme attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeId) => {
    setUserTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
