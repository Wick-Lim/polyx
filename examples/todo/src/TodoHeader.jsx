export default function TodoHeader({ total = 0, completed = 0 }) {
  return (
    <>
      <h1>Todo App</h1>
      <p className="subtitle">{total} tasks, {completed} completed</p>
    </>
  );
}
