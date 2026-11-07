import { isCommandKey, useWindowKeys } from '@oxy.so/bloom/kbd';
import type { PlatformKeyEvent } from '@oxy.so/bloom/platform-surface';
import { useRef } from 'react';
import type { ViewMode } from '@/components/BrowserProvider';
import type { Commands } from '@/hooks/use-commands';
import type { Item } from '@/lib/items';
import { rowStep } from '@/lib/items-layout';
import {
  focusEnd,
  moveFocus,
  type Selection,
  selectOnly,
  typedSoFar,
  typeSelect,
} from '@/lib/selection';

/** What the file chooser's panel does for its keys. */
export interface ChooserKeys {
  /** ⌘↓: what a double click on the selected item does. */
  onActivate: () => void;
  /** Return: the panel's button, when it is enabled; false when it is not. */
  onConfirm: () => boolean;
  /** Escape, even in a field: the panel is cancelled. */
  onCancel: () => void;
}

/**
 * The window's own keys, after the menus' shortcuts (ADR 0021): the arrows
 * (across and down a grid, down a list, from group to group; Shift extends), Home and End, Return
 * to rename, Space for a preview, Escape to close it or cancel a rename, and a
 * name's first letters to select it (type-select). In the file chooser,
 * Return is the panel's button and Escape cancels it.
 */
export function useBrowserKeys({
  isEnabled,
  viewMode,
  getColumns,
  groupSizes,
  shown,
  onSelectionChange,
  commands,
  isPreviewOpen,
  onTogglePreview,
  isRenaming,
  onCancelRename,
  chooser,
}: {
  isEnabled: boolean;
  viewMode: ViewMode;
  /** The grid's columns now, read as a key moves down or up it. */
  getColumns: () => number;
  /** The groups `shown` runs in (View › Group By), by how many each has; one, ungrouped. */
  groupSizes: readonly number[];
  shown: readonly Item[];
  onSelectionChange: (change: (selection: Selection) => Selection) => void;
  commands: Commands;
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  isRenaming: boolean;
  onCancelRename: () => void;
  chooser: ChooserKeys | null;
}) {
  const typed = useRef({ text: '', at: 0 });
  const keys = shown.map((item) => item.key);

  const handleKey = (event: PlatformKeyEvent): boolean => {
    const isCommand = isCommandKey(event);
    const step = (by: number) => {
      onSelectionChange((selection) => moveFocus(selection, keys, by, event.shiftKey));
      return true;
    };
    // Up or down a row, into the next group's first row or the previous group's last, as Finder.
    const stepRow = (direction: 1 | -1) => {
      const columns = viewMode === 'list' ? 1 : getColumns();
      onSelectionChange((selection) => {
        const at = selection.focus ? keys.indexOf(selection.focus) : -1;
        const by = at < 0 ? direction : rowStep(groupSizes, columns, at, direction) - at;
        return moveFocus(selection, keys, by, event.shiftKey);
      });
      return true;
    };
    switch (event.key) {
      case 'ArrowDown':
        if (isCommand) {
          if (chooser) chooser.onActivate();
          else commands.open.run();
          return true;
        }
        return stepRow(1);
      case 'ArrowUp':
        if (isCommand) return false;
        return stepRow(-1);
      case 'ArrowRight':
        return viewMode === 'icons' ? step(1) : false;
      case 'ArrowLeft':
        return viewMode === 'icons' ? step(-1) : false;
      case 'Home':
      case 'End':
        onSelectionChange((selection) =>
          focusEnd(selection, keys, event.key === 'Home' ? 'first' : 'last', event.shiftKey),
        );
        return true;
      case 'Enter':
        if (chooser) return chooser.onConfirm();
        if (!commands.rename.isEnabled) return false;
        commands.rename.run();
        return true;
      case ' ':
        if (isCommand || event.altKey) return false;
        if (isPreviewOpen || commands.preview.isEnabled) onTogglePreview();
        return true;
      case 'Escape':
        if (!isPreviewOpen) return false;
        onTogglePreview();
        return true;
      default:
        break;
    }
    if (event.key.length === 1 && !isCommand && !event.altKey && !event.ctrlKey && !event.metaKey) {
      typed.current = typedSoFar(typed.current, event.key, Date.now());
      const found = typeSelect(shown, typed.current.text);
      if (found) onSelectionChange(() => selectOnly(found));
      return true;
    }
    return false;
  };

  useWindowKeys(handleKey, { enabled: isEnabled && !isRenaming });
  // Escape in the rename field cancels the rename, as Finder's does; nothing else is taken there.
  useWindowKeys(
    (event) => {
      if (event.key !== 'Escape') return false;
      onCancelRename();
      return true;
    },
    { enabled: isRenaming, whileTyping: true },
  );
  // Escape cancels the panel wherever the keys are, its name field and the search included.
  useWindowKeys(
    (event) => {
      if (event.key !== 'Escape' || !chooser) return false;
      chooser.onCancel();
      return true;
    },
    { enabled: isEnabled && chooser !== null && !isRenaming && !isPreviewOpen, whileTyping: true },
  );
}
