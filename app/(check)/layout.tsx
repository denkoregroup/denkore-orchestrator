import { Bricolage_Grotesque, JetBrains_Mono, Source_Sans_3 } from "next/font/google";

// Variable fonts: Bricolage Grotesque goes down to weight 200 for the headline's light middle words.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

/** The site check has no app chrome: a dark screen to show across a table, and white paper when printed. */
export default function CheckLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${bricolage.variable} ${sourceSans.variable} ${jetbrainsMono.variable} site-check min-h-dvh bg-check-bg font-copy text-check-ink`}>
      {children}
    </div>
  );
}
