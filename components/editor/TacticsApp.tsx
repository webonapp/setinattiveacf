'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  AlignCenter, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check,
  Copy, Download, FileJson, FolderOpen, ImagePlus, Layers, Lock, Maximize, Menu, Minus,
  MousePointer2, Plus, Redo2, RotateCcw, Save, Search, Trash2, Undo2, Unlock, Upload, Users, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createPortableProject, downloadBlob, importField, importPlayerFiles, parsePortableProject } from '@/lib/tactics/assets';
import { BUILTIN_ASSETS, createEmptyProject, createId, DEFAULT_FIELD, FIELD_HEIGHT, FIELD_WIDTH } from '@/lib/tactics/constants';
import { getLastProject, getProject, listAssets, listProjects, removeProject, saveAssets, saveProject, setLastProject } from '@/lib/tactics/db';
import { clamp } from '@/lib/tactics/geometry';
import type { ExportFit, ExportFormat, FieldItem, PlayerAsset, PlayerCategory, ProjectDocument } from '@/lib/tactics/types';
import type { TacticalCanvasHandle } from './TacticalCanvas';

const TacticalCanvas = dynamic(() => import('./TacticalCanvas'), { ssr: false, loading: () => <div className="tl-canvas-loading">Preparazione del campo…</div> });
const categoryLabel: Record<PlayerCategory, string> = { viola: 'Viola', bianchi: 'Bianchi', portiere: 'Portieri', personalizzati: 'Personalizzati' };
const cloneItems = (items: FieldItem[]) => items.map((item) => ({ ...item }));

type SaveState = 'loading' | 'dirty' | 'saving' | 'saved' | 'error';
type SortMode = 'updated' | 'name';
type ConfirmState = { title: string; message: string; actionLabel: string; destructive?: boolean; action: () => void } | null;

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="tl-icon-button" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function safeFilename(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'formazione';
}

function validateImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Immagine non disponibile'));
    image.src = src;
  });
}

