/**
 * Hand-built shadcn/ui primitives for Preact.
 *
 * shadcn's look, none of its runtime: no React, no Radix, no preact/compat.
 * Variants are declared with `cva` and merged with `tailwind-merge` exactly as
 * upstream does, so call sites can override any class.
 *
 * Everything here is presentational. Nothing in this file touches `chrome.*`,
 * applicant data, or `innerHTML`.
 */
import type { ComponentChildren, JSX } from 'preact';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...parts: ClassValue[]): string => twMerge(clsx(parts));

/** Strips Preact's `class`/`className` union so our own `class?: string` wins. */
type Bare<E extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[E],
  'class' | 'className' | 'size'
> & { class?: string };

/* ── Button ──────────────────────────────────────────────────────────── */

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium ' +
    'transition-colors outline-none select-none ' +
    'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'aria-[busy=true]:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        outline:
          'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
      },
      size: {
        // 36px / 32px: both clear the 32px minimum target size for a dense panel.
        default: 'h-9 px-4 text-[13px]',
        sm: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = Bare<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ class: cls, variant, size, ...rest }: ButtonProps): JSX.Element {
  return <button type="button" class={cn(buttonVariants({ variant, size }), cls)} {...rest} />;
}

/* ── Input / Select ──────────────────────────────────────────────────── */

const fieldBase =
  'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-[13px] ' +
  'shadow-xs transition-[color,box-shadow] outline-none ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ class: cls, ...rest }: Bare<'input'>): JSX.Element {
  return <input class={cn(fieldBase, cls)} {...rest} />;
}

export function Select({ class: cls, ...rest }: Bare<'select'>): JSX.Element {
  return <select class={cn(fieldBase, 'cursor-pointer pr-2', cls)} {...rest} />;
}

export function Label({ class: cls, ...rest }: Bare<'label'>): JSX.Element {
  return (
    <label
      class={cn('mb-1 block text-[11px] font-medium text-muted-foreground', cls)}
      {...rest}
    />
  );
}

/* ── Card ────────────────────────────────────────────────────────────── */

export function Card({ class: cls, ...rest }: Bare<'section'>): JSX.Element {
  return (
    <section
      class={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-xs',
        cls,
      )}
      {...rest}
    />
  );
}

/** Title row of a card: an uppercase eyebrow plus optional trailing controls. */
export function CardHeader({
  title,
  children,
  class: cls,
}: {
  title: string;
  children?: ComponentChildren;
  class?: string;
}): JSX.Element {
  return (
    <div class={cn('flex min-h-6 items-center justify-between gap-2', cls)}>
      <h2 class="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ── Badge / Separator ───────────────────────────────────────────────── */

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 ' +
    'text-[11px] font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type BadgeProps = Bare<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ class: cls, variant, ...rest }: BadgeProps): JSX.Element {
  return <span class={cn(badgeVariants({ variant }), cls)} {...rest} />;
}

export function Separator({ class: cls }: { class?: string }): JSX.Element {
  return <div role="separator" aria-orientation="horizontal" class={cn('h-px bg-border', cls)} />;
}

/* ── States: empty / loading / error ─────────────────────────────────── */

/** Dashed + centred, so an empty state can never be mistaken for content. */
export function Empty({
  icon,
  children,
  class: cls,
  ...rest
}: Omit<JSX.IntrinsicElements['div'], 'class' | 'className'> & {
  icon?: ComponentChildren;
  class?: string;
}): JSX.Element {
  return (
    <div
      class={cn(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-dashed ' +
          'px-3 py-5 text-center text-xs wrap-anywhere text-muted-foreground',
        cls,
      )}
      {...rest}
    >
      {icon !== undefined && <span class="text-muted-foreground/70">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

export function Loading({
  children,
  class: cls,
  ...rest
}: Omit<JSX.IntrinsicElements['div'], 'class' | 'className'> & {
  class?: string;
}): JSX.Element {
  return (
    <div
      class={cn(
        'flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs ' +
          'text-muted-foreground',
        cls,
      )}
      {...rest}
    >
      <Spinner />
      <span class="animate-pulse">{children}</span>
    </div>
  );
}

/** Errors get the destructive tint AND an icon — never colour alone. */
export function ErrorNote({
  children,
  class: cls,
  ...rest
}: Omit<JSX.IntrinsicElements['p'], 'class' | 'className'> & {
  class?: string;
}): JSX.Element {
  return (
    <p
      role="alert"
      class={cn(
        'm-0 flex min-w-0 items-start gap-2 rounded-lg border border-destructive/30 ' +
          'bg-destructive/10 px-3 py-2 text-xs wrap-anywhere text-destructive',
        cls,
      )}
      {...rest}
    >
      <CircleAlert class="mt-px" />
      <span class="min-w-0">{children}</span>
    </p>
  );
}

/** Quiet explanatory text. */
export function Hint({
  children,
  class: cls,
  ...rest
}: Omit<JSX.IntrinsicElements['p'], 'class' | 'className'> & {
  class?: string;
}): JSX.Element {
  return (
    <p class={cn('m-0 text-xs wrap-anywhere text-muted-foreground', cls)} {...rest}>
      {children}
    </p>
  );
}

/* ── Icons (lucide geometry, inlined — no icon dependency) ───────────── */

type IconProps = { class?: string };

function Svg({ children, class: cls }: IconProps & { children: ComponentChildren }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class={cn('size-4 shrink-0', cls)}
    >
      {children}
    </svg>
  );
}

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const CircleCheck = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const TriangleAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const CircleAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Svg>
);

export const CircleX = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </Svg>
);

export const CircleSlash = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m4.9 4.9 14.2 14.2" />
  </Svg>
);

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const Crosshair = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
  </Svg>
);

export const Zap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </Svg>
);

export const RotateCcw = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);

export const RefreshCw = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Svg>
);

export const Globe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </Svg>
);

export const LogOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const X = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const CornerDownLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </Svg>
);

export const Radio = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48" />
  </Svg>
);

export const Spinner = ({ class: cls }: IconProps) => (
  <Svg class={cn('animate-spin', cls)}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </Svg>
);

/** Product mark. A plain tinted square — no gradient, no glow. */
export function Mark({ class: cls }: IconProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class={cn(
        'grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground',
        cls,
      )}
    >
      <Zap class="size-3.5" />
    </span>
  );
}
