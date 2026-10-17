import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Chat OLAP · Analytics workspace",
  description:
    "Explore PostgreSQL data with inspectable cubes and grounded analytical answers.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
