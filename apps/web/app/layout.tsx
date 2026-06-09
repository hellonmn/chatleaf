import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
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
      <body>
        <NextTopLoader
          color="#25D366"
          height={3}
          shadow="0 0 10px #25D366,0 0 5px #25D366"
          showSpinner={false}
        />
        {children}
      </body>
    </html>
  );
}
