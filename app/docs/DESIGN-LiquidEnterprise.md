---
name: Luminous Liquid Enterprise
colors:
  surface: '#0d1322'
  surface-dim: '#0d1322'
  surface-bright: '#33394a'
  surface-container-lowest: '#080e1d'
  surface-container-low: '#151b2b'
  surface-container: '#191f2f'
  surface-container-high: '#242a3a'
  surface-container-highest: '#2f3445'
  on-surface: '#dde2f8'
  on-surface-variant: '#e3beb6'
  inverse-surface: '#dde2f8'
  inverse-on-surface: '#2a3040'
  outline: '#aa8982'
  outline-variant: '#5b403b'
  surface-tint: '#ffb4a4'
  primary: '#ffb4a4'
  on-primary: '#640d00'
  primary-container: '#fd5837'
  on-primary-container: '#580a00'
  inverse-primary: '#b62506'
  secondary: '#c2c1ff'
  on-secondary: '#1800a7'
  secondary-container: '#3630bf'
  on-secondary-container: '#b1b1ff'
  tertiary: '#00dce6'
  on-tertiary: '#00373a'
  tertiary-container: '#00a0a9'
  on-tertiary-container: '#002f32'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3e0500'
  on-primary-fixed-variant: '#8d1600'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c2c1ff'
  on-secondary-fixed: '#0c006b'
  on-secondary-fixed-variant: '#332dbc'
  tertiary-fixed: '#6ff6ff'
  tertiary-fixed-dim: '#00dce6'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#004f53'
  background: '#0d1322'
  on-background: '#dde2f8'
  surface-variant: '#2f3445'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.03em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '800'
    lineHeight: 28px
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.06em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system crafts an elevated, high-performance communication hub for merchants operating at enterprise scale. Merging ultra-refined glassmorphism with dynamic optical physics, the interface transforms high-density operational telemetry, customer chats, broadcast campaigns, and dispute resolutions into a fluid, luminous workplace.

The visual direction rejects flat, utilitarian enterprise sprawl in favor of translucent depth, precision refractive edges, and vivid energy conduits. Deep nocturnal slate surfaces provide an infinite foundation, punctured by radiant ambient light meshes in signature marketplace vermilion and electric indigo. Liquid refraction, frosted specular planes, and razor-sharp white highlights simulate physical optical lenses. The resulting emotional tone is authoritative yet frictionless, executive, and relentlessly modern.

## Colors

The color architecture is built entirely on dark-mode light dispersion, contrasting absolute nocturnal backdrops against high-temperature radiative accents:

- **Surface Ground (`#0B1120`)**: The foundational deep slate-navy canvas, absorbing excess visual clutter and providing an infinite stage for refracted light.
- **Primary Vermilion (`#EE4D2D`)**: The core brand pulse. Used for primary calls-to-action, high-priority notifications, real-time message alerts, and critical transaction states. Emits a localized radiant heat glow when paired with translucent glass surfaces.
- **Secondary Electric Indigo (`#5E5CE6`)**: Provides chromatic tension and balanced optical resonance. Powers analytical metrics, broadcast tool states, secondary indicators, and systemic status badges.
- **Tertiary Cyan Light (`#00F2FE`)**: Used sparingly for liquid specular highlights, shimmer states, refraction vertices, and active real-time socket connections.
- **Glass Shading Tiers**:
  - `Glass-Base`: `rgba(15, 23, 42, 0.65)` with backdrop filter blur.
  - `Glass-Elevated`: `rgba(30, 41, 59, 0.45)` with dynamic multi-stop linear specular borders.
  - `Glass-Overlay`: `rgba(255, 255, 255, 0.04)` over layered cards.
- **Specular Border Gradients**: Directional top-down linear gradients running from `rgba(255, 255, 255, 0.25)` to `rgba(255, 255, 255, 0.04)`.

## Typography

Typography prioritizes high-velocity readability and optical density over decorative nuance. Built with **Inter**, the scale achieves clean separation across high-density chat lists, order telemetry, and navigation rails:

- **H1 (`headline-lg`)**: Primary view titles, revenue metric counters, and critical dialogue summaries. Rendered with tight tracking and paired with pure white `#FFFFFF` or a subtle liquid gradient fill transitioning from `#FFFFFF` down to `#CBD5E1`.
- **H2 (`headline-md`)**: Sub-panel headers, buyer communication titles, and active channel labels. Retains strong contrast without commanding unnecessary weight.
- **H3 (`headline-sm`)**: Functional section dividing labels, metric categorization badges, and thread metadata keys. Set in uppercase with wide letter spacing (`0.06em`) and paired with muted slate `rgba(148, 163, 184, 0.8)`.
- **Body & Numerical Values**: Tabular figures (`font-variant-numeric: tabular-nums`) must be active on all timestamp, balance, and order reference contexts to prevent optical jitter during live streaming updates.

## Layout & Spacing

The portal deploys an asymmetric 3-tier master-detail structural grid designed for rapid triaging and live customer engagement:

1. **Global Navigation Rail (80px fixed width)**: Compact icon-based luminous rail anchored to the left viewport.
2. **Master List / Communication Index (340px–380px fixed fluid)**: Encapsulated in a continuous frosted column housing buyer message queues, SLA status meters, and filter pills.
3. **Primary Canvas / Workspace (Fluid flex-1)**: Houses the interactive thread, customer transaction telemetry, and logistics sidecar panels.

