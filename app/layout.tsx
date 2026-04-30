import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Colour Wheel Explorer",
  description:
    "Explore colours and palettes in OKLCH space — hue by segment, value × chroma per grid",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
