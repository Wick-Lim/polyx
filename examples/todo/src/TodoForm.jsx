import { useState, useRef, useLayoutEffect } from '@polyx/runtime';

export default function TodoForm({ onAdd }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    const input = document.querySelector('polyx-todoform input');
    if (input) {
      inputRef.current = input;
      input.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onAdd(text.trim());
      setText('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <style>{`
        .todo-form {
          display: flex;
          gap: 0.5rem;
          margin: 1rem 0;
        }
        .todo-form input {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .todo-form input:focus {
          border-color: #4a90d9;
        }
        .todo-form button {
          padding: 0.75rem 1.5rem;
          background: #4a90d9;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .todo-form button:hover {
          background: #357abd;
        }
      `}</style>
      <input
        type="text"
        value={text}
        placeholder="What needs to be done?"
        onInput={(e) => setText(e.target.value)}
      />
      <button type="submit">Add</button>
    </form>
  );
}
