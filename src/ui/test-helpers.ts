/**
 * Shared store-reset helper for src/ui tests. Not itself a `*.test.*` file,
 * so vitest's `include` glob never collects it as a suite — plain test
 * utility module.
 */
import { DEFAULT_BRUSH_SETTINGS } from '../tools/tools';
import { createInitialStats, useCityStore } from './store';

export function resetCityStore(): void {
  useCityStore.setState({
    stats: createInitialStats(),
    selectedTool: 'select',
    overlay: null,
    speed: 1,
    notifications: [],
    preview: null,
    selectedBuilding: null,
    canUndo: false,
    canRedo: false,
    bound: null,
    toolFlags: { angleLock: false, straightMode: false },
    toolMode: 'lpath',
    previousMonthPopulation: createInitialStats().population,
    previousMonthFunds: createInitialStats().funds,
    selectionInfo: null,
    brushSettings: DEFAULT_BRUSH_SETTINGS,
  });
}
