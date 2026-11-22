import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type LangCode = 'en' | 'vi' | 'de';

/** Theme chosen in operartis-theme.js, kept in step with the account menu and other tabs. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => window.getOperartisTheme?.() || 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: ThemeMode }>).detail;
      setThemeState(detail?.theme || window.getOperartisTheme?.() || 'system');
    };
    window.addEventListener('operartis:theme-change', handler);
    return () => window.removeEventListener('operartis:theme-change', handler);
  }, []);

  const setTheme = (next: ThemeMode) => {
    if (window.setOperartisTheme) {
      window.setOperartisTheme(next);
      return;
    }
    document.documentElement.classList.toggle('dark', next === 'dark' || (next === 'system' && systemDark));
    setThemeState(next);
  };

  return { theme, dark, setTheme };
}

/** Language chosen in operartis-lang.js. */
export function useLang() {
  const [lang, setLangState] = useState<LangCode>(() => window.getOperartisLang?.() || 'en');

  useEffect(() => {
    const handler = (event: Event) => {
      setLangState((event as CustomEvent<{ lang?: LangCode }>).detail?.lang || window.getOperartisLang?.() || 'en');
    };
    window.addEventListener('operartis:lang-change', handler);
    return () => window.removeEventListener('operartis:lang-change', handler);
  }, []);

  const setLang = (next: LangCode) => {
    if (window.setOperartisLang) {
      window.setOperartisLang(next);
      return;
    }
    setLangState(next);
  };

  return { lang, setLang };
}

/** A boolean kept in localStorage, for example "sidebar collapsed". */
export function useStoredFlag(key: string, initial = false) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? initial : stored === '1';
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* Private windows may refuse storage; the flag then lasts for this visit only. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
