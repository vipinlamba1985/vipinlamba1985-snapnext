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

import { colors, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import { demoUser } from "@/src/data/mocks";

type Row = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  chevron?: boolean;
  tint?: string;
};

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Account",
    rows: [
      { id: "profile", icon: "person-outline", title: "Profile", subtitle: "Name, handle, avatar", chevron: true },
      { id: "email", icon: "mail-outline", title: "Email & login", subtitle: "vipin@example.com", chevron: true },
      { id: "plan", icon: "diamond-outline", title: demoUser.plan, subtitle: "200 GB · Manage plan", chevron: true, tint: "#EC4899" },
    ],
  },
  {
    title: "Privacy",
    rows: [
      { id: "sharing", icon: "share-outline", title: "Sharing & Favorites", subtitle: "Who can see what", chevron: true },
      { id: "faces", icon: "happy-outline", title: "Face grouping", subtitle: "Local-only recognition", chevron: true },
      { id: "location", icon: "location-outline", title: "Location data", subtitle: "Show place info in memories", chevron: true },
    ],
  },
  {
    title: "AI",
    rows: [
      { id: "learn", icon: "sparkles-outline", title: "SnapNext AI learning", subtitle: "Controls what AI analyzes", chevron: true },
      { id: "suggestions", icon: "bulb-outline", title: "Insight frequency", subtitle: "One per day", chevron: true },
    ],
  },
  {
    title: "Backup",
    rows: [
      { id: "auto", icon: "cloud-outline", title: "Auto backup", subtitle: "Available in native app", chevron: true },
      { id: "quality", icon: "image-outline", title: "Upload quality", subtitle: "Original", chevron: true },
    ],
  },
  {
    title: "App",
    rows: [
      { id: "notifications", icon: "notifications-outline", title: "Notifications", chevron: true },
      { id: "language", icon: "language-outline", title: "Language", subtitle: "English", chevron: true },
      { id: "about", icon: "information-circle-outline", title: "About SnapNext", chevron: true },
    ],
  },
];

export default function SettingsScreen() {
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
        testID="settings-scroll"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="settings-back-button"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.headerTitle}>Settings</Text>
              <DemoBadge compact />
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Profile card */}
        <View style={styles.profileCard} testID="settings-profile">
          <Image source={{ uri: demoUser.avatar }} style={styles.profileAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{demoUser.name}</Text>
            <Text style={styles.profileHandle}>{demoUser.handle}</Text>
            <View style={styles.planPill}>
              <Ionicons name="sparkles" size={10} color={colors.brand.pink} />
              <Text style={styles.planPillText}>{demoUser.plan}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn} testID="settings-edit-profile">
            <Ionicons name="pencil" size={14} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, idx) => (
                <TouchableOpacity
                  key={row.id}
                  style={[
                    styles.row,
                    idx === section.rows.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  activeOpacity={0.8}
                  testID={`settings-row-${row.id}`}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      row.tint ? { backgroundColor: `${row.tint}25` } : null,
                    ]}
                  >
                    <Ionicons
                      name={row.icon}
                      size={18}
                      color={row.tint ?? colors.text.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    {row.subtitle ? <Text style={styles.rowSub}>{row.subtitle}</Text> : null}
                  </View>
                  {row.chevron ? (
                    <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.signOutBtn} testID="settings-sign-out">
          <Ionicons name="log-out-outline" size={18} color={colors.status.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>SnapNext · Prototype build · v0.1</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
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
  profileCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  profileAvatar: { width: 60, height: 60, borderRadius: 999 },
  profileName: { ...typography.h3, color: colors.text.primary },
  profileHandle: { ...typography.small, color: colors.text.secondary, marginTop: 2 },
  planPill: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(236,72,153,0.15)",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.3)",
  },
  planPillText: { fontSize: 10, color: colors.brand.pink, fontWeight: "700" },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    ...typography.tiny,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
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
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { ...typography.body, color: colors.text.primary, fontWeight: "500" },
  rowSub: { ...typography.tiny, color: colors.text.secondary, marginTop: 3 },

  signOutBtn: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutText: { ...typography.body, color: colors.status.error, fontWeight: "700" },

  footerNote: {
    marginTop: spacing.xl,
    ...typography.tiny,
    color: colors.text.muted,
    textAlign: "center",
  },
});
