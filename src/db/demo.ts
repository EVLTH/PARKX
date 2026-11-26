// Données initiales. Les tâches marquées demo:true sont des EXEMPLES modifiables,
// elles ne représentent pas des travaux réellement réalisés.
import type { JournalEntry, Pcb, PlanVersion, Project, Settings, Task, TaskStatus } from './types';
import { REFERENCE_PLAN } from './types';
import { uid } from '../lib/utils';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

export function defaultProject(): Project {
  return {
    name: 'Maquette de parking PARKX',
    subtitle: 'Suivi de projet – Maquette de parking',
    description:
      "Conception et fabrication d'une maquette physique de parking (plaque 120 × 80 cm, 24 places dont 1 PMR) avec signalisation électronique par LED et 12 PCB.",
    startDate: iso(-14),
    endDate: iso(60),
    statusLabel: 'En cours de fabrication',
    docVersion: '1.0',
  };
}

export function defaultSettings(): Settings {
  return {
    currentUser: '',
    contributors: ['Matthias', 'Evan'],
    autoExport: { enabled: false, mode: 'download', intervalMin: 30, lastAt: '', fileName: '' },
    autoSnapshot: true,
    sidebarCollapsed: false,
  };
}

const meta = (who = 'Démo') => {
  const t = new Date().toISOString();
  return { createdAt: t, updatedAt: t, createdBy: who, updatedBy: who };
};

export function demoTasks(): Task[] {
  const steps: [string, string, TaskStatus, number, number][] = [
    ['Préparation de la plaque', 'Structure', 'validated', -14, -10],
    ['Traçage des dimensions', 'Structure', 'done', -10, -7],
    ['Réalisation des bordures', 'Structure', 'doing', -6, 3],
    ['Traçage des emplacements', 'Marquage', 'todo', 2, 8],
    ["Réalisation de l'allée centrale", 'Marquage', 'todo', 4, 10],
    ['Installation des places', 'Marquage', 'todo', 8, 15],
    ['Préparation des supports', 'Structure', 'waiting', 10, 18],
    ['Installation électronique', 'Électronique', 'todo', 18, 30],
    ['Câblage', 'Électronique', 'blocked', 25, 35],
    ['Tests électriques', 'Électronique', 'todo', 35, 42],
    ['Finitions', 'Finitions', 'todo', 42, 52],
    ['Validation finale', 'Validation', 'todo', 55, 60],
  ];
  return steps.map(([name, category, status, s, e], i) => ({
    id: uid('t-'),
    ...meta(),
    demo: true,
    name,
    description: 'Exemple de tâche (donnée de démonstration à adapter).',
    category,
    startDate: iso(s),
    dueDate: iso(e),
    doneDate: status === 'done' || status === 'validated' ? iso(e) : '',
    responsible: i % 2 ? 'Evan' : 'Matthias',
    status,
    priority: i === 8 ? 'critique' : i < 3 ? 'haute' : 'normale',
    comments: status === 'blocked' ? 'Exemple : en attente des connecteurs.' : '',
    photoIds: [],
    order: i,
  }));
}

/** Les 12 fiches PCB sont créées vides : aucune caractéristique électronique n'est inventée. */
export function emptyPcbs(): Pcb[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: 'pcb-' + (i + 1),
    ...meta('Système'),
    number: i + 1,
    reference: '',
    func: '',
    fabState: 'nc',
    wiringState: 'nc',
    power: '',
    connections: '',
    tests: '',
    lastTestDate: '',
    result: '',
    problems: '',
    comments: '',
    photoIds: [],
  }));
}

export function referenceVersion(): PlanVersion {
  return {
    id: 'v-reference',
    ...meta('Système'),
    label: 'v1 – Référence',
    comment: 'Plan de référence du cahier des charges (120 × 80 cm, 24 places, PMR en bas à gauche).',
    config: { ...REFERENCE_PLAN },
  };
}

export function demoJournal(): JournalEntry[] {
  return [
    {
      id: uid('j-'),
      ...meta(),
      demo: true,
      date: iso(-14),
      title: 'Exemple : choix de la plaque',
      description: 'Entrée de démonstration — décrire ici une décision réelle du projet.',
      author: 'Matthias',
      category: 'Décision',
      photoIds: [],
      docIds: [],
    },
  ];
}
