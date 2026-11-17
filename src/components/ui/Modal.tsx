import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

// Reference-counted so stacked dialogs cannot hand scrolling back to the page
// while another dialog is still open.
let openDialogs = 0;
let pageOverflow = '';

function lockPageScroll() {
  if (openDialogs === 0) {
    pageOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogs += 1;
}

function unlockPageScroll() {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs === 0) document.body.style.overflow = pageOverflow;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
};

interface ModalShellProps {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Extra row rendered directly under the header (format tabs, toolbars...). */
  toolbar?: React.ReactNode;
  bodyClassName?: string;
  closeLabel?: string;
}

/**
 * Shared dialog frame. Centred card on desktop, bottom sheet on phones, with
 * focus restore, Escape handling, scroll lock and safe-area padding.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  toolbar,
  bodyClassName = '',
  closeLabel = 'Close dialog',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep focus inside the dialog: the page behind it must stay inert.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    lockPageScroll();
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      unlockPageScroll();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="pg-safe-top fixed inset-0 z-50 flex items-end justify-center bg-[var(--pg-overlay)] backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl outline-none sm:max-h-[88dvh] sm:rounded-lg ${SIZE_CLASS[size]}`}
      >
        {/* Sheet grab handle (phones only) */}
        <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-[var(--pg-border-strong)]" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--pg-border)] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-base font-semibold tracking-tight text-[var(--pg-text)]"
            >
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-0.5 font-mono-grid text-xs text-[var(--pg-muted)]">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="pg-tap -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--pg-muted)] transition-colors hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {toolbar ? (
          <div className="shrink-0 border-b border-[var(--pg-border)] bg-[var(--pg-well)]">
            {toolbar}
          </div>
        ) : null}

        <div className={`pg-sheet-body flex-1 overflow-y-auto pg-scroll ${bodyClassName}`}>
          {children}
        </div>

        {footer ? (
          <footer className="pg-safe-bottom flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-[var(--pg-border)] bg-[var(--pg-surface)] px-4 py-3 sm:px-5 sm:py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
};

interface SectionHeadingProps {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

/** Uppercase inspector-style section label with optional right-hand readout. */
export const SectionHeading: React.FC<SectionHeadingProps> = ({
  children,
  trailing,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-2 ${className}`}>
    <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pg-text)]">
      {children}
    </h2>
    {trailing ? <div className="shrink-0 text-xs text-[var(--pg-muted)]">{trailing}</div> : null}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

const BUTTON_VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--pg-accent)] text-[var(--pg-accent-ink)] font-semibold hover:opacity-90 active:scale-[0.98]',
  secondary:
    'border border-[var(--pg-border-strong)] bg-[var(--pg-elevated)] text-[var(--pg-text)] font-medium hover:border-[var(--pg-accent)] hover:text-[var(--pg-accent)]',
  ghost:
    'border border-transparent text-[var(--pg-muted)] font-medium hover:bg-[var(--pg-elevated)] hover:text-[var(--pg-text)]',
  danger:
    'border border-[var(--pg-danger)]/45 bg-[var(--pg-danger-soft)] text-[var(--pg-danger)] font-medium hover:border-[var(--pg-danger)]',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`pg-tap inline-flex items-center justify-center gap-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      size === 'md' ? 'min-h-[40px] px-3.5 py-2 text-xs' : 'min-h-[34px] px-2.5 py-1.5 text-xs'
    } ${BUTTON_VARIANT[variant]} ${className}`}
    {...rest}
  />
);

interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  /** Shown only on wider viewports to keep phone controls single-line. */
  compactLabel?: string;
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** Single-row segmented control used for modes, colour depth and tube choice. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <span className="block text-xs font-medium text-[var(--pg-muted)]">{label}</span>
      ) : null}
      <div
        role="group"
        aria-label={label}
        className="grid gap-1 rounded-md border border-[var(--pg-border)] bg-[var(--pg-well)] p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`pg-tap min-h-[34px] truncate rounded px-1.5 py-1 text-xs transition-colors disabled:opacity-45 ${
                active
                  ? 'bg-[var(--pg-accent)] font-semibold text-[var(--pg-accent-ink)]'
                  : 'text-[var(--pg-muted)] hover:text-[var(--pg-text)]'
              }`}
            >
              <span className="sm:hidden">{option.compactLabel ?? option.label}</span>
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
