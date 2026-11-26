import type { Pcb, Task } from '../db/types';

export const isDone = (t: Task) => t.status === 'done' || t.status === 'validated';

export function taskStats(tasks: Task[]) {
  const total = tasks.length;
  const done = tasks.filter(isDone).length;
  const doing = tasks.filter((t) => t.status === 'doing').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const waiting = tasks.filter((t) => t.status === 'waiting').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const today = new Date().toISOString().slice(0, 10);
  const late = tasks.filter((t) => !isDone(t) && t.dueDate && t.dueDate < today).length;
  const pct = total ? (done / total) * 100 : 0;
  return { total, done, doing, blocked, waiting, todo, remaining: total - done, late, pct };
}

export const pcbValidated = (p: Pcb) => p.fabState === 'valide';
