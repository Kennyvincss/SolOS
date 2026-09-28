import AsyncStorage from "@react-native-async-storage/async-storage";
import { EMPTY_LIBRARY, type Library } from "./lib/library";

const LIBRARY_KEY = "library.v1";
const TABS_KEY = "tabs.v1";

export interface SavedTabs {
  tabs: { id: string; url: string; title: string }[];
  activeId: string;
}

export async function loadLibrary(): Promise<Library> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_KEY);
    return raw ? { ...EMPTY_LIBRARY, ...(JSON.parse(raw) as Partial<Library>) } : EMPTY_LIBRARY;
  } catch {
    return EMPTY_LIBRARY;
  }
}

let libTimer: ReturnType<typeof setTimeout> | null = null;
export function saveLibrary(lib: Library) {
  if (libTimer) clearTimeout(libTimer);
  libTimer = setTimeout(() => AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(lib)).catch(() => {}), 400);
}

export async function loadTabs(): Promise<SavedTabs | null> {
  try {
    const raw = await AsyncStorage.getItem(TABS_KEY);
    const t = raw ? (JSON.parse(raw) as SavedTabs) : null;
    return t && Array.isArray(t.tabs) && t.tabs.length ? t : null;
  } catch {
    return null;
  }
}

let tabsTimer: ReturnType<typeof setTimeout> | null = null;
export function saveTabs(t: SavedTabs) {
  if (tabsTimer) clearTimeout(tabsTimer);
  tabsTimer = setTimeout(() => AsyncStorage.setItem(TABS_KEY, JSON.stringify(t)).catch(() => {}), 800);
}
