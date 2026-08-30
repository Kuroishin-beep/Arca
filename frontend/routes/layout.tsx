import type { Metadata, Viewport } from "next";

import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Arca",
  description:
    "Shared inventory for a Dragonbane Westmarch campaign, running as a TaleSpire Symbiote.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The panel is narrow and the content is dense; letting the user zoom is the
  // accessibility escape hatch, so it is never disabled.
  //
  // Two values so the browser chrome matches the page in both themes — a white
  // page under a near-black title bar is the tell that a theme was bolted on.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
