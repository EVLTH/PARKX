// Modèle de données PARKX — suivi de fabrication d'une maquette (pas de gestion de parking réel).

export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  demo?: boolean; // donnée de démonstration (non réalisée)
}

export type TaskStatus = 'todo' | 'doing' | 'waiting' | 'blocked' | 'done' | 'validated';
export type Priority = 'basse' | 'normale' | 'haute' | 'critique';

export interface Task extends Base {
  name: string;
  description: string;
  category: string;
  startDate: string;
  dueDate: string;
  doneDate: string;
  responsible: string;
  status: TaskStatus;
  priority: Priority;
  comments: string;
  photoIds: string[];
  order: number;
}

export type PcbFab = 'nc' | 'encours' | 'attente' | 'probleme' | 'termine' | 'valide';
export type PcbWiring = 'nc' | 'partiel' | 'branche' | 'probleme';
export type PcbResult = '' | 'ok' | 'partiel' | 'ko';

export interface Pcb extends Base {
  number: number; // 1..12
  reference: string;
  func: string;
  fabState: PcbFab;
  wiringState: PcbWiring;
  power: string;
  connections: string;
  tests: string;
  lastTestDate: string;
  result: PcbResult;
  problems: string;
  comments: string;
  photoIds: string[];
}

export interface Photo extends Base {
  name: string;
  description: string;
  date: string;
  category: string;
  taskId: string;
  mime: string;
  blob: Blob;
}

export interface DocFile extends Base {
  name: string;
  category: string;
  description: string;
  mime: string;
  size: number;
  blob: Blob;
}

export interface JournalEntry extends Base {
  date: string;
  title: string;
  description: string;
  author: string;
  category: string;
  photoIds: string[];
  docIds: string[];
}

export interface PlaceInfo extends Base {
  number: number;
  description: string;
  reference: string;
  observations: string;
  modifications: string;
  annotations: string;
  photoIds: string[];
}

export interface PlanConfig {
  plateW: number; // longueur plaque (cm)
  plateH: number; // largeur plaque (cm)
  border: number;
  aisle: number;
  placeDepth: number; // profondeur d'une place (12)
  placeWidth: number; // largeur place classique (7)
  pmrWidth: number; // largeur place PMR (10)
}

export interface PlanVersion extends Base {
  label: string;
  comment: string;
  config: PlanConfig;
}

export interface Activity {
  id: string;
  at: string;
  author: string;
  action: 'création' | 'modification' | 'suppression' | 'import' | 'restauration' | 'export' | 'info';
  entity: string;
  label: string;
}

export interface Snapshot {
  id: string;
  at: string;
  author: string;
  reason: string;
  payload: string; // JSON des données (hors fichiers binaires)
}

export interface Project {
  name: string;
  subtitle: string;
  description: string;
  startDate: string;
  endDate: string;
  statusLabel: string;
  docVersion: string;
}

export interface Settings {
  currentUser: string;
  contributors: string[];
  autoExport: {
    enabled: boolean;
    mode: 'file' | 'download';
    intervalMin: number;
    lastAt: string;
    fileName: string;
  };
  autoSnapshot: boolean;
  sidebarCollapsed: boolean;
}

export type LedState = 'libre' | 'occupe' | 'maintenance';

/** Sauvegardes faites depuis ce navigateur (non partagé avec l'équipe). */
export interface BackupInfo {
  lastExportAt: string;
  lastExportName: string;
  lastExportKind: '' | 'complète' | 'données seules' | 'automatique';
  lastImportAt: string;
  lastImportName: string;
}

/** Suivi du stockage de ce navigateur : date du premier enregistrement, nombre d'ouvertures. */
export interface StorageInfo {
  installedAt: string;
  opens: number;
  lastOpenAt: string;
  persistAsked: boolean;
}

export interface KV {
  project: Project;
  settings: Settings;
  planConfig: PlanConfig;
  led: Record<number, LedState>;
  backupInfo: BackupInfo;
  storageInfo: StorageInfo;
}

export interface Collections {
  tasks: Task;
  pcbs: Pcb;
  photos: Photo;
  documents: DocFile;
  journal: JournalEntry;
  places: PlaceInfo;
  planVersions: PlanVersion;
}
export type CollName = keyof Collections;
export const COLLECTIONS: CollName[] = ['tasks', 'pcbs', 'photos', 'documents', 'journal', 'places', 'planVersions'];
export const BLOB_COLLECTIONS: CollName[] = ['photos', 'documents'];

export const REFERENCE_PLAN: PlanConfig = {
  plateW: 120,
  plateH: 80,
  border: 7.5,
  aisle: 20,
  placeDepth: 12,
  placeWidth: 7,
  pmrWidth: 10,
};

export const SIGNATURE = 'by Matthias AS Evan G';
