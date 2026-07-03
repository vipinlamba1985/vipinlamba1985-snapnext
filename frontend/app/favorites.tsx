import React from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, gradients, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import { favorites } from "@/src/data/mocks";

const STATUS_META = {
  accepted: { label: "Connected", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  pending: { label: "Waiting for reply", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  invited: { label: "Invite you sent", color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
};

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
        testID="favorites-scroll"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="favorites-back-button"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.headerTitle}>Favorites</Text>
              <DemoBadge compact />
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn} testID="favorites-add-button" hitSlop={8}>
            <Ionicons name="person-add" size={18} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Explanation */}
        <View style={styles.explainCard} testID="favorites-explanation">
          <LinearGradient
            colors={gradients.aiSoft as unknown as string[]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.explainIcon}>
            <Ionicons name="lock-closed" size={16} color={colors.brand.pink} />
          </View>
          <Text style={styles.explainTitle}>Private, permission-based sharing</Text>
          <Text style={styles.explainBody}>
            Favorites are people you invite. They must accept, and they only see memories you
            explicitly share. Nothing else in your library is visible.
          </Text>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity activeOpacity={0.9} style={styles.inviteBtn} testID="favorites-invite-cta">
          <LinearGradient
            colors={gradients.aiAccent as unknown as string[]}
            style={styles.inviteBtnInner}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.inviteBtnText}>Invite a favorite</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* People list */}
        <Text style={styles.h3}>Your favorites</Text>
        <View style={styles.list}>
          {favorites.map((f) => {
            const meta = STATUS_META[f.status];
            return (
              <View key={f.id} style={styles.row} testID={`favorites-row-${f.id}`}>
                <Image source={{ uri: f.avatar }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.name}>{f.name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.sub}>
                    {f.status === "accepted"
                      ? `${f.sharedCount} shared memories · ${f.since}`
                      : f.since}
                  </Text>
                </View>
                {f.status === "accepted" ? (
                  <TouchableOpacity style={styles.actionBtn} testID={`favorites-view-${f.id}`}>
                    <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                  </TouchableOpacity>
                ) : f.status === "pending" ? (
                  <TouchableOpacity style={styles.actionBtn} testID={`favorites-remind-${f.id}`}>
                    <Text style={styles.actionText}>Remind</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.brand.pink }]}
                      testID={`favorites-accept-${f.id}`}
                    >
                      <Text style={[styles.actionText, { color: "#fff" }]}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} testID={`favorites-decline-${f.id}`}>
                      <Text style={styles.actionText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Privacy detail */}
        <View style={styles.privacyBox}>
          <View style={styles.privacyItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
            <Text style={styles.privacyText}>Favorites see only memories you share.</Text>
          </View>
          <View style={styles.privacyItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
            <Text style={styles.privacyText}>Photos with both of you may be suggested to share.</Text>
          </View>
          <View style={styles.privacyItem}>
            <Ionicons name="close-circle" size={16} color={colors.status.error} />
            <Text style={styles.privacyText}>Favorites never see your private library.</Text>
          </View>
        </View>

        <Text style={styles.footerNote}>
          Prototype only. No invitations are actually sent from this preview.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerTitle: { ...typography.h3, color: colors.text.primary },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
  },

  explainCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
    gap: 6,
  },
  explainIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(236,72,153,0.15)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.3)",
  },
  explainTitle: { ...typography.title, color: colors.text.primary, marginTop: 8 },
  explainBody: { ...typography.small, color: colors.text.secondary, lineHeight: 20 },

  inviteBtn: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  inviteBtnInner: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  inviteBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },

  h3: {
    ...typography.h3,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  list: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  avatar: { width: 44, height: 44, borderRadius: 999 },
  name: { ...typography.title, color: colors.text.primary },
  sub: { ...typography.tiny, color: colors.text.secondary, marginTop: 4 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusDot: { width: 5, height: 5, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "700" },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  actionText: { ...typography.tiny, color: colors.text.primary, fontWeight: "700" },

  privacyBox: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: 12,
  },
  privacyItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  privacyText: { ...typography.small, color: colors.text.secondary, flex: 1, lineHeight: 20 },

  footerNote: {
    marginTop: spacing.xl,
    ...typography.tiny,
    color: colors.text.muted,
    textAlign: "center",
    marginHorizontal: spacing.lg,
  },
});
