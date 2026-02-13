import { useState, useMemo, useCallback, useEffect } from '@polyx/runtime';

const CATEGORIES = ['Engineering', 'Design', 'Marketing', 'Sales', 'Support'];
const STATUSES = ['Active', 'Inactive', 'On Leave'];
const FIRST_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack',
  'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Ruby', 'Sam', 'Tina'];
const LAST_NAMES = ['Anderson', 'Brown', 'Clark', 'Davis', 'Evans', 'Fisher', 'Garcia', 'Harris', 'Ito', 'Jones',
  'Kim', 'Lee', 'Miller', 'Nelson', 'Owen', 'Park', 'Reed', 'Smith', 'Taylor', 'Wang'];

function generateItems(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      name: FIRST_NAMES[i % FIRST_NAMES.length] + ' ' + LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length],
      score: Math.floor(Math.random() * 100),
      status: STATUSES[i % STATUSES.length],
      category: CATEGORIES[i % CATEGORIES.length],
    });
  }
  return items;
}

const INITIAL_ITEMS = generateItems(200);

export default function App() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [sortField, setSortField] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedId, setSelectedId] = useState(null);

  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [items, sortField, sortDir]);

  const sortBy = useCallback((field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const shuffle = useCallback(() => {
    setItems(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      return shuffled;
    });
  }, []);

  const reverse = useCallback(() => {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  }, []);

  const select = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  useEffect(() => {
    const start = performance.now();
    requestAnimationFrame(() => {
      const elapsed = (performance.now() - start).toFixed(1);
      const el = document.getElementById('render-time');
      if (el) el.textContent = elapsed + 'ms';
    });
  });

  return (
    <div className="app-container">
      <style>{`
        .app-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 1.5rem;
        }
        .app-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }
        .render-info {
          font-size: 0.75rem;
          color: #888;
          margin-left: 1rem;
          font-weight: 400;
        }
      `}</style>
      <h1 className="app-title">
        Sortable List (200 items)
        <span className="render-info">Render: <span id="render-time">—</span></span>
      </h1>
      <Controls
        sortField={sortField}
        sortDir={sortDir}
        onSortBy={sortBy}
        onShuffle={shuffle}
        onReverse={reverse}
      />
      <ListStats total={items.length} selectedId={selectedId} />
      <SortableList items={sortedItems} selectedId={selectedId} onSelect={select} />
    </div>
  );
}
