import { describe, expect, it } from 'vitest';
import { clampItemPosition, fitInside, rotatedHalfExtents, snapItemPosition } from '../../lib/tactics/geometry';
import type { FieldItem } from '../../lib/tactics/types';

const item: FieldItem = {
  id: 'one', assetId: 'asset', x: 0, y: 0, width: 200, height: 100,
  rotation: 0, name: '', number: '', showLabel: false, labelSize: 24,
  labelColor: '#000000', textColor: '#ffffff', labelPosition: 'below',
  rotateLabel: false, locked: false,
};

describe('geometria del campo', () => {
  it('calcola correttamente gli ingombri ruotati', () => {
    expect(rotatedHalfExtents(200, 100, 90).x).toBeCloseTo(50);
    expect(rotatedHalfExtents(200, 100, 90).y).toBeCloseTo(100);
  });

  it('mantiene il giocatore dentro il campo anche da ruotato', () => {
    const position = clampItemPosition({ ...item, rotation: 90 }, -500, -500);
    expect(position.x).toBeCloseTo(-50);
    expect(position.y).toBeCloseTo(50);
  });

  it('aggancia al centro del campo entro la soglia', () => {
    const snapped = snapItemPosition(item, [], 1155, 618, 15);
    expect(snapped.guides).toEqual({ x: 1248, y: 663 });
    expect(snapped.x).toBe(1148);
    expect(snapped.y).toBe(613);
  });

  it('calcola contain e cover senza deformare', () => {
    expect(fitInside(100, 50, 100, 100, 'contain')).toEqual({ x: 0, y: 25, width: 100, height: 50 });
    expect(fitInside(100, 50, 100, 100, 'cover')).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });
});
