// Simple test component
import { useState } from '@polyx/runtime';

function Test() {
  const [count, setCount] = useState(0);
  
  return (
    <div style="padding: 20px; background: lightblue;">
      <h1>Test Component Works!</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Click me</button>
    </div>
  );
}

export default Test;
