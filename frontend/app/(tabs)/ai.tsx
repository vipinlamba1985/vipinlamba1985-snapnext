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
}> = {
  ask: {
    icon: "search",
    color: "#EC4899",
    headline: "Ask your archive",
    subhead: "Natural-language search over your memories.",
  },
  understand: {
    icon: "analytics",
    color: "#06B6D4",
    headline: "Understand your life",
    subhead: "See patterns SnapNext AI found across your archive.",
  },
  create: {
    icon: "color-wand",
    color: "#8B5CF6",
    headline: "Create from your moments",
    subhead: "Captions, stories, and social drafts — from your own photos.",
  },
  organize: {
    icon: "sparkles",
    color: "#10B981",
    headline: "Organize your archive",
    subhead: "Duplicates, albums, and cleanup suggestions.",
  },
};

const UNDERSTAND_INSIGHTS = [
  {
    id: "u1",
    icon: "location" as const,
    title: "Your top place is Cubbon Park",
    body: "42 visits captured — mostly weekends with Milo.",
  },
  {
    id: "u2",
    icon: "people" as const,
    title: "Family shows up in 38% of your photos",
    body: "Mom appears most often, followed by Dad and Ananya.",
  },
  {
    id: "u3",
    icon: "images" as const,
    title: "3 unfinished stories",
    body: "Goa 2026, Diwali 2025, and Ladakh have enough material to publish.",
  },
];

const ORGANIZE_ITEMS = [
  { id: "o1", icon: "copy-outline" as const, title: "42 possible duplicates", body: "Review before removing." },
  { id: "o2", icon: "folder-outline" as const, title: "Suggested album: Weekend brunches", body: "18 photos over 6 months." },
  { id: "o3", icon: "eye-off-outline" as const, title: "Screenshots pile-up", body: "112 screenshots — clean up in one tap." },
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
            <Text style={styles.pageSub}>Ask · Understand · Create · Organize</Text>
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

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            testID="ai-tabs"
          >
            {aiTabs.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[styles.tab, active && styles.tabActive]}
                  activeOpacity={0.85}
                  testID={`ai-tab-${t.key}`}
                >
                  <Ionicons
                    name={TAB_META[t.key].icon}
                    size={14}
                    color={active ? colors.text.primary : colors.text.secondary}
                  />
                  <Text
                    style={[styles.tabText, { color: active ? colors.text.primary : colors.text.secondary }]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Prompt hero */}
        <View style={styles.heroCard} testID={`ai-hero-${tab}`}>
          <View style={[styles.heroIcon, { backgroundColor: `${meta.color}22` }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <Text style={styles.heroHead}>{meta.headline}</Text>
          <Text style={styles.heroSub}>{meta.subhead}</Text>

          <View style={styles.promptWrap}>
            <TextInput
              style={styles.promptInput}
              placeholder={
                tab === "ask"
                  ? "e.g. Find photos from my Goa trip"
                  : tab === "understand"
                    ? "What have you learned about me?"
                    : tab === "create"
                      ? "Write a caption for last weekend"
                      : "Find duplicates in my archive"
              }
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

          <Text style={styles.exampleLabel}>Try one of these</Text>
          <View style={styles.examples}>
            {aiExamples[tab].map((ex) => (
              <TouchableOpacity
                key={ex}
                style={styles.exampleChip}
                onPress={() => setPrompt(ex)}
                activeOpacity={0.85}
                testID={`ai-example-${tab}`}
              >
                <Text style={styles.exampleText} numberOfLines={1}>
                  {ex}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tab-specific content */}
        {tab === "ask" ? <AskResults /> : null}
        {tab === "understand" ? <UnderstandList /> : null}
        {tab === "create" ? <CreateGrid /> : null}
        {tab === "organize" ? <OrganizeList /> : null}

        <Text style={styles.footerNote}>
          AI responses shown here are illustrative. Real AI uses your own archive with strict privacy.
        </Text>
      </ScrollView>
    </View>
  );
}

function AskResults() {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Recent answer preview</Text>
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
      <Text style={styles.h3}>What SnapNext AI has learned</Text>
      <View style={styles.insightList}>
        {UNDERSTAND_INSIGHTS.map((it) => (
          <View key={it.id} style={styles.insightRow} testID={`ai-insight-${it.id}`}>
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
    { id: "c1", title: "Caption draft", body: '"Golden hour, quieter than we remember."', tag: "Caption" },
    { id: "c2", title: "Story: Goa 2026", body: "6 scenes · 47 photos · 1 min read", tag: "Story" },
    { id: "c3", title: "Reel concept", body: "Ladakh · 15-sec cut · Lo-fi audio", tag: "Video" },
    { id: "c4", title: "Social post", body: "1 photo + witty caption for Instagram", tag: "Post" },
  ];
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h3}>Draft ideas from your archive</Text>
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
      <Text style={styles.h3}>Cleanup suggestions</Text>
      <View style={styles.insightList}>
        {ORGANIZE_ITEMS.map((it) => (
          <TouchableOpacity
            key={it.id}
            activeOpacity={0.85}
            style={styles.insightRow}
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

  tabsRow: { height: 44, marginBottom: spacing.md },
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
  tabActive: {
    backgroundColor: "rgba(139,92,246,0.18)",
    borderColor: colors.brand.purple,
  },
  tabText: { ...typography.small, fontWeight: "600" },

  heroCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  heroHead: { ...typography.h2, color: colors.text.primary },
  heroSub: { ...typography.small, color: colors.text.secondary, marginTop: 4, lineHeight: 18 },

  promptWrap: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: 6,
    paddingLeft: 14,
  },
  promptInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 14,
    paddingVertical: 10,
    minHeight: 40,
    maxHeight: 100,
    outlineWidth: 0,
  } as any,
  sendBtn: { width: 40, height: 40, borderRadius: 12, overflow: "hidden" },
  sendBtnInner: { flex: 1, alignItems: "center", justifyContent: "center" },

  exampleLabel: {
    ...typography.tiny,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  examples: { gap: spacing.sm },
  exampleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  exampleText: { ...typography.small, color: colors.text.primary },

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

  footerNote: {
    marginTop: spacing.xl,
    ...typography.tiny,
    color: colors.text.muted,
    textAlign: "center",
    marginHorizontal: spacing.lg,
    lineHeight: 15,
  },
});
