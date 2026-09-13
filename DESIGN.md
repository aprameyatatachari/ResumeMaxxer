---
name: ResumeMaxxer
description: AI resume tailor for Indian students. Build your vault once, cut a one-page ATS resume for every job description.
colors:
  obsidian: "#303236"
  void: "#090a0c"
  charcoal: "#111111"
  slate-edge: "#4a4b50"
  iron-veil: "#6b6c6d"
  smoke: "#95979e"
  ash: "#a9a9aa"
  frost: "#d1d1d1"
  linen: "#e5e5e7"
  snow: "#ffffff"
  iris: "#5683da"
  iris-hover: "#6690e2"
  ember: "#ff8964"
  molasses: "#5a250a"
  day-bg: "#ffffff"
  day-bg-2: "#f6f6f6"
  day-ink: "#050506"
  day-ink-muted: "#303236"
  day-ink-faint: "#5d5f64"
  day-line: "#d1d1d1"
  day-line-strong: "#a9a9aa"
  day-tag-iris: "#3a64b8"
  day-tag-ember: "#b24a26"
  day-danger: "#b3261e"
  day-danger-wash: "#fdecea"
  day-success: "#1f7a4d"
  day-success-wash: "#e6f4ec"
  night-bg: "#0b0c0e"
  night-surface: "#111111"
  night-surface-2: "#1a1b1e"
  night-ink: "#ffffff"
  night-ink-muted: "#c2c3c7"
  night-ink-faint: "#a0a2a8"
  night-line: "#2c2d31"
  night-line-strong: "#4a4b50"
  night-tag-iris: "#8fb0ef"
  night-tag-ember: "#ffb095"
  night-danger: "#ff9b8f"
  night-danger-wash: "#2a1412"
  night-success: "#7fd6a8"
  night-success-wash: "#0f231a"
typography:
  display:
    fontFamily: "General Sans, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 8vw, 5.25rem)"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "General Sans, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
    fontFeature: "'cv11', 'ss01'"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  button:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  chip:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0"
rounded:
  field: "4px"
  card: "12px"
  panel: "30px"
  pill: "9999px"
spacing:
  unit: "4px"
  card: "24px"
  section-y: "96px"
  section-y-lg: "128px"
  page-max: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.iris}"
    textColor: "{colors.snow}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "10px 21.6px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.iris-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.day-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 21.6px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.day-ink}"
    textColor: "{colors.day-bg}"
  button-white:
    backgroundColor: "{colors.snow}"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "10px 21.6px"
    height: "44px"
  button-white-hover:
    backgroundColor: "{colors.linen}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.day-danger}"
    rounded: "{rounded.pill}"
    padding: "10px 21.6px"
  button-danger-hover:
    backgroundColor: "{colors.day-danger-wash}"
  input:
    backgroundColor: "{colors.day-bg}"
    textColor: "{colors.day-ink}"
    rounded: "{rounded.field}"
    padding: "9.6px 12.8px"
    height: "44px"
  card:
    backgroundColor: "{colors.day-bg}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip:
    textColor: "{colors.day-tag-iris}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "4px 10.4px"
  chip-ember:
    textColor: "{colors.day-tag-ember}"
    rounded: "{rounded.pill}"
  band-void:
    backgroundColor: "{colors.void}"
    textColor: "{colors.snow}"
  theme-toggle:
    rounded: "{rounded.pill}"
    size: "40px"
---

# Design System: ResumeMaxxer

<!-- Source of truth: frontend/src/index.css ("Aurora vault" system). The visual language comes from the Huly style reference; everything below describes what is actually implemented. -->

## Overview

**Creative North Star: "The Aurora Vault"**

Picture a midnight observatory where your whole record is kept. The visual language is Huly's: a near-black void, graphite surfaces, pill controls and hairline edges. One electric iris blue and one ember coral tell the whole colour story. The aurora beam appears once per page, and here it reads as light leaking out of a vault door. The vault is also the product idea: you build it once, and every resume is cut from it. So the vault dial is the logo, the door swings open after sign-in, and the auth screens show that same door glowing beside the form.

