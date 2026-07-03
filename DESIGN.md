# Design

## Theme

EzyTime is a light product UI for a small restaurant or shop. The scene is a bright QR station and a quiet admin desk, so the app uses a pure white base, restrained sky-teal actions, and small coral/mint moments for warmth and state.

## Palette

Use OKLCH values in [src/styles.css](src/styles.css).

- Background: `oklch(1 0 0)`
- Surface: `oklch(0.985 0.006 200)`
- Ink: `oklch(0.22 0.035 220)`
- Muted text: `oklch(0.43 0.035 220)`
- Primary: `oklch(0.62 0.11 198)`
- Primary strong: `oklch(0.47 0.11 202)`
- Accent: `oklch(0.67 0.15 35)`
- Success: `oklch(0.55 0.13 152)`
- Danger: `oklch(0.58 0.16 20)`

## Typography

Use the system sans stack for fast loading and Thai readability. Product type scale is fixed in rem units: compact labels at `0.8125rem` to `0.9375rem`, body at `0.975rem`, panel titles around `1.1rem`, and page headings from `1.75rem` to `2.25rem`.

## Components

- Buttons use icon plus text for clear actions, with visible focus rings and 44px minimum target size.
- Forms use visible labels, never placeholder-only labels.
- Cards and panels use 8px radius or less.
- Tables stay table-first on desktop and horizontally scroll on mobile.
- QR and summary areas are separate panels, not nested cards.

## Motion

Use short 150ms to 180ms transitions for button state changes. Loading uses a spinner on buttons and skeleton rows for table loading. Respect `prefers-reduced-motion`.

## Responsive Behavior

Desktop uses a QR side panel plus summary area. Tablet and mobile collapse to one column. The employee clock form is optimized for phone use with large controls and a stable scan-time ticket.
