import * as Radix from "@radix-ui/react-alert-dialog";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** "danger" renders the confirm button in rose-600. */
  confirmVariant?: "default" | "danger";
  onConfirm: () => void;
}

/**
 * Accessible confirmation dialog built on Radix UI AlertDialog.
 * Usage pattern:
 *
 *   const [pendingId, setPendingId] = useState<string | null>(null);
 *
 *   <AlertDialog
 *     open={pendingId !== null}
 *     onOpenChange={(o) => { if (!o) setPendingId(null); }}
 *     title="…"
 *     description="…"
 *     confirmLabel="Apagar"
 *     confirmVariant="danger"
 *     onConfirm={() => { doDelete(pendingId!); setPendingId(null); }}
 *   />
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  confirmVariant = "default",
  onConfirm,
}: AlertDialogProps) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Radix.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <Radix.Title className="text-base font-semibold text-zinc-900">
            {title}
          </Radix.Title>
          <Radix.Description className="mt-2 text-sm text-zinc-600">
            {description}
          </Radix.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Radix.Cancel className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50">
              Cancelar
            </Radix.Cancel>
            <Radix.Action
              onClick={onConfirm}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                confirmVariant === "danger"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-zinc-900 hover:bg-zinc-800"
              }`}
            >
              {confirmLabel}
            </Radix.Action>
          </div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
