import { describe, expect, it } from 'vitest';
import { joinsPrevious, unfold } from './layout';
import { wall } from '../test/fixtures';

describe('joinsPrevious', () => {
  const a = wall({ id: 'a', W: 160, ox: 8, oy: 7 });

  it('voit un angle commun quand la grille est raccordée', () => {
    expect(joinsPrevious([a, wall({ id: 'b', ox: 8 - 160, oy: 7 })], 1)).toBe(true);
    expect(joinsPrevious([a, wall({ id: 'b', ox: 3, oy: 7 })], 1)).toBe(false);
  });

  it('suit le réglage explicite du pan', () => {
    expect(joinsPrevious([a, wall({ id: 'b', ox: 3, joinPrev: true })], 1)).toBe(true);
    expect(joinsPrevious([a, wall({ id: 'b', ox: 8 - 160, oy: 7, joinPrev: false })], 1)).toBe(false);
  });

  it('ne relie jamais le premier pan', () => {
    expect(joinsPrevious([a], 0)).toBe(false);
  });
});

describe('unfold', () => {
  it('met bout à bout les pans reliés, et commence une nouvelle suite sinon', () => {
    const walls = [
      wall({ id: 'a', W: 160 }),
      wall({ id: 'b', W: 300, joinPrev: true }),
      wall({ id: 'c', W: 100, joinPrev: true }),
      wall({ id: 'd', W: 80 }),
    ];
    expect(unfold(walls)).toEqual([{ run: 0, x0: 0 }, { run: 0, x0: 160 }, { run: 0, x0: 460 }, { run: 1, x0: 0 }]);
  });
});
