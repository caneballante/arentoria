import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arentoria · DM City Index",
  description: "A local-first municipal archive and live-session reference for Arentoria.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
