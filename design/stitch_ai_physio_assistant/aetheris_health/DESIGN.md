---
name: Aetheris Health
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#bbcac6'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#859490'
  outline-variant: '#3c4947'
  surface-tint: '#4fdbc8'
  primary: '#4fdbc8'
  on-primary: '#003731'
  primary-container: '#14b8a6'
  on-primary-container: '#00423b'
  inverse-primary: '#006b5f'
  secondary: '#bec6e0'
  on-secondary: '#283044'
  secondary-container: '#3f465c'
  on-secondary-container: '#adb4ce'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e49200'
  on-tertiary-container: '#543300'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#71f8e4'
  primary-fixed-dim: '#4fdbc8'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005048'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  stat-value:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  stack-sm: 12px
  stack-md: 24px
  stack-lg: 48px
---

## Brand & Style
The design system is engineered for a premium, AI-driven physiotherapy experience. The brand personality is "Clinical Excellence meets Human Warmth"—it must feel as precise as a medical instrument but as motivating as a high-end personal trainer. 

The aesthetic follows a **Premium Health-Tech** movement: a dark, focused environment that reduces visual fatigue during recovery sessions. It utilizes a refined version of **Glassmorphism** and **Tonal Layering**, where depth is communicated through subtle border highlights and soft teal glows rather than traditional heavy shadows. This creates a high-fidelity "dashboard" feel that empowers users to track their physical progress with confidence.

## Colors
The palette is centered on a deep, obsidian-like foundation to provide maximum contrast for medical data.

- **Primary (Teal 500):** Used for primary actions, active progress rings, and joint tracking markers. It represents healing and technological precision.
- **Background (Slate 950):** A near-black slate (#020617) used for the base canvas.
- **Surface (Slate 900):** Used for cards and navigation elements to create subtle separation from the background.
- **Accents/Status:** 
    - **Amber/Rose:** Used for misalignment warnings and high-stress alerts.
    - **Emerald:** Reserved for successful session completion and "In-Range" movement markers.
- **Glows:** A 15% opacity Teal glow is used behind key interactive elements and hero typography to simulate a high-tech "aura."

## Typography
The system uses **Inter** for all primary interfaces to maintain a clean, systematic feel. A secondary monospaced font, **JetBrains Mono**, is introduced sparingly for data points, timestamps, and anatomical coordinates to reinforce the "AI" and "Precision" aspect of the platform.

Headlines should use tight letter-spacing for a modern, high-end look. Body text maintains a generous line height (1.5x) to ensure exercises and medical instructions are easily readable during physical activity.

## Layout & Spacing
The layout uses a **Fluid Grid** model with high-margin "safe zones" to ensure the UI feels airy and premium. 

- **Desktop:** 12-column grid with 24px gutters. Content is typically centered in a 1280px container.
- **Mobile:** 4-column grid with 16px margins. Elements are primarily stacked vertically to accommodate one-handed use during physical therapy sessions.
- **Spacing Rhythm:** Based on a 4px baseline. Most component spacing should use 12px (Small), 24px (Medium), or 48px (Large) increments to maintain vertical rhythm.

## Elevation & Depth
This design system avoids traditional "heavy" shadows in favor of **Tonal Elevation** and **Inner Glows**.

1.  **Level 0 (Base):** Slate-950 background.
2.  **Level 1 (Cards/Surfaces):** Slate-900 with a 1px solid border (Slate-800) and a very subtle 20px blur shadow at 30% opacity black.
3.  **Level 2 (Modals/Popovers):** Slate-800 with a 1px "light-source" border on the top edge (Teal-500 at 20% opacity) to suggest the element is closer to the user.
4.  **Active Focus:** Elements in use (like the current exercise card) gain a soft Teal-500 outer glow (32px blur, 10% opacity) to draw the eye without being distracting.

## Shapes
The shape language is "Generous & Organic." While the system is technical, the use of large corner radii makes it feel accessible and safe.

- **Standard Cards:** 24px (1.5rem) or 32px (2rem) for larger dashboard sections.
- **Form Inputs:** 12px (0.75rem) to balance the larger cards.
- **Buttons & Badges:** Full pill-shape (999px) to differentiate actionable items and status indicators from structural layout blocks.

## Components

- **Buttons:** Primary buttons are pill-shaped, Teal-500 background with white or Slate-950 text. Secondary buttons use a "Ghost" style: 1px Teal-500 border with no fill.
- **Stat Tiles:** High-contrast blocks featuring a `label-caps` title and a `stat-value` number. A mini sparkline (Teal) is often embedded at the bottom of the tile.
- **Progress Rings:** Thick 8px stroke widths. Use Teal-500 for the progress and Slate-800 for the track. Center the percentage or a "check" icon within the ring.
- **Data Charts:** Line and Area charts must use a Teal-500 stroke (2px) with a subtle Teal-to-Transparent gradient fill. Grid lines should be very faint (Slate-800).
- **Form Controls:** Inputs are Slate-900 with a 1px Slate-800 border. On focus, the border transitions to Teal-500 with a 2px outer glow.
- **Activity Chips:** Small pill-shaped badges (e.g., "Strength", "Flexibility") using Slate-800 backgrounds and Slate-300 text. Active chips toggle to a Teal-500 background.
- **Exercise Cards:** Large 2xl rounded containers. They feature a primary image/video area, a bold title, and a bottom bar with "Rep" and "Set" monospaced labels.