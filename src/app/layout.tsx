import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import { Snow } from "@/components/snow";
import "./globals.css";

const body = Geist({ variable: "--font-body", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "800"] });

export const metadata: Metadata = {
  title: "White Elephant",
  description: "A white elephant gift exchange with secret gift challenges and chaotic twists.",
};

export const viewport: Viewport = {
  themeColor: "#1f5b41",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="relative min-h-full flex flex-col font-sans">
        <Snow />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
