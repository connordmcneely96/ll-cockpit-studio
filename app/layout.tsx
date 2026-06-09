import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Movie Studio — LL Cockpit",
  description: "Movie Studio worker",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
