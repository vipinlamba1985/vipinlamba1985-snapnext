import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, gradients, radius, spacing, typography } from "@/src/theme";
import DemoBadge from "@/src/components/DemoBadge";
import { aiExamples, aiTabs, demoPhotos } from "@/src/data/mocks";

type TabKey = (typeof aiTabs)[number]["key"];

const TAB_META: Record<TabKey, {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  headline: string;
  subhead: string;
  helper: string;
}> = {
  ask: {
    icon: "search",
    color: "#EC4899",
    headline: "Ask SnapNext",
    subhead: "Anything about your own memories.",
    helper: "Try",
  },
  understand: {
    icon: "leaf",
    color: "#06B6D4",
    headline: "Understand your life",
    subhead: "Quiet observations from your archive.",
    helper: "Try",
  },
  create: {
    icon: "color-wand",
    color: "#8B5CF6",
    headline: "Create from your moments",
    subhead: "Captions, stories, and posts — from your own photos.",
    helper: "Try",
  },
  organize: {
    icon: "sparkles",
    color: "#10B981",
    headline: "Organize gently",
    subhead: "Duplicates, albums, and cleanup — without stress.",
    helper: "Try",
  },
  remember: {
    icon: "heart",
    color: "#F472B6",
    headline: "Remember with me",
    subhead: "Bring back moments worth revisiting.",
    helper: "Try",
  },
};

const UNDERSTAND_INSIGHTS = [
  {
    id: "u1",
    icon: "location" as const,
    title: "Cubbon Park is your quiet place",
    body: "42 visits — mostly weekends with Milo.",
  },
  {
    id: "u2",
    icon: "people" as const,
    title: "Family shows up in 38% of your photos",
    body: "Mom appears most often, followed by Dad and Ananya.",
  },
  {
    id: "u3",
    icon: "book" as const,
    title: "You have 3 unfinished stories",
    body: "Goa 2026, Diwali 2025, and Ladakh have enough moments to publish.",
  },
];

const ORGANIZE_ITEMS = [
  { id: "o1", icon: "copy-outline" as const, title: "42 possible duplicates", body: "Review before removing." },
  { id: "o2", icon: "folder-outline" as const, title: "Suggested album: Weekend brunches", body: "18 photos over 6 months." },
  { id: "o3", icon: "eye-off-outline" as const, title: "112 screenshots piling up", body: "Clean up in one tap." },
];

const REMEMBER_ITEMS = [
  { id: "r1", icon: "sunny-outline" as const, title: "A morning with Mom", body: "Diwali 2022 · Home" },
  { id: "r2", icon: "moon-outline" as const, title: "That night in Udaipur", body: "Feb 2021 · Wedding week" },
  { id: "r3", icon: "cloud-outline" as const, title: "First rain in Ladakh", body: "Jul 2020 · Trip" },
];

