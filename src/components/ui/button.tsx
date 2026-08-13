import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_rgb(18_50_39_/_0.28)] hover:-translate-y-px hover:bg-primary-hover",
        primary: "bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_rgb(18_50_39_/_0.28)] hover:-translate-y-px hover:bg-primary-hover",
        accent: "bg-accent-marigold text-primary shadow-[0_8px_20px_-6px_rgb(18_50_39_/_0.22)] hover:-translate-y-px hover:brightness-95",
        "primary-on-ink": "bg-background text-primary hover:-translate-y-px hover:bg-background/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-[1.5px] border-border bg-card text-primary shadow-xs hover:bg-surface hover:border-primary/25",
        secondary:
          "border-[1.5px] border-border bg-card text-primary shadow-xs hover:bg-surface hover:border-primary/25",
        ghost:
          "text-muted-foreground hover:bg-surface hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline [&_svg]:transition-transform hover:[&_svg]:translate-x-0.5",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-[52px] px-7 text-base has-[>svg]:px-5",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
