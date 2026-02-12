import { useContext } from '@polyx/runtime';
import { ThemeContext, LocaleContext } from './contexts.js';

export default function ThemedBox() {
  const theme = useContext(ThemeContext);
  const locale = useContext(LocaleContext);

  return (
    <div className="themed-box" style={`border:2px solid ${theme.primary};background:${theme.surface}`}>
      <style>{`
        .themed-box {
          border-radius: 12px;
          padding: 1.5rem;
          grid-column: 1 / -1;
          text-align: center;
          transition: all 0.3s;
        }
        .themed-box-title {
          font-size: 1.2rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .themed-box-desc {
          font-size: 0.9rem;
          opacity: 0.7;
        }
        .color-swatches {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }
        .swatch {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          border: 2px solid rgba(128,128,128,0.3);
        }
      `}</style>
      <div className="themed-box-title">{locale.strings.theme}: {theme.mode}</div>
      <div className="themed-box-desc">
        {theme.mode === 'dark' ? locale.strings.darkMode : locale.strings.lightMode}
      </div>
      <div className="color-swatches">
        <div className="swatch" style={`background:${theme.primary}`}></div>
        <div className="swatch" style={`background:${theme.bg}`}></div>
        <div className="swatch" style={`background:${theme.surface}`}></div>
        <div className="swatch" style={`background:${theme.text}`}></div>
      </div>
    </div>
  );
}