export default function AIScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("ask");
  const [prompt, setPrompt] = useState("");

  const meta = TAB_META[tab];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 140,
        }}
        showsVerticalScrollIndicator={false}
        testID="ai-scroll"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.pageTitle}>SnapNext AI</Text>
              <DemoBadge compact />
            </View>
            <Text style={styles.pageSub}>Your quiet intelligence layer</Text>
          </View>
          <View style={styles.aiBadge}>
            <LinearGradient
              colors={gradients.aiAccent as unknown as string[]}
              style={styles.aiBadgeInner}
            >
              <Ionicons name="sparkles" size={16} color="#fff" />
            </LinearGradient>
          </View>
        </View>

        {/* Ask hero — always present */}
        <View style={styles.askHero} testID="ai-ask-hero">
          <LinearGradient
            colors={gradients.aiSoft as unknown as string[]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.askHeroTitle}>Ask SnapNext</Text>
          <Text style={styles.askHeroSub}>Anything about your own memories.</Text>
          <View style={styles.promptWrap}>
            <Ionicons name="sparkles" size={16} color={colors.brand.pink} style={{ marginLeft: 4 }} />
            <TextInput
              style={styles.promptInput}
              placeholder="Find my beach photos with family"
              placeholderTextColor={colors.text.muted}
              value={prompt}
              onChangeText={setPrompt}
              testID="ai-prompt-input"
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} testID="ai-send-button">
              <LinearGradient
                colors={gradients.aiAccent as unknown as string[]}
                style={styles.sendBtnInner}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quieter capability chips row */}
        <Text style={styles.capabilitiesLabel}>What would you like today?</Text>
        <View style={styles.tabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            testID="ai-tabs"
          >
            {aiTabs.map((t) => {
              const active = tab === t.key;
              const tm = TAB_META[t.key];
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[
                    styles.tab,
                    active && { borderColor: tm.color, backgroundColor: `${tm.color}20` },
                  ]}
                  activeOpacity={0.85}
                  testID={`ai-tab-${t.key}`}
                >
                  <Ionicons
                    name={tm.icon}
                    size={14}
                    color={active ? tm.color : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? tm.color : colors.text.secondary },
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Contextual sub-copy for chosen capability */}
        <View style={styles.subHero} testID={`ai-subhero-${tab}`}>
          <View style={[styles.subHeroIcon, { backgroundColor: `${meta.color}20` }]}>
            <Ionicons name={meta.icon} size={16} color={meta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subHeroTitle}>{meta.headline}</Text>
            <Text style={styles.subHeroSub}>{meta.subhead}</Text>
          </View>
        </View>

        {/* Try chips */}
        <Text style={styles.tryLabel}>{meta.helper}</Text>
        <View style={styles.examples}>
          {aiExamples[tab].map((ex) => (
            <TouchableOpacity
              key={ex}
              style={styles.exampleChip}
              onPress={() => setPrompt(ex)}
              activeOpacity={0.85}
              testID={`ai-example-${tab}`}
            >
              <Ionicons
                name="arrow-up-circle-outline"
                size={14}
                color={meta.color}
              />
              <Text style={styles.exampleText} numberOfLines={1}>
                {ex}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab-specific content — quiet, single primary block */}
        {tab === "ask" ? <AskResults /> : null}
        {tab === "understand" ? <UnderstandList /> : null}
        {tab === "create" ? <CreateGrid /> : null}
        {tab === "organize" ? <OrganizeList /> : null}
        {tab === "remember" ? <RememberList /> : null}

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={11} color={colors.text.muted} />
          <Text style={styles.footerNote}>
            Prototype only · SnapNext AI runs privately on your archive
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function AskResults() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Recent answer</Text>
      <View style={styles.answerCard}>
        <View style={styles.answerHeader}>
          <View style={styles.answerAvatar}>
            <Ionicons name="sparkles" size={14} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.answerTitle}>Found 12 photos from your Goa trip</Text>
            <Text style={styles.answerSub}>Feb 14 – Feb 20, 2026 · 4 with family</Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: spacing.md }}
        >
          {demoPhotos.slice(0, 6).map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.url }}
              style={{ width: 84, height: 84, borderRadius: radius.sm }}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function UnderstandList() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>What SnapNext has quietly noticed</Text>
      <View style={styles.insightList}>
        {UNDERSTAND_INSIGHTS.map((it, i) => (
          <View
            key={it.id}
            style={[styles.insightRow, i === UNDERSTAND_INSIGHTS.length - 1 && { borderBottomWidth: 0 }]}
            testID={`ai-insight-${it.id}`}
          >
            <View style={styles.insightIcon}>
              <Ionicons name={it.icon} size={16} color={colors.brand.cyan} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightTitle}>{it.title}</Text>
              <Text style={styles.insightBody}>{it.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function CreateGrid() {
  const drafts = [
    { id: "c1", title: "Caption ready", body: '"Golden hour, quieter than we remember."', tag: "Caption" },
    { id: "c2", title: "Goa 2026 story", body: "6 chapters · 47 photos · 1 min read", tag: "Story" },
    { id: "c3", title: "Ladakh reel idea", body: "15-sec cut · Lo-fi audio", tag: "Reel" },
    { id: "c4", title: "Weekend post", body: "1 photo · witty caption", tag: "Post" },
  ];
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Ready when you are</Text>
      <View style={styles.createGrid}>
        {drafts.map((d) => (
          <View key={d.id} style={styles.createCard} testID={`ai-draft-${d.id}`}>
            <View style={styles.createTag}>
              <Text style={styles.createTagText}>{d.tag}</Text>
            </View>
            <Text style={styles.createTitle}>{d.title}</Text>
            <Text style={styles.createBody}>{d.body}</Text>
            <TouchableOpacity style={styles.createCta} testID={`ai-draft-preview-${d.id}`}>
              <Text style={styles.createCtaText}>Preview</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.brand.purple} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

function OrganizeList() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Little cleanups</Text>
      <View style={styles.insightList}>
        {ORGANIZE_ITEMS.map((it, i) => (
          <TouchableOpacity
            key={it.id}
            activeOpacity={0.85}
            style={[styles.insightRow, i === ORGANIZE_ITEMS.length - 1 && { borderBottomWidth: 0 }]}
            testID={`ai-organize-${it.id}`}
          >
            <View style={[styles.insightIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <Ionicons name={it.icon} size={16} color={colors.status.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightTitle}>{it.title}</Text>
              <Text style={styles.insightBody}>{it.body}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RememberList() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Waiting for you</Text>
      <View style={styles.insightList}>
        {REMEMBER_ITEMS.map((it, i) => (
          <TouchableOpacity
            key={it.id}
            activeOpacity={0.85}
            style={[styles.insightRow, i === REMEMBER_ITEMS.length - 1 && { borderBottomWidth: 0 }]}
            testID={`ai-remember-${it.id}`}
          >
            <View style={[styles.insightIcon, { backgroundColor: "rgba(244,114,182,0.15)" }]}>
              <Ionicons name={it.icon} size={16} color="#F472B6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightTitle}>{it.title}</Text>
              <Text style={styles.insightBody}>{it.body}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
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
  aiBadge: {
    width: 44,
    height: 44,
    borderRadius: 999,
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  aiBadgeInner: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  // Ask hero (always present)
  askHero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.25)",
    overflow: "hidden",
  },
  askHeroTitle: { ...typography.h2, color: colors.text.primary },
  askHeroSub: { ...typography.small, color: colors.text.secondary, marginTop: 4, marginBottom: spacing.lg, lineHeight: 18 },
  promptWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 6,
    paddingLeft: 8,
  },
  promptInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 40,
    maxHeight: 100,
    outlineWidth: 0,
  } as any,
  sendBtn: { width: 40, height: 40, borderRadius: 12, overflow: "hidden" },
  sendBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },

  capabilitiesLabel: {
    ...typography.tiny,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },

  tabsRow: { height: 44 },
  tabsContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  tab: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.default,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabText: { ...typography.small, fontWeight: "600" },

  subHero: {
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
  subHeroIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  subHeroTitle: { ...typography.title, color: colors.text.primary },
  subHeroSub: { ...typography.tiny, color: colors.text.secondary, marginTop: 2, lineHeight: 15 },

  tryLabel: {
    ...typography.tiny,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    textTransform: "uppercase",
  },
  examples: { gap: 6, paddingHorizontal: spacing.lg },
  exampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  exampleText: { ...typography.small, color: colors.text.primary, flex: 1 },

  h3: {
    ...typography.h3,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },

  // Ask answer
  answerCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  answerHeader: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  answerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.brand.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  answerTitle: { ...typography.title, color: colors.text.primary },
  answerSub: { ...typography.tiny, color: colors.text.secondary, marginTop: 2 },

  // Insight list
  insightList: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: "hidden",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(6,182,212,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: { ...typography.title, color: colors.text.primary },
  insightBody: { ...typography.small, color: colors.text.secondary, marginTop: 2 },

  // Create
  createGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  createCard: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: spacing.md,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: 6,
  },
  createTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(139,92,246,0.2)",
  },
  createTagText: { ...typography.tiny, color: colors.brand.purple, fontWeight: "700" },
  createTitle: { ...typography.title, color: colors.text.primary },
  createBody: { ...typography.tiny, color: colors.text.secondary, lineHeight: 16 },
  createCta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  createCtaText: { ...typography.tiny, color: colors.brand.purple, fontWeight: "700" },

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
