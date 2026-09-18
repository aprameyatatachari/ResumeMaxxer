---
name: ResumeMaxxer
description: A monochrome vault for your career record, with one iridescent light inside.
colors:
  ink: "#1a1a1a"
  void: "#0a0a0a"
  paper: "#ffffff"
  paper-2: "#f4f4f4"
  ink-muted: "#4d4d4d"
  ink-faint: "#6e6e6e"
  line: "#e6e6e6"
  line-strong: "#c4c4c4"
  night-surface: "#121212"
  night-surface-2: "#1b1b1b"
  night-ink: "#f5f5f5"
  night-line: "#262626"
  iri-lilac: "#c9aaff"
  iri-butter: "#feffbc"
  iri-blush: "#ffcdfd"
  iri-sky: "#b3e2ff"
  iri-peri: "#839aff"
  tag-ember: "#6b3fc4"
  tag-iris: "#3f52c4"
  danger: "#b3261e"
  danger-wash: "#fdecea"
  success: "#1f7a4d"
  success-wash: "#e6f4ec"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8.5vw, 6.25rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.06em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 3.25rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.045em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  field: "14px"
  card: "28px"
  panel: "44px"
  pill: "1024px"
spacing:
  chip-x: "0.7rem"
  field-x: "0.95rem"
  button-x: "1.35rem"
  card: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 1.35rem"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.void}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 1.35rem"
    height: "44px"
  button-white:
    backgroundColor: "#f2f2f2"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "0 1.35rem"
    height: "44px"
  button-iridescent:
    backgroundColor: "{colors.void}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 1.35rem"
    height: "44px"
  button-glass:
    backgroundColor: "rgb(255 255 255 / 0.16)"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 1.35rem"
    height: "44px"
  input:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0.6rem 0.95rem"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  chip:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "0 0.7rem"
    height: "26px"
  chip-ember:
    backgroundColor: "rgb(201 170 255 / 0.18)"
    textColor: "{colors.tag-ember}"
    rounded: "{rounded.pill}"
    padding: "0 0.7rem"
    height: "26px"
---

# Design System: ResumeMaxxer

## Overview

**Creative North Star: "The Monochrome Vault"**

The visual language derives from the Conicorn Webflow template: a white-and-graphite page, Geist set huge and tight, pills for every control, fat rounded cards, black-and-white photography, and one pastel iridescent gradient (lilac, butter, blush, sky, periwinkle). Everything is grey until something matters; then it catches the light. The gradient is the only colour story, and it is spent on the hero headline, one focal line per page, the logo core and the hero CTA ring.

Day is the native mode. Night inverts the greys and keeps the gradient unchanged. Sections that must stay dark in both themes (the nav cluster, the auth image panel, dark feature wells) use the void band scope, which re-declares every night token for its subtree. The landing page reads as a numbered editorial sequence (001 What it is, 002 Why it works, 003 Capabilities, 004 Process, 005 The output, 006 Pricing), each opened by a small uppercase section marker.

Honesty is a visual constraint: nothing on screen may look like a statistic, testimonial, customer logo or real person unless it is one. Sample content is visibly labelled as sample.

**Key Characteristics:**
- Monochrome greys plus one iridescent pastel gradient; no other accent.
- Geist only, displayed at 600 weight with -0.06em tracking and line-height 1.
- Every button, chip and nav item is a full pill (1024px). Fields 14px, cards 28px, big image panels 44px.
- All photography is grayscale (`grayscale(1) contrast(1.05)`).
- Numbered section markers (001 to 006) structure the landing page.
- Motion is slow and expo-eased; every animation has a finished reduced-motion state.

## Colors

A graphite-on-white monochrome with a single iridescent pastel spectrum held in reserve.

### Primary
- **Graphite Ink** (ink): Body text, the primary pill fill in day, focus ring. Inverts to Night Ink (night-ink) in night mode, where the primary pill becomes light on dark.
- **Iridescent Spectrum** (iri-lilac, iri-butter, iri-blush, iri-sky, iri-peri): Always used together as `linear-gradient(90deg, lilac, butter 25%, blush 50%, sky 75%, periwinkle)`. Clipped into display text, drawn as the ring of the hero CTA, filling the logo core. Lilac alone is the text-selection colour and the tint of the ember chip.

