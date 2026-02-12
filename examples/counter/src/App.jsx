import { useState } from '@polyx/runtime';

export default function App() {
  const [showCounter, setShowCounter] = useState(true);
  
  return (
    <div className="app">
      <h1>PolyX Example</h1>
      <p>JSX to Custom Elements</p>
      
      <label>
        <input 
          type="checkbox" 
          checked={showCounter}
          onChange={(e) => setShowCounter(e.target.checked)}
        />
        Show Counter
      </label>
      
      {showCounter && <Counter />}
    </div>
  );
}
