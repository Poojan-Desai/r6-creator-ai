export type EditorHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};

export function createEditorHistory<T>(present: T): EditorHistory<T> {
  return { past: [], present, future: [] };
}

export function pushEditorHistory<T>(
  history: EditorHistory<T>,
  next: T,
  maximumEntries = 50,
): EditorHistory<T> {
  return {
    past: [...history.past, history.present].slice(-maximumEntries),
    present: next,
    future: [],
  };
}

export function undoEditorHistory<T>(
  history: EditorHistory<T>,
): EditorHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoEditorHistory<T>(
  history: EditorHistory<T>,
): EditorHistory<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
