'use client';

import Konva from 'konva';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { FIELD_HEIGHT, FIELD_WIDTH } from '@/lib/tactics/constants';
import { clampItemPosition, fitInside, intersects, snapItemPosition, type GuideState } from '@/lib/tactics/geometry';
import type { ExportOptions, FieldItem, PlayerAsset, ProjectDocument } from '@/lib/tactics/types';

export interface TacticalCanvasHandle {
  exportImage(options: ExportOptions): Promise<Blob>;
  thumbnail(): Promise<string>;
}

interface TacticalCanvasProps {
  project: ProjectDocument;
  assets: PlayerAsset[];
  selectedIds: Set<string>;
  scale: number;
  snapEnabled: boolean;
  onSelect: (ids: Set<string>) => void;
  onLiveItems: (items: FieldItem[]) => void;
  onTransaction: (before: FieldItem[], after: FieldItem[]) => void;
  onAssetError: (name: string) => void;
}

const cloneItems = (items: FieldItem[]) => items.map((item) => ({ ...item }));

function useCanvasImage(src: string, onError?: () => void) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => {
    let active = true;
    const next = new window.Image();
    next.onload = () => { if (active) setImage(next); };
    next.onerror = () => { if (active) onError?.(); };
    next.src = src;
    return () => { active = false; };
  }, [onError, src]);
  return image;
}

function FieldBackground({ project, onError }: { project: ProjectDocument; onError: () => void }) {
  const image = useCanvasImage(project.fieldSrc, onError);
  const rect = image ? fitInside(image.naturalWidth, image.naturalHeight, FIELD_WIDTH, FIELD_HEIGHT, project.fieldMode) : { x: 0, y: 0, width: FIELD_WIDTH, height: FIELD_HEIGHT };
  return <KonvaImage image={image} {...rect} listening={false} />;
}

function PlayerLabel({ item, rotated }: { item: FieldItem; rotated: boolean }) {
  if (!item.showLabel) return null;
  const label = `${item.number ? `${item.number} · ` : ''}${item.name}`;
  const width = Math.max(item.width, label.length * item.labelSize * .58 + 26);
  const height = item.labelSize + 18;
  const localY = item.labelPosition === 'above' ? -item.height / 2 - height - 10 : item.height / 2 + 10;
  const content = <><Rect x={-width / 2} y={0} width={width} height={height} cornerRadius={7} fill={item.labelColor} opacity={.92} /><Text x={-width / 2 + 8} y={8} width={width - 16} height={item.labelSize + 4} align="center" fontFamily="Inter, Arial" fontStyle="bold" fontSize={item.labelSize} fill={item.textColor} text={label} /></>;
  if (rotated) return <Group y={localY}>{content}</Group>;
  const centerY = item.y + item.height / 2 + localY;
  return <Group x={item.x + item.width / 2} y={centerY}>{content}</Group>;
}

