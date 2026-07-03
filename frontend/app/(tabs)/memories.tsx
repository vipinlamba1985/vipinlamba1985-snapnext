import React from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { colors, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import SectionHeader from "@/src/components/SectionHeader";
import {
  onThisDay,
  memoriesStories,
  memoriesPeople,
  memoriesPlaces,
  demoPhotos,
} from "@/src/data/mocks";

// "This Day in Past Years" — show one moment per past year.
const PAST_YEARS = [
  { year: "3 years ago", cover: demoPhotos[0].url, place: "Goa" },
  { year: "5 years ago", cover: demoPhotos[4].url, place: "Udaipur" },
  { year: "7 years ago", cover: demoPhotos[7].url, place: "Home" },
];

const TIMELINE = [
  { id: "t1", month: "July 2026", count: 47, cover: demoPhotos[0].url, hint: "Goa trip · Family" },
  { id: "t2", month: "June 2026", count: 22, cover: demoPhotos[1].url, hint: "Dubai layover" },
  { id: "t3", month: "May 2026", count: 68, cover: demoPhotos[2].url, hint: "Weekends with friends" },
  { id: "t4", month: "February 2026", count: 213, cover: demoPhotos[4].url, hint: "Wedding week" },
];

export default function MemoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const containerW = Math.min(winW, 480);
  const placeW = (containerW - spacing.lg * 2 - spacing.md) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 120,
        }}
        showsVerticalScrollIndicator={false}
        testID="memories-scroll"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.pageTitle}>Memories</Text>
            <DemoBadge compact />
          </View>
          <TouchableOpacity style={styles.iconBtn} testID="memories-search-button">
            <Ionicons name="search" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.pageSub}>Rediscover the moments that made your life.</Text>

        {/* TODAY hero — On This Day */}
        <SectionHeader title="Today" testID="memories-today-header" />
        <TouchableOpacity
          activeOpacity={0.92}
          style={styles.hero}
          onPress={() => router.push(`/media/${onThisDay.photo.id}`)}
          testID="memories-on-this-day"
        >
          <Image source={{ uri: onThisDay.photo.url }} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={["transparent", "rgba(11,12,16,0.95)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroMeta}>
            <View style={styles.heroPill}>
              <Ionicons name="calendar" size={12} color="#fff" />
              <Text style={styles.heroPillText}>
                This day · {onThisDay.yearsAgo} years ago
              </Text>
            </View>
            <Text style={styles.heroTitle}>{onThisDay.caption}</Text>
            <View style={styles.heroCtaRow}>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>Open collection</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </View>
              <Text style={styles.heroSub}>{onThisDay.photoCount} photos</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* This Day in Past Years */}
        <SectionHeader
          title="This day, in past years"
          subtitle="Little windows back in time"
          testID="memories-past-years-header"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        >
          {PAST_YEARS.map((y, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.pastCard}
              activeOpacity={0.85}
              testID={`memories-pastyear-${idx}`}
            >
              <Image source={{ uri: y.cover }} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.9)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.pastCardMeta}>
                <Text style={styles.pastCardYear}>{y.year}</Text>
                <Text style={styles.pastCardPlace} numberOfLines={1}>{y.place}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Stories */}
        <SectionHeader
          title="Stories"
          subtitle="Chapters SnapNext has been quietly writing"
          actionLabel="See all"
          testID="memories-stories-header"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        >
          {memoriesStories.map((s) => (
            <TouchableOpacity
              key={s.id}
              activeOpacity={0.85}
              style={styles.storyCard}
              testID={`memories-story-${s.id}`}
            >
              <Image source={{ uri: s.cover }} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.85)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.storyBadge}>
                <Text style={styles.storyBadgeText}>{s.tag}</Text>
              </View>
              <View style={styles.storyMeta}>
                <Text style={styles.storyTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.storyCount}>{s.count} moments</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* People You Love */}
        <SectionHeader
          title="People you love"
          subtitle="Faces that keep showing up"
          actionLabel="See all"
          onAction={() => router.push("/favorites")}
          testID="memories-people-header"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        >
          {memoriesPeople.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.personCard}
              activeOpacity={0.85}
              testID={`memories-person-${p.id}`}
            >
              <View style={styles.personAvatarWrap}>
                <Image source={{ uri: p.avatar }} style={styles.personAvatar} />
              </View>
              <Text style={styles.personName}>{p.name}</Text>
              <Text style={styles.personCount}>{p.count} moments</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Trips & Places */}
        <SectionHeader
          title="Trips & places"
          subtitle="Where your memories live"
          testID="memories-places-header"
        />
        <View style={styles.placesGrid}>
          {memoriesPlaces.map((pl) => (
            <TouchableOpacity
              key={pl.id}
              style={[styles.placeCard, { width: placeW }]}
              activeOpacity={0.9}
              testID={`memories-place-${pl.id}`}
            >
              <Image source={{ uri: pl.cover }} style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.85)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.placeMeta}>
                <Text style={styles.placeName} numberOfLines={1}>{pl.name}</Text>
                <Text style={styles.placeSub} numberOfLines={1}>
                  {pl.subtitle} · {pl.count} moments
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Life Timeline */}
        <SectionHeader
          title="Life timeline"
          subtitle="Your months, in one gentle scroll"
          testID="memories-timeline-header"
        />
        <View style={styles.timelineList}>
          {TIMELINE.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              activeOpacity={0.85}
              style={[
                styles.timelineRow,
                i === TIMELINE.length - 1 && { borderBottomWidth: 0 },
              ]}
              testID={`memories-timeline-${t.id}`}
            >
              <Image source={{ uri: t.cover }} style={styles.timelineCover} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineMonth}>{t.month}</Text>
                <Text style={styles.timelineHint} numberOfLines={1}>
                  {t.hint} · {t.count} moments
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
          <Text style={styles.footerNote}>
            Prototype · Demo memories only
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
    gap: spacing.md,
  },
  pageTitle: { ...typography.h1, color: colors.text.primary },
  pageSub: {
    ...typography.small,
    color: colors.text.secondary,
    marginTop: 4,
    paddingHorizontal: spacing.lg,
  },
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
  hero: {
    marginHorizontal: spacing.lg,
    height: 280,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  heroMeta: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  heroPill: {
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
  heroPillText: { ...typography.tiny, color: "#fff", fontWeight: "700" },
  heroTitle: { ...typography.h3, color: "#fff", marginBottom: spacing.md, lineHeight: 24 },
  heroCtaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.pill,
  },
  heroCtaText: { ...typography.small, color: "#fff", fontWeight: "700" },
  heroSub: { ...typography.small, color: "rgba(255,255,255,0.8)" },

  // Past years
  pastCard: {
    width: 128,
    height: 160,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  pastCardMeta: { position: "absolute", left: 10, right: 10, bottom: 10 },
  pastCardYear: { ...typography.small, color: "#fff", fontWeight: "700" },
  pastCardPlace: { ...typography.tiny, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // Timeline
  timelineList: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  timelineCover: { width: 48, height: 48, borderRadius: radius.sm },
  timelineMonth: { ...typography.title, color: colors.text.primary },
  timelineHint: { ...typography.small, color: colors.text.secondary, marginTop: 2 },

  // Stories
  storyCard: {
    width: 196,
    height: 246,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  storyBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  storyBadgeText: { ...typography.tiny, color: "#fff", fontWeight: "700" },
  storyMeta: { position: "absolute", left: 14, right: 14, bottom: 14 },
  storyTitle: { ...typography.title, color: "#fff" },
  storyCount: { ...typography.tiny, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // People
  personCard: { alignItems: "center", width: 72 },
  personAvatarWrap: {
    width: 68,
    height: 68,
    borderRadius: 999,
    padding: 2,
    borderWidth: 2,
    borderColor: colors.brand.pink,
  },
  personAvatar: { flex: 1, borderRadius: 999 },
  personName: {
    ...typography.small,
    color: colors.text.primary,
    marginTop: 6,
    fontWeight: "700",
  },
  personCount: { ...typography.tiny, color: colors.text.secondary },

  // Places
  placesGrid: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  placeCard: {
    aspectRatio: 1.1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.bg.surface,
  },
  placeMeta: { position: "absolute", left: 12, right: 12, bottom: 12 },
  placeName: { ...typography.title, color: "#fff" },
  placeSub: { ...typography.tiny, color: "rgba(255,255,255,0.8)", marginTop: 2 },

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
