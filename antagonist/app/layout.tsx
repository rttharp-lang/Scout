import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { season } from "@/content/season";

const archivo = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${season.meta.platform} — ${season.meta.chapter} · ${season.meta.division}`,
  description: `${season.meta.division} · ${season.meta.season} ${season.meta.subtitle}. Internal creative direction.`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: season.palette.ink,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const p = season.palette;
  const vars = `:root{--ink:${p.ink};--paper:${p.paper};--accent:${p.accent};--clash:${p.clash};--mute:${p.mute};}`;
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: vars }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
