import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./landing.css";
export const metadata: Metadata = {
  title: "Cube Chat · A clearer conversation with your data",
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
