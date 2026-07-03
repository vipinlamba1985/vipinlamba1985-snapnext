import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { colors, gradients, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import { uploadQueue, demoUser } from "@/src/data/mocks";

const STATE_META = {
  uploaded: { icon: "checkmark-circle" as const, color: "#10B981", label: "Saved" },
  uploading: { icon: "cloud-upload" as const, color: "#06B6D4", label: "Saving" },
  queued: { icon: "time-outline" as const, color: "#94A3B8", label: "Waiting" },
  skipped: { icon: "alert-circle" as const, color: "#F59E0B", label: "Skipped" },
  failed: { icon: "close-circle" as const, color: "#EF4444", label: "Failed" },
};

export default function UploadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [wifiOnly, setWifiOnly] = useState(true);
  const [dailySync, setDailySync] = useState(false);

  const q = uploadQueue.progress;
  const pct = Math.round((q.uploaded / q.total) * 100);
  const storagePct = Math.round((demoUser.storageUsedGB / demoUser.storageTotalGB) * 100);
  const isDone = q.uploaded === q.total;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 140,
        }}
        showsVerticalScrollIndicator={false}
        testID="upload-scroll"
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.pageTitle}>Back up</Text>
              <DemoBadge compact />
            </View>
            <Text style={styles.pageSub}>Keep your memories safe, forever.</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/settings")}
            testID="upload-settings-button"
          >
            <Ionicons name="settings-outline" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity activeOpacity={0.92} style={styles.primaryWrap} testID="upload-primary-cta">
          <LinearGradient
            colors={gradients.aiAccent as unknown as string[]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primary}
          >
            <View style={styles.primaryIcon}>
              <Ionicons name="cloud-upload" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.primaryTitle}>{uploadQueue.primaryLabel}</Text>
              <Text style={styles.primarySub}>{uploadQueue.primarySubtitle}</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.85} style={styles.secondaryBtn} testID="upload-secondary-cta">
          <Ionicons name="images-outline" size={18} color={colors.text.primary} />
          <Text style={styles.secondaryBtnText}>Choose specific files</Text>
        </TouchableOpacity>
        <Text style={styles.pickerNote} testID="upload-picker-honest-note">
          On mobile web, SnapNext can only see files you pick. The native app can quietly back up everything for you.
        </Text>

        {/* Progress / success card */}
        <View style={styles.card} testID="upload-progress-card">
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {isDone ? "All caught up" : "Backing up now"}
              </Text>
              <Text style={styles.cardSub}>
                {isDone
                  ? `${q.total - q.skipped} moments saved · ${q.skipped} skipped`
                  : `${q.uploaded} of ${q.total} saved · ${q.skipped} skipped`}
              </Text>
            </View>
            {isDone ? (
              <View style={styles.doneBadge}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            ) : (
              <Text style={styles.pct}>{pct}%</Text>
            )}
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={gradients.aiAccent as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${pct}%` }]}
            />
          </View>
          <View style={styles.thumbsRow}>
            {uploadQueue.recent.map((it) => {
              const meta = STATE_META[it.state];
              return (
                <View key={it.id} style={styles.thumbWrap} testID={`upload-thumb-${it.id}`}>
                  <Image source={{ uri: it.url }} style={styles.thumb} />
                  <View style={[styles.thumbBadge, { backgroundColor: meta.color }]}>
                    <Ionicons name={meta.icon} size={10} color="#fff" />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Skip reasons */}
        <Text style={styles.h3}>Why {q.skipped} were skipped</Text>
        <View style={styles.reasonList}>
          {uploadQueue.skipReasons.map((r, i) => (
            <View
              key={i}
              style={[
                styles.reasonRow,
                i === uploadQueue.skipReasons.length - 1 && { borderBottomWidth: 0 },
              ]}
              testID={`upload-skip-${i}`}
            >
              <View
                style={[
                  styles.reasonDot,
                  {
                    backgroundColor:
                      r.tone === "warning"
                        ? "rgba(245,158,11,0.15)"
                        : "rgba(6,182,212,0.15)",
                  },
                ]}
              >
                <Ionicons
                  name={r.tone === "warning" ? "alert-circle-outline" : "information-circle-outline"}
                  size={16}
                  color={r.tone === "warning" ? colors.status.warning : colors.brand.cyan}
                />
              </View>
              <Text style={styles.reasonLabel}>{r.label}</Text>
              <Text style={styles.reasonCount}>{r.count}</Text>
            </View>
          ))}
        </View>

        {/* Storage */}
        <Text style={styles.h3}>Storage</Text>
        <View style={styles.card} testID="upload-storage-card">
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>{demoUser.plan}</Text>
              <Text style={styles.cardSub}>
                {demoUser.storageUsedGB} GB of {demoUser.storageTotalGB} GB used
              </Text>
            </View>
            <Text style={styles.pct}>{storagePct}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={[colors.brand.cyan, colors.brand.purple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${storagePct}%` }]}
            />
          </View>
          <TouchableOpacity style={styles.upgradeBtn} testID="upload-upgrade-button">
            <Text style={styles.upgradeBtnText}>Get more space</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.text.inverse} />
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <Text style={styles.h3}>Preferences</Text>
        <View style={styles.prefCard}>
          <PrefRow
            title="Save data (Wi-Fi only)"
            subtitle="We'll wait for Wi-Fi before backing up"
            value={wifiOnly}
            onToggle={() => setWifiOnly((v) => !v)}
            testID="upload-pref-wifi"
          />
          <View style={styles.prefDivider} />
          <PrefRow
            title="Back up every day, quietly"
            subtitle="Available in the native app"
            value={dailySync}
            disabled
            onToggle={() => setDailySync((v) => !v)}
            testID="upload-pref-daily"
          />
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
          <Text style={styles.footerNote}>
            Prototype · No files are actually uploaded from this preview
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function PrefRow({
  title,
  subtitle,
  value,
  onToggle,
  disabled,
  testID,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.prefRow}
      onPress={onToggle}
      activeOpacity={0.8}
      disabled={disabled}
      testID={testID}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.prefTitle, disabled && { color: colors.text.secondary }]}>{title}</Text>
        <Text style={styles.prefSub}>{subtitle}</Text>
      </View>
      <View
        style={[
          styles.toggle,
          value && !disabled ? styles.toggleOn : null,
          disabled ? styles.toggleDisabled : null,
        ]}
      >
        <View style={[styles.toggleKnob, value && !disabled && { alignSelf: "flex-end" }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  pageTitle: { ...typography.h1, color: colors.text.primary },
  pageSub: { ...typography.small, color: colors.text.secondary, marginTop: 4 },
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
  primaryWrap: { marginHorizontal: spacing.lg, borderRadius: radius.xl, overflow: "hidden" },
  primary: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTitle: { ...typography.title, color: "#fff" },
  primarySub: { ...typography.small, color: "rgba(255,255,255,0.9)", marginTop: 2, lineHeight: 18 },
  secondaryBtn: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  secondaryBtnText: { ...typography.body, color: colors.text.primary, fontWeight: "600" },
  pickerNote: {
    marginTop: 10,
    marginHorizontal: spacing.lg,
    ...typography.tiny,
    color: colors.text.muted,
    lineHeight: 16,
  },

  h3: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: { ...typography.title, color: colors.text.primary },
  cardSub: { ...typography.small, color: colors.text.secondary, marginTop: 2 },
  pct: { ...typography.h3, color: colors.text.primary },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.status.success,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999 },
  thumbsRow: { flexDirection: "row", gap: 6 },
  thumbWrap: { width: 44, height: 44, position: "relative" },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  thumbBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.bg.surface,
  },

  reasonList: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  reasonDot: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonLabel: { ...typography.body, color: colors.text.primary, flex: 1 },
  reasonCount: { ...typography.small, color: colors.text.secondary, fontWeight: "700" },

  upgradeBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  upgradeBtnText: { ...typography.small, color: colors.text.inverse, fontWeight: "700" },

  prefCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  prefDivider: { height: 1, backgroundColor: colors.border.subtle },
  prefTitle: { ...typography.body, color: colors.text.primary, fontWeight: "600" },
  prefSub: { ...typography.tiny, color: colors.text.secondary, marginTop: 3, lineHeight: 15 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: colors.brand.pink },
  toggleDisabled: { opacity: 0.4 },
  toggleKnob: { width: 20, height: 20, borderRadius: 999, backgroundColor: "#fff" },

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
