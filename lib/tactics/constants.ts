import type { PlayerAsset, ProjectDocument } from './types';

export const FIELD_WIDTH = 2496;
export const FIELD_HEIGHT = 1326;
export const DEFAULT_FIELD = '/assets/campo-drone.png';
export const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
export const MAX_ASSET_COUNT = 250;

const directions = [
  ['00-nord', 'Nord'],
  ['01-nordest', 'Nord-est'],
  ['02-est', 'Est'],
  ['03-sudest', 'Sud-est'],
  ['04-sud', 'Sud'],
  ['05-sudovest', 'Sud-ovest'],
  ['06-ovest', 'Ovest'],
  ['07-nordovest', 'Nord-ovest'],
] as const;

export const BUILTIN_ASSETS: PlayerAsset[] = [
  ...directions.map(([slug, label]) => ({
    id: `viola-${slug}`,
    name: `Viola · ${label}`,
    shortName: label,
    category: 'viola' as const,
    src: `/assets/players/viola/viola-${slug}.png`,
    aspect: 2 / 3,
    imported: false,
  })),
  ...directions.map(([slug, label]) => ({
    id: `bianco-${slug}`,
    name: `Bianco · ${label}`,
    shortName: label,
    category: 'bianchi' as const,
    src: `/assets/players/bianchi/bianco-${slug}.png`,
    aspect: 2 / 3,
    imported: false,
  })),
  { id: 'portiere-00-frontale', name: 'Portiere · Frontale', shortName: 'Frontale', category: 'portiere', src: '/assets/players/portiere/portiere-00-frontale.png', aspect: 1086 / 1448, imported: false },
  { id: 'portiere-01-sinistra', name: 'Portiere · Sinistra', shortName: 'Sinistra', category: 'portiere', src: '/assets/players/portiere/portiere-01-sinistra.png', aspect: 1086 / 1448, imported: false },
  { id: 'portiere-02-destra', name: 'Portiere · Destra', shortName: 'Destra', category: 'portiere', src: '/assets/players/portiere/portiere-02-destra.png', aspect: 1086 / 1448, imported: false },
];

export const createId = (prefix = 'item') => `${prefix}-${crypto.randomUUID()}`;

export function createEmptyProject(title = 'Nuova composizione'): ProjectDocument {
  const now = Date.now();
  return {
    id: createId('project'),
    title,
    items: [],
    fieldSrc: DEFAULT_FIELD,
    fieldName: 'Campo drone originale',
    fieldMode: 'contain',
    createdAt: now,
    updatedAt: now,
  };
}
