export default function Controls({ sortField, sortDir, onSortBy, onShuffle, onReverse }) {
  const baseProps = { type: 'button' };
  const dirLabel = sortDir === 'asc' ? '\u2191' : '\u2193';

  return (
    <div className="controls">
      <style>{`
        .controls {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .ctrl-btn {
          padding: 0.4rem 0.8rem;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          background: #fff;
          cursor: pointer;
          font-size: 0.8rem;
          transition: background 0.15s, border-color 0.15s;
        }
        .ctrl-btn:hover {
          background: #e8f0fe;
          border-color: #4a90d9;
        }
        .ctrl-btn.active {
          background: #4a90d9;
          color: #fff;
          border-color: #4a90d9;
        }
      `}</style>
      <button
        className={sortField === 'id' ? 'ctrl-btn active' : 'ctrl-btn'}
        onClick={() => onSortBy('id')}
        {...baseProps}
      >
        ID {sortField === 'id' ? dirLabel : ''}
      </button>
      <button
        className={sortField === 'name' ? 'ctrl-btn active' : 'ctrl-btn'}
        onClick={() => onSortBy('name')}
        {...baseProps}
      >
        Name {sortField === 'name' ? dirLabel : ''}
      </button>
      <button
        className={sortField === 'score' ? 'ctrl-btn active' : 'ctrl-btn'}
        onClick={() => onSortBy('score')}
        {...baseProps}
      >
        Score {sortField === 'score' ? dirLabel : ''}
      </button>
      <button
        className={sortField === 'category' ? 'ctrl-btn active' : 'ctrl-btn'}
        onClick={() => onSortBy('category')}
        {...baseProps}
      >
        Category {sortField === 'category' ? dirLabel : ''}
      </button>
      <button className="ctrl-btn" onClick={onShuffle} {...baseProps}>
        Shuffle
      </button>
      <button className="ctrl-btn" onClick={onReverse} {...baseProps}>
        Reverse
      </button>
    </div>
  );
}