### Neutral
- **Void** (void): The always-dark base: night background, dark bands, primary hover in day.
- **Paper / Paper 2** (paper, paper-2): Page and card surfaces; paper-2 fills inputs, chips and alternate bands.
- **Muted and Faint Ink** (ink-muted, ink-faint): Secondary copy and section markers / placeholders.
- **Hairlines** (line, line-strong): Card borders and dividers; line-strong for secondary pill borders and field hover.
- **Night steps** (night-surface, night-surface-2, night-line): Night-mode surfaces and hairlines.

### Status
- **Danger / Success** with their washes: Form errors and confirmations only. Tag text tones (tag-iris, tag-ember) exist for accessible chip text.

### Named Rules
**The One Light Rule.** The iridescent gradient is the only colour. Use it on the hero headline and at most one other focal line per page, never on body copy or as a large fill.

**The Semantic-Only Rule.** Components use the semantic tokens (bg, surface, ink, line) so they flip between day and night; raw values only for elements that must look identical in both themes (white pill, glass pill, dot well, orb).

**The Void Band Rule.** Anything that stays dark in both themes lives inside the void band scope, which re-declares all night tokens.

## Typography

**Display Font:** Geist (variable 100-900, with ui-sans-serif, system-ui)
**Body Font:** Geist
**Label Font:** Geist, uppercase at 12px

**Character:** One family doing everything; hierarchy comes from sheer size and tightness, not from pairing.

### Hierarchy
- **Display** (600, clamp(3rem, 8.5vw, 6.25rem), 1, -0.06em): Hero headline, usually iridescent, max about 13ch, balanced wrap.
- **Headline** (600, clamp(2.25rem, 5.5vw, 4.5rem), 1, -0.06em): Section headings, often animated as dial text.
- **Title** (500, clamp(1.75rem, 4vw, 3.25rem), 1.05, -0.045em): Large statement paragraphs such as the scroll-scrubbed intro.
- **Body** (400, 15px, 1.5, -0.01em): Interface and reading text.
- **Label** (500, 12px, 0.04em, uppercase): Section markers "001 • LABEL" in faint ink with a 6px ink dot.

### Named Rules
**The Tight Display Rule.** Display text is always line-height 1 with negative tracking (-0.06em) and balanced wrapping; never loosen it.

## Layout

Content sits in a 1200px max container with 16px gutters (24px from 640px). The navigation floats rather than docking: a fixed cluster centred at the top with 16px top offset. Landing sections are tall, generous and numbered; hero and closing sections run full-bleed grayscale photography behind the type. A facts marquee (display-size text at 15% ink, masked at both edges, 40s linear loop) runs behind a framed image. Auth pages split into a form column (max 420px) and a dark photographic panel from 1024px up. Breakpoints: 640px (sm), 768px (md, nav collapses below), 1024px (lg).

## Elevation & Depth

Mostly flat: cards are separated by hairline borders and surface steps, not shadows. Depth appears only in specific dark objects and as state.

### Shadow Vocabulary
- **Nav glass** (`0 10px 30px -10px rgb(0 0 0 / 0.6)` with backdrop blur): The floating nav cluster.
- **Primary hover halo** (`0 0 0 4px rgb(131 154 255 / 0.18), 0 10px 30px -10px rgb(131 154 255 / 0.6)`): Primary pill hover only.
- **Iridescent glow** (`0 0 28px -4px rgb(201 170 255 / 0.55)`): Iridescent pill hover.
- **Dot well** (`inset 0 2px 30px rgb(0 0 0 / 0.8), inset 0 0 0 1px rgb(255 255 255 / 0.06)`): The dark dotted top of feature cards.
- **Orb** (two faint rings at 10px and 22px, inset highlight, `0 18px 40px rgb(0 0 0 / 0.6)`): Glossy grey sphere holding a feature icon.
- **Focus ring** (`0 0 0 2px bg, 0 0 0 4px ink`): Every focusable element.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; shadows belong to the nav, the dark signature objects, and hover/focus states.

