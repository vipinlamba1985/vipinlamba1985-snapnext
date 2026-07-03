import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, gradients, radius, spacing, typography } from "@/src/theme";
import { demoPhotos } from "@/src/data/mocks";

export default function MediaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const imgSize = Math.min(winW, 480);
  const photo = demoPhotos.find((p) => p.id === id) ?? demoPhotos[0];
  const [fav, setFav] = useState(!!photo.favorite);

  const aiCaption = `SnapNext AI: "${photo.label} in ${photo.place}. The light hits softly across the frame."`;
  const tags = [photo.place.split(",")[0], "Family", "Golden hour", photo.isVideo ? "Video" : "Photo"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.topBtn}
          testID="media-close-button"
          hitSlop={8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.topBtn} testID="media-more-button" hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        testID="media-scroll"
      >
        {/* Full image */}
        <View style={[styles.imageWrap, { width: imgSize, height: imgSize }]}>
          <Image source={{ uri: photo.url }} style={styles.image} />
          {photo.isVideo ? (
            <View style={styles.playOverlay}>
              <View style={styles.playBtn}>
                <Ionicons name="play" size={22} color="#fff" />
              </View>
            </View>
          ) : null}
        </View>

        {/* Meta */}
        <View style={styles.meta}>
          <Text style={styles.date}>{photo.date}</Text>
          <Text style={styles.title}>{photo.label}</Text>
          <View style={styles.placeRow}>
            <Ionicons name="location-outline" size={14} color={colors.text.secondary} />
            <Text style={styles.place}>{photo.place}</Text>
          </View>
        </View>

        {/* AI caption */}
        <View style={styles.aiCard} testID="media-ai-caption">
          <LinearGradient
            colors={gradients.aiSoft as unknown as string[]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={14} color="#fff" />
            </View>
            <Text style={styles.aiHeaderText}>AI description</Text>
          </View>
          <Text style={styles.aiText}>{aiCaption}</Text>
        </View>

        {/* Tags */}
        <View style={styles.tagsRow} testID="media-tags">
          {tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* AI actions */}
        <Text style={styles.actionsHeader}>AI actions</Text>
        <View style={styles.actionsGrid}>
          {[
            { id: "caption", label: "Rewrite caption", icon: "text-outline" as const },
            { id: "post", label: "Draft a post", icon: "megaphone-outline" as const },
            { id: "story", label: "Add to a story", icon: "albums-outline" as const },
            { id: "similar", label: "Find similar", icon: "grid-outline" as const },
          ].map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.actionCard}
              activeOpacity={0.85}
              testID={`media-action-${a.id}`}
            >
              <Ionicons name={a.icon} size={18} color={colors.brand.purple} />
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <BarBtn
          icon={fav ? "heart" : "heart-outline"}
          label="Favorite"
          onPress={() => setFav((v) => !v)}
          testID="media-favorite-toggle"
          active={fav}
        />
        <BarBtn icon="share-outline" label="Share" testID="media-share" />
        <BarBtn icon="cloud-download-outline" label="Download" testID="media-download" />
        <BarBtn icon="trash-outline" label="Trash" tone="danger" testID="media-trash" />
      </View>
    </View>
  );
}

function BarBtn({
  icon,
  label,
  onPress,
  testID,
  active,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  testID?: string;
  active?: boolean;
  tone?: "danger";
}) {
  const color =
    tone === "danger" ? colors.status.error : active ? colors.brand.pink : colors.text.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.barBtn}
      hitSlop={6}
      activeOpacity={0.7}
      testID={testID}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.barLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    zIndex: 10,
    gap: 8,
    alignItems: "center",
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  imageWrap: {
    backgroundColor: "#000",
  },
  image: { width: "100%", height: "100%" },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  meta: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: 4,
  },
  date: { ...typography.tiny, color: colors.text.secondary, fontWeight: "700", letterSpacing: 0.6 },
  title: { ...typography.h2, color: colors.text.primary },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  place: { ...typography.small, color: colors.text.secondary },

  aiCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  aiIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.brand.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  aiHeaderText: {
    ...typography.tiny,
    color: colors.brand.pink,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  aiText: { ...typography.body, color: colors.text.primary, lineHeight: 22 },

  tagsRow: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  tagText: { ...typography.tiny, color: colors.text.primary, fontWeight: "600" },

  actionsHeader: {
    ...typography.tiny,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  actionsGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionCard: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  actionLabel: { ...typography.small, color: colors.text.primary, fontWeight: "600" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    paddingTop: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(11,12,16,0.98)",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  barBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  barLabel: { ...typography.tiny, fontWeight: "700" },
});
