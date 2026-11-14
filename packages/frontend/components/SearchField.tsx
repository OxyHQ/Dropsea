/**
 * The toolbar's search field. Where the platform searches its index for
 * Dropsea (`tokens` given), it is Finder's: as a word is typed, a menu under
 * the field offers the kinds, tags and dates whose names start with it, and
 * the name itself ("Name matches: …"); ↓ and ↑ go through them, Return or a
 * press chooses one, which becomes a token in the field ("Kind: PDF") and
 * takes the word out of the text, and Escape closes the menu. A token goes
 * with its ×, or Backspace at the start of the text; the clear button clears
 * the text and the tokens. Elsewhere it is a field of words alone.
 *
 * The menu is drawn in the window, under the field, never in a popup of the
 * platform's own: such a popup takes the keyboard while it is open (OxyOS ADR
 * 0001, input grabs), and the person goes on typing in the field with the menu
 * shown, as in Finder. A press on a row keeps the caret in the field.
 */
import type { PlatformSearchToken } from '@oxy.so/bloom/platform-surface';
import { useWindowKeys } from '@oxy.so/bloom/kbd';
import { Portal } from '@oxy.so/bloom/portal';
import { Search } from '@oxy.so/bloom/search';
import { Surface } from '@oxy.so/bloom/surface';
import { Text } from '@oxy.so/bloom/typography';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useLocalTagNames } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import {
  type SearchSuggestion,
  searchSuggestions,
  textAfterChoosing,
  tokenKey,
  tokenLabel,
  withoutToken,
  withToken,
} from '@/lib/search';
import { tagSuggestions } from '@/lib/tags';

/** The menu's narrowest, wider than the toolbar's field as Finder's is. */
const MENU_MIN_WIDTH = 260;
/** Between the field and the menu, and the menu and the window's edge. */
const MENU_GAP = 4;
const WINDOW_MARGIN = 8;

/**
 * On the web a press on a row would take the focus from the field, which
 * closes the menu before the press lands: the row keeps it where it is.
 */
const KEEPS_FOCUS =
  Platform.OS === 'web'
    ? { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() }
    : {};

