# HKSCDA Color System

Source of truth: `src/styles.css`, scoped by `.site-shell` for public pages and `.admin-shell` for the operational admin surface.

## Brand anchors

| Token | Hex | RGB | HSL | Approx. OKLCH | Use |
| --- | --- | --- | --- | --- | --- |
| `--brand-blue-official` | `#05648e` | `5, 100, 142` | `198.4 93.2% 28.8%` | `0.477 0.102 236.5` | Primary links, actions, focus, information |
| `--brand-magenta-official` | `#a61c56` | `166, 28, 86` | `334.8 71.1% 38.0%` | `0.481 0.176 2.1` | Secondary actions, donation emphasis, warm identity accent |

The canonical blue has approximately 6.52:1 contrast with white. The canonical magenta has approximately 7.19:1 contrast with white. These values are enforced by the brand contrast test.

## Public semantic roles

- `--color-primary`, `--color-primary-hover`, `--color-primary-active`: navigation, primary calls to action, links, and focus-visible outlines.
- `--color-primary-highlight`: quiet blue information surfaces and selected states.
- `--color-secondary`, `--color-secondary-hover`, `--color-secondary-highlight`: secondary actions, fundraising emphasis, and warm callouts.
- `--color-bg`, `--color-surface`, `--color-surface-2`: page, panel, and elevated content surfaces.
- `--color-surface-offset`, `--color-surface-offset-2`: alternating bands, form backgrounds, and low-emphasis grouping.
- `--color-text`, `--color-text-muted`, `--color-text-faint`, `--color-text-inverse`: readable hierarchy on light and dark surfaces.
- `--color-divider`, `--color-border`: structural separation and form controls.
- `--color-success`, `--color-warning`, `--color-error`, and their highlight variants: status feedback only, never decorative branding.
- `--color-cat`, `--color-dog`, and chart series tokens: data/category distinction only.

## Component rules

- Use blue with white text for primary actions and links that must read as the default next step.
- Use magenta with white text for secondary or donation-focused actions; use the highlight token for quiet backgrounds.
- Use dark text on pale surfaces. Do not place long body copy directly on saturated brand colours.
- Use the same semantic token for hover and active states across a route family.
- Use `btn-primary`, `btn-secondary`, and `btn-outline`; deprecated `btn-cta`, `btn-navy`, `card-dashed`, `arch-mask`, `bg-topo`, and `--color-pink-strip` are prohibited in public source.
- Avoid hardcoded replacement palettes that recreate the old paw-substitute identity.

## Admin boundary

Existing admin components retain a small compatibility set inside `.admin-shell` only: `--color-accent-warm`, `--color-accent-soft`, `--color-lavender`, `--color-lavender-deep`, and `--color-panel-2`. These aliases are operational migration aids, not public branding tokens. They must not be added back to the global theme or public components.