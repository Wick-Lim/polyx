import { useRef, useLayoutEffect } from '@polyx/runtime';

export default function FilterInput({ value, onInput }) {
  const inputRef = useRef(null);
  const widthRef = useRef(0);

  useLayoutEffect(() => {
    const input = document.querySelector('polyx-filterinput input');
    if (input) {
      inputRef.current = input;
      widthRef.current = input.getBoundingClientRect().width;
    }
  }, []);

  return (
    <div className="filter-input">
      <style>{`
        .filter-input {
          margin: 1.5rem 0;
        }
        .filter-input input {
          width: 100%;
          padding: 0.75rem 1rem;
          background: #2d2d44;
          border: 2px solid #3d3d5c;
          border-radius: 8px;
          color: #eee;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .filter-input input:focus {
          border-color: #64b5f6;
        }
        .filter-input input::placeholder {
          color: #888;
        }
      `}</style>
      <input
        type="text"
        placeholder="Filter by name, email, or status..."
        value={value}
        onInput={(e) => onInput(e.target.value)}
      />
    </div>
  );
}
