import { openDB, type DBSchema } from 'idb';
import type { PlayerAsset, ProjectDocument } from './types';

interface TacticsDatabase extends DBSchema {
  projects: {
    key: string;
    value: ProjectDocument;
    indexes: { 'by-updated': number; 'by-title': string };
  };
  assets: {
    key: string;
    value: PlayerAsset;
    indexes: { 'by-hash': string };
  };
  settings: {
    key: string;
    value: { key: string; value: string };
  };
}

const databasePromise = typeof indexedDB === 'undefined' ? null : openDB<TacticsDatabase>('tactics-lab', 1, {
  upgrade(database) {
    const projects = database.createObjectStore('projects', { keyPath: 'id' });
    projects.createIndex('by-updated', 'updatedAt');
    projects.createIndex('by-title', 'title');
    const assets = database.createObjectStore('assets', { keyPath: 'id' });
    assets.createIndex('by-hash', 'hash', { unique: true });
    database.createObjectStore('settings', { keyPath: 'key' });
  },
});

function requireDatabase() {
  if (!databasePromise) throw new Error('IndexedDB non è disponibile in questo browser.');
  return databasePromise;
}

export async function saveProject(project: ProjectDocument) {
  return (await requireDatabase()).put('projects', project);
}

export async function getProject(id: string) {
  return (await requireDatabase()).get('projects', id);
}

export async function listProjects() {
  const projects = await (await requireDatabase()).getAll('projects');
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeProject(id: string) {
  return (await requireDatabase()).delete('projects', id);
}

export async function saveAssets(assets: PlayerAsset[]) {
  if (!assets.length) return;
  const transaction = (await requireDatabase()).transaction('assets', 'readwrite');
  for (const asset of assets) await transaction.store.put(asset);
  await transaction.done;
}

export async function listAssets() {
  return (await requireDatabase()).getAll('assets');
}

export async function setLastProject(id: string) {
  return (await requireDatabase()).put('settings', { key: 'last-project', value: id });
}

export async function getLastProject() {
  return (await requireDatabase()).get('settings', 'last-project');
}
