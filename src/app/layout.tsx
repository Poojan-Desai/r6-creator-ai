import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "R6 Creator AI",
    template: "%s · R6 Creator AI",
  },
  description:
    "A private local workspace for turning Rainbow Six Siege recordings into clips and content packages.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
