import { createTheme, type MantineColorsTuple } from "@mantine/core";

const honey: MantineColorsTuple = [
  "#fef3c7",
  "#fde68a",
  "#fcd34d",
  "#fbbf24",
  "#f59e0b",
  "#d97706",
  "#b45309",
  "#92400e",
  "#78350f",
  "#451a03",
];

const ember: MantineColorsTuple = [
  "#fff1ee",
  "#ffd9d1",
  "#ffb7a1",
  "#ff8e6f",
  "#ff6645",
  "#f0451f",
  "#cc3414",
  "#9c2510",
  "#6e190a",
  "#3d0d05",
];

export const theme = createTheme({
  primaryColor: "honey",
  primaryShade: { light: 6, dark: 4 },
  defaultRadius: "md",
  colors: {
    honey,
    ember,
  },
  fontFamily:
    "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  fontFamilyMonospace:
    "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
  headings: {
    fontFamily:
      "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: "1.05" },
      h2: { fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", lineHeight: "1.15" },
      h3: { fontSize: "clamp(1.25rem, 2.5vw, 1.625rem)", lineHeight: "1.25" },
    },
  },
});
