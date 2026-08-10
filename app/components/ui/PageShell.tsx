import { ReactNode } from "react";

interface PageProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function Page({
  children,
  className = "",
  maxWidth = "1600px",
}: PageProps) {
  return (
    <main
      className={className}
      style={{
        width: "100%",
        maxWidth,
        margin: "0 auto",
        padding: "20px 36px 32px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </main>
  );
}