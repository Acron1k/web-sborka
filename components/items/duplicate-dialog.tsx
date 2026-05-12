'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Похожий пункт уже есть</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Ты добавляешь <b>«{newTitle}»</b>, но в списке уже есть <b>«{existingTitle}»</b>.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>Отмена</Button>
          <Button variant="secondary" onClick={onKeepBoth}>Это другое</Button>
          <Button onClick={onMerge}>Беру существующий</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