## Shapes

Pills and fat curves. Controls are full pills (1024px); fields have soft 14px corners; cards 28px; large image panels 44px. Round icon buttons (48px home mark, 40px menu) complete the silhouette. Dots recur: the 6px section-marker dot, the 12px dot grid of the dark well, the orb, the logo's round core.

## Components

### Buttons
Confident, quiet pills that only colour up at the focal moment.
- **Shape:** Full pill (1024px), min height 44px, 14px/500 text; compact variant 34px / 13px.
- **Primary:** Ink fill with paper text (inverted in night). Hover deepens to void with a periwinkle halo.
- **Secondary:** Transparent with line-strong border; border turns ink on hover.
- **White:** Light grey (#f2f2f2) pill on dark imagery and in the nav; pure white on hover.
- **Iridescent:** Void pill with a 1.5px iridescent gradient ring; lilac glow on hover. Hero only.
- **Glass:** 16% white with blur over photography.
- **Danger:** Transparent with danger text and border; danger wash on hover.
- **All:** Press scales to 0.97; disabled at 45% opacity.

### Chips
- **Style:** 26px pill, paper-2 fill, hairline border, 12px/500 muted text.
- **Ember variant:** 18% lilac tint with lilac border and tag-ember text, for emphasis tags.

### Cards / Containers
- **Corner Style:** 28px.
- **Background:** Surface, with a 1px line border, 1.5rem padding, no shadow.
- **Feature cards:** Open with a dark dotted well holding a glossy orb icon. An optional soft lilac or periwinkle bloom may sit in a card corner.

### Inputs / Fields
- **Style:** 44px, 14px radius, paper-2 fill, line border; select gets a custom chevron.
- **Focus:** Fill turns surface, border and a 1px ring turn ink.
- **Labels:** 13px/500 muted, above the field.

### Navigation
A floating dark-glass cluster on every page, always dark via the void band: a 48px round home mark that rotates 45deg on hover, beside a pill holding nav links (40px pills, muted, active gets 12% white fill), theme toggle, account email and a white CTA pill. Below 768px the links collapse into a menu button that opens a 28px-radius glass sheet.

### Section Marker
"001 • What it is": the number, a 6px ink dot, the uppercase label, all 12px faint ink. Numbers run 001 to 006 in page order.

### Dial Text (signature)
Headlines unlock like a combination dial: on entering view the whole line scrambles as rolling narrow glyphs, then letters click into place left to right with a small overshoot, all set within 1.3s. Replays when scrolled back into view. Reduced motion shows the final text immediately.

### Scrub Text
A statement paragraph whose words ink in from faint to solid tied to scroll position. Reduced motion renders it solid.

### Logo
A vault dial seen head-on: a ring and four bolt stubs in current text colour around an iridescent core. Wordmark in 15px/600 Geist at -0.04em.

### Tailor Loom
The tailoring loader: a blank sheet on which a seam of light travels down while resume lines are laid in section by section; the real stage list sits beside it and is announced to screen readers. Reduced motion stops the thread and line animations.

### Welcome Loader
Shown once after sign-up: the dial ring draws itself, the core pops in, a bar fills, and the overlay fades out over 1.6s. Never replayed on navigation.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens so every screen works in day and night.
- **Do** wrap any always-dark section in the void band scope.
- **Do** keep all photography grayscale.
- **Do** use one primary pill per screen; white or glass pills on dark imagery; the iridescent pill only in the hero.
- **Do** open each landing section with a numbered section marker.
- **Do** state only true product facts, and label sample content visibly as sample or example.
- **Do** give every animation a finished reduced-motion state (dial and scrub text render final, marquee, loom and hero settle stop).

### Don't:
- **Don't** invent statistics, user counts, success rates, customer logos, testimonials or quotes.
- **Don't** add any accent colour beyond the iridescent spectrum, or use the gradient on body text or large fills.
- **Don't** show colour photography.
- **Don't** use square or small-radius buttons; controls are pills.
- **Don't** add drop shadows to ordinary cards.
- **Don't** use emoji or unicode glyphs as icons.
- **Don't** replay the welcome loader on normal navigation.
