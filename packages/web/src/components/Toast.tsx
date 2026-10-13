import { useEffect } from 'react';

export function Toast({ text, tick, onDone }: { text: string | null; tick: number; onDone: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [text, tick, onDone]);
  return text ? <div className="toast" role="alert">{text}</div> : null;
}
