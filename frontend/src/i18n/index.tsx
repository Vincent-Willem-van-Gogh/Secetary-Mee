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
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export type UiLanguage = 'en' | 'zh-CN';
export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<UiLanguage, Record<string, string>> = {
  en,
  'zh-CN': zhCN,
};

let activeLanguage: UiLanguage = 'en';

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'en' || value === 'zh-CN';
}

export function translate(
  language: UiLanguage,
  key: string,
  params: TranslationParams = {},
): string {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: string, params?: TranslationParams): string {
  return translate(activeLanguage, key, params);
}

export interface I18nContextValue {
  language: UiLanguage;
  locale: 'en-US' | 'zh-CN';
  setLanguage: (language: UiLanguage) => Promise<void>;
  t: typeof t;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>('en');
  const [ready, setReady] = useState(false);

  const applyLanguage = useCallback((next: UiLanguage) => {
    activeLanguage = next;
    setLanguageState(next);
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    invoke<string>('get_ui_language')
      .then((stored) => applyLanguage(isUiLanguage(stored) ? stored : 'en'))
      .catch((error) => {
        console.error('[i18n] Failed to load interface language:', error);
        applyLanguage('en');
      })
      .finally(() => setReady(true));
  }, [applyLanguage]);

  const setLanguage = useCallback(async (next: UiLanguage) => {
    await invoke('set_ui_language', { language: next });
    applyLanguage(next);
  }, [applyLanguage]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: language === 'zh-CN' ? 'zh-CN' : 'en-US',
    setLanguage,
    t,
  }), [language, setLanguage]);

  if (!ready) {
    return <div className="h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
