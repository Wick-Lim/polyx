import { useState, useMemo, useCallback, useLayoutEffect } from '@polyx/runtime';

const THEMES = {
  light: { mode: 'light', primary: '#4a90d9', bg: '#ffffff', text: '#333333', surface: '#f5f5f5' },
  dark: { mode: 'dark', primary: '#64b5f6', bg: '#1a1a2e', text: '#e0e0e0', surface: '#2d2d44' },
};

const LOCALES = {
  en: {
    lang: 'en',
    strings: {
      greeting: 'Hello',
      profile: 'Profile',
      info: 'Information',
      theme: 'Theme',
      locale: 'Language',
      toggleTheme: 'Toggle Theme',
      lightMode: 'Light Mode',
      darkMode: 'Dark Mode',
    },
  },
  ko: {
    lang: 'ko',
    strings: {
      greeting: '안녕하세요',
      profile: '프로필',
      info: '정보',
      theme: '테마',
      locale: '언어',
      toggleTheme: '테마 전환',
      lightMode: '라이트 모드',
      darkMode: '다크 모드',
    },
  },
  ja: {
    lang: 'ja',
    strings: {
      greeting: 'こんにちは',
      profile: 'プロフィール',
      info: '情報',
      theme: 'テーマ',
      locale: '言語',
      toggleTheme: 'テーマ切替',
      lightMode: 'ライトモード',
      darkMode: 'ダークモード',
    },
  },
};

export default function App() {
  const [themeMode, setThemeMode] = useState('light');
  const [localeLang, setLocaleLang] = useState('en');

  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const locale = useMemo(() => LOCALES[localeLang] || LOCALES.en, [localeLang]);

  const toggleTheme = useCallback(() => {
    setThemeMode(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  useLayoutEffect(() => {
    const themeProvider = document.querySelector('polyx-ctx-provider-1');
    if (themeProvider) themeProvider.value = theme;
  }, [theme]);

  useLayoutEffect(() => {
    const localeProvider = document.querySelector('polyx-ctx-provider-2');
    if (localeProvider) localeProvider.value = locale;
  }, [locale]);

  useLayoutEffect(() => {
    document.body.style.background = theme.bg;
    document.body.style.color = theme.text;
  }, [theme]);

  return (
    <div className="app-container">
      <style>{`
        .app-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
        }
        .content-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }
      `}</style>
      <Toolbar onToggleTheme={toggleTheme} onLocaleChange={setLocaleLang} currentLocale={localeLang} />
      <div className="content-grid">
        <ProfileSection />
        <InfoSection />
        <ThemedBox />
      </div>
    </div>
  );
}
