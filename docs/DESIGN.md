# Theme Name: Minimal
# Vibe & Description: Prioritizing a sense of airiness, it establishes information hierarchy through ample whitespace and clear distinctions in font size, weight, and spacing. The design remains extremely restrained, with almost no use of shadows or decorative colors, while ensuring long‑term reading comfort through gentle contrast and fine, non‑sharp typefaces. Depth comes from translucent floating glass rather than from shadows or decorative color.

# Color

## Light
- Primary Background: #FFFFFF
- Secondary Background: #F8F9FB → Use only extremely subtle color differences to distinguish layers.
- Primary Text: #111827 (dark gray rather than pure black).
- Secondary Text: #6B7280.
- Border: #E5E7EB (1px).
- Unique Signal Color (selectable based on user requirements): Used for selected states, primary buttons, and current status indicators.

## Dark
- Primary Background: hsl(240 10% 3.9%) — the `.dark` class in `src/index.css`.
- Primary Text: hsl(0 0% 98%).
- Border: hsl(240 3.7% 15.9%).
- The app ships a working light/dark toggle; every token above has a dark counterpart defined in the same block.

## Glass
Both themes expose the same four tokens, defined once per theme in `src/index.css`:

| Token | Role |
| --- | --- |
| `--glass-bg` | Fill for floating shell chrome (top bar, sidebar, rail toggle). Light `0.5`, dark `0.45` alpha over `--card`. |
| `--glass-overlay-bg` | Fill for overlays that float over live content (menus, dialogs, popovers, palette). `0.8` alpha over `--popover` in both themes, so text stays readable. |
| `--glass-blur` | 18px light / 20px dark. Paired with `saturate(1.6)`. |
| `--glass-highlight` | Inset 1px top rim: white `0.55` light, `0.1` dark. |

- `.glass-panel` (shell chrome) and `.glass-overlay` (overlays) are the only two surface classes; both add a 1px `--glass-border` and the `--shadow-float` diffuse shadow. Prefer them over `bg-card` / `bg-popover` for any floating surface.
- The fill must stay translucent. Raising `--glass-bg` alpha flattens the glass back into an opaque rectangle.

## Ambient backdrop
- `.app-ambient` in `src/index.css` is a fixed, inert layer at `z-index: -1` holding two `blur(90px)` radial fields (info blue top-left, education green bottom-right), tinted per theme.
- It exists because `backdrop-filter` is a no-op over a uniform fill: this is the surface the glass panels actually refract. Do not remove it, and do not cover it with an opaque shell background.

# Font
- Heading & Body: Montserrat (weights 400/500/600/700), loaded from Google Fonts by the `@import` at the top of `src/index.css` and bound to Tailwind's `font-sans` in `tailwind.config.js`. The platform font stack is the fallback.
- Tabular numerals use `.tabular-nums` on financial figures.

# Animation
## Elemental animation
- The animation is minimalist and linear. Elements slide into place along the grid lines;
## Entrance animation
- There is no bouncing or elasticity effect; the page scrolls naturally like a document with an ease-out effect.
## Transition animation
- Use a fade-in or slight displacement when loading content;
## Animation implementation
- The project integrates the tailwindcss-intersect plugin, which allows you to achieve animation effects when elements enter the viewport in a manner similar to the following:
opacity-0 intersect:opacity-100 transition duration-700
- Animations can also be achieved using motion/react.
- Overlays share one motion curve: `data-[state=open]:fade-in-0` + `zoom-in-95`, 200ms, with a small directional slide.
- `prefers-reduced-motion: reduce` disables transitions outright (see `src/index.css`) — it must not be softened to a short duration, or Radix repositioning fights the animation and freezes date pickers.

# Layout

## Shell
- The shell is a capped, centered float. `--shell-max: 1600px`, `--shell-inset: max(0.75rem, calc((100% - 1600px) / 2 + 0.75rem))`. The panels are `position: fixed`, so they cannot be centered by a wrapper — each one applies `--shell-inset` directly, which keeps ultrawide monitors balanced instead of leaving a dead right gutter. `100%` is used rather than `100vw` so a classic scrollbar cannot push the shell past the viewport edge.
- Top bar: `top-3`, height 3.5rem, `left`/`right` = `--shell-inset`, `z-40`.
- Sidebar: `top-[76px] bottom-3`, width 16rem (68px in rail mode), `left` = `--shell-inset`, `z-30`, `rounded-2xl`.
- Rail toggle: floats outside the sidebar's right edge at `top-[100px]`, half-overlapping it. It must stay outside the aside or the panel's `overflow-y-auto` clips it.
- Content is left-anchored, not centered: the container is `max-w-7xl` without `mx-auto`. Centering is the shell's job; `mx-auto` grows the left margin with the viewport and pulls the column away from the sidebar on wide screens.

## Gutter and text safety
- Content column padding: `calc(var(--shell-inset) + 256px)` left, `var(--shell-inset)` right (rail: `+ 80px`) — i.e. one sidebar-width, then the container's own `p-8`. The gutter is measured from `--shell-inset`, never from the viewport, so it stays correct at every shell width.
- Result: page heading, subtitle, section headings, filter chips, date/status spans, and chart axis labels all clear the panel — measured across 8 routes at 1559/2078/2560px, zero text behind the glass. Headings clear by 32px and clear the rail toggle by 8px (the original committed geometry).
- The gutter must NOT be narrowed to let cards tuck under the sidebar. That was tried and reverted: the column edge then sits behind the panel and any bare text at that edge is clipped — it hid 7 strings on the Dashboard alone, including two section headings and two chart axis labels. The glass reads from the ambient backdrop and from content passing beneath the top bar instead.
- Below `lg`, panels collapse to the mobile menu and the gutter is dropped.

# Elements
- Prefers minimalist linear charts with uniform stroke thickness and no fill.
- Shadow ≈ 0, border ≤ 1px, minimizes the button's visual impact; main button ≠ large color block, emphasizes text more.
- Floating surfaces use `.glass-panel` (shell) or `.glass-overlay` (menus, dropdowns, selects, dialogs, alert dialogs, notifications popover, command palette) instead of opaque card backgrounds. Overlay primitives carry `text-popover-foreground`; the glass supplies no foreground of its own.
- Controls keep a solid, opaque fill — glass is for surfaces that float above content, not for inputs, cards, or buttons.
