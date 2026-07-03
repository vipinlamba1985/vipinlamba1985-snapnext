// SnapNext AI — Design tokens for the mobile prototype.
// Dark surfaces, pink/purple/cyan accents, restrained gradients.

export const colors = {
  bg: {
    base: "#0B0C10",
    surface: "#121318",
    elevated: "#1A1C23",
    overlay: "rgba(11, 12, 16, 0.85)",
  },
  text: {
    primary: "#F8FAFC",
    secondary: "#94A3B8",
    muted: "#64748B",
    inverse: "#020617",
  },
  brand: {
    pink: "#EC4899",
    cyan: "#06B6D4",
    purple: "#8B5CF6",
  },
  status: {
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
  },
  border: {
    subtle: "rgba(255, 255, 255, 0.06)",
    default: "rgba(255, 255, 255, 0.10)",
    strong: "rgba(255, 255, 255, 0.18)",
  },
};

// Gradient stop arrays (for expo-linear-gradient).
export const gradients = {
  aiAccent: ["#EC4899", "#8B5CF6", "#06B6D4"] as const,
  aiSoft: ["rgba(236,72,153,0.18)", "rgba(139,92,246,0.14)", "rgba(6,182,212,0.14)"] as const,
  purpleFade: ["#8B5CF6", "#4C1D95"] as const,
  cyanFade: ["#06B6D4", "#0E7490"] as const,
  pinkFade: ["#EC4899", "#9D174D"] as const,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.6 },
  h2: { fontSize: 22, fontWeight: "700" as const, letterSpacing: -0.4 },
  h3: { fontSize: 18, fontWeight: "600" as const, letterSpacing: -0.2 },
  title: { fontSize: 16, fontWeight: "600" as const },
  body: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  small: { fontSize: 12, fontWeight: "400" as const, lineHeight: 16 },
  tiny: { fontSize: 11, fontWeight: "500" as const, letterSpacing: 0.4 },
};
