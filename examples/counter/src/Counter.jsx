import { useState, useEffect } from '@polyx/runtime';

export default function Counter() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    console.log('Count changed:', count);
  }, [count]);
  
  return (
    <div className="counter">
      <h2>Counter Component</h2>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
      <button onClick={() => setCount(c => c - 1)}>
        Decrement
      </button>
    </div>
  );
}
