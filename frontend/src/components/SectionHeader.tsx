import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "@/src/theme";

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

export default function SectionHeader({ title, subtitle, actionLabel, onAction, testID }: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={12}
          style={styles.actionBtn}
          testID={testID ? `${testID}-action` : undefined}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.text.secondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.h3, color: colors.text.primary },
  subtitle: { ...typography.small, color: colors.text.secondary, marginTop: 2 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionText: { ...typography.small, color: colors.text.secondary, fontWeight: "600" },
});
