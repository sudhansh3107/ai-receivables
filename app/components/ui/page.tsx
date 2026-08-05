import { ReactNode } from "react";
import { tokens } from "@/lib/theme/tokens";

interface PageProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function Page({
  children,
  className = "",
  maxWidth,
}: PageProps) {
  return (
    <main
      className={className}
      style={{
        width: "100%",
        maxWidth: maxWidth ?? tokens.layout.contentMaxWidth,
        margin: "0 auto",
        padding: tokens.layout.contentPadding,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing.xl,
      }}
    >
      {children}
    </main>
  );
}