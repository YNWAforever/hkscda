# HKSCDA Brand Guidelines

> 香港拯救貓狗協會 · Hong Kong Saving Cat And Dog Association
>
> Approved public identity, August 2026. The matching machine-readable exports are
> `brand/design-tokens.json` and `brand/design-tokens.css`; the live application maps
> these values into semantic variables in `src/styles.css`.

## Brand idea

**Clear action, warm rescue.** HKSCDA should feel compassionate and approachable while
remaining dependable enough for adoption decisions, donations, reporting, and public
accountability. Real animals and real rescue work carry the emotion. Layout, colour, and
copy make the next responsible action easy to understand.

The former Poofyco/Baloo rose-and-navy direction is retired. Do not copy it into new
components, planning documents, screenshots, or generated assets.

## Core palette

| Token | Value | Intended use |
| --- | --- | --- |
| Primary blue | `#05648E` | Main actions, links, active controls, key labels |
| Deep blue | `#034A69` | Hover/pressed blue, dark emphasis |
| Soft blue | `#E4F2F7` | Selected filters, information surfaces |
| Accent magenta | `#A61C56` | Secondary emphasis, urgent/support actions |
| Deep magenta | `#821442` | Hover/pressed magenta |
| Soft magenta | `#F9E7EF` | Accent washes and quiet highlights |
| Paper | `#FFFDF9` | Main page background |
| Warm neutral | `#F6F1E9` | Alternating section background |
| Sand | `#E8DED0` | Warm borders and supporting surfaces |
| Ink | `#162C36` | Primary text |
| Muted ink | `#5B6E76` | Supporting text |
| Line | `#D7DDD9` | Borders and dividers |
| Success | `#176F54` | Confirmed, successful states |

White text may be used on the primary blue or accent magenta only where the resulting
combination meets WCAG 2.2 AA. Error, warning, success, and availability must always
include text or an icon; colour is never the only signal.

## Typography

- Primary: **Noto Sans HK**.
- Fallbacks: PingFang HK, Microsoft JhengHei, system-ui, sans-serif.
- Do not use Baloo 2 or decorative display faces.
- Navigation: 15–16px.
- Body: 16–18px, with a Traditional Chinese line height around 1.65–1.75.
- Keep long reading text to roughly 65–75 characters per line.
- Use a clear, single H1 on every public route and a logical H2/H3 hierarchy.

## Layout and shape

- Maximum content width: approximately 1200px.
- Desktop structure: consistent 12-column grid.
- Spacing: 8px base scale.
- Radius set: 8px for controls/small elements, 16px for cards/panels, pill for chips and
  compact actions.
- Minimum interactive target: approximately 44 by 44px.
- Use one public hero family and one card anatomy across animal, story, opportunity,
  and report content, with only domain-specific details changing.
- Visible focus indicators are mandatory. Never remove an outline without replacing it
  with an equally clear focus treatment.

## Photography and imagery

- Prioritise approved, first-party HKSCDA animal, rescue, volunteer, and programme photos.
- Do not generate imagery that could be mistaken for a real adoptable animal or a
  documented rescue event.
- Avoid generic stock images when an approved first-party image exists.
- Crop responsively without hiding an animal's face.
- Use meaningful CMS alt text, or a safe fallback built only from verified fields.
- If an animal has no usable image, show a restrained branded fallback with its name;
  do not leave a large empty square.

## Motion

- Use motion to clarify hierarchy, state changes, or feedback.
- Normal reveals should take about 350–500ms.
- Avoid autoplay for important content. Any retained autoplay must have pause/play and
  pause on hover and keyboard focus.
- Respect `prefers-reduced-motion`.

## Voice and content

- Traditional Chinese (`zh-HK`) first; English is secondary.
- Be compassionate, specific, and factual.
- State what an action accomplishes rather than repeating its label.
- Keep organisational copy collective: 協會 / 義工團隊.
- Avoid comparative superlatives such as 「全港最好」 or “best in Hong Kong”.
- Avoid founder-centric framing in organisational copy.
- Do not publish unverified people, impact numbers, payment details, or provider status.
- Core message: 「支持領養等於拯救生命」 / “Adoption saves lives”.

## Accessibility baseline

Public work targets WCAG 2.2 AA foundations: semantic landmarks, keyboard-operable
navigation and filters, visible focus, labelled inputs, status announcements, error
summaries with inline errors, adequate contrast, meaningful alt text, and no essential
meaning conveyed by colour alone.

## Review checklist

Before merge, confirm the official blue/magenta identity, Noto Sans HK stack, 1200px
grid, 8px spacing rhythm, approved radii, authentic imagery, Traditional Chinese copy,
visible focus, reduced motion, responsive reflow, and the absence of Poofyco/Baloo
tokens. Run `bun run verify:brand` with the application preview.

