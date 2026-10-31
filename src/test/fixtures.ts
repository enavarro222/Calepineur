import type { Project, Wall } from '../core/types';

export function wall(over: Partial<Wall> = {}): Wall {
  return {
    id: 'w1', name: 'Pan', W: 100, H: 60, color: '#eeeeee', ox: 8, oy: 7, zoneMode: 'organic',
    zone: [[-10, -10], [-10, 70], [110, 70], [110, -10]], obstacles: [], photo: null, tiles: {},
    ...over,
  };
}

export function project(over: Partial<Project> = {}): Project {
  return {
    version: 1, name: 'Test',
    tile: { F: 10, joint: 0.2, orient: 'flat', grout: '#cccccc', edgeGap: 0, waste: 10, minPiece: 15, perBox: 0, m2PerBox: 0 },
    rotMode: 'none', seed: 1,
    designs: [
      { key: 'A', name: 'Alpha', img: '', color: '#aa0000', weight: 1 },
      { key: 'B', name: 'Beta', img: '', color: '#00aa00', weight: 1 },
      { key: 'C', name: 'Gamma', img: '', color: '#0000aa', weight: 1 },
    ],
    walls: [wall()],
    ...over,
  };
}
