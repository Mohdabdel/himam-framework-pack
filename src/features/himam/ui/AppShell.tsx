import { cn } from "@/lib/utils";

export interface AppShellProps {
  children: React.ReactNode;
  className?: string;
  width?: "narrow" | "regular" | "wide";
}

const WIDTH_CLASS: Record<NonNullable<AppShellProps["width"]>, string> = {
  narrow: "max-w-2xl",
  regular: "max-w-4xl",
  wide: "max-w-6xl",
};

// RTL page shell shared by every HIMAM operational screen.
export function AppShell({ children, className, width = "regular" }: AppShellProps) {
  return (
    <div dir="rtl" className={cn("min-h-screen bg-background font-sans text-foreground")}>
      <div className={cn("mx-auto px-6 py-8", WIDTH_CLASS[width], className)}>{children}</div>
    </div>
  );
}
