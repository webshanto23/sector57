import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি",
    template: "%s | উত্তরা সেক্টর ৫৭",
  },
  description: "উত্তরা সেক্টর ৫৭ কল্যাণ সমিতির নোটিশ, সদস্য সেবা ও কমিটির তথ্য।",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="bn" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