const TacticalCanvas = forwardRef<TacticalCanvasHandle, TacticalCanvasProps>(function TacticalCanvas({ project, assets, selectedIds, scale, snapEnabled, onSelect, onLiveItems, onTransaction, onAssetError }, ref) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Group>());
  const liveItems = useRef(project.items);
  const transactionStart = useRef<FieldItem[] | null>(null);
  const dragOrigins = useRef(new Map<string, { x: number; y: number }>());
  const selectionOrigin = useRef<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number }>();
  const [guides, setGuides] = useState<GuideState>({});
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  useEffect(() => { liveItems.current = project.items; }, [project.items]);
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    transformer.nodes([...selectedIds].map((id) => nodes.current.get(id)).filter((node): node is Konva.Group => Boolean(node)));
    transformer.getLayer()?.batchDraw();
  }, [project.items, selectedIds]);

  useImperativeHandle(ref, () => ({
    async exportImage(options) {
      const stage = stageRef.current;
      if (!stage) throw new Error('L’area di lavoro non è ancora pronta.');
      const baseWidth = options.width;
      let baseHeight = options.height;
      if (options.fit === 'field') baseHeight = Math.round(baseWidth * FIELD_HEIGHT / FIELD_WIDTH);
      const outputWidth = Math.round(baseWidth * options.scale);
      const outputHeight = Math.round(baseHeight * options.scale);
      if (outputWidth * outputHeight > 60_000_000) throw new Error('La risoluzione richiesta è troppo grande per questo dispositivo.');
      const renderRatio = Math.max(outputWidth / FIELD_WIDTH, outputHeight / FIELD_HEIGHT, 1);
      const transformer = transformerRef.current;
      const wasVisible = transformer?.visible();
      transformer?.visible(false);
      stage.draw();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const source = stage.toCanvas({ pixelRatio: renderRatio });
      if (wasVisible) transformer?.visible(true);
      stage.draw();

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Il browser non può creare l’immagine.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#0b120d';
      context.fillRect(0, 0, outputWidth, outputHeight);
      const placement = fitInside(source.width, source.height, outputWidth, outputHeight, options.fit === 'cover' ? 'cover' : 'contain');
      context.drawImage(source, placement.x, placement.y, placement.width, placement.height);
      const mime = options.format === 'png' ? 'image/png' : 'image/jpeg';
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Esportazione non riuscita.')), mime, options.quality));
    },
    async thumbnail() {
      const stage = stageRef.current;
      if (!stage) return '';
      const transformer = transformerRef.current;
      const wasVisible = transformer?.visible();
      transformer?.visible(false);
      stage.draw();
      const value = stage.toDataURL({ pixelRatio: 480 / FIELD_WIDTH, mimeType: 'image/jpeg', quality: .72 });
      if (wasVisible) transformer?.visible(true);
      stage.draw();
      return value;
    },
  }), []);

  function pointerPosition() {
    return stageRef.current?.getPointerPosition() || { x: 0, y: 0 };
  }

  function startSelection(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (event.target !== event.target.getStage()) return;
    const position = pointerPosition();
    selectionOrigin.current = position;
    setSelectionRect({ ...position, width: 0, height: 0 });
    if (!('shiftKey' in event.evt) || !event.evt.shiftKey) onSelect(new Set());
  }

  function moveSelection() {
    const origin = selectionOrigin.current;
    if (!origin) return;
    const position = pointerPosition();
    setSelectionRect({ x: Math.min(origin.x, position.x), y: Math.min(origin.y, position.y), width: Math.abs(position.x - origin.x), height: Math.abs(position.y - origin.y) });
  }

  function finishSelection(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!selectionOrigin.current || !selectionRect) { selectionOrigin.current = null; return; }
    const matched = project.items.filter((item) => intersects(selectionRect, { x: item.x, y: item.y, width: item.width, height: item.height })).map((item) => item.id);
    const next = 'shiftKey' in event.evt && event.evt.shiftKey ? new Set([...selectedIds, ...matched]) : new Set(matched);
    onSelect(next);
    selectionOrigin.current = null;
    setSelectionRect(undefined);
  }

  function selectItem(event: KonvaEventObject<MouseEvent | TouchEvent>, id: string) {
    event.cancelBubble = true;
    const multi = 'shiftKey' in event.evt && event.evt.shiftKey;
    if (!multi) { onSelect(new Set([id])); return; }
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelect(next);
  }

  function startDrag(item: FieldItem) {
    if (!selectedIds.has(item.id)) onSelect(new Set([item.id]));
    const activeIds = selectedIds.has(item.id) ? selectedIds : new Set([item.id]);
    transactionStart.current = cloneItems(liveItems.current);
    dragOrigins.current = new Map(liveItems.current.filter((entry) => activeIds.has(entry.id)).map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
  }

  function moveDrag(event: KonvaEventObject<DragEvent>, item: FieldItem) {
    const node = event.target as Konva.Group;
    const origin = dragOrigins.current.get(item.id);
    if (!origin) return;
    const proposed = { x: node.x() - item.width / 2, y: node.y() - item.height / 2 };
    const snapping = snapEnabled && !event.evt.shiftKey
      ? snapItemPosition(item, liveItems.current.filter((entry) => entry.id !== item.id), proposed.x, proposed.y)
      : { ...clampItemPosition(item, proposed.x, proposed.y), guides: {} };
    setGuides(snapping.guides);
    const dx = snapping.x - origin.x;
    const dy = snapping.y - origin.y;
    const next = liveItems.current.map((entry) => {
      const entryOrigin = dragOrigins.current.get(entry.id);
      if (!entryOrigin || entry.locked) return entry;
      const clamped = clampItemPosition(entry, entryOrigin.x + dx, entryOrigin.y + dy);
      return { ...entry, ...clamped };
    });
    liveItems.current = next;
    onLiveItems(next);
  }

  function finishDrag() {
    setGuides({});
    if (!transactionStart.current) return;
    onTransaction(transactionStart.current, liveItems.current);
    transactionStart.current = null;
  }

  function finishTransform() {
    const before = transactionStart.current || cloneItems(liveItems.current);
    const next = liveItems.current.map((item) => {
      if (!selectedIds.has(item.id)) return item;
      const node = nodes.current.get(item.id);
      if (!node) return item;
      const width = Math.max(60, item.width * Math.abs(node.scaleX()));
      const height = Math.max(60, item.height * Math.abs(node.scaleY()));
      const transformed = { ...item, width, height, rotation: node.rotation(), x: node.x() - width / 2, y: node.y() - height / 2 };
      node.scale({ x: 1, y: 1 });
      return { ...transformed, ...clampItemPosition(transformed, transformed.x, transformed.y) };
    });
    liveItems.current = next;
    onTransaction(before, next);
    transactionStart.current = null;
  }

  return (
    <div className="tl-stage-shell" style={{ width: FIELD_WIDTH * scale, height: FIELD_HEIGHT * scale }} data-testid="canvas-shell">
      <div className="tl-konva-scale" style={{ width: FIELD_WIDTH, height: FIELD_HEIGHT, transform: `scale(${scale})` }}>
        <Stage ref={stageRef} width={FIELD_WIDTH} height={FIELD_HEIGHT} onMouseDown={startSelection} onTouchStart={startSelection} onMouseMove={moveSelection} onTouchMove={moveSelection} onMouseUp={finishSelection} onTouchEnd={finishSelection}>
          <Layer>
            <Rect width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="#0b120d" listening={false} />
            <FieldBackground project={project} onError={() => onAssetError(project.fieldName)} />
          </Layer>
          <Layer>
            {project.items.map((item) => {
              const asset = assetsById.get(item.assetId);
              return asset ? <PlayerNode key={item.id} item={item} asset={asset} selected={selectedIds.has(item.id)} register={(node) => { if (node) nodes.current.set(item.id, node); else nodes.current.delete(item.id); }} onSelect={selectItem} onDragStart={startDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onError={() => onAssetError(asset.name)} /> : null;
            })}
            {project.items.filter((item) => item.showLabel && !item.rotateLabel).map((item) => <PlayerLabel key={`label-${item.id}`} item={item} rotated={false} />)}
            {guides.x !== undefined && <Line points={[guides.x, 0, guides.x, FIELD_HEIGHT]} stroke="#d5ff74" strokeWidth={3} dash={[12, 10]} listening={false} />}
            {guides.y !== undefined && <Line points={[0, guides.y, FIELD_WIDTH, guides.y]} stroke="#d5ff74" strokeWidth={3} dash={[12, 10]} listening={false} />}
            {selectionRect && <Rect {...selectionRect} fill="rgba(200,250,91,.12)" stroke="#d5ff74" strokeWidth={2} dash={[10, 8]} listening={false} />}
            <Transformer ref={transformerRef} rotateEnabled enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} keepRatio borderStroke="#d5ff74" anchorFill="#d5ff74" anchorStroke="#182018" anchorSize={18} rotateAnchorOffset={40} flipEnabled={false} boundBoxFunc={(oldBox, newBox) => newBox.width < 60 || newBox.height < 60 ? oldBox : newBox} onTransformStart={() => { transactionStart.current = cloneItems(liveItems.current); }} onTransformEnd={finishTransform} />
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

function PlayerNode({ item, asset, selected, register, onSelect, onDragStart, onDragMove, onDragEnd, onError }: { item: FieldItem; asset: PlayerAsset; selected: boolean; register: (node: Konva.Group | null) => void; onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, id: string) => void; onDragStart: (item: FieldItem) => void; onDragMove: (event: KonvaEventObject<DragEvent>, item: FieldItem) => void; onDragEnd: () => void; onError: () => void }) {
  const image = useCanvasImage(asset.src, onError);
  return (
    <Group ref={register} x={item.x + item.width / 2} y={item.y + item.height / 2} width={item.width} height={item.height} rotation={item.rotation} draggable={!item.locked} onClick={(event) => onSelect(event, item.id)} onTap={(event) => onSelect(event, item.id)} onDragStart={() => onDragStart(item)} onDragMove={(event) => onDragMove(event, item)} onDragEnd={onDragEnd}>
      <KonvaImage image={image} x={-item.width / 2} y={-item.height / 2} width={item.width} height={item.height} shadowColor="black" shadowBlur={selected ? 12 : 7} shadowOpacity={.26} />
      {item.rotateLabel && <PlayerLabel item={item} rotated />}
      {item.locked && selected && <Text x={-16} y={-16} width={32} height={32} align="center" verticalAlign="middle" text="●" fill="#d5ff74" fontSize={25} />}
    </Group>
  );
}

export default TacticalCanvas;
