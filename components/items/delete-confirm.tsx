'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DeleteConfirm({
  open,
  onOpenChange,
  itemTitle,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemTitle: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-[var(--rule)]">
        <DialogHeader className="text-left space-y-3">
          <span className="mono-tag text-muted-foreground">подтверди</span>
          <DialogTitle className="display text-3xl ink leading-tight tracking-tight">
            Удалить пункт?
          </DialogTitle>
        </DialogHeader>

        <p className="text-base ink leading-relaxed mt-2">
          <span className="display-italic text-primary">«{itemTitle}»</span> исчезнет
          у&nbsp;всех семей. Отменить нельзя.
        </p>

        <div className="hairline-t pt-4 mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="mono-tag text-muted-foreground hover:text-foreground transition-colors px-3 py-2 text-left sm:text-center"
          >
            отмена
          </button>
          <button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="h-11 px-5 rounded-full bg-destructive text-background text-sm tracking-tight hover:bg-destructive/90 transition-colors"
          >
            удалить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
