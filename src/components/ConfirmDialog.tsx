import { ReactNode } from "react";

type Props = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modale de confirmation cohérente avec le thème dark de l'app.
 * Remplace les confirm() / alert() natifs du navigateur.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 p-4 backdrop-blur"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{title}</h2>
        {message && (
          <div className="mt-2 text-sm text-muted-foreground">{message}</div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold hover:bg-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-md py-2.5 text-sm font-bold text-primary-foreground ${
              destructive
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-gradient-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
