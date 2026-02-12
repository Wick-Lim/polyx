import { useContext } from '@polyx/runtime';
import { ThemeContext, LocaleContext } from './contexts.js';

export default function ThemeToggle({ onToggle }) {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return (
    <button className="theme-toggle" onClick={onToggle}>
      <style>{`
        .theme-toggle {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          transition: all 0.2s;
        }
      `}</style>
      {theme.mode === 'dark' ? locale.strings.lightMode : locale.strings.darkMode}
    </button>
  );
}
