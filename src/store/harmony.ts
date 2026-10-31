// La note suit le projet : une seule évaluation par version, quel que soit le nombre de composants qui l'affichent.
import { harmonyReport, type HarmonyReport } from '../core/harmony';
import type { Project } from '../core/types';
import { getComps, useStore } from './store';

const cache = new WeakMap<Project, HarmonyReport>();

export function useHarmony(): HarmonyReport {
  const project = useStore(s => s.project);
  const hit = cache.get(project);
  if (hit) return hit;
  const report = harmonyReport(project, getComps());
  cache.set(project, report);
  return report;
}
