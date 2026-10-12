"use client";

import { useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const DESKTOP = "(min-width: 768px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Rendered beside the title (e.g. an active-filter count) */
  titleExtra?: React.ReactNode;
  /** Replaces the close button (e.g. "Clear all"); the sheet still closes by swipe, overlay tap or Escape */
  action?: React.ReactNode;
};

/**
 * Bottom sheet (vaul drawer) on phones; a centred dialog on wider screens.
 * Vaul is bottom-anchored and paints an overscroll strip under the panel, so it can't be centred.
 */
export function Sheet(props: Props) {
  return useDesktop() ? <DesktopSheet {...props} /> : <MobileSheet {...props} />;
}

function MobileSheet({ open, onOpenChange, title, description, children, footer, className, titleExtra, action }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Drawer.Content className={cn("fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface outline-none", className)}>
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
          <Header
            title={<Drawer.Title className="flex items-center gap-2 font-display text-xl font-bold">{title}{titleExtra}</Drawer.Title>}
            description={<Drawer.Description className={description ? "mt-0.5 text-sm text-muted" : "sr-only"}>{description ?? title}</Drawer.Description>}
            action={action ?? <Drawer.Close className={closeCls} aria-label="Close"><X className="size-4" /></Drawer.Close>}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="safe-bottom border-t border-line px-5 pt-3 pb-3">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DesktopSheet({ open, onOpenChange, title, description, children, footer, className, titleExtra, action }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "sheet-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,88dvh)] w-[calc(100%-48px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] bg-surface pt-2 shadow-[0_24px_64px_-16px_rgb(12_35_38/0.35)] outline-none",
            className,
          )}
        >
          <Header
            title={<Dialog.Title className="flex items-center gap-2 font-display text-xl font-bold">{title}{titleExtra}</Dialog.Title>}
            description={<Dialog.Description className={description ? "mt-0.5 text-sm text-muted" : "sr-only"}>{description ?? title}</Dialog.Description>}
            action={action ?? <Dialog.Close className={closeCls} aria-label="Close"><X className="size-4" /></Dialog.Close>}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const closeCls = "-mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-field text-ink hover:bg-line";

function Header({ title, description, action }: { title: React.ReactNode; description: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
      <div>
        {title}
        {description}
      </div>
      {action}
    </div>
  );
}
