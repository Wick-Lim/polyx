import { createContext } from '@polyx/runtime';

// ThemeContext: polyx-ctx-provider-1
export const ThemeContext = createContext({
  mode: 'light',
  primary: '#4a90d9',
  bg: '#ffffff',
  text: '#333333',
  surface: '#f5f5f5',
});

// LocaleContext: polyx-ctx-provider-2
export const LocaleContext = createContext({
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
});
