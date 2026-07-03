import React, { useState } from "react";
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
import { favorites as SEED } from "@/src/data/mocks";

const STATUS_META = {
  accepted: { label: "Trusted", color: "#10B981", bg: "rgba(16,185,129,0.15)" },
  pending: { label: "Waiting for reply", color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  invited: { label: "Wants to connect", color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
};

const ACCESS_LABEL = {
  both: "Sees photos with both of you",
  albums: "Sees photos with both of you + selected albums",
};

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [openedId, setOpenedId] = useState<string | null>(null);

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

        {/* Explanation — human, calm */}
        <View style={styles.explainCard} testID="favorites-explanation">
          <LinearGradient
            colors={gradients.aiSoft as unknown as string[]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.explainIcon}>
            <Ionicons name="lock-closed" size={16} color={colors.brand.pink} />
          </View>
          <Text style={styles.explainTitle}>People you trust with your memories</Text>
          <Text style={styles.explainBody}>
            A favorite is a trusted person. They only see photos where both of you appear —
            nothing else in your library — unless you explicitly share an album.
          </Text>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity activeOpacity={0.92} style={styles.inviteBtn} testID="favorites-invite-cta">
          <LinearGradient
            colors={gradients.aiAccent as unknown as string[]}
            style={styles.inviteBtnInner}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.inviteBtnText}>Invite someone you love</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* People list */}
        <Text style={styles.h3}>Your trusted people</Text>
        <View style={styles.list}>
          {SEED.map((f, idx) => {
            const meta = STATUS_META[f.status];
            const isOpen = openedId === f.id;
            return (
              <View
                key={f.id}
                style={[styles.rowWrap, idx === SEED.length - 1 && { borderBottomWidth: 0 }]}
                testID={`favorites-row-${f.id}`}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.row}
                  onPress={() =>
                    setOpenedId((prev) => (prev === f.id ? null : f.id))
                  }
                  testID={`favorites-toggle-${f.id}`}
                >
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
                        ? `${f.sharedCount} shared moments · ${f.since}`
                        : f.since}
                    </Text>
                  </View>
                  {f.status === "accepted" ? (
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={colors.text.secondary}
                    />
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
                </TouchableOpacity>

                {/* Expanded permission panel */}
                {isOpen && f.status === "accepted" ? (
                  <View style={styles.expand} testID={`favorites-permissions-${f.id}`}>
                    <View style={styles.permRow}>
                      <View style={styles.permIcon}>
                        <Ionicons name="people-outline" size={14} color={colors.brand.cyan} />
                      </View>
                      <Text style={styles.permText}>{ACCESS_LABEL[f.accessLevel]}</Text>
                    </View>
                    <View style={styles.expandActions}>
                      <TouchableOpacity
                        style={styles.expandBtn}
                        testID={`favorites-manage-albums-${f.id}`}
                      >
                        <Ionicons name="albums-outline" size={14} color={colors.text.primary} />
                        <Text style={styles.expandBtnText}>Manage shared albums</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.expandBtn, styles.dangerBtn]}
                        testID={`favorites-revoke-${f.id}`}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={colors.status.error} />
                        <Text style={[styles.expandBtnText, { color: colors.status.error }]}>
                          Revoke access
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Privacy do/don't */}
        <View style={styles.privacyBox}>
          <View style={styles.privacyItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
            <Text style={styles.privacyText}>They see only what you share, nothing more.</Text>
          </View>
          <View style={styles.privacyItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
            <Text style={styles.privacyText}>Photos with both of you may be quietly suggested.</Text>
          </View>
          <View style={styles.privacyItem}>
            <Ionicons name="close-circle" size={16} color={colors.status.error} />
            <Text style={styles.privacyText}>They never see your private library.</Text>
          </View>
          <View style={styles.privacyItem}>
            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
            <Text style={styles.privacyText}>You can revoke access anytime — quietly, instantly.</Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
          <Text style={styles.footerNote}>
            Prototype · No invitations are actually sent
          </Text>
        </View>
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
    marginTop: spacing.xxl,
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
  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
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

  expand: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 4,
    gap: spacing.sm,
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  permIcon: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(6,182,212,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  permText: { ...typography.small, color: colors.text.primary, flex: 1 },
  expandActions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    flexGrow: 1,
    justifyContent: "center",
  },
  expandBtnText: { ...typography.tiny, color: colors.text.primary, fontWeight: "700" },
  dangerBtn: { backgroundColor: "rgba(239,68,68,0.1)" },

  privacyBox: {
    marginTop: spacing.xxl,
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

  footerRow: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  footerNote: {
    ...typography.tiny,
    color: colors.text.muted,
  },
});
