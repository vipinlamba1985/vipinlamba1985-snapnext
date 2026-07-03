import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import { demoPhotos, galleryFilters } from "@/src/data/mocks";

const GRID_GAP = 4;
const GRID_COLS = 2;
const MOBILE_MAX_W = 480;

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const containerW = Math.min(winW, MOBILE_MAX_W);
  const cardW = (containerW - spacing.lg * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    let list = demoPhotos;
    if (activeFilter === "Favorites") list = list.filter((p) => p.favorite);
    if (activeFilter === "Videos") list = list.filter((p) => p.isVideo);
    if (activeFilter === "Screenshots") list = [];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.place.toLowerCase().includes(q) ||
          p.date.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeFilter, query]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleSelect = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const openMedia = (id: string) => {
    if (selectMode) {
      toggleSelect(id);
    } else {
      router.push(`/media/${id}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      {/* Sticky header */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.pageTitle}>Gallery</Text>
            <DemoBadge compact />
          </View>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              setSelectMode((v) => !v);
              if (selectMode) setSelected({});
            }}
            testID="gallery-select-toggle"
          >
            <Ionicons
              name={selectMode ? "close" : "checkmark-done"}
              size={20}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar} testID="gallery-search-bar">
          <Ionicons name="search" size={18} color={colors.text.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by place, date, or moment"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            returnKeyType="search"
            testID="gallery-search-input"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter chips row — sticky, single horizontal scroller */}
        <View style={styles.chipsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            testID="gallery-filter-chips"
          >
            {galleryFilters.map((f) => {
              const active = f === activeFilter;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setActiveFilter(f)}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.85}
                  testID={`gallery-filter-${f.toLowerCase()}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {selectMode ? (
          <View style={styles.selectBar} testID="gallery-select-bar">
            <Text style={styles.selectCount}>{selectedCount} selected</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.selectPill} testID="gallery-bulk-favorite">
                <Ionicons name="heart-outline" size={16} color={colors.text.primary} />
                <Text style={styles.selectPillText}>Favorite</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectPill} testID="gallery-bulk-share">
                <Ionicons name="share-outline" size={16} color={colors.text.primary} />
                <Text style={styles.selectPillText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectPill, { backgroundColor: "rgba(239,68,68,0.15)" }]}
                testID="gallery-bulk-trash"
              >
                <Ionicons name="trash-outline" size={16} color={colors.status.error} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLS}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + 120,
          gap: GRID_GAP,
        }}
        ListEmptyComponent={
          <View style={styles.empty} testID="gallery-empty">
            <View style={styles.emptyIcon}>
              <Ionicons name="images-outline" size={28} color={colors.text.secondary} />
            </View>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyBody}>
              Try a different search or clear the filter to see all memories.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSel = !!selected[item.id];
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openMedia(item.id)}
              onLongPress={() => {
                setSelectMode(true);
                toggleSelect(item.id);
              }}
              style={[styles.card, { width: cardW, height: cardW }]}
              testID={`gallery-tile-${item.id}`}
            >
              <Image source={{ uri: item.url }} style={styles.cardImg} />
              {item.isVideo ? (
                <View style={styles.videoPill}>
                  <Ionicons name="play" size={10} color="#fff" />
                  <Text style={styles.videoPillText}>{item.duration ?? "0:15"}</Text>
                </View>
              ) : null}
              {item.favorite ? (
                <View style={styles.favBadge}>
                  <Ionicons name="heart" size={12} color="#fff" />
                </View>
              ) : null}
              {selectMode ? (
                <View style={[styles.selectRing, isSel && styles.selectRingActive]}>
                  {isSel ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stickyHeader: {
    backgroundColor: "rgba(11,12,16,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pageTitle: { ...typography.h1, color: colors.text.primary },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
    paddingVertical: 0,
    outlineWidth: 0,
  } as any,

  // Filter chips
  chipsRow: { height: 44, marginHorizontal: -spacing.lg },
  chipsContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "rgba(236,72,153,0.15)",
    borderColor: colors.brand.pink,
  },
  chipText: { ...typography.small, color: colors.text.secondary, fontWeight: "600" },
  chipTextActive: { color: colors.brand.pink },

  // Select bar
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectCount: { ...typography.small, color: colors.text.primary, fontWeight: "700" },
  selectPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  selectPillText: { ...typography.tiny, color: colors.text.primary, fontWeight: "600" },

  // Grid
  card: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  cardImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  videoPill: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  videoPillText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  favBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(236,72,153,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectRing: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectRingActive: {
    backgroundColor: colors.brand.pink,
    borderColor: colors.brand.pink,
  },

  empty: { padding: spacing.xxl, alignItems: "center", gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...typography.title, color: colors.text.primary },
  emptyBody: {
    ...typography.small,
    color: colors.text.secondary,
    textAlign: "center",
    maxWidth: 240,
  },
});
