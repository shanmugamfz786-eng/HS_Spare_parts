import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | HS Spare Parts",
    default: "HS Spare Parts — Right Part. Right Price.",
  },
  description:
    "Discover genuine and verified automotive spare parts for your car. Browse engine parts, suspension, steering, brakes, and more with guaranteed compatibility.",
  keywords: [
    "automotive spare parts",
    "car parts online",
    "genuine auto spares",
    "suspension and steering",
    "engine parts",
    "brake pads",
  ],
  authors: [{ name: "HS Spare Parts" }],
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#090D18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="min-h-screen bg-ink text-paper antialiased flex flex-col selection:bg-ember selection:text-paper">
        {children}
      </body>
    </html>
  );
}
