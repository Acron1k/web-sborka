'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DuplicateDialog({
  open,
  existingTitle,
  newTitle,
  onMerge,
  onKeepBoth,
  onCancel,
}: {
  open: boolean;
  existingTitle: string;
  newTitle: string;
  onMerge: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="sm:max-w-md bg-background border-[var(--rule)]">
        <DialogHeader className="text-left space-y-3">
          <span className="mono-tag text-muted-foreground">похоже на дубль</span>
          <DialogTitle className="display text-3xl ink leading-tight tracking-tight">
            Такой пункт уже есть
          </DialogTitle>
        </DialogHeader>

        <p className="text-base ink leading-relaxed mt-2">
          Ты добавляешь{' '}
          <span className="display-italic text-primary">«{newTitle}»</span>,
          но в&nbsp;списке уже значится{' '}
          <span className="display-italic text-primary">«{existingTitle}»</span>.
        </p>

        <div className="hairline-t pt-4 mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            onClick={onCancel}
            className="mono-tag text-muted-foreground hover:text-foreground transition-colors px-3 py-2 text-left sm:text-center"
          >
            отмена
          </button>
          <button
            onClick={onKeepBoth}
            className="h-11 px-5 rounded-full border border-foreground text-foreground text-sm tracking-tight hover:bg-foreground/[0.04] transition-colors"
          >
            это другое
          </button>
          <button
            onClick={onMerge}
            className="h-11 px-5 rounded-full bg-foreground text-background text-sm tracking-tight hover:bg-foreground/90 transition-colors"
          >
            Беру существующий
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
