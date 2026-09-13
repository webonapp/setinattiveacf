import { FIELD_HEIGHT, FIELD_WIDTH } from './constants';
import type { FieldItem } from './types';

export interface GuideState { x?: number; y?: number }

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function rotatedHalfExtents(width: number, height: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return {
    x: Math.abs(Math.cos(radians)) * width / 2 + Math.abs(Math.sin(radians)) * height / 2,
    y: Math.abs(Math.sin(radians)) * width / 2 + Math.abs(Math.cos(radians)) * height / 2,
  };
}

export function clampItemPosition(item: FieldItem, proposedX: number, proposedY: number) {
  const extents = rotatedHalfExtents(item.width, item.height, item.rotation);
  const centerX = clamp(proposedX + item.width / 2, extents.x, FIELD_WIDTH - extents.x);
  const centerY = clamp(proposedY + item.height / 2, extents.y, FIELD_HEIGHT - extents.y);
  return { x: centerX - item.width / 2, y: centerY - item.height / 2 };
}

export function snapItemPosition(item: FieldItem, others: FieldItem[], proposedX: number, proposedY: number, threshold = 14) {
  const centerX = proposedX + item.width / 2;
  const centerY = proposedY + item.height / 2;
  const xTargets = [FIELD_WIDTH / 2, ...others.map((other) => other.x + other.width / 2)];
  const yTargets = [FIELD_HEIGHT / 2, ...others.map((other) => other.y + other.height / 2)];
  let snappedX = proposedX;
  let snappedY = proposedY;
  const guides: GuideState = {};
  const targetX = xTargets.find((target) => Math.abs(target - centerX) <= threshold);
  const targetY = yTargets.find((target) => Math.abs(target - centerY) <= threshold);
  if (targetX !== undefined) { snappedX += targetX - centerX; guides.x = targetX; }
  if (targetY !== undefined) { snappedY += targetY - centerY; guides.y = targetY; }
  return { ...clampItemPosition(item, snappedX, snappedY), guides };
}

export function fitInside(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, mode: 'contain' | 'cover') {
  const scale = mode === 'contain'
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

export function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
