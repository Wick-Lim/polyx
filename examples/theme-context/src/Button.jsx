import { useContext } from '@polyx/runtime';
import { ThemeContext } from './contexts.js';

export default function Button({ label, ...rest }) {
  const theme = useContext(ThemeContext);

  return (
    <button className="themed-btn" style={`background:${theme.primary};color:white`} {...rest}>
      <style>{`
        .themed-btn {
          padding: 0.5rem 1.25rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          transition: opacity 0.2s;
        }
        .themed-btn:hover {
          opacity: 0.85;
        }
      `}</style>
      {label}
    </button>
  );
}
