export type PlayerCategory = 'viola' | 'bianchi' | 'portiere' | 'personalizzati';
export type FieldMode = 'contain' | 'cover';
export type LabelPosition = 'above' | 'below';
export type ExportFormat = 'png' | 'jpg';
export type ExportFit = 'contain' | 'cover' | 'field';

export interface PlayerAsset {
  id: string;
  name: string;
  shortName: string;
  category: PlayerCategory;
  src: string;
  aspect: number;
  hash?: string;
  imported: boolean;
  bytes?: number;
}

export interface FieldItem {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  name: string;
  number: string;
  showLabel: boolean;
  labelSize: number;
  labelColor: string;
  textColor: string;
  labelPosition: LabelPosition;
  rotateLabel: boolean;
  locked: boolean;
}

export interface ProjectDocument {
  id: string;
  title: string;
  items: FieldItem[];
  fieldSrc: string;
  fieldName: string;
  fieldMode: FieldMode;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export interface ImportIssue {
  file: string;
  message: string;
}

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  scale: 1 | 2 | 4;
  quality: number;
  fit: ExportFit;
}

export interface PortableProject {
  kind: 'tactics-lab-project';
  version: 2;
  exportedAt: string;
  project: ProjectDocument;
  assets: PlayerAsset[];
}
