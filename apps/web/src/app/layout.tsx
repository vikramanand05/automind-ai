import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import { Providers } from "@/components/providers";
export const metadata: Metadata = {
  title: "AutoMind AI · Industrial Intelligence",
  description:
    "Industrial knowledge, visual inspection and production intelligence in one local platform.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('automind-theme')||'dark';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){document.documentElement.dataset.theme='dark'}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
