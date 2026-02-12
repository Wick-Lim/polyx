import { useState, useRef, useEffect, useLayoutEffect } from '@polyx/runtime';

export default function DimensionDisplay() {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    const box = document.querySelector('polyx-dimensiondisplay .measure-box');
    if (box) {
      boxRef.current = box;
      const rect = box.getBoundingClientRect();
      setWidth(Math.round(rect.width));
      setHeight(Math.round(rect.height));
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (boxRef.current) {
        const rect = boxRef.current.getBoundingClientRect();
        setWidth(Math.round(rect.width));
        setHeight(Math.round(rect.height));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="dimension-display">
      <style>{`
        .dimension-display {
          background: #2d2d44;
          border-radius: 12px;
          padding: 1.5rem;
        }
        .dimension-title {
          font-weight: 600;
          margin-bottom: 1rem;
        }
        .measure-box {
          background: linear-gradient(135deg, #4a90d9, #764ba2);
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          font-size: 0.9rem;
          color: rgba(255,255,255,0.9);
        }
        .dimension-values {
          margin-top: 1rem;
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .dim-badge {
          background: rgba(255,255,255,0.1);
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-family: monospace;
        }
      `}</style>
      <div className="dimension-title">DOM Measurement (useLayoutEffect)</div>
      <div className="measure-box">
        This box is measured synchronously via useLayoutEffect
        <div className="dimension-values">
          <span className="dim-badge">W: {width}px</span>
          <span className="dim-badge">H: {height}px</span>
        </div>
      </div>
    </div>
  );
}
