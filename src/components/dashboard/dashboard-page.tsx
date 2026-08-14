import * as React from "react";

import { cn } from "@/lib/utils";

const widthClass = {
  /** Overview / wide metric grids */
  lg: "max-w-6xl",
  /** Reviews and general dashboard content */
  md: "max-w-5xl",
  /** Settings-style forms */
  sm: "max-w-3xl",
} as const;

export type DashboardPageWidth = keyof typeof widthClass;

export function DashboardPage({
  children,
  width = "md",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  width?: DashboardPageWidth;
}) {
  return (
    <div
      className={cn("mx-auto w-full space-y-8", widthClass[width], className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DashboardPageHeader({
  title,
  description,
  children,
  className,
  kicker,
  align = "start",
  ...props
}: React.ComponentProps<"header"> & {
  title: string;
  description?: React.ReactNode;
  kicker?: string;
  align?: "start" | "center";
}) {
  const centered = align === "center";

  return (
    <header className={cn("space-y-3", centered && "text-center", className)} {...props}>
      {kicker ? (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-marigold">{kicker}</p>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-4",
          centered
            ? "items-center"
            : "sm:flex-row sm:items-start sm:justify-between"
        )}
      >
        <div className={cn("space-y-1", !centered && "min-w-0")}>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">{title}</h1>
          {description ? (
            <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {children ? (
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center gap-2",
              centered && "justify-center"
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function DashboardSection({
  title,
  description,
  children,
  className,
  ...props
}: React.ComponentProps<"section"> & {
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-primary">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
