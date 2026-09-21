import type { Metadata } from "next";
import "./globals.css";
import { FACTORY_VERSION, RELEASE_STATUS } from "@/lib/factory/schema";

export const metadata: Metadata = {
  title: "AI Delivery Factory",
  description: "A governed, evidence-driven delivery control plane with stateless AI specialists and human authority.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          {children}
          <div className="footer">
            AI Delivery Factory · v{FACTORY_VERSION} {RELEASE_STATUS} · certified rollback baseline v1.3 · conversation history is never authoritative state
          </div>
        </div>
      </body>
    </html>
  );
}
