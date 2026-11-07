/**
 * The pane's toolbar, Finder's: the sidebar's toggle, back and forward in one
 * island, the place's name, then the view and the search. It is Bloom's
 * `PageHeader` in the pane's `Screen`: where the platform has windows it is
 * the window's toolbar row, centred on the window's controls, a press on it
 * that no control takes moves the window, and with the sidebar hidden it
 * keeps the controls' room itself.
 */
import { AppShellMenuButton, useAppShell } from '@oxy.so/bloom/app-shell';
import { ButtonGroup, ButtonGroupItem } from '@oxy.so/bloom/button-group';
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiInformationLine,
  RiLayoutGridLine,
  RiListView,
  RiPriceTag3Line,
  RiSearchLine,
  RiSideBarLine,
  RiUploadCloud2Line,
} from '@oxy.so/bloom/icons';
import { PageHeader } from '@oxy.so/bloom/page-header';
import { Search } from '@oxy.so/bloom/search';
import { useState } from 'react';
import { View } from 'react-native';
import type { ViewMode } from '@/components/BrowserProvider';
import { useLocale } from '@/hooks/use-locale';

export function Toolbar({
  title,
  placeName,
  viewMode,
  onViewMode,
  search,
  onSearch,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  isPreviewShown,
  onPreviewShown,
  onUpload,
  onTags,
}: {
  title: string;
  /** The place shown, which the search looks in: the title, but in the file chooser, whose title is its own. */
  placeName: string;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  search: string;
  onSearch: (text: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  isPreviewShown: boolean;
  onPreviewShown: (isShown: boolean) => void;
  /** Uploading what the person picks, where that is how files reach Oxy Files here. */
  onUpload: (() => void) | null;
  /** The Tags button, Finder's: the selection's tags (null where nothing selected takes tags). */
  onTags: (() => void) | null;
}) {
  const { strings } = useLocale();
  const { navigationDock } = useAppShell();
  // A narrow toolbar keeps the search as its button, Finder's, until it is
  // pressed or holds text.
  const [isSearchOpen, setSearchOpen] = useState(false);
  return (
    <PageHeader
      testID="toolbar"
      onBack={null}
      scrim="none"
      leading={
        <>
          {/* The drawer's button on a phone; nothing while the sidebar is in the window. */}
          <AppShellMenuButton />
          <ButtonGroup accessibilityLabel={strings.appName}>
            {navigationDock.available ? (
              <ButtonGroupItem
                iconOnly
                leadingIcon={RiSideBarLine}
                accessibilityLabel={
                  navigationDock.hidden ? strings.menus.showSidebar : strings.menus.hideSidebar
                }
                onPress={navigationDock.toggleHidden}
                testID="sidebar-toggle"
              />
            ) : null}
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiArrowLeftSLine}
              accessibilityLabel={strings.back}
              disabled={!canGoBack}
              onPress={onBack}
              testID="back"
            />
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiArrowRightSLine}
              accessibilityLabel={strings.forward}
              disabled={!canGoForward}
              onPress={onForward}
              testID="forward"
            />
          </ButtonGroup>
        </>
      }
      title={title}
      actions={({ compact }) => (
        <>
          {onUpload ? (
            <ButtonGroup accessibilityLabel={strings.menus.uploadFiles}>
              <ButtonGroupItem
                iconOnly
                leadingIcon={RiUploadCloud2Line}
                accessibilityLabel={strings.menus.uploadFiles}
                onPress={onUpload}
                testID="upload"
              />
            </ButtonGroup>
          ) : null}
          <ButtonGroup accessibilityLabel={strings.tags.button}>
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiPriceTag3Line}
              accessibilityLabel={strings.tags.button}
              disabled={onTags === null}
              onPress={() => onTags?.()}
              testID="tags-button"
            />
          </ButtonGroup>
          <ButtonGroup accessibilityLabel={strings.view}>
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiLayoutGridLine}
              accessibilityLabel={strings.asIcons}
              selected={viewMode === 'icons'}
              onPress={() => onViewMode('icons')}
              testID="view-icons"
            />
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiListView}
              accessibilityLabel={strings.asList}
              selected={viewMode === 'list'}
              onPress={() => onViewMode('list')}
              testID="view-list"
            />
            <ButtonGroupItem
              iconOnly
              leadingIcon={RiInformationLine}
              accessibilityLabel={
                isPreviewShown ? strings.menus.hidePreview : strings.menus.showPreview
              }
              selected={isPreviewShown}
              onPress={() => onPreviewShown(!isPreviewShown)}
              testID="preview-toggle"
            />
          </ButtonGroup>
          {compact && !isSearchOpen && search === '' ? (
            <ButtonGroup accessibilityLabel={strings.search}>
              <ButtonGroupItem
                iconOnly
                leadingIcon={RiSearchLine}
                accessibilityLabel={strings.search}
                onPress={() => setSearchOpen(true)}
                testID="search-button"
              />
            </ButtonGroup>
          ) : (
            <View className={compact ? 'w-40' : 'w-52'}>
              <Search
                size="sm"
                value={search}
                onChangeText={onSearch}
                onClearText={() => onSearch('')}
                onBlur={() => setSearchOpen(false)}
                autoFocus={compact && isSearchOpen}
                placeholder={compact ? strings.search : strings.searchIn(placeName)}
                accessibilityLabel={strings.search}
                testID="search"
              />
            </View>
          )}
        </>
      )}
    />
  );
}
