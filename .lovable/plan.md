
## Goal
Rebuild a Lovable version of HKSCDA's site reusing their existing colors, imagery, and Chinese content, then extend it with three new sections: social proof, a social media wall (Facebook + Instagram), and a volunteer story carousel.

## Steps

### 1. Source content & assets from hkscda.com
- Fetch hkscda.com (home + key subpages: About, Adopt, Donate, Volunteer, Contact) to extract:
  - Section copy (Chinese 繁體)
  - Hero/about/adoption images
  - Logo + favicon
- Download images and upload via `lovable-assets` CLI → `src/assets/*.asset.json` pointers (no binaries in repo).
- Reuse the color tokens already defined in the uploaded `hkscda.html` (warm cream/orange palette) — port them verbatim into `src/styles.css` as semantic tokens. Use Noto Serif HK / Noto Sans HK.

### 2. Page structure (single-page TanStack route at `/`)
1. Sticky nav + logo
2. Hero (mission tagline + Adopt/Donate CTAs, hero image from hkscda.com)
3. Mission / About summary
4. Services (糧食、醫療、絕育、領養) — icon cards
5. Featured adoptable cats & dogs (grid pulled from site)
6. **NEW — Social proof**
   - Impact stats row (animals rescued, adopted, sterilized, years active) — numbers sourced from hkscda.com if published, otherwise placeholder with TODO comment
   - Press/media logo strip (grayscale logos of outlets covering HKSCDA)
   - Partner/sponsor logo strip (vet clinics, corporate sponsors)
   - Adopter testimonial cards (3 quotes with adopter + pet name + photo)
7. **NEW — Volunteer stories carousel** (5–6 swipeable cards: photo, name, role, quote) using embla-carousel-react
8. **NEW — Social media wall**
   - Tabs: Facebook | Instagram
   - Facebook: official Facebook Page Plugin iframe embedding HKSCDA's FB page timeline
   - Instagram: responsive grid of latest posts via Instagram profile embed iframes (or `<blockquote class="instagram-media">` with embed.js). Note: a true live IG grid requires Instagram Graph API + token; the embed approach renders real posts without backend setup.
9. Donation CTA band
10. Footer (contact, address, socials, copyright)

### 3. New components
- `src/components/SocialProof.tsx` — stats counters, logo strips, testimonial cards
- `src/components/VolunteerCarousel.tsx` — embla carousel
- `src/components/SocialWall.tsx` — Tabs with FB Page Plugin + IG embeds
- Reusable `StatCounter`, `LogoStrip`, `TestimonialCard`, `VolunteerCard`

### 4. Technical notes
- Add `embla-carousel-react` dependency.
- Facebook Page Plugin: load `https://connect.facebook.net/zh_HK/sdk.js` in `__root.tsx` once; render `<div class="fb-page" data-href="https://www.facebook.com/HKSCDA">`.
- Instagram embeds: load `https://www.instagram.com/embed.js`; needs specific post URLs (I'll pull 6 latest visible from their public IG).
- SEO head() on `/`: zh-Hant title, description, og:image = hero image.
- All copy in 繁體中文 to match brand.

### 5. Out of scope (will note to user)
- Live, auto-refreshing IG/FB feeds require API keys + backend. Embeds render real current posts but updates depend on the embed script, not a custom API.
- If user later wants a true live feed, we'd add Instagram Graph API + a server function.

## Open question handled later
If hkscda.com blocks scraping for some images, I'll substitute with generated placeholders matching the warm rescue-shelter aesthetic and flag them.
