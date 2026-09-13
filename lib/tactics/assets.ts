import JSZip from 'jszip';
import { MAX_ASSET_COUNT, MAX_IMPORT_BYTES, MAX_PACKAGE_BYTES } from './constants';
import type { ImportIssue, PlayerAsset, PlayerCategory, PortableProject, ProjectDocument } from './types';

const supportedExtensions = new Set(['png', 'webp', 'jpg', 'jpeg']);

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const baseName = (name: string) => name.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Giocatore';

function inferCategory(name: string): PlayerCategory {
  const normalized = name.toLowerCase();
  if (normalized.includes('viola')) return 'viola';
  if (normalized.includes('bianc')) return 'bianchi';
  if (normalized.includes('portier')) return 'portiere';
  return 'personalizzati';
}

function humanize(name: string) {
  return baseName(name).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Il file non contiene dati leggibili.'));
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.readAsDataURL(blob);
  });
}

function imageAspect(src: string) {
  return new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth / image.naturalHeight);
    image.onerror = () => reject(new Error('Immagine corrotta o non supportata.'));
    image.src = src;
  });
}

async function hashBlob(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function assetFromBlob(blob: Blob, name: string): Promise<PlayerAsset> {
  if (blob.size > MAX_IMPORT_BYTES) throw new Error('Il file supera il limite di 12 MB.');
  const dataUrl = await toDataUrl(blob);
  const aspect = await imageAspect(dataUrl);
  const hash = await hashBlob(blob);
  const label = humanize(name);
  return { id: `imported-${hash.slice(0, 24)}`, name: label, shortName: label, category: inferCategory(name), src: dataUrl, aspect, hash, imported: true, bytes: blob.size };
}

export async function importPlayerFiles(files: File[], onProgress?: (done: number, total: number) => void) {
  const candidates: Array<{ name: string; blob: Blob }> = [];
  const issues: ImportIssue[] = [];

  for (const file of files) {
    if (extensionOf(file.name) === 'zip') {
      try {
        if (file.size > MAX_PACKAGE_BYTES) throw new Error('Il file ZIP supera il limite di 80 MB.');
        const archive = await JSZip.loadAsync(file, { checkCRC32: true });
        const entries = Object.values(archive.files).filter((entry) => !entry.dir && supportedExtensions.has(extensionOf(entry.name)) && !entry.name.split('/').some((part) => part === '..' || part.startsWith('.')));
        if (entries.length > MAX_ASSET_COUNT) throw new Error(`Il file ZIP contiene più di ${MAX_ASSET_COUNT} immagini.`);
        const declaredBytes = entries.reduce((sum, entry) => {
          const metadata = entry as typeof entry & { _data?: { uncompressedSize?: number } };
          return sum + (metadata._data?.uncompressedSize || 0);
        }, 0);
        if (declaredBytes > MAX_PACKAGE_BYTES) throw new Error('Il contenuto estratto supera il limite di 80 MB.');
        for (const entry of entries) candidates.push({ name: entry.name, blob: await entry.async('blob') });
      } catch (error) { issues.push({ file: file.name, message: error instanceof Error ? error.message : 'ZIP non valido o danneggiato.' }); }
    } else if (supportedExtensions.has(extensionOf(file.name))) {
      candidates.push({ name: file.name, blob: file });
    } else {
      issues.push({ file: file.name, message: 'Formato non supportato.' });
    }
  }

  if (candidates.length > MAX_ASSET_COUNT) throw new Error(`Puoi importare al massimo ${MAX_ASSET_COUNT} immagini alla volta.`);

  const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.blob.size, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('Il pacchetto supera il limite complessivo di 80 MB.');

  const assets: PlayerAsset[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try { assets.push(await assetFromBlob(candidate.blob, candidate.name)); }
    catch (error) { issues.push({ file: candidate.name, message: error instanceof Error ? error.message : 'Importazione non riuscita.' }); }
    onProgress?.(index + 1, candidates.length);
  }
  return { assets: [...new Map(assets.map((asset) => [asset.id, asset])).values()], issues };
}

export async function importField(file: File) {
  if (!supportedExtensions.has(extensionOf(file.name))) throw new Error('Il campo deve essere PNG, WebP o JPG.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('L’immagine supera il limite di 12 MB.');
  const src = await toDataUrl(file);
  await imageAspect(src);
  return { src, name: file.name };
}

export function createPortableProject(project: ProjectDocument, assets: PlayerAsset[]): PortableProject {
  const used = new Set(project.items.map((item) => item.assetId));
  return { kind: 'tactics-lab-project', version: 2, exportedAt: new Date().toISOString(), project, assets: assets.filter((asset) => used.has(asset.id) && asset.imported) };
}

export function parsePortableProject(value: unknown): PortableProject {
  const data = value as Partial<PortableProject>;
  if (data.kind !== 'tactics-lab-project' || data.version !== 2 || !data.project || !Array.isArray(data.project.items) || !Array.isArray(data.assets)) throw new Error('Progetto incompatibile o non valido.');
  return data as PortableProject;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
