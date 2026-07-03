import { View, Text, StyleSheet } from "react-native";
import { colors, radius, typography } from "@/src/theme";

// Discreet but always visible "prototype/demo data" pill.
// This is intentional per the brief — the whole app is a UX reference,
// so we never let the viewer forget these are not real memories.
export default function DemoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View
      style={[styles.wrap, compact && styles.compact]}
      testID="demo-data-badge"
    >
      <View style={styles.dot} />
      <Text style={styles.text}>{compact ? "DEMO" : "DEMO DATA"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  compact: { paddingHorizontal: 6, paddingVertical: 2 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.status.warning,
  },
  text: {
    ...typography.tiny,
    color: colors.status.warning,
    fontWeight: "700",
  },
});
