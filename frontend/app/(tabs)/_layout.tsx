import { Tabs } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, gradients } from "@/src/theme";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName; label: string }> = {
  index: { active: "home", inactive: "home-outline", label: "Home" },
  gallery: { active: "images", inactive: "images-outline", label: "Gallery" },
  upload: { active: "add", inactive: "add", label: "Upload" },
  memories: { active: "time", inactive: "time-outline", label: "Memories" },
  ai: { active: "sparkles", inactive: "sparkles-outline", label: "AI" },
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.tabWrap,
        { paddingBottom: Math.max(insets.bottom, 10) },
      ]}
      testID="bottom-tab-bar"
    >
      <View style={styles.tabInner}>
        {state.routes.map((route, index) => {
          const meta = TAB_ICONS[route.name];
          if (!meta) return null;
          const isFocused = state.index === index;
          const isCenter = route.name === "upload";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          if (isCenter) {
            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                activeOpacity={0.85}
                style={styles.centerBtnWrap}
                testID="tab-upload-button"
              >
                <LinearGradient
                  colors={gradients.aiAccent as unknown as string[]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.centerBtn}
                >
                  <Ionicons name="add" size={26} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          const iconName = isFocused ? meta.active : meta.inactive;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tabBtn}
              testID={`tab-${route.name}-button`}
            >
              <Ionicons
                name={iconName}
                size={22}
                color={isFocused ? colors.text.primary : colors.text.secondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.text.primary : colors.text.secondary },
                ]}
              >
                {meta.label}
              </Text>
              {isFocused ? <View style={styles.activeDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="upload" />
      <Tabs.Screen name="memories" />
      <Tabs.Screen name="ai" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(11,12,16,0.92)",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    height: 60,
    justifyContent: "space-between",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  tabLabel: { fontSize: 10, fontWeight: "600" },
  activeDot: {
    position: "absolute",
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.brand.pink,
  },
  centerBtnWrap: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    shadowColor: "#EC4899",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    borderWidth: 3,
    borderColor: "#0B0C10",
  },
});
