# HKSCDA Brand Guidelines

> 香港拯救貓狗協會 · HK Saving Cat And Dog Association
> Visual direction referenced from the Poofyco pet-rescue design language (ThemeForest #55964358), adapted to HKSCDA's identity. Implemented in `src/styles.css` theme tokens.
> Design-token exports live in `brand/design-tokens.{json,css}` — NOT `assets/` (that's Nitro's server-assets dir and breaks the build).

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #E05C78 (Rescue Rose) |
| Secondary Color | #1D2353 (Guardian Navy) |
| Accent Color | #F27D92 (Soft Salmon) |
| Background | #FDF7F4 (Warm Cream) |
| Lavender Zone | #E9E9F6 |
| Pink Strip | #F298A4 |
| Display Font | Baloo 2 (Latin) + Noto Sans HK |
| Body Font | Noto Sans HK |

## Brand Concept

**Theme: Warm Rescue（暖心救援）**

Warm, approachable, and trustworthy. The blush-pink-and-navy palette signals compassion without losing the credibility a registered charity needs. Rounded shapes (pill buttons, blob-masked photos, circular badges) keep the mood friendly and pet-like; deep navy anchors data, reports, and transparency content.

## Color Palette

### Primary Colors

| Shade | Hex | Usage |
|-------|-----|-------|
| **Rescue Rose** | #E05C78 | Links, eyebrows, cat accents, progress bars |
| **Rescue Rose Hover** | #CF4A66 | Hover states |
| **Rescue Rose Active** | #B93D58 | Pressed states |
| **Rescue Rose Light** | #FADFE4 | Highlight backgrounds, icon chips |

### Secondary Colors

| Shade | Hex | Usage |
|-------|-----|-------|
| **Guardian Navy** | #1D2353 | Headings, full-bleed dark bands, footer, dog accents |
| **Guardian Navy 2** | #283066 | Inset panels on navy (footer logo card) |
| **Lavender** | #E9E9F6 | Light section zones, soft navy surfaces |
| **Lavender Deep** | #DCDCF0 | Borders/dividers on lavender zones |

### Accent Colors

| Shade | Hex | Usage |
|-------|-----|-------|
| **Soft Salmon** | #F27D92 | CTA pills, stat numbers, star ratings, footer headings |
| **Soft Salmon Hover** | #EE6781 | CTA hover states |
| **Soft Salmon Light** | #FCE8EB | Blush section backgrounds (hero) |
| **Pink Strip** | #F298A4 | Footer copyright strip, thin brand bands |

## Typography

- **Display**: Baloo 2 (700–800) — rounded, playful; Chinese headings fall back to Noto Sans HK Bold
- **Body**: Noto Sans HK (400/500), line-height 1.7
- Headings use tight tracking (-0.01em); never use serif faces

## Shape Language

- Pill-shaped buttons and nav bar (`rounded-full`)
- Large card radii (`rounded-2xl` to `rounded-[2.5rem]`)
- **Dashed-border rounded cards** (`card-dashed` utility) — the signature Poofyco card style for checklists, volunteer cards, info panels
- Circular icon badges; arch-masked photography (`arch-mask` utility)
- Topographic contour texture (`bg-topo` utility) on light sections
- Dashed dividers (`border-dashed`) between stats and feature columns

## Voice & Tone

- 繁體中文 (zh-HK) first; English secondary
- Compassionate but factual — lead with the animal's story, back with transparent data
- Core message: 「支持領養等於拯救生命」/ "Adoption saves lives"
- Always credibility-anchored: charity licence 91/14493, No-Kill commitment, IRD §88

### Hard bans (site copy)

- **No comparative superlatives** vs other rescue groups（全港最…、第一、best in HK）— ranks peer organisations and invites offence; describe commitment, not competition（e.g. 「日夜堅守前線」not「全港最用心」）
- **No founder-centric framing** in organisational copy（由創辦人 X 帶領…）— the work is collective; speak as 義工團隊/協會. Personal names are fine inside first-person volunteer stories/testimonials only
- Comparative section labels like 「為何選擇我們」→ prefer commitment framing（「我們的承諾」）

## AI Image Generation

**Base prompt**: warm-toned photo of rescued cats and dogs with volunteers, soft blush-pink and cream environment, deep navy accents, gentle natural light, hopeful and affectionate mood, Hong Kong urban context

**Mood keywords**: warm, compassionate, trustworthy, playful, hopeful
**Avoid**: clinical/cold lighting, cages in distress framing, aggressive colors
