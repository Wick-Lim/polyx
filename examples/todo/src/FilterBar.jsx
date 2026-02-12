export default function FilterBar({ filter, onFilterChange }) {
  return (
    <div className="filter-bar">
      <style>{`
        .filter-bar {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .filter-btn {
          padding: 0.4rem 1rem;
          border: 1px solid #ddd;
          border-radius: 20px;
          background: white;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: #f0f0f0;
        }
        .filter-btn.active {
          background: #4a90d9;
          color: white;
          border-color: #4a90d9;
        }
      `}</style>
      <button
        className={filter === 'all' ? 'filter-btn active' : 'filter-btn'}
        onClick={() => onFilterChange('all')}
      >All</button>
      <button
        className={filter === 'active' ? 'filter-btn active' : 'filter-btn'}
        onClick={() => onFilterChange('active')}
      >Active</button>
      <button
        className={filter === 'completed' ? 'filter-btn active' : 'filter-btn'}
        onClick={() => onFilterChange('completed')}
      >Completed</button>
    </div>
  );
}
