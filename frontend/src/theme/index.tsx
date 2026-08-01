'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export type UiTheme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: UiTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: UiTheme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function isUiTheme(value: unknown): value is UiTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: UiTheme): ResolvedTheme {
  return theme === 'system' ? systemTheme() : theme;
}

function applyDocumentTheme(theme: UiTheme, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  void getCurrentWindow().setTheme(theme === 'system' ? null : resolved).catch((error) => {
    console.error('[Theme] Failed to update native window theme:', error);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [ready, setReady] = useState(false);

  const applyTheme = useCallback((next: UiTheme) => {
    const resolved = resolveTheme(next);
    setThemeState(next);
    setResolvedTheme(resolved);
    applyDocumentTheme(next, resolved);
  }, []);

  useEffect(() => {
    invoke<string>('get_ui_theme')
      .then((stored) => applyTheme(isUiTheme(stored) ? stored : 'system'))
      .catch((error) => {
        console.error('[Theme] Failed to load interface theme:', error);
        applyTheme('system');
      })
      .finally(() => setReady(true));
  }, [applyTheme]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme !== 'system') return;
      const resolved = systemTheme();
      setResolvedTheme(resolved);
      applyDocumentTheme('system', resolved);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback(async (next: UiTheme) => {
    await invoke('set_ui_theme', { theme: next });
    applyTheme(next);
  }, [applyTheme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  if (!ready) return <div className="h-screen bg-background" aria-hidden="true" />;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