interface FieldFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function SearchField({
  value,
  onValueChange,
  tokens,
  onTokensChange,
  placeholder,
  isAutoFocused,
  focusRequest,
  onBlur,
}: {
  value: string;
  onValueChange: (text: string) => void;
  /** The filters chosen, where the platform's search takes them; null for a field of words alone. */
  tokens: readonly PlatformSearchToken[] | null;
  onTokensChange: (tokens: readonly PlatformSearchToken[]) => void;
  placeholder: string;
  isAutoFocused: boolean;
  /** Rises at each Edit › Find…: the field takes the keyboard, its text selected to type over. */
  focusRequest: number;
  onBlur: () => void;
}) {
  const { strings } = useLocale();
  const words = strings.searching;
  const { definitions } = useTagDefinitions();
  const localTagNames = useLocalTagNames(tokens !== null);
  const windowSize = useWindowDimensions();
  const field = useRef<ComponentRef<typeof View>>(null);
  const input = useRef<ComponentRef<typeof Search>>(null);
  // A request made before the field was there (a narrow toolbar's button) is its autofocus's.
  const handledFocus = useRef(focusRequest);
  useEffect(() => {
    if (focusRequest === handledFocus.current) return;
    handledFocus.current = focusRequest;
    input.current?.focus();
    input.current?.setSelection(0, value.length);
  }, [focusRequest, value.length]);
  const [frame, setFrame] = useState<FieldFrame | null>(null);
  const [isFocused, setFocused] = useState(false);
  // Escape (or Return on no row) closes the menu until the text changes.
  const [isDismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = tokens
    ? searchSuggestions(value, {
        words,
        tagNames: tagSuggestions(definitions, localTagNames),
        chosen: tokens,
      })
    : [];
  const isMenuOpen =
    tokens !== null && isFocused && !isDismissed && frame !== null && suggestions.length > 0;
  const active = activeIndex < suggestions.length ? activeIndex : -1;

  const measure = () => {
    field.current?.measureInWindow((x, y, width, height) => setFrame({ x, y, width, height }));
  };
  const choose = (suggestion: SearchSuggestion) => {
    if (!tokens) return;
    onTokensChange(withToken(tokens, suggestion.token));
    onValueChange(textAfterChoosing(value, suggestion));
    setActiveIndex(-1);
  };

  // The menu's keys, heard before the field's: the field keeps every other key.
  useWindowKeys(
    (event) => {
      switch (event.key) {
        case 'ArrowDown':
          setActiveIndex(active + 1 >= suggestions.length ? 0 : active + 1);
          return true;
        case 'ArrowUp':
          setActiveIndex(active <= 0 ? suggestions.length - 1 : active - 1);
          return true;
        case 'Enter': {
          const chosen = suggestions[active];
          if (chosen) choose(chosen);
          else setDismissed(true);
          return true;
        }
        case 'Escape':
          setDismissed(true);
          return true;
        default:
          return false;
      }
    },
    { enabled: isMenuOpen, whileTyping: true },
  );

  const menuWidth = Math.min(
    Math.max(frame?.width ?? 0, MENU_MIN_WIDTH),
    windowSize.width - 2 * WINDOW_MARGIN,
  );
  // Under the field, its end at the field's end (the field is at the toolbar's end), on screen.
  const menuLeft = frame
    ? Math.max(
        WINDOW_MARGIN,
        Math.min(frame.x + frame.width - menuWidth, windowSize.width - menuWidth - WINDOW_MARGIN),
      )
    : 0;

  const sections = (['kinds', 'tags', 'dates', 'name'] as const).flatMap((section) => {
    const rows = suggestions.flatMap((suggestion, index) =>
      suggestion.section === section ? [{ suggestion, index }] : [],
    );
    return rows.length > 0 ? [{ section, rows }] : [];
  });

  return (
    <View ref={field} onLayout={measure} collapsable={false}>
      <Search
        ref={input}
        size="sm"
        value={value}
        onChangeText={(text) => {
          onValueChange(text);
          setDismissed(false);
          setActiveIndex(-1);
          measure();
        }}
        tokens={tokens?.map((token) => ({ key: tokenKey(token), label: tokenLabel(token, words) }))}
        onRemoveToken={(key) => {
          if (tokens) onTokensChange(withoutToken(tokens, key));
        }}
        onClearText={() => {
          onValueChange('');
          if (tokens) onTokensChange([]);
        }}
        onFocus={() => {
          setFocused(true);
          measure();
        }}
        onBlur={() => {
          setFocused(false);
          setActiveIndex(-1);
          onBlur();
        }}
        autoFocus={isAutoFocused}
        placeholder={placeholder}
        accessibilityLabel={strings.search}
        // Said expanded while its suggestions show, and nothing otherwise: a Mac's search field is a
        // search field to VoiceOver, never a collapsed one.
        aria-expanded={tokens && isMenuOpen ? true : undefined}
        testID="search"
      />
      {isMenuOpen && frame ? (
        <Portal>
          <Surface
            radius={12}
            className="absolute p-1 shadow-dropdown"
            style={{ top: frame.y + frame.height + MENU_GAP, left: menuLeft, width: menuWidth }}
            role="menu"
            accessibilityLabel={words.suggestions}
            testID="search-suggestions"
          >
            {sections.map(({ section, rows }) => (
              <View key={section}>
                {section === 'name' ? (
                  sections.length > 1 ? (
                    <View className="mx-2 my-1 h-px bg-border" />
                  ) : null
                ) : (
                  <Text
                    variant="caption-1-semibold"
                    numberOfLines={1}
                    className="px-2 pt-1 pb-0.5 text-text-secondary"
                  >
                    {words.sections[section]}
                  </Text>
                )}
                {rows.map(({ suggestion, index }) => {
                  const isActive = index === active;
                  return (
                    <Pressable
                      key={tokenKey(suggestion.token)}
                      {...KEEPS_FOCUS}
                      role="menuitem"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={
                        section === 'name' ? suggestion.label : tokenLabel(suggestion.token, words)
                      }
                      onHoverIn={() => setActiveIndex(index)}
                      onPress={() => choose(suggestion)}
                      className={`h-7 flex-row items-center rounded-md px-2 ${isActive ? 'bg-primary' : ''}`}
                      testID={
                        section === 'name'
                          ? 'search-suggestion-name'
                          : `search-suggestion-${tokenKey(suggestion.token)}`
                      }
                    >
                      <Text
                        variant="body-2-regular"
                        numberOfLines={1}
                        className={isActive ? 'text-primary-foreground' : 'text-text-primary'}
                      >
                        {suggestion.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Surface>
        </Portal>
      ) : null}
    </View>
  );
}