Night is the native mode. In day mode the content bands turn white and warm linen, but the spectacle stays dark in both themes. That covers the hero, the dark bands, the auth vault panel, the tailoring loader and the vault door, all through the `.band-void` scope. The landing page is roomy and editorial. The app (vault editor, tailor, history) is practical and form-heavy.

The product serves Indian students applying to real jobs, so honesty is also a visual rule. Nothing on screen may look like a statistic, a testimonial or a real person unless it is one. Examples are always labelled as examples.

**Key Characteristics:**
- Iris blue and ember coral are the only accents; everything else is graphite, white and grey.
- Every button, chip, toggle and nav item is a full pill (9999px). Fields get 4px corners, cards 12px, large dark panels 30px.
- Semantic tokens (`bg`, `surface`, `ink`, `line`, `danger`, `success`) change between day and night. The raw palette stays the same.
- Dark spectacle bands alternate with content bands that follow the theme.
- One custom line-icon set and one vault-dial mark. No emoji or unicode glyphs stand in for icons.
- Motion is slow and expo-eased, and it is reduced or switched off under `prefers-reduced-motion`.

## Colors

The colour range is narrow: layered graphite and white carry the page, iris marks what is active, and ember adds warmth.

### Primary
- **Electric Iris** (iris): Marks the one most important action on each screen (as decoration and icons; the primary button fill is the deeper Iris Action #3d6bc9 for 4.5:1 white-text contrast, darkening to #355fb5 on hover). Text in iris uses `text-iris-fg` (#3a64b8 day, #8fb0ef night). Also the focus colour on fields, the checkbox and radio accent, the logo ring, the cool end of the aurora, and the text selection highlight at 45%.

### Secondary
- **Ember Pulse** (ember): Used only as a warm accent: the logo core, the warm end of the aurora, the vault door hub and light seam, `.chip-ember` tags, and `.glow-ember` corner glows. Never a button fill.
- **Molasses** (molasses): A deep ember for strokes and fills on dark backgrounds, where coral would be too loud.

### Neutral (raw palette, same in both themes)
- **Void** (void): Background of every `.band-void` band and of the vault door stage.
- **Obsidian Canvas** (obsidian), **Charcoal Card** (charcoal), **Slate Edge** (slate-edge): The vault door face, the auth dial, and dark hairlines.
- **Smoke, Ash, Frost, Linen, Snow**: Mid-grey icon strokes, dividers, and the white CTA (Linen is its hover colour).

### Semantic day/night tokens
Components must use these semantic tokens. They are exposed as Tailwind colours (`bg-bg`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `text-danger`, ...):
- **bg / bg-2**: page background and alternate band (day: white / #f6f6f6; night: #0b0c0e / obsidian).
- **surface / surface-2**: cards, fields, panels.
- **ink / ink-muted / ink-faint**: main text, secondary text, placeholders and metadata.
- **line / line-strong**: hairline borders. The strong version outlines fields and secondary buttons.
- **tag-fg-iris / tag-fg-ember**: chip text. It is darker in day mode and lighter at night so it stays readable on a 12-14% tint.
- **danger / danger-wash, success / success-wash**: alerts, destructive buttons, save confirmations.
- **focus-ring-solid**: #3d6bc9 in day mode, white at night and in `.band-void`.

### Named Rules
**The Two Voices Rule.** Iris and ember are the only accent colours. Add no third accent, and no status colours beyond danger and success.

**The Semantic-Only Rule.** Inside components, use `ink`, `surface`, `line` and the other semantic tokens, never raw hex or `obsidian`/`snow`. The only exception is an element meant to look the same in both themes, like the logo, the vault door or the sample resume sheet.

**The Void Band Rule.** A section that must stay dark in both themes gets `.band-void`. That class sets the void background, white text and `color-scheme: dark`, and it re-declares every night token for everything inside it. Cards, chips and fields placed inside it therefore show night styling even in day mode.

## Typography

**Display Font:** General Sans 500/600, self-hosted (the listed substitute for Huly's Esbuild), falling back to Inter.
**Body Font:** Inter variable, with the `cv11` and `ss01` features on.

**Character:** A tight, geometric display face at hero size, over a precise, slightly tightened Inter for all interface text.

### Hierarchy
- **Display** (`.display`: 500, `clamp(2.75rem, 8vw, 5.25rem)` on the hero, line-height 0.9, -0.05em): Hero headline only, max about 14ch.
- **Headline** (`.display` at `clamp(2.25rem, 5vw, 3.75rem)`; `.display-sm` at line-height 1, -0.045em): Section headings, max 14-18ch.
- **Body** (400, 15px, 1.5, -0.01em): All running text. Long descriptions stop at about 48ch.
- **Label** (500, 13px, ink-muted): `.label` above every field.
- **Button** (600, 14px, line-height 1, -0.01em). Compact buttons drop to 13px.
- **Chip** (500, 11px, no letter-spacing).

### Named Rules
**The Display Floor Rule.** General Sans is only for display text at 28px and up. Nav, buttons, labels and body text always use Inter. The wordmark is Inter 600 at 15px, -0.02em.

## Layout

Content sits in a centred container, 1200px wide at most, with 16px side padding on mobile and 24px from `sm` up. Sections stack as full-width bands with 96px vertical padding on mobile and 128px from `sm` up. The app shell has three parts. At the top is a sticky header that blurs once you scroll; it holds the logo on the left, pill nav items, the theme toggle and the auth actions, and on mobile a Menu/Close icon button opens the menu. Below it is the page content, then a quiet footer.

**Landing structure (the JD is the map):**
1. Hero: an always-dark `.band-void` band. AuroraBeam sits behind a centred display headline and an iris primary CTA. A framed product UI starts just below the fold, labelled "Example with sample data".
2. "How it works": a band that follows the theme. A sample job description is pinned on the left (`lg:sticky lg:top-24`). Its header reads `sample-job-description.pdf` with an "Example" pill. Each requirement line matches one feature on the right, and the line lights up while that feature is in view. On mobile the JD does not stick and the sections simply stack.
3. A dark band with the example tailored resume image, captioned as sample output for a fictional student.
4. A theme-following band, then a closing dark CTA band.

**Auth (AuthShell):** from `lg` up, a two-column grid: the form column (up to 420px) and a dark vault panel. Below `lg`, only the form shows.

### Named Rules
**The Band Rhythm Rule.** Alternate `.band-void` bands with `bg-bg` content bands. Never put two full-strength aurora or glow effects on screen at the same time.

## Elevation & Depth

Surfaces are flat by default. Depth comes from stepped surface colours and hairline borders, not shadows. Shadows show up in only three places: product and photo frames, floating panels, and hover or focus glows.

### Shadow Vocabulary
- **Frame** (`box-shadow: 0 6px 25px rgb(0 0 0 / 0.5)`): product screenshot frames and the auth vault dial.
- **Float** (`box-shadow: 0 4px 16px rgb(0 0 0 / 0.35)`): floating panels and dialogs.
- **Elev token** (`--elev`: `0 4px 6px rgb(0 0 0 / 0.08)` in day, `0 4px 16px rgb(0 0 0 / 0.35)` at night): a small lift that adapts to the theme.
- **Iris hover glow** (`0 0 0 1px rgb(86 131 218 / 0.5), 0 8px 28px rgb(86 131 218 / 0.45)`): primary button hover only.
- **Focus ring** (`0 0 0 2px var(--bg), 0 0 0 4px var(--focus-ring-solid)`), following the element's own radius. Fields get a solid focus-ring-solid border plus a 1px ring.

### Glows
- **Corner glow** (`.glow-ember`): a 320px radial circle, fading from warm amber through pale gold to transparent, peeking out from behind a card's top-right corner. Add `.glow-iris` as well for the cool blue version.
- **Aurora beam**: see AuroraBeam under Components. Once per page.

### Named Rules
**The Borders-Not-Shadows Rule.** Dark cards are set apart by hairline borders and surface colour steps, not drop shadows.

## Shapes

Pills come first. Buttons, chips, nav items, the theme toggle and status pills are all 9999px. Fields have crisp 4px corners so they look like places to type, not things to press. Cards are 12px. Large dark panels (the auth vault panel, TailorLoom) are 30px. The recurring shape is the circle: the logo dial, the vault door, the auth dial and the glows.

## Components

The feel is tactile and quiet: pills light up in iris, and hairline surfaces stay in the background.

### Buttons
- **Shape:** full pill (9999px), at least 44px tall, 0.5rem gap for an icon, 1px border.
- **Primary** (`.btn-primary`): Iris Action fill (#3d6bc9), white text. For the single most important action on a screen. On hover it darkens to #355fb5 and gets the iris glow.
- **Secondary** (`.btn-secondary`): transparent, with a `line-strong` outline and `ink` text. On hover it flips to an ink fill with bg-coloured text.
- **White** (`.btn-white`): white fill, void text, for CTAs on dark bands. Hover turns it linen.
- **Danger** (`.btn-danger`): transparent with danger-coloured text. Hover adds the danger wash. For delete and remove actions.
- **States:** pressing moves the button 1px down. Disabled or `aria-disabled` buttons fade to 45% opacity with a not-allowed cursor. Adding `text-xs` makes a compact button (36px tall, 13px text).

### Chips
- **Style** (`.chip`): pill, 11px/500, iris at 12% behind `tag-fg-iris` text. `.chip-ember` switches to ember at 14% with `tag-fg-ember` text.
- **Use:** categories, skills, stage and status labels. Inside `.band-void` they switch to night colours on their own.

### Cards / Containers
- **Card** (`.card`): `surface` background, 1px `line` border, 12px radius, 24px padding, no shadow. Entries in vault sections are sortable cards with drag handles and move buttons.
- **Dark panel:** `.band-void` with a 30px radius and a `line` border, optionally with `.glow-ember`.

### Inputs / Fields
- **Style** (`.input`): at least 44px tall, 4px radius, 1px `line-strong` border, `surface` fill, 15px text, `ink-faint` placeholder. Selects use a custom smoke-grey chevron. Textareas keep a 1.5 line-height.
- **Hover:** the border darkens to `ink-faint`. **Focus:** solid focus-ring-solid border plus a 1px ring.
- **Label** (`.label`): its own line, 13px/500, `ink-muted`, with 6px of space before the field.
- Checkboxes and radios are 16px with an iris accent colour.

### Navigation
A sticky header that blurs once the page scrolls past 8px. Nav items are pills at least 40px tall with `ink-muted` text that turns `ink` on hover. The active item gets a 10% ink wash. On mobile the items fold behind the Menu icon.

### Theme Toggle
A 40px round icon button with a `line` border. Each click moves to the next mode: system, day, night. The icon shows the current mode (Monitor, Sun or Moon, 17px), and the aria-label names both the current mode and the next one. The choice is saved in `localStorage` under `resumemaxxer.theme` (`light` or `dark`; no value means system) and set as `data-theme="light|dark"` on `<html>`. An inline script in `index.html` sets it before React loads, so night mode never flashes white. In system mode the page follows `prefers-color-scheme` as it changes. Tailwind's `dark:` variant keys off `[data-theme='dark']`, not the media query.

### Logo (vault dial)
`LogoMark` (`src/components/brand/Logo.tsx`) is a 32-unit SVG of a vault dial seen from the front. It has an iris ring (r10, stroke 2.4), four rounded bolt stubs at top, bottom, left and right, and an ember core (r3.6). Its colours are fixed in both themes, and it is hidden from screen readers (`aria-hidden`). The `Wordmark` is the mark plus "ResumeMaxxer" in Inter 600 at 15px. The same dial appears at 88px in the auth panel, and the vault door repeats its design.

### Icons
Every interface icon comes from `src/components/icons.tsx`. They share one 24px grid, a `currentColor` stroke at 1.8, round caps and joins, no fill, and `aria-hidden`. The default size is 20px (17px in the toggle). Icons take the text colour, so they follow the theme. New icons go in this file in the same style. Never use unicode glyphs (arrows, ×, ✓, ★), emoji or an icon library in place of icons.

### AuroraBeam (hero)
`src/components/landing/AuroraBeam.tsx` is a small raw-WebGL shader drawn inside the dark hero. It paints a vertical beam that runs from iris through ember to white, with a warm glow at the base. It pauses while off-screen, and under reduced motion it draws one still frame. If WebGL is unavailable or the shader fails, a CSS version takes over: a blurred vertical gradient stripe 18% wide, about 62% from the left, plus a round glow at the base. It is always `aria-hidden` and appears once per page.

### VaultDoor (post sign-in)
`src/components/VaultDoor.tsx` plays a one-time 2.3s full-screen overlay (z-100, ignores pointer events). It runs only on the first render right after a successful sign-in: sign-in sets a `sessionStorage` flag, and this component reads and clears it. It never runs under reduced motion. The sequence:
- 0-700ms: the iris dial turns -200deg.
- 550-950ms: the bolts slide back.
- 850-1150ms: an ember and iris seam of light opens around the rim.
- 1100-2300ms: the door swings open on its left hinge in 3D, a white-ember-iris light blooms, and the dark stage fades away.

### TailorLoom (tailoring loader)
`src/components/TailorLoom.tsx` is the loader shown while a resume is tailored. It sits in a 30px panel with `.band-void .glow-ember`.
- **Left:** a white sheet in A4 proportions (4px radius). A seam of iris-to-ember light travels down it (`loom-thread`, 1.8s loop) while resume lines grow in, one section at a time (`loom-line`, 900ms expo).
- **Right:** the real list of stages as an `<ol role="status" aria-live="polite">`. Finished stages get the Check icon.
- **Reduced motion:** both animations stop, and the stage text alone shows progress.

### AuthShell
`src/components/AuthShell.tsx` wraps the sign-in and sign-up pages. The form sits on the plain page. From `lg` up, a 30px `.band-void` panel sits beside it. The panel holds an ember-to-iris round glow, a 288px charcoal dial with the Frame shadow around an 88px LogoMark, and one line of muted text at the bottom. The panel is decorative and previews the VaultDoor that opens after sign-in.

### Scroll reveal
Add `data-reveal` to an element, or `data-reveal="fade"` to fade without movement, with an optional `--reveal-delay`. Content is visible by default. Only once the page script runs does `useReveal` add `reveal-armed` to `<html>`. From then on, elements that have not appeared yet start at opacity 0, 24px lower, with an 8px blur. When `.is-in` is added they ease into place over 1000ms on `--ease-out-expo`. If the script never runs, nothing stays hidden.

### Motion
Two easing tokens: `--ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`) for reveals, glows and entrances, and `--ease-in-out-quart` (`cubic-bezier(0.76, 0, 0.24, 1)`) for slower, deliberate moves. Hover and state changes take 160-300ms, reveals 1000ms, and the vault door 2300ms.

**The Reduced Motion Rule.** Under `prefers-reduced-motion: reduce`, a global rule shortens every animation and transition to 0.01ms and turns off smooth scrolling. The loom animations are removed, AuroraBeam draws one still frame, and VaultDoor does not render at all. Any new motion must end in a complete, readable state with nothing lost.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens (`bg`, `surface`, `ink`, `line`, `danger`, `success`) so every screen works in day and night.
- **Do** wrap any always-dark section in `.band-void` instead of hard-coding void and white on its children.
- **Do** use exactly one `.btn-primary` per screen, and `.btn-white` for CTAs on dark bands.
- **Do** keep buttons, chips and toggles at 9999px, fields at 4px, cards at 12px and dark panels at 30px.
- **Do** take every icon from `icons.tsx` (24px grid, 1.8 stroke, `currentColor`).
- **Do** label sample content visibly as sample or example ("Example with sample data", "Example output. The student and every detail are sample data.") and say that people are fictional in alt text.
- **Do** give every animation a finished reduced-motion state, and keep revealed content visible even without scripts.

### Don't:
- **Don't** invent statistics, user counts, success rates, logos, testimonials or quotes. If a number or person is not real, it does not ship.
- **Don't** add a third accent colour or use ember as a button fill.
- **Don't** use unicode glyphs, emoji or third-party icon sets as icons.
- **Don't** show the aurora beam more than once per page, or put two full-strength glows on screen together.
- **Don't** use General Sans below 28px or for interface text.
- **Don't** put drop shadows on dark cards; separate them with hairlines and surface steps.
- **Don't** replay the VaultDoor on normal navigation; it belongs only to the moment right after sign-in.
- **Don't** drive `dark:` styles from `prefers-color-scheme`; the theme lives in `data-theme`.
