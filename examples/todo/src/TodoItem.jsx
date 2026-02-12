export default function TodoItem({ todo = {}, onToggle, onRemove }) {
  return (
    <div className={todo.completed ? 'todo-item completed' : 'todo-item'}>
      <style>{`
        .todo-item {
          display: flex;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.2s;
        }
        .todo-item:hover {
          background: #f8f9fa;
        }
        .todo-item.completed .todo-text {
          text-decoration: line-through;
          color: #999;
        }
        .todo-checkbox {
          width: 20px;
          height: 20px;
          margin-right: 0.75rem;
          cursor: pointer;
        }
        .todo-text {
          flex: 1;
          font-size: 1rem;
        }
        .todo-remove {
          padding: 0.25rem 0.5rem;
          background: none;
          border: none;
          color: #e74c3c;
          cursor: pointer;
          font-size: 1.2rem;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .todo-item:hover .todo-remove {
          opacity: 1;
        }
      `}</style>
      <input
        type="checkbox"
        className="todo-checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      <span className="todo-text">{todo.text}</span>
      <button className="todo-remove" onClick={() => onRemove(todo.id)}>x</button>
    </div>
  );
}