On desktop displays, columns sit atop a shared canvas displaying subtle blurred color meshes. Gutters of `1.25rem` (20px) maintain isolation between distinct glass containers. Mobile devices collapse into a single-pane fluid flow with bottom navigation pills, reducing outer margins to `1rem` (16px) and utilizing modal overlays for communication inspector panels.

## Elevation & Depth

Visual depth is achieved through layered optical refraction, variable frost density, and directional top illumination rather than standard diffuse drop shadows:

- **Level 0 (Canvas Base)**: `#0B1120` layered with dual under-glass radial blur meshes: a Vermilion glow (`#EE4D2D` at 12% opacity, 180px blur) in the top-right quadrant, and an Electric Indigo glow (`#5E5CE6` at 15% opacity, 220px blur) centered under active data lists.
- **Level 1 (Docked Panes & Shells)**: Translucent glass layers utilizing `backdrop-filter: blur(20px)`, background fill of `rgba(15, 23, 42, 0.65)`, and an outer edge stroke created by a 1px gradient: `linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.03) 100%)`.
- **Level 2 (Cards, Interactive Modules & Feed Items)**: `backdrop-filter: blur(16px)`, background fill of `rgba(30, 41, 59, 0.55)`, framed with a 1px border `rgba(255, 255, 255, 0.20)`. Casts an ambient shadow: `0 8px 32px 0 rgba(0, 0, 0, 0.37)`.
- **Level 3 (Modals, Liquid Active Pills & Popovers)**: Elevated glass panes with background fill `rgba(30, 41, 59, 0.85)`, specular highlight inner shadow `inset 0 1px 1px 0 rgba(255, 255, 255, 0.30)`, and a vivid ambient halo tinted by the underlying content context (`rgba(238, 77, 45, 0.25)` or `rgba(94, 92, 230, 0.25)` with a 32px blur).

## Shapes

The geometric framework balances precision tooling with sleek, organic tactility:

- **Cards and Functional Modules (`rounded-lg` / 1rem)**: Structural panes, chat bubbles, customer history trays, and data visualizations take 16px corner radii to balance content density with modern fluidity.
- **Interactive Controls & System Pills (`full` / 9999px)**: Action items, status indicators, filter tags, and quick-reply triggers are modeled as frictionless liquid pills.
- **Hero Containers & Major Panes (`rounded-xl` / 1.5rem)**: Large primary workspaces and modal shells utilize 24px corner curves, echoing optical lenses.

## Components

### Buttons & Action Pills
- **Primary Liquid Button**: Saturated gradient fill `linear-gradient(135deg, #FF6433 0%, #EE4D2D 100%)` encased in a 1px border `rgba(255, 255, 255, 0.3)`. Features an internal top highlight `inset 0 1px 0 0 rgba(255, 255, 255, 0.45)` and a persistent ambient bloom: `0 4px 20px rgba(238, 77, 45, 0.4)`. Hovering produces an internal white specular wash (`opacity 0.15`) and expands the ambient bloom to 28px.
- **Secondary Glass Button**: Translucent background `rgba(255, 255, 255, 0.06)`, `backdrop-filter: blur(12px)`, bordered with 1px `rgba(255, 255, 255, 0.15)`. On hover, the fill shifts to `rgba(255, 255, 255, 0.12)` with border brightening to `rgba(255, 255, 255, 0.35)`.

### Navigation Rail
- A vertical column wrapped in `backdrop-filter: blur(24px)` with a right-hand specular divider (`1px solid rgba(255, 255, 255, 0.08)`).
- **Active Navigation Indicator**: A floating liquid pill with an electric vermilion glow, featuring a centered white icon and an absolute right-edge vertical light tick (`2px x 16px` pure `#EE4D2D` with `box-shadow: 0 0 8px #EE4D2D`).
- **Inactive Items**: Slate-tinted icons (`rgba(148, 163, 184, 0.7)`) that smoothly transition to pure white on hover with a faint radial light pool behind the glyph.

### Chat & Customer Thread Cards
- **Customer Messages**: Glass tile with `rgba(255, 255, 255, 0.05)` fill, `backdrop-filter: blur(12px)`, and a crisp top-left radius accent.
- **Seller Replies**: Directional gradient glass `linear-gradient(135deg, rgba(238, 77, 45, 0.2) 0%, rgba(94, 92, 230, 0.15) 100%)`, bounded by a 1px specular border `rgba(255, 255, 255, 0.25)`.
- **Order Embed Pill**: A nested card within the chat containing product thumbnails, total price in tabular bold text, and a luminous status chip (`In Transit`, `Unpaid`, `Delivered`).

### Input Fields & Search Bars
- Glass-well inputs styled with `rgba(15, 23, 42, 0.6)` background fill, set recessed into the surface using an inner shadow `inset 0 2px 4px rgba(0, 0, 0, 0.5)`.
- Bounded by 1px `rgba(255, 255, 255, 0.12)`. When focused, the border shifts to `#EE4D2D` with a subtle outer glow: `0 0 0 3px rgba(238, 77, 45, 0.2)`.

### Status Badges & SLA Chips
- Pill shapes with a hybrid 10% opacity background matched to indicator color:
  - **Critical SLA / Urgent**: `#EE4D2D` tint with pulsing liquid dot (`box-shadow: 0 0 6px #EE4D2D`).
  - **VIP Buyer**: `#5E5CE6` tint with refractive specular border.
  - **Resolved / Stable**: `#10B981` tint with crisp monochrome label.