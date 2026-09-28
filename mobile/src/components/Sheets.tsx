import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { bookmarkList, recentHistory, type Library } from "../lib/library";
import { hostOf } from "../lib/url";
import { C } from "./theme";

type IconName = keyof typeof Ionicons.glyphMap;

function Sheet({ visible, onClose, title, children, right }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          {right}
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={C.muted} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

export interface MenuItem {
  icon: IconName;
  label: string;
  hint?: string;
  disabled?: boolean;
  onPress: () => void;
}

export function MenuSheet({ visible, onClose, title, items }: { visible: boolean; onClose: () => void; title: string; items: MenuItem[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          disabled={it.disabled}
          style={({ pressed }) => [s.row, pressed && s.pressed, it.disabled && { opacity: 0.4 }]}
          onPress={() => {
            onClose();
            it.onPress();
          }}
        >
          <Ionicons name={it.icon} size={20} color={C.text} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowText}>{it.label}</Text>
            {it.hint ? <Text style={s.hint}>{it.hint}</Text> : null}
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

export function TabsSheet(p: {
  visible: boolean;
  onClose: () => void;
  tabs: { id: string; url: string; title: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}) {
  return (
    <Sheet
      visible={p.visible}
      onClose={p.onClose}
      title={`${p.tabs.length} ${p.tabs.length === 1 ? "tab" : "tabs"}`}
      right={
        <Pressable onPress={p.onNewTab} hitSlop={10} style={{ marginRight: 16 }} accessibilityLabel="New tab">
          <Ionicons name="add" size={24} color={C.accent} />
        </Pressable>
      }
    >
      <FlatList
        style={s.list}
        data={p.tabs}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [s.row, item.id === p.activeId && s.activeRow, pressed && s.pressed]} onPress={() => p.onSelect(item.id)}>
            <Ionicons name="globe-outline" size={18} color={C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowText} numberOfLines={1}>
                {item.title || hostOf(item.url) || item.url}
              </Text>
              <Text style={s.hint} numberOfLines={1}>
                {hostOf(item.url) ?? item.url}
              </Text>
            </View>
            <Pressable onPress={() => p.onCloseTab(item.id)} hitSlop={10} accessibilityLabel="Close tab">
              <Ionicons name="close-circle" size={20} color={C.faint} />
            </Pressable>
          </Pressable>
        )}
      />
    </Sheet>
  );
}

export function LibrarySheet(p: {
  visible: boolean;
  mode: "bookmarks" | "history";
  lib: Library;
  onClose: () => void;
  onOpen: (url: string) => void;
  onRemoveBookmark: (url: string) => void;
  onClearHistory: () => void;
}) {
  const rows: { url: string; title: string }[] = p.mode === "bookmarks" ? bookmarkList(p.lib) : recentHistory(p.lib, 200);
  const shown = rows;
  return (
    <Sheet
      visible={p.visible}
      onClose={p.onClose}
      title={p.mode === "bookmarks" ? "Bookmarks" : "History"}
      right={
        p.mode === "history" && rows.length ? (
          <Pressable
            style={{ marginRight: 16 }}
            hitSlop={10}
            onPress={() =>
              Alert.alert("Clear history?", "This removes browsing history from this phone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Clear", style: "destructive", onPress: p.onClearHistory },
              ])
            }
          >
            <Text style={{ color: C.down, fontSize: 14 }}>Clear</Text>
          </Pressable>
        ) : null
      }
    >
      {shown.length ? (
        <FlatList
          style={s.list}
          data={shown}
          keyExtractor={(r) => r.url}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [s.row, pressed && s.pressed]}
              onPress={() => p.onOpen(item.url)}
              onLongPress={
                p.mode === "bookmarks"
                  ? () =>
                      Alert.alert("Remove bookmark?", item.title, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => p.onRemoveBookmark(item.url) },
                      ])
                  : undefined
              }
            >
              <Ionicons name={p.mode === "bookmarks" ? "star" : "time-outline"} size={18} color={p.mode === "bookmarks" ? C.warn : C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowText} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={s.hint} numberOfLines={1}>
                  {hostOf(item.url) ?? item.url}
                </Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <Text style={s.empty}>{p.mode === "bookmarks" ? "No bookmarks yet. Use the menu to bookmark a page. Bookmarks from the desktop app appear here once you sign in." : "No history yet."}</Text>
      )}
      {p.mode === "bookmarks" && shown.length ? <Text style={s.footnote}>Long-press a bookmark to remove it.</Text> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 8, maxHeight: "80%" },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 },
  title: { flex: 1, color: C.text, fontSize: 16, fontWeight: "600" },
  list: { flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
  activeRow: { backgroundColor: C.surface2 },
  pressed: { backgroundColor: C.surface2 },
  rowText: { color: C.text, fontSize: 15 },
  hint: { color: C.muted, fontSize: 12, marginTop: 2 },
  empty: { color: C.muted, fontSize: 14, padding: 16, lineHeight: 20 },
  footnote: { color: C.faint, fontSize: 12, paddingHorizontal: 12, paddingTop: 6 },
});
