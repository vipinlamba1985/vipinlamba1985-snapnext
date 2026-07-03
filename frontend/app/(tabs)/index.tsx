import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, gradients, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import SectionHeader from "@/src/components/SectionHeader";
import {
  demoUser,
  onThisDay,
  primaryRecommendation,
  aiInsight,
  continueYourStory,
  demoPhotos,
} from "@/src/data/mocks";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

// Subtle staggered fade+rise. Keeps micro-motion tasteful.
function useRevealStack(count: number) {
  const values = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;
  useEffect(() => {
    Animated.stagger(
      70,
      values.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [values]);
  return values.map((v) => ({
    opacity: v,
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
    ],
  }));
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  void winW;
  const greeting = getGreeting();
  const styleStack = useRevealStack(6);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 120,
        }}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* A. Compact Personal Header */}
        <Animated.View style={[styles.headerRow, styleStack[0]]}>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={styles.avatarWrap}
            testID="home-avatar-button"
            hitSlop={8}
          >
            <Image source={{ uri: demoUser.avatar }} style={styles.avatar} />
            <View style={styles.avatarRing} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.greeting} numberOfLines={1}>
                {greeting}
              </Text>
              <DemoBadge compact />
            </View>
            <Text style={styles.subGreeting} numberOfLines={2}>
              Your memories are safe. SnapNext found something for you.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/favorites")}
            testID="home-favorites-button"
            hitSlop={8}
          >
            <Ionicons name="heart-outline" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </Animated.View>

        {/* B. One adaptive Smart Action */}
        <Animated.View style={styleStack[1]}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.primaryActionWrap}
            testID="home-primary-action"
          >
            <LinearGradient
              colors={gradients.aiSoft as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryActionBg}
            >
              <View style={styles.aiChip}>
                <Ionicons name="sparkles" size={12} color={colors.brand.pink} />
                <Text style={styles.aiChipText}>SnapNext found this for you</Text>
              </View>
              <Text style={styles.primaryActionTitle}>{primaryRecommendation.title}</Text>
              <Text style={styles.primaryActionReason}>{primaryRecommendation.reason}</Text>
              <View style={styles.primaryActionCta}>
                <Text style={styles.primaryActionCtaText}>{primaryRecommendation.actionLabel}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.text.primary} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* C. Today in Your Life */}
        <SectionHeader title="Today in your life" testID="home-today-header" />
        <Animated.View style={styleStack[2]}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.todayCard}
            onPress={() => router.push(`/media/${onThisDay.photo.id}`)}
            testID="home-today-card"
          >
            <Image source={{ uri: onThisDay.photo.url }} style={styles.todayImg} />
            <LinearGradient
              colors={["transparent", "rgba(11,12,16,0.95)"]}
              style={styles.todayOverlay}
            />
            <View style={styles.todayContent}>
              <View style={styles.onThisDayPill}>
                <Ionicons name="calendar" size={12} color="#fff" />
                <Text style={styles.onThisDayPillText}>
                  This day · {onThisDay.yearsAgo} years ago
                </Text>
              </View>
              <Text style={styles.todayCaption} numberOfLines={2}>
                {onThisDay.caption}
              </Text>
              <Text style={styles.todayMeta}>{onThisDay.photoCount} photos worth revisiting</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* D. One AI Insight */}
        <SectionHeader title="A gentle observation" testID="home-insight-header" />
        <Animated.View style={[styles.insightCard, styleStack[3]]} testID="home-insight-card">
          <View style={styles.insightIconWrap}>
            <LinearGradient
              colors={gradients.aiAccent as unknown as string[]}
              style={styles.insightIconBg}
            >
              <Ionicons name="heart" size={16} color="#fff" />
            </LinearGradient>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightTitle}>{aiInsight.title}</Text>
            <Text style={styles.insightDetail}>{aiInsight.detail}</Text>
            <TouchableOpacity style={styles.insightCta} testID="home-insight-cta">
              <Text style={styles.insightCtaText}>{aiInsight.actionLabel}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand.cyan} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* E. Continue Your Story */}
        <SectionHeader
          title="Continue your story"
          actionLabel="See all"
          onAction={() => router.push("/(tabs)/memories")}
          testID="home-continue-header"
        />
        <Animated.View style={styleStack[4]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              gap: spacing.md,
            }}
            testID="home-continue-row"
          >
            {continueYourStory.map((s) => (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.85}
                style={styles.storyCard}
                testID={`home-story-${s.id}`}
              >
                <Image source={{ uri: s.cover }} style={styles.storyCover} />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.9)"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.storyMeta}>
                  <Text style={styles.storyTitle} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={styles.storySub} numberOfLines={1}>
                    {s.subtitle} · {s.count} moments
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* F. Recent Memories — compact horizontal strip (not grid). */}
        <SectionHeader
          title="Recent moments"
          actionLabel="Open gallery"
          onAction={() => router.push("/(tabs)/gallery")}
          testID="home-recent-header"
        />
        <Animated.View style={styleStack[5]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              gap: spacing.sm,
            }}
            testID="home-recent-row"
          >
            {demoPhotos.slice(0, 8).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.recentTile}
                onPress={() => router.push(`/media/${p.id}`)}
                activeOpacity={0.85}
                testID={`home-recent-${p.id}`}
              >
                <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} />
                {p.favorite ? (
                  <View style={styles.tileFav}>
                    <Ionicons name="heart" size={10} color="#fff" />
                  </View>
                ) : null}
                {p.isVideo ? (
                  <View style={styles.tileVideo}>
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Quick Capture — quiet, progressive-disclosure entry */}
        <SectionHeader title="Capture something new" testID="home-capture-header" />
        <View style={[styles.captureRow, { paddingHorizontal: spacing.lg }]} testID="home-quick-capture">
          <TouchableOpacity style={styles.captureBtn} testID="home-capture-note">
            <View style={[styles.captureIcon, { backgroundColor: "rgba(6,182,212,0.15)" }]}>
              <Ionicons name="create-outline" size={18} color={colors.brand.cyan} />
            </View>
            <Text style={styles.captureLabel}>Thought</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={() => router.push("/(tabs)/upload")}
            testID="home-capture-media"
          >
            <View style={[styles.captureIcon, { backgroundColor: "rgba(236,72,153,0.15)" }]}>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.brand.pink} />
            </View>
            <Text style={styles.captureLabel}>Back up</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={() => router.push("/(tabs)/ai")}
            testID="home-capture-ai"
          >
            <View style={[styles.captureIcon, { backgroundColor: "rgba(139,92,246,0.15)" }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.brand.purple} />
            </View>
            <Text style={styles.captureLabel}>Ask</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
          <Text style={styles.footerNote}>
            Prototype · Demo memories only · Nothing here is real user data
          </Text>
        </View>
        {/* Storage sits quietly at the bottom, not competing with today's moments. */}
        <View style={styles.storageMini} testID="home-storage-mini">
          <View style={{ flex: 1 }}>
            <Text style={styles.storageLabel}>Storage</Text>
            <Text style={styles.storageValue}>
              {demoUser.storageUsedGB} GB of {demoUser.storageTotalGB} GB used
            </Text>
          </View>
          <View style={styles.storageTrack}>
            <View
              style={[
                styles.storageFill,
                {
                  width: `${Math.round((demoUser.storageUsedGB / demoUser.storageTotalGB) * 100)}%`,
                },
              ]}
            />
          </View>
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
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  avatarWrap: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 999 },
  avatarRing: {
    position: "absolute",
    inset: 0,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.brand.pink,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  greeting: { ...typography.h2, color: colors.text.primary },
  subGreeting: { ...typography.small, color: colors.text.secondary, marginTop: 3, lineHeight: 18 },
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

  // Primary action
  primaryActionWrap: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.28)",
  },
  primaryActionBg: {
    padding: spacing.lg,
    backgroundColor: colors.bg.surface,
  },
  aiChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(236,72,153,0.12)",
    borderRadius: radius.pill,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.25)",
  },
  aiChipText: { ...typography.tiny, color: colors.brand.pink, fontWeight: "700" },
  primaryActionTitle: { ...typography.h2, color: colors.text.primary, marginBottom: 6, lineHeight: 28 },
  primaryActionReason: { ...typography.body, color: colors.text.secondary, marginBottom: spacing.lg, lineHeight: 20 },
  primaryActionCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  primaryActionCtaText: { ...typography.small, fontWeight: "700", color: colors.text.primary },

  // Today
  todayCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    overflow: "hidden",
    height: 260,
    backgroundColor: colors.bg.surface,
  },
  todayImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  todayOverlay: { ...StyleSheet.absoluteFillObject, top: "35%" },
  todayContent: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  onThisDayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(139,92,246,0.92)",
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  onThisDayPillText: { ...typography.tiny, color: "#fff", fontWeight: "700" },
  todayCaption: { ...typography.h3, color: "#fff", marginBottom: 4, lineHeight: 24 },
  todayMeta: { ...typography.small, color: "rgba(255,255,255,0.75)" },

  // Insight
  insightCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: "row",
    gap: spacing.md,
  },
  insightIconWrap: { width: 40, height: 40 },
  insightIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: { ...typography.title, color: colors.text.primary, marginBottom: 4, lineHeight: 22 },
  insightDetail: { ...typography.small, color: colors.text.secondary, lineHeight: 19 },
  insightCta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md },
  insightCtaText: { ...typography.small, color: colors.brand.cyan, fontWeight: "700" },

  // Story row
  storyCard: {
    width: 168,
    height: 210,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  storyCover: { ...StyleSheet.absoluteFillObject },
  storyMeta: { position: "absolute", left: 12, right: 12, bottom: 12 },
  storyTitle: { ...typography.title, color: "#fff" },
  storySub: { ...typography.tiny, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // Recent strip
  recentTile: {
    width: 92,
    height: 116,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  tileFav: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(236,72,153,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  tileVideo: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Quick capture
  captureRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  captureBtn: {
    flex: 1,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    alignItems: "flex-start",
    gap: 8,
  },
  captureIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  captureLabel: { ...typography.small, color: colors.text.primary, fontWeight: "600" },

  // Storage mini
  storageMini: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  storageLabel: { ...typography.tiny, color: colors.text.secondary, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  storageValue: { ...typography.small, color: colors.text.primary, marginTop: 2, fontWeight: "600" },
  storageTrack: {
    width: 90,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  storageFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.brand.cyan,
  },

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
