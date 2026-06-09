import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatleaf — Conversations that grow your business",
  description:
    "Chatleaf is a multi-channel marketing & lead platform — build WhatsApp chatbots, run broadcasts, and handle live chats.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Figtree — the Chatleaf typeface (Brand Guide §04). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NextTopLoader
          color="#0e7490"
          height={3}
          shadow="0 0 10px #0e7490,0 0 5px #0e7490"
          showSpinner={false}
        />
        {children}
      </body>
    </html>
  );
}
