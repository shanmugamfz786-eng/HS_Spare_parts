import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: {
    template: "%s | HS Spare Parts",
    default: "HS Spare Parts — Right Part. Right Price. Guaranteed Fitment.",
  },
  description:
    "Discover quality automotive spare parts for your car. Browse engine parts, suspension, steering, brakes, and more with vehicle fitment assistance.",
  keywords: [
    "automotive spare parts",
    "car parts online",
    "genuine auto spares India",
    "suspension and steering",
    "engine parts",
    "brake pads",
    "OEM car spares",
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
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen bg-[#F8F9FA] text-charcoal antialiased flex flex-col selection:bg-ember selection:text-paper">
        <Header />
        <main className="flex-1 flex flex-col">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
