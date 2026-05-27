import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "../components/AppNav";
import { AppProviders } from "../components/AppProviders";
import { getServerSession } from "../lib/server-auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Family Meals HQ",
    template: "%s | Family Meals HQ",
  },
  description: "Family meal planning — recipes, fresh inventory, and weekly meals",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Record<string, string | string[]>>;
}>) {
  await params;
  const session = await getServerSession();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-base text-primary antialiased">
        <AppProviders initialSession={session}>
          <AppNav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
