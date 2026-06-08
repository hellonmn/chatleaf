import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watool — WhatsApp Chatbot Portal",
  description: "Build and run WhatsApp chatbots for your business.",
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
