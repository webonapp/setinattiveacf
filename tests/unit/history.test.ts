import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from '../../lib/tactics/history';

describe('cronologia annulla/ripristina', () => {
  it('torna indietro e ripristina lo stato successivo', () => {
    const initial = createHistory(['a']);
    const changed = commitHistory(initial, ['a', 'b']);
    const undone = undoHistory(changed);
    expect(undone.present).toEqual(['a']);
    expect(redoHistory(undone).present).toEqual(['a', 'b']);
  });

  it('rispetta il limite e cancella il futuro dopo una modifica', () => {
    let state = createHistory(0);
    state = commitHistory(state, 1, 2);
    state = commitHistory(state, 2, 2);
    state = commitHistory(state, 3, 2);
    expect(state.past).toEqual([1, 2]);
    expect(commitHistory(undoHistory(state), 9).future).toEqual([]);
  });
});
