import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium outline-none transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.08),0_4px_12px_-4px_rgb(0_0_0/0.25),inset_0_1px_0_0_rgb(255_255_255/0.12)] hover:shadow-[0_1px_2px_0_rgb(0_0_0/0.1),0_6px_16px_-4px_rgb(0_0_0/0.3),inset_0_1px_0_0_rgb(255_255_255/0.12)] hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.08),0_4px_12px_-4px_rgb(0_0_0/0.2),inset_0_1px_0_0_rgb(255_255_255/0.1)] hover:shadow-[0_1px_2px_0_rgb(0_0_0/0.1),0_6px_16px_-4px_rgb(0_0_0/0.25),inset_0_1px_0_0_rgb(255_255_255/0.1)] hover:-translate-y-px",
        outline:
          "border border-input bg-background/80 shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-foreground/20",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
