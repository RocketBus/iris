import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Iris",
  description:
    "Iris privacy policy — how we handle your data, what we collect, and your rights.",
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
