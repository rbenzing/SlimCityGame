/**
 * Which view the city is drawn in. The city goes underground while the player
 * works on the pipes: the Water or Sewer lens, the pipe tool, the buried cable
 * tool, or any building of the Water tab in hand.
 */
import type { LensId, ToolId } from './types';

export function isUnderground(overlay: LensId | null, selectedTool: ToolId): boolean {
  return (
    overlay === 'watered' ||
    overlay === 'sewered' ||
    selectedTool === 'water.pipe' ||
    selectedTool === 'power.cable' ||
    selectedTool.startsWith('plop.water-')
  );
}
