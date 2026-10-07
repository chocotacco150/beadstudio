import { useCallback, useRef, useState } from "react";
import type { Pattern } from "../core/types";
export function useHistory() {
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const current = useRef<Pattern | null>(null);
  const past = useRef<Pattern[]>([]),
    future = useRef<Pattern[]>([]);
  const [, tick] = useState(0);
  const update = useCallback((p: Pattern) => {
    current.current = p;
    setPattern(p);
  }, []);
  const commit = useCallback(
    (p: Pattern) => {
      if (current.current) {
        past.current.push(current.current);
        let cells = past.current.reduce(
          (sum, item) => sum + item.cells.length,
          0,
        );
        while (
          past.current.length > 1 &&
          (past.current.length > 50 || cells > 2_000_000)
        ) {
          cells -= past.current.shift()!.cells.length;
        }
      }
      future.current = [];
      update(p);
      tick((n) => n + 1);
    },
    [update],
  );
  const reset = useCallback(
    (p: Pattern) => {
      past.current = [];
      future.current = [];
      update(p);
      tick((n) => n + 1);
    },
    [update],
  );
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (p && current.current) {
      future.current.push(current.current);
      update(p);
      tick((n) => n + 1);
    }
  }, [update]);
  const redo = useCallback(() => {
    const p = future.current.pop();
    if (p && current.current) {
      past.current.push(current.current);
      update(p);
      tick((n) => n + 1);
    }
  }, [update]);
  return {
    pattern,
    current,
    commit,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
