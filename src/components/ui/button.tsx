import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-hover disabled:bg-line-strong disabled:text-muted disabled:opacity-100",
        secondary: "border border-line-strong bg-surface text-ink hover:border-ink/30",
        ghost: "text-ink hover:bg-field",
        soft: "bg-tint text-brand-ink hover:bg-[#cbe9eb]",
        dark: "bg-ink text-white hover:bg-ink-2",
        onDark: "bg-white text-ink hover:bg-white/90",
        danger: "border border-[#f1c6bc] bg-surface text-danger hover:bg-danger-tint",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-14 rounded-2xl px-6 text-base",
        md: "h-11 rounded-xl px-4 text-[15px]",
        sm: "h-9 rounded-lg px-3 text-sm",
        icon: "size-11 rounded-full",
        iconSm: "size-9 rounded-full",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, block, asChild, loading, children, disabled, ...props }: Props) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <LoaderCircle className="size-[18px] animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
