export default function TodoList({ todos = [], onToggle, onRemove }) {
  return (
    <div className="todo-list">
      {todos.map(todo => (
        <TodoItem todo={todo} onToggle={onToggle} onRemove={onRemove} />
      ))}
      {todos.length === 0 ? "No todos to show" : null}
    </div>
  );
}