export default function TacticsApp() {
  const [project, setProject] = useState<ProjectDocument>(() => createEmptyProject());
  const projectRef = useRef(project);
  const [assets, setAssets] = useState<PlayerAsset[]>(BUILTIN_ASSETS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<FieldItem[][]>([]);
  const [future, setFuture] = useState<FieldItem[][]>([]);
  const [clipboard, setClipboard] = useState<FieldItem[]>([]);
  const [filter, setFilter] = useState<'tutti' | PlayerCategory>('tutti');
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(.35);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [hydrated, setHydrated] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectList, setProjectList] = useState<ProjectDocument[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [toast, setToast] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importCategory, setImportCategory] = useState<'automatico' | PlayerCategory>('automatico');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportPreset, setExportPreset] = useState<'original' | 'fullhd' | 'custom'>('original');
  const [exportFit, setExportFit] = useState<ExportFit>('field');
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(1);
  const [exportWidth, setExportWidth] = useState(FIELD_WIDTH);
  const [exportHeight, setExportHeight] = useState(FIELD_HEIGHT);
  const [jpgQuality, setJpgQuality] = useState(.92);
  const [preview, setPreview] = useState('');
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<TacticalCanvasHandle>(null);
  const playerImportRef = useRef<HTMLInputElement>(null);
  const fieldImportRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<ProjectDocument>(project);
  const inputTransaction = useRef<FieldItem[] | null>(null);

  const scale = fitScale * zoom;
  const selectedItems = project.items.filter((item) => selectedIds.has(item.id));
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [storedAssets, session, storedProjects] = await Promise.all([listAssets(), getLastProject(), listProjects()]);
        if (!active) return;
        setAssets([...BUILTIN_ASSETS, ...storedAssets.filter((asset) => !BUILTIN_ASSETS.some((builtin) => builtin.id === asset.id))]);
        setProjectList(storedProjects);
        if (session?.value) {
          const restored = await getProject(session.value);
          if (restored && active) { setProject(restored); projectRef.current = restored; lastSavedRef.current = restored; }
        }
        setSaveState('saved');
      } catch (error) { if (active) { setSaveState('error'); setErrorMessage(error instanceof Error ? error.message : 'Impossibile aprire l’archivio locale.'); } }
      finally { if (active) setHydrated(true); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    const resize = () => setFitScale(Math.max(.08, Math.min((viewport.clientWidth - 44) / FIELD_WIDTH, (viewport.clientHeight - 44) / FIELD_HEIGHT)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [libraryOpen]);

  useEffect(() => {
    if (!hydrated) return;
    const statusTimer = window.setTimeout(() => setSaveState('dirty'), 0);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setSaveState('saving');
          const thumbnail = await canvasRef.current?.thumbnail();
          const saved = { ...projectRef.current, thumbnail: thumbnail || projectRef.current.thumbnail, updatedAt: Date.now() };
          await saveProject(saved);
          await setLastProject(saved.id);
          setSaveState('saved');
          setProjectList(await listProjects());
        } catch (error) { setSaveState('error'); setErrorMessage(error instanceof Error ? error.message : 'Salvataggio non riuscito.'); }
      })();
    }, 850);
    return () => { window.clearTimeout(statusTimer); window.clearTimeout(timer); };
  }, [hydrated, project.fieldMode, project.fieldName, project.fieldSrc, project.id, project.items, project.title]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const commitTransaction = useCallback((before: FieldItem[], after: FieldItem[]) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    setPast((history) => [...history, cloneItems(before)].slice(-80));
    setFuture([]);
    setProject((current) => ({ ...current, items: cloneItems(after) }));
  }, []);

  const commitItems = useCallback((items: FieldItem[]) => commitTransaction(projectRef.current.items, items), [commitTransaction]);
  const setItemsLive = useCallback((items: FieldItem[]) => setProject((current) => ({ ...current, items })), []);

  const undo = useCallback(() => {
    if (!past.length) return;
    const previous = cloneItems(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setFuture([cloneItems(projectRef.current.items), ...future].slice(0, 80));
    setProject((current) => ({ ...current, items: previous }));
  }, [future, past]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = cloneItems(future[0]);
    setFuture(future.slice(1));
    setPast([...past, cloneItems(projectRef.current.items)].slice(-80));
    setProject((current) => ({ ...current, items: next }));
  }, [future, past]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return;
    commitItems(projectRef.current.items.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  }, [commitItems, selectedIds]);

  const duplicateSelected = useCallback((source?: FieldItem[]) => {
    const chosen = source ?? projectRef.current.items.filter((item) => selectedIds.has(item.id));
    if (!chosen.length) return;
    const copies = chosen.map((item) => ({ ...item, id: createId(), x: clamp(item.x + 42, 0, FIELD_WIDTH - item.width), y: clamp(item.y + 42, 0, FIELD_HEIGHT - item.height) }));
    commitItems([...projectRef.current.items, ...copies]);
    setSelectedIds(new Set(copies.map((item) => item.id)));
  }, [commitItems, selectedIds]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select')) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (mod && key === 'a') { event.preventDefault(); setSelectedIds(new Set(projectRef.current.items.map((item) => item.id))); return; }
      if (mod && key === 'd') { event.preventDefault(); duplicateSelected(); return; }
      if (mod && key === 'c') { event.preventDefault(); setClipboard(cloneItems(selectedItems)); return; }
      if (mod && key === 'v') { event.preventDefault(); duplicateSelected(clipboard); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && selectedIds.size) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
        const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
        commitItems(projectRef.current.items.map((item) => selectedIds.has(item.id) && !item.locked ? { ...item, x: clamp(item.x + dx, 0, FIELD_WIDTH - item.width), y: clamp(item.y + dy, 0, FIELD_HEIGHT - item.height) } : item));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clipboard, commitItems, deleteSelected, duplicateSelected, redo, selectedIds, selectedItems, undo]);

  const visibleAssets = useMemo(() => assets.filter((asset) => {
    const query = search.trim().toLocaleLowerCase('it');
    return (filter === 'tutti' || asset.category === filter) && (!query || `${asset.name} ${asset.shortName}`.toLocaleLowerCase('it').includes(query));
  }), [assets, filter, search]);

  function makeItem(asset: PlayerAsset, x = FIELD_WIDTH / 2, y = FIELD_HEIGHT / 2): FieldItem {
    const width = asset.category === 'portiere' ? 190 : 170;
    const height = width / asset.aspect;
    return { id: createId(), assetId: asset.id, x: clamp(x - width / 2, 0, FIELD_WIDTH - width), y: clamp(y - height / 2, 0, FIELD_HEIGHT - height), width, height, rotation: 0, name: categoryLabel[asset.category], number: '', showLabel: false, labelSize: 26, labelColor: '#07100b', textColor: '#ffffff', labelPosition: 'below', rotateLabel: false, locked: false };
  }

  function addAsset(assetId: string, x?: number, y?: number) {
    const asset = assetById.get(assetId);
    if (!asset) return;
    const item = makeItem(asset, x, y);
    commitItems([...projectRef.current.items, item]);
    setSelectedIds(new Set([item.id]));
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const assetId = event.dataTransfer.getData('application/x-tactics-player');
    const rect = stageShellRef.current?.getBoundingClientRect();
    if (!assetId || !rect) return;
    addAsset(assetId, (event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
  }

  function updateSelected(patch: Partial<FieldItem>, live = false) {
    const next = projectRef.current.items.map((item) => selectedIds.has(item.id) ? { ...item, ...patch } : item);
    if (live) setItemsLive(next); else commitItems(next);
  }

  function beginInputTransaction() { inputTransaction.current = cloneItems(projectRef.current.items); }
  function finishInputTransaction() {
    if (!inputTransaction.current) return;
    commitTransaction(inputTransaction.current, projectRef.current.items);
    inputTransaction.current = null;
  }

  function moveLayer(direction: 'front' | 'back' | 'forward' | 'backward') {
    const current = cloneItems(projectRef.current.items);
    if (direction === 'front' || direction === 'back') {
      const chosen = current.filter((item) => selectedIds.has(item.id));
      const other = current.filter((item) => !selectedIds.has(item.id));
      commitItems(direction === 'front' ? [...other, ...chosen] : [...chosen, ...other]);
      return;
    }
    const step = direction === 'forward' ? 1 : -1;
    const ordered = step > 0 ? current : current.reverse();
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      if (selectedIds.has(ordered[index].id) && !selectedIds.has(ordered[index + 1].id)) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
    }
    commitItems(step > 0 ? ordered : ordered.reverse());
  }

  function requestConfirm(state: NonNullable<ConfirmState>) { setConfirmState(state); }

  function clearField() {
    if (!project.items.length) return;
    requestConfirm({ title: 'Cancellare la formazione?', message: 'Tutti i giocatori verranno rimossi. Potrai comunque usare Annulla.', actionLabel: 'Cancella tutto', destructive: true, action: () => { commitItems([]); setSelectedIds(new Set()); } });
  }

  function restoreSavedFormation() {
    const snapshot = lastSavedRef.current;
    const currentContent = { title: project.title, items: project.items, fieldSrc: project.fieldSrc, fieldMode: project.fieldMode };
    const savedContent = { title: snapshot.title, items: snapshot.items, fieldSrc: snapshot.fieldSrc, fieldMode: snapshot.fieldMode };
    if (JSON.stringify(currentContent) === JSON.stringify(savedContent)) { setToast('La composizione coincide già con l’ultimo salvataggio'); return; }
    requestConfirm({
      title: 'Ripristinare la versione salvata?',
      message: 'Le modifiche successive all’ultimo salvataggio manuale verranno sostituite.',
      actionLabel: 'Ripristina formazione',
      action: () => {
        const restored = { ...snapshot, items: cloneItems(snapshot.items), updatedAt: Date.now() };
        setProject(restored); projectRef.current = restored; setSelectedIds(new Set()); setPast([]); setFuture([]); setToast('Formazione ripristinata');
      },
    });
  }

  function newProject() {
    const create = () => { const next = createEmptyProject(); setProject(next); projectRef.current = next; lastSavedRef.current = next; setSelectedIds(new Set()); setPast([]); setFuture([]); };
    if (!project.items.length) create();
    else requestConfirm({ title: 'Nuova composizione?', message: 'La composizione attuale è salvata automaticamente e resterà tra i progetti.', actionLabel: 'Crea nuova', action: create });
  }

  async function manualSave(overwrite = false) {
    const title = project.title.trim() || 'Composizione senza titolo';
    const duplicate = projectList.find((entry) => entry.id !== project.id && entry.title.toLocaleLowerCase('it') === title.toLocaleLowerCase('it'));
    if (duplicate && !overwrite) {
      requestConfirm({ title: 'Titolo già utilizzato', message: `Esiste già “${title}”. Conferma per sovrascriverlo, oppure annulla e cambia titolo.`, actionLabel: 'Sovrascrivi', action: () => { const replacement = { ...projectRef.current, id: duplicate.id, title }; projectRef.current = replacement; setProject(replacement); void manualSave(true); } });
      return;
    }
    try {
      setSaveState('saving');
      const thumbnail = await canvasRef.current?.thumbnail();
      const saved = { ...projectRef.current, title, updatedAt: Date.now(), thumbnail: thumbnail || project.thumbnail };
      await saveProject(saved); await setLastProject(saved.id); lastSavedRef.current = saved; setProject(saved); setSaveState('saved'); setProjectList(await listProjects()); setToast('Progetto salvato');
    } catch (error) { setSaveState('error'); setErrorMessage(error instanceof Error ? error.message : 'Salvataggio non riuscito.'); }
  }

  async function openProject(next: ProjectDocument) {
    setProject(next); projectRef.current = next; lastSavedRef.current = next; setPast([]); setFuture([]); setSelectedIds(new Set()); await setLastProject(next.id); setProjectsOpen(false); setToast('Progetto aperto');
  }

  function duplicateProject(entry: ProjectDocument) {
    const copy = { ...entry, id: createId('project'), title: `${entry.title} — copia`, createdAt: Date.now(), updatedAt: Date.now(), items: cloneItems(entry.items) };
    void saveProject(copy).then(async () => { setProjectList(await listProjects()); setToast('Copia creata'); });
  }

  function deleteProject(entry: ProjectDocument) {
    requestConfirm({ title: 'Eliminare il progetto?', message: `“${entry.title}” verrà rimosso definitivamente da questo browser.`, actionLabel: 'Elimina', destructive: true, action: () => { void removeProject(entry.id).then(async () => { setProjectList(await listProjects()); if (entry.id === project.id) newProject(); }); } });
  }

  async function handlePlayerImport(files: File[]) {
    if (!files.length) return;
    setImporting(true); setImportProgress('Analisi dei file…');
    try {
      const result = await importPlayerFiles(files, (done, total) => setImportProgress(`Importazione ${done} di ${total}`));
      const imported = importCategory === 'automatico' ? result.assets : result.assets.map((asset) => ({ ...asset, category: importCategory }));
      await saveAssets(imported);
      setAssets((current) => [...new Map([...current, ...imported].map((asset) => [asset.id, asset])).values()]);
      setFilter(importCategory === 'automatico' ? 'tutti' : importCategory);
      setToast(`${imported.length} ${imported.length === 1 ? 'giocatore importato' : 'giocatori importati'}`);
      if (result.issues.length) setErrorMessage(result.issues.map((issue) => `${issue.file}: ${issue.message}`).join('\n'));
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Importazione non riuscita.'); }
    finally { setImporting(false); setImportProgress(''); if (playerImportRef.current) playerImportRef.current.value = ''; }
  }

  async function handleFieldImport(file?: File) {
    if (!file) return;
    try { const next = await importField(file); setProject((current) => ({ ...current, fieldSrc: next.src, fieldName: next.name })); setToast('Nuovo campo applicato'); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Campo non valido.'); }
    finally { if (fieldImportRef.current) fieldImportRef.current.value = ''; }
  }

  function resetField() { setProject((current) => ({ ...current, fieldSrc: DEFAULT_FIELD, fieldName: 'Campo drone originale', fieldMode: 'contain' })); }

  async function exportProjectJson(entry = project) {
    const portable = createPortableProject(entry, assets);
    downloadBlob(new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' }), `${safeFilename(entry.title)}.tactics.json`);
  }

  async function importProjectJson(file?: File) {
    if (!file) return;
    try {
      const portable = parsePortableProject(JSON.parse(await file.text()) as unknown);
      await saveAssets(portable.assets);
      const next = { ...portable.project, id: createId('project'), title: `${portable.project.title} — importato`, createdAt: Date.now(), updatedAt: Date.now() };
      await saveProject(next);
      setAssets((current) => [...new Map([...current, ...portable.assets].map((asset) => [asset.id, asset])).values()]);
      await openProject(next); setProjectList(await listProjects()); setToast('Progetto importato');
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'File progetto non valido.'); }
    finally { if (projectImportRef.current) projectImportRef.current.value = ''; }
  }

  async function openExport() {
    setPreview(await canvasRef.current?.thumbnail() || '');
    setExportOpen(true);
  }

  async function performExport() {
    try {
      const usedAssets = project.items.map((item) => assetById.get(item.assetId)).filter((asset): asset is PlayerAsset => Boolean(asset));
      const missing: string[] = [];
      await Promise.all([{ name: project.fieldName, src: project.fieldSrc }, ...usedAssets].map(async (entry) => { try { await validateImage(entry.src); } catch { missing.push(entry.name); } }));
      if (missing.length) throw new Error(`Impossibile caricare: ${[...new Set(missing)].join(', ')}`);
      let width = exportWidth; let height = exportHeight;
      if (exportPreset === 'original') { width = FIELD_WIDTH; height = FIELD_HEIGHT; }
      if (exportPreset === 'fullhd') { width = 1920; height = 1080; }
      const blob = await canvasRef.current?.exportImage({ format: exportFormat, width, height, scale: exportScale, quality: jpgQuality, fit: exportFit });
      if (!blob) throw new Error('L’area di lavoro non è pronta.');
      downloadBlob(blob, `${safeFilename(project.title)}-${width * exportScale}x${exportFit === 'field' ? Math.round(width * FIELD_HEIGHT / FIELD_WIDTH) * exportScale : height * exportScale}.${exportFormat}`);
      setExportOpen(false); setToast(`Immagine ${exportFormat.toUpperCase()} esportata`);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Esportazione non riuscita.'); }
  }

  const filteredProjects = useMemo(() => projectList.filter((entry) => entry.title.toLocaleLowerCase('it').includes(projectSearch.toLocaleLowerCase('it'))).sort((a, b) => sortMode === 'name' ? a.title.localeCompare(b.title, 'it') : b.updatedAt - a.updatedAt), [projectList, projectSearch, sortMode]);

  if (!hydrated) return <main className="tl-loading-screen"><Layers size={30} /><strong>Tactics Lab</strong><span>Recupero dell’ultima sessione…</span></main>;

  return (
    <main className={`tl-app ${libraryOpen ? '' : 'tl-library-closed'}`}>
      <header className="tl-topbar">
        <div className="tl-brand"><div className="tl-brand-mark"><Layers size={20} strokeWidth={2.7} /></div><div><strong>Tactics Lab</strong><span>Editor tattico</span></div></div>
        <div className="tl-project-title"><input aria-label="Titolo del progetto" value={project.title} onChange={(event) => setProject((current) => ({ ...current, title: event.target.value }))} /><span className={`tl-save-state is-${saveState}`}>{saveState === 'dirty' ? 'Modifiche non salvate' : saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato' : saveState === 'error' ? 'Errore' : 'Caricamento'}</span></div>
        <div className="tl-header-actions">
          <IconButton label="Annulla" disabled={!past.length} onClick={undo}><Undo2 size={18} /></IconButton><IconButton label="Ripristina" disabled={!future.length} onClick={redo}><Redo2 size={18} /></IconButton><span className="tl-divider" />
          <button className="tl-button tl-button-ghost" type="button" onClick={() => setProjectsOpen(true)}><FolderOpen size={17} /> Progetti</button>
          <button className="tl-button tl-button-ghost" type="button" onClick={() => void manualSave()}><Save size={17} /> Salva</button>
          <button className="tl-button tl-button-primary" type="button" onClick={() => void openExport()}><Download size={17} /> Esporta</button>
        </div>
      </header>

      <div className="tl-layout">
        <aside className="tl-library" aria-label="Libreria giocatori">
          <div className="tl-panel-heading"><div><p className="tl-eyebrow">Libreria</p><h1>Giocatori</h1></div><IconButton label="Chiudi libreria" onClick={() => setLibraryOpen(false)}><X size={18} /></IconButton></div>
          <p className="tl-instruction">Trascina un giocatore sul campo oppure toccalo per inserirlo al centro.</p>
          <div className="tl-import-strip"><button type="button" onClick={() => playerImportRef.current?.click()} disabled={importing}><Upload size={15} /> {importing ? importProgress : 'Importa ZIP o immagini'}</button><label>Categoria<select aria-label="Categoria dei nuovi giocatori" value={importCategory} onChange={(event) => setImportCategory(event.target.value as typeof importCategory)}><option value="automatico">Automatica</option><option value="viola">Viola</option><option value="bianchi">Bianchi</option><option value="portiere">Portieri</option><option value="personalizzati">Personalizzati</option></select></label><input ref={playerImportRef} className="tl-hidden-input" type="file" multiple accept=".zip,image/png,image/webp,image/jpeg" onChange={(event) => void handlePlayerImport([...event.target.files || []])} /></div>
          <label className="tl-search"><Search size={16} /><input aria-label="Cerca giocatore" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca giocatore" /></label>
          <div className="tl-filter-row">{(['tutti', 'viola', 'bianchi', 'portiere', 'personalizzati'] as const).map((value) => <button key={value} className={filter === value ? 'is-active' : ''} type="button" onClick={() => setFilter(value)}>{value === 'tutti' ? 'Tutti' : categoryLabel[value]}</button>)}</div>
          <div className="tl-player-grid">{visibleAssets.map((asset) => <button data-testid={`asset-${asset.id}`} className={`tl-player-card tl-${asset.category}`} key={asset.id} type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-tactics-player', asset.id); }} onClick={() => addAsset(asset.id)}><span className="tl-thumb"><Image src={asset.src} alt="" width={140} height={160} unoptimized draggable={false} /></span><strong>{asset.shortName}</strong><small>{categoryLabel[asset.category]}</small><span className="tl-add"><Plus size={14} /></span></button>)}</div>
        </aside>

        <section className="tl-workspace" aria-label="Area di composizione">
          <div className="tl-canvas-toolbar"><div className="tl-toolbar-group">{!libraryOpen && <IconButton label="Apri libreria" onClick={() => setLibraryOpen(true)}><Menu size={18} /></IconButton>}<IconButton label="Annulla" disabled={!past.length} onClick={undo}><Undo2 size={17} /></IconButton><IconButton label="Ripristina" disabled={!future.length} onClick={redo}><Redo2 size={17} /></IconButton><button className="tl-tool-text" type="button" onClick={newProject}><Plus size={16} /> Nuova</button><button className="tl-tool-text" type="button" onClick={restoreSavedFormation}><RotateCcw size={16} /> Versione salvata</button><button className="tl-tool-text" type="button" onClick={() => setSelectedIds(new Set(project.items.map((item) => item.id)))} disabled={!project.items.length}><MousePointer2 size={16} /> Seleziona tutto</button><button className="tl-tool-text" type="button" onClick={() => duplicateSelected()} disabled={!selectedIds.size}><Copy size={16} /> Duplica</button><button className="tl-tool-text tl-danger" type="button" onClick={deleteSelected} disabled={!selectedIds.size}><Trash2 size={16} /> Elimina</button><button className="tl-tool-text tl-danger" type="button" onClick={clearField} disabled={!project.items.length}><Trash2 size={16} /> Cancella tutto</button></div>
            <div className="tl-toolbar-group"><button className={`tl-tool-text ${snapEnabled ? 'is-active' : ''}`} type="button" onClick={() => setSnapEnabled((value) => !value)} title="Allineamento magnetico"><AlignCenter size={17} /> Snap</button><IconButton label="Impostazioni campo" onClick={() => setSettingsOpen(true)}><ImagePlus size={17} /></IconButton><IconButton label="Riduci zoom" onClick={() => setZoom((value) => clamp(value - .15, .4, 2.5))}><Minus size={17} /></IconButton><button className="tl-zoom-label" type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><IconButton label="Aumenta zoom" onClick={() => setZoom((value) => clamp(value + .15, .4, 2.5))}><Plus size={17} /></IconButton><IconButton label="Adatta allo schermo" onClick={() => setZoom(1)}><Maximize size={17} /></IconButton></div></div>
          <div className="tl-stage-viewport" ref={stageViewportRef} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={handleDrop}><div ref={stageShellRef} className="tl-stage-drop-target"><TacticalCanvas ref={canvasRef} project={project} assets={assets} selectedIds={selectedIds} scale={scale} snapEnabled={snapEnabled} onSelect={setSelectedIds} onLiveItems={setItemsLive} onTransaction={commitTransaction} onAssetError={(name) => setErrorMessage(`Impossibile caricare l’asset “${name}”.`)} /></div>{!project.items.length && <div className="tl-empty-hint tl-empty-hint-overlay"><Users size={23} /><div><strong>Inizia la composizione</strong><span>Trascina qui un giocatore dalla libreria</span></div></div>}</div>
          <div className="tl-statusbar"><span data-testid="player-count">{project.items.length} {project.items.length === 1 ? 'giocatore' : 'giocatori'} sul campo</span><span>Maiusc + clic per selezione multipla · Maiusc disattiva lo snap</span><span>{FIELD_WIDTH} × {FIELD_HEIGHT} px</span></div>
        </section>

        <aside className={`tl-inspector ${selectedIds.size ? 'is-visible' : ''}`} aria-label="Proprietà elemento"><div className="tl-panel-heading"><div><p className="tl-eyebrow">Proprietà</p><h2>{selectedItem ? 'Giocatore' : `${selectedIds.size} selezionati`}</h2></div><IconButton label="Deseleziona" onClick={() => setSelectedIds(new Set())}><X size={18} /></IconButton></div>{selectedItem ? <div className="tl-inspector-content"><div className="tl-selected-preview"><Image src={assetById.get(selectedItem.assetId)?.src || DEFAULT_FIELD} alt="" width={52} height={62} unoptimized /><div><strong>{assetById.get(selectedItem.assetId)?.name}</strong><span>{Math.round(selectedItem.width)} × {Math.round(selectedItem.height)} px</span></div></div>
          <label className="tl-field-label"><span>Nome</span><input value={selectedItem.name} onFocus={beginInputTransaction} onChange={(event) => updateSelected({ name: event.target.value }, true)} onBlur={finishInputTransaction} /></label><label className="tl-field-label"><span>Numero</span><input value={selectedItem.number} maxLength={3} onFocus={beginInputTransaction} onChange={(event) => updateSelected({ number: event.target.value }, true)} onBlur={finishInputTransaction} placeholder="—" /></label>
          <div className="tl-range-label"><span><label htmlFor="item-size"><b>Dimensione</b></label><output>{Math.round(selectedItem.width)} px</output></span><input id="item-size" type="range" min="60" max="520" value={selectedItem.width} onPointerDown={beginInputTransaction} onChange={(event) => { const width = Number(event.target.value); updateSelected({ width, height: width * selectedItem.height / selectedItem.width }, true); }} onPointerUp={finishInputTransaction} /></div>
          <div className="tl-range-label"><span><label htmlFor="item-rotation"><b>Rotazione</b></label><output>{Math.round(selectedItem.rotation)}°</output></span><input id="item-rotation" type="range" min="-180" max="180" value={selectedItem.rotation} onPointerDown={beginInputTransaction} onChange={(event) => updateSelected({ rotation: Number(event.target.value) }, true)} onPointerUp={finishInputTransaction} /></div>
          <div className="tl-label-options"><label>Posizione<select value={selectedItem.labelPosition} onChange={(event) => updateSelected({ labelPosition: event.target.value as FieldItem['labelPosition'] })}><option value="above">Sopra</option><option value="below">Sotto</option></select></label><label>Testo<input type="color" value={selectedItem.textColor} onChange={(event) => updateSelected({ textColor: event.target.value })} /></label><label>Sfondo<input type="color" value={selectedItem.labelColor} onChange={(event) => updateSelected({ labelColor: event.target.value })} /></label></div>
          <div className="tl-range-label"><span><label htmlFor="label-size"><b>Dimensione etichetta</b></label><output>{selectedItem.labelSize} px</output></span><input id="label-size" type="range" min="16" max="48" value={selectedItem.labelSize} onPointerDown={beginInputTransaction} onChange={(event) => updateSelected({ labelSize: Number(event.target.value) }, true)} onPointerUp={finishInputTransaction} /></div>
          <button className={`tl-toggle-row ${selectedItem.showLabel ? 'is-on' : ''}`} type="button" onClick={() => updateSelected({ showLabel: !selectedItem.showLabel })}><span>Mostra nome e numero</span><i>{selectedItem.showLabel && <Check size={13} />}</i></button><button className={`tl-toggle-row ${selectedItem.rotateLabel ? 'is-on' : ''}`} type="button" onClick={() => updateSelected({ rotateLabel: !selectedItem.rotateLabel })}><span>Ruota anche l’etichetta</span><i>{selectedItem.rotateLabel && <Check size={13} />}</i></button><button className={`tl-toggle-row ${selectedItem.locked ? 'is-on' : ''}`} type="button" onClick={() => updateSelected({ locked: !selectedItem.locked })}><span>{selectedItem.locked ? <Lock size={16} /> : <Unlock size={16} />} Blocca posizione</span><i>{selectedItem.locked && <Check size={13} />}</i></button>
          <div className="tl-section-title">Livelli</div><div className="tl-layer-grid"><button onClick={() => moveLayer('back')}><ArrowDownToLine size={15} /> Fondo</button><button onClick={() => moveLayer('backward')}><ArrowDown size={15} /> Indietro</button><button onClick={() => moveLayer('forward')}><ArrowUp size={15} /> Avanti</button><button onClick={() => moveLayer('front')}><ArrowUpToLine size={15} /> Primo piano</button></div><div className="tl-section-title">Azioni</div><div className="tl-split-buttons"><button type="button" onClick={() => duplicateSelected()}><Copy size={16} /> Duplica</button><button className="tl-action-danger" type="button" onClick={deleteSelected}><Trash2 size={16} /> Elimina</button></div></div> : selectedIds.size ? <div className="tl-multi-actions"><p>Le azioni vengono applicate ai {selectedIds.size} giocatori selezionati.</p><button onClick={() => updateSelected({ locked: true })}><Lock size={16} /> Blocca tutti</button><button onClick={() => duplicateSelected()}><Copy size={16} /> Duplica selezione</button><button className="tl-action-danger" onClick={deleteSelected}><Trash2 size={16} /> Elimina selezione</button></div> : <div className="tl-empty-inspector"><MousePointer2 size={24} /><p>Seleziona un giocatore per modificarlo.</p></div>}</aside>
      </div>

      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}><DialogContent className="tl-shadcn-dialog tl-projects-dialog" showCloseButton={false}><DialogHeader><p className="tl-eyebrow">Archivio IndexedDB</p><DialogTitle>Progetti salvati</DialogTitle><DialogDescription>Le composizioni rimangono su questo dispositivo.</DialogDescription></DialogHeader><div className="tl-dialog-tools"><label className="tl-search"><Search size={16} /><input aria-label="Cerca progetto" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Cerca progetto" /></label><select aria-label="Ordina progetti" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="updated">Più recenti</option><option value="name">Per nome</option></select><button onClick={() => projectImportRef.current?.click()}><Upload size={15} /> Importa JSON</button><input ref={projectImportRef} className="tl-hidden-input" type="file" accept="application/json,.json" onChange={(event) => void importProjectJson(event.target.files?.[0])} /></div><div className="tl-project-list">{filteredProjects.map((entry) => <article key={entry.id}>{entry.thumbnail ? <Image src={entry.thumbnail} alt="" width={96} height={52} unoptimized /> : <div className="tl-project-thumb"><Layers size={18} /></div>}<div><strong>{entry.title}</strong><span>{entry.items.length} giocatori · {new Date(entry.updatedAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}</span></div><button onClick={() => void openProject(entry)}>Apri</button><IconButton label="Duplica progetto" onClick={() => duplicateProject(entry)}><Copy size={15} /></IconButton><IconButton label="Esporta progetto JSON" onClick={() => void exportProjectJson(entry)}><FileJson size={15} /></IconButton><IconButton label="Elimina progetto" onClick={() => deleteProject(entry)}><Trash2 size={15} /></IconButton></article>)}{!filteredProjects.length && <div className="tl-modal-empty"><FolderOpen size={26} /><p>Nessun progetto trovato.</p></div>}</div></DialogContent></Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="tl-shadcn-dialog" showCloseButton={false}><DialogHeader><p className="tl-eyebrow">Sfondo</p><DialogTitle>Impostazioni campo</DialogTitle><DialogDescription>{project.fieldName}</DialogDescription></DialogHeader><div className="tl-settings-grid"><button onClick={() => fieldImportRef.current?.click()}><ImagePlus size={18} /><span><b>Sostituisci campo</b><small>PNG, WebP o JPG fino a 12 MB</small></span></button><button onClick={resetField}><RotateCcw size={18} /><span><b>Campo originale</b><small>Ripristina l’allegato fornito</small></span></button></div><label className="tl-choice-label">Adattamento<select value={project.fieldMode} onChange={(event) => setProject((current) => ({ ...current, fieldMode: event.target.value as ProjectDocument['fieldMode'] }))}><option value="contain">Contieni senza tagli</option><option value="cover">Riempi e ritaglia</option></select></label><input ref={fieldImportRef} className="tl-hidden-input" type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => void handleFieldImport(event.target.files?.[0])} /></DialogContent></Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="tl-shadcn-dialog tl-export-dialog" showCloseButton={false}><DialogHeader><p className="tl-eyebrow">Immagine finale</p><DialogTitle>Esporta composizione</DialogTitle><DialogDescription>Anteprima senza selezioni, guide o controlli.</DialogDescription></DialogHeader>{preview && <Image className="tl-export-preview-image" src={preview} alt="Anteprima della composizione" width={640} height={340} unoptimized />}<div className="tl-export-options"><fieldset><legend>Formato</legend><div className="tl-choice-grid"><button className={exportFormat === 'png' ? 'is-active' : ''} onClick={() => setExportFormat('png')}>PNG</button><button className={exportFormat === 'jpg' ? 'is-active' : ''} onClick={() => setExportFormat('jpg')}>JPG</button></div></fieldset><fieldset><legend>Risoluzione</legend><select value={exportPreset} onChange={(event) => setExportPreset(event.target.value as typeof exportPreset)}><option value="original">Originale · 2496 × 1326</option><option value="fullhd">Full HD · 1920 × 1080</option><option value="custom">Personalizzata</option></select>{exportPreset === 'custom' && <div className="tl-custom-size"><label>Larghezza<input type="number" min="320" max="7680" value={exportWidth} onChange={(event) => setExportWidth(Number(event.target.value))} /></label><span>×</span><label>Altezza<input type="number" min="240" max="4320" value={exportHeight} onChange={(event) => setExportHeight(Number(event.target.value))} /></label></div>}</fieldset><fieldset><legend>Adattamento</legend><select value={exportFit} onChange={(event) => setExportFit(event.target.value as ExportFit)}><option value="field">Tela proporzionale al campo</option><option value="contain">Campo completo con bande</option><option value="cover">Ritaglio centrale</option></select></fieldset><fieldset><legend>Scala</legend><div className="tl-choice-grid tl-choice-grid-3">{([1, 2, 4] as const).map((value) => <button key={value} className={exportScale === value ? 'is-active' : ''} onClick={() => setExportScale(value)}>{value}×</button>)}</div></fieldset>{exportFormat === 'jpg' && <div className="tl-range-label"><span><label htmlFor="jpg-quality"><b>Qualità JPG</b></label><output>{Math.round(jpgQuality * 100)}%</output></span><input id="jpg-quality" type="range" min="0.5" max="1" step=".01" value={jpgQuality} onChange={(event) => setJpgQuality(Number(event.target.value))} /></div>}</div><div className="tl-modal-footer"><button className="tl-button tl-button-ghost" onClick={() => setExportOpen(false)}>Annulla</button><button data-testid="download-image" className="tl-button tl-button-primary" onClick={() => void performExport()}><Download size={17} /> Scarica {exportFormat.toUpperCase()}</button></div></DialogContent></Dialog>

      <AlertDialog open={Boolean(confirmState)} onOpenChange={(open) => { if (!open) setConfirmState(null); }}><AlertDialogContent className="tl-alert-dialog"><AlertDialogHeader><AlertDialogTitle>{confirmState?.title}</AlertDialogTitle><AlertDialogDescription>{confirmState?.message}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction className={confirmState?.destructive ? 'tl-confirm-danger' : ''} onClick={() => { confirmState?.action(); setConfirmState(null); }}>{confirmState?.actionLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={Boolean(errorMessage)} onOpenChange={(open) => { if (!open) setErrorMessage(''); }}><DialogContent className="tl-shadcn-dialog tl-error-dialog"><DialogHeader><DialogTitle>Operazione non completata</DialogTitle><DialogDescription className="tl-error-copy">{errorMessage}</DialogDescription></DialogHeader></DialogContent></Dialog>
      {toast && <output className="tl-toast"><Check size={17} />{toast}</output>}
    </main>
  );
}
