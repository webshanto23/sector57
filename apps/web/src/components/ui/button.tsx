import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Matches the mockup's `.btn`: 8px radius, 7px 13px padding, medium weight, 7px icon gap.
// Variant names stay shadcn's so generated shadcn components keep working:
// default = `.btn.primary`, outline = plain `.btn`, destructive = `.btn.danger`.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-[7px] rounded-[8px] border border-transparent font-medium leading-[1.4] whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px]",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground hover:border-[var(--accent-brand-strong)] hover:bg-[var(--accent-brand-strong)]",
        outline: "border-line bg-surface text-fg hover:border-muted-foreground",
        secondary: "bg-surface-2 text-fg hover:border-line",
        ghost: "bg-transparent text-fg hover:bg-surface-2",
        destructive: "border-bad-soft bg-bad-soft text-bad hover:border-bad",
        link: "h-auto px-0 py-0 font-semibold text-primary underline-offset-[3px] hover:underline",
      },
      size: {
        default: "px-[13px] py-[7px]",
        sm: "px-2.5 py-1 text-[12.5px]",
        lg: "px-4 py-2.5",
        pill: "rounded-full px-[11px] py-[5px] text-[12.5px]",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
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
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
