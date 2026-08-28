# Command Hub — Blended UI Design Brief

## Purpose

Recreate a premium desktop web-app dashboard for an adaptable AI business command hub. The interface should combine the tactile luxury of dark stone cards with the controlled energy of a neon operations console. It must feel powerful, high-end, modern, and extremely clear rather than flashy or game-like.

The product helps businesses access specialized one-click tools and interact with an AI assistant from one central workspace. During onboarding, the user selects a business category; the hub then adapts its tools, recommendations, and language to that category.

> **Core design idea:** A luxury obsidian command center illuminated by precise teal system light and selective pink action signals.

> **RECONCILED 2026-08-28:** This brief now documents the layout as EXECUTED in `agent/src/components/dashboard/CommandHubShell.tsx` (the Manus implementation). Where the original mock-up and the shipped code differ, the shipped code wins. Divergences are marked **[as built]**. The business-category selector was not implemented and is marked **[deferred]**.

## Overall visual direction

Use a nearly black obsidian background as the dominant canvas. Layer dark charcoal and stone-gray surfaces over it, with subtle mineral or granite texture applied only to cards and panels. The texture should be understated and premium, never noisy.

Use **teal** for system intelligence, navigation focus, icons, borders, graphs, and operational status. Use **white or warm white** for primary text. Use **hot pink or coral pink** for action buttons, selected conversation bubbles, alerts, and high-priority emphasis. A very small amount of muted violet or silver may be used as a secondary accent, but teal, white, pink, and black must remain the defining palette.

The interface should use sharp edges, precise borders, controlled glow, and generous alignment. Avoid excessive rounded “soft SaaS” styling. Cards may use small-radius corners or clipped geometric corners, but they should feel engineered from stone or metal.

## Suggested color system

| Role | Color direction | Suggested value |
|---|---|---|
| Main canvas | Deep obsidian black | `#05080A` |
| Secondary canvas | Black graphite | `#0B1013` |
| Card surface | Dark stone / charcoal | `#151B1F` |
| Card highlight | Slate-gray edge | `#273137` |
| Primary text | Warm white | `#F5F7F4` |
| Secondary text | Cool gray | `#98A4A7` |
| Primary accent | Electric teal | `#00D6D0` |
| Teal glow | Transparent cyan-teal | `rgba(0,214,208,0.25)` |
| Action accent | Hot pink / coral | `#F23D78` |
| Pink glow | Transparent pink | `rgba(242,61,120,0.22)` |
| Optional secondary accent | Muted violet | `#8D72E8` |
| Optional status color | Soft green | `#43D17A` |

## Typography

Use a powerful display typeface for large headings, section labels, and tool names. It should have a strong architectural presence without becoming difficult to read. Good visual characteristics include tall uppercase forms, moderate tracking, and crisp geometric shapes.

Pair the display face with a clean modern sans-serif for descriptions, navigation, chat messages, timestamps, and controls. Body text must remain highly legible at normal desktop sizes.

Recommended hierarchy:

| Element | Treatment |
|---|---|
| Main page heading | Large uppercase or title case, condensed display face, warm white, strong tracking |
| Section heading | Uppercase condensed face, electric teal, moderate tracking |
| Tool title | Bold sans-serif or condensed face, white |
| Navigation labels | Clean sans-serif, medium weight, cool white |
| Descriptions | Clean sans-serif, gray, compact line height |
| AI assistant title | Bold condensed face, teal, with a small intelligence/spark icon |
| Pink action labels | Bold sans-serif, pink, short and direct |

## Desktop composition

Design the screen as a wide 16:9 desktop dashboard with three primary vertical zones:

1. A narrow collapsible to icons left navigation rail
2. A large central workspace for business tools.
3. A fixed condenced right-side AI assistant panel or popup, exitable or minimazble window.

The overall layout should feel luxurious sleek and spacious. The center workspace is the primary area, while the AI panel is always available without overwhelming the tools.

### Left navigation rail

Place a narrow vertical rail along the full left side of the screen. Give it a dark stone surface with a thin border and subtle texture. At the top, show a compact geometric Command Hub mark followed by the stacked wordmark:

```text
COMMAND
HUB
```

Use white for the wordmark, with a small teal accent in the mark.

Navigation items should appear in a vertical list:

| Item | Icon concept | State treatment |
|---|---|---|
| Home | House | Active item has a teal outline and subtle teal glow |
| AI Tools | Sparkles (routes to Agent Tools view) | Neutral gray-white |
| Data | Database cylinder (routes to Command Hub dashboard) | Neutral gray-white |
| Reports | Document (routes to Documents view) | Neutral gray-white |
| Automations | Lightning bolt | Neutral gray-white |
| Integrations | Puzzle | Neutral gray-white |
| LLM Hub | CPU chip | Neutral gray-white |
| System | Heart pulse | Neutral gray-white |
| Settings | Gear (routes to Settings & Security) | Neutral gray-white |

**[as built]** The rail collapses to a 76px icon-only strip via a PanelLeft toggle. The mock-up's Business item was dropped; LLM Hub and System were added.

The active Home item should look like an illuminated stone plate: a thin teal border, a faint cyan glow, teal icon, and teal label. Do not fill the entire rail with bright color.

At the bottom of the rail, include a small plan-status card:

```text
[ green dot ]  All systems active
Ready when connected services are available.
```

**[as built]** No PRO plan badge; the card shows a green status dot plus a one-line readiness note.

## Top workspace area

The central workspace begins with a large heading:

```text
Your Command Hub, In One Place
```

Below it, place a smaller subtitle:

```text
AI command center for your workflows
```

The heading should be the strongest visual element in the central workspace. Use a tall, powerful display font in warm white. The subtitle should be smaller, tracked, and gray-white.

At the upper-right of the center workspace, place a business profile selector:

```text
[ building icon ]  Acme Partners  [ chevron ]
```

The selector should use a dark stone surface, thin gray border, white text, and a small teal building icon.

Behind the heading and category selector, include a very subtle teal data-grid or flowing-line visualization. It should resemble an abstract operational landscape or business signal graph. Keep it low contrast so it supports the interface without competing with the text.

## Business category selector **[deferred]**

The original mock-up placed a wide horizontal category bar beneath the main heading. **This was not implemented**: there is no backend model for business categories yet. When it ships, it should slot beneath the main heading as a dark stone slab with a teal underline on the active tab. Until then the heading area goes straight into the one-click tools section. It should look like a dark stone slab with a thin border and five evenly spaced category options:

```text
Retail     Agency     Finance     Healthcare     Services
```

Each category should have a simple line icon. The selected category is **Retail** in the example.

The active Retail tab should use:

- Teal icon and label.
- A thin teal underline along the bottom edge.
- A restrained teal glow.
- Slightly brighter surface contrast.

Inactive tabs should use white-gray labels and subdued gray icons. The category bar should communicate that the entire tool suite is tailored to the selected business type.

## One-click tools section

Below the category selector, add a section label:

```text
ONE-CLICK TOOLS   ///
```

Use condensed uppercase typography in teal. Add a thin horizontal divider extending to the right.

Display six modular tool cards in a three-column by two-row grid. Each card should be a dark stone rectangle with:

- Subtle granite or mineral texture.
- Thin charcoal border.
- Fine teal highlight along one edge or corner.
- A compact line icon in a dark inset square.
- A large, clear title.
- One or two lines of explanatory copy.
- A small pink square action button containing a white arrow.

Use the following sample cards:

| Tool | Description |
|---|---|
| **CODE GENERATION** | Scaffold projects and generate code from a spec. |
| **DOCUMENTS** | Create .docx, .xlsx, .pdf and slide decks. |
| **AGENT TOOLS** | Memory, email, Slack, image-gen and agent bus. |
| **TASK HUB** | Plan, queue and track autonomous runs. |
| **APPROVALS** | Review and approve high-risk actions. |
| **INTEGRATIONS** | Connect tools, providers and services. |

**[as built]** The mock-up's generic business tools (Draft Email, Build Quote, Plan Campaign, Summarize Meeting, Track Leads, Generate Report) were replaced with the hub's six real feature views, each card carrying a category tag chip (Build / Create / Automate / Plan / Review / Connect) and routing to its panel on click.

### Card interaction behavior

Each card is a one-click launch point. Clicking the card or pink arrow should open the associated tool with relevant business context already loaded. The selected business category should influence the template, recommendations, tone, and fields shown inside the tool.

On hover, the card should:

- Brighten slightly.
- Reveal a thin teal perimeter glow.
- Increase icon brightness.
- Keep the pink arrow visible and crisp.

Do not use large gradients or animated effects that make the interface feel unstable.

## Central AI command composer

Place a large command composer beneath the tool grid. This is the bridge between one-click actions and free-form AI interaction.

The composer should be a wide dark-stone panel with a visible teal outline and restrained cyan glow. Its left side contains a circular AI intelligence emblem: a four-point star or abstract spark inside concentric teal and charcoal rings.

Use this exact heading:

```text
What would you like to get done?
```

Immediately beneath it, use a pink uppercase helper label:

```text
ASK COMMAND HUB ANYTHING
```

Include a row of suggested prompt chips:

```text
Scaffold a new project
Create a document
Run an agent task
Summarize my workspace
```

Place a pink or pink-outlined submit button at the upper-right of the composer with a white upward arrow. Include a small lock icon and this disclaimer along the bottom:

```text
AI responses may be inaccurate. Verify important information.
```

The composer must make it clear that the user can type a custom instruction or use one of the suggested prompts.

## Right-side AI assistant panel

The right side of the dashboard is a fixed AI chat panel with a dark stone background, thin border, and subtle inner shadow. It should be visually distinct from the center but use the same design language.

At the top, show:

```text
[ spark icon ]  COMMAND AI            [ pop-out ] [ collapse ] [ close ]
Your AI co-pilot for getting things done.
```

**[as built]** The panel has three controls: pop-out (opens a floating command window), collapse (shrinks to a 76px strip with a vertical AI label), and close (dismisses; a floating teal spark button reopens it). On mobile the panel is reached through a pink Command AI pill button that opens the pop-out window.

Use teal for the title and spark icon. Use gray-white for the subtitle. The minus button should be a small dark square with a thin border.

### Conversation content

Show a short, realistic conversation with generous spacing and clearly differentiated message bubbles.

Assistant message:

```text
Good morning, Alex.
Here’s what’s happening with your business today.
9:00 AM
```

User message, using a pink bubble aligned to the right:

```text
What are my top priorities today?
9:01 AM  ✓✓
```

Assistant response:

```text
Here are your top priorities:

1. Follow up with 5 leads
2. Send proposal to Acme Corp
3. Review Q2 marketing plan
4. Invoice Eclipse Project
9:01 AM
```

User message:

```text
Draft a follow-up email for Acme Corp.
9:02 AM  ✓✓
```

Assistant response:

```text
Sure! Here’s a draft follow-up email
for Acme Corp.
9:02 AM
```

The assistant messages should use dark graphite bubbles with light borders. User messages should use a deep pink gradient or solid pink surface with white text. Keep bubbles rectangular with modest rounding; avoid oversized pill shapes.

### Chat input

At the bottom of the AI panel, include a bright outlined input field with a teal glow:

```text
Ask anything or give a command...
```

Inside or beneath the input, include small teal utility icons for:

- AI spark or assistant mode.
- Attachment.
- Data or chart context.

Place a pink square submit button on the right containing a teal or white paper-plane arrow. Below the field, include:

```text
AI responses may be inaccurate.
Verify important information.
```

## Iconography

Use a consistent technical line-icon system. Icons should be simple, geometric, and readable at small sizes. Recommended visual language:

- Two-pixel or similarly substantial strokes.
- Rounded endpoints only where helpful.
- Teal for intelligence and system functions.
- Pink for action and attention.
- White-gray for navigation and neutral functions.
- Icons placed inside dark inset squares for tool cards.

Avoid decorative illustrations, cartoon mascots, excessive 3D effects, and unrelated stock imagery.

## Surface and lighting rules

The visual blend depends on a careful balance between stone and neon:

| Element | Stone treatment | Neon treatment |
|---|---|---|
| Background | Matte obsidian, nearly black | Almost no glow; retain depth through faint grid lines |
| Tool cards | Textured charcoal or granite | Thin teal edge highlights and pink action buttons |
| Active navigation | Dark raised plate | Teal perimeter light |
| Category selector | Heavy dark slab | Teal underline and active icon |
| AI composer | Stone panel with inset intelligence emblem | Teal outline and pink helper label |
| AI chat panel | Dark graphite, slightly elevated | Teal title, pink user messages, glowing input |
| Data visualization | Low-contrast linework | Very restrained teal luminescence |

Glow should be used as a precision signal, not as ambient decoration. A user should be able to tell what is active, actionable, or intelligent without the whole interface glowing.

## Layout proportions

Use the following approximate desktop proportions:

| Region | Width or height guidance |
|---|---:|
| Left rail | 12–14% of viewport width |
| Right AI panel | 24–27% of viewport width |
| Center workspace | Remaining 59–64% of viewport width |
| Top heading area | 18–22% of center workspace height |
| Category selector | 8–10% of center workspace height |
| Tool grid | 35–42% of center workspace height |
| AI composer | 20–24% of center workspace height |

Maintain consistent internal padding. The dashboard should feel dense enough to be useful but never crowded.

## Responsive behavior

On narrower screens, preserve the command composer and AI assistant as the primary interaction points.

- Collapse the left rail into an icon-only rail or a slide-out drawer.
- Move the right AI panel below the central tools or open it as an overlay.
- Convert the tool grid from three columns to two columns, then one column.
- Keep tool titles and primary actions visible without truncation.
- Preserve the teal active state and pink action state across breakpoints.

## Product personality

The interface should communicate the following qualities:

| Quality | How to express it visually |
|---|---|
| Powerful | Strong display typography, decisive spacing, clear action buttons |
| Intelligent | AI spark symbols, teal system color, contextual recommendations |
| Adaptable | Business category selector and tailored tool names |
| Premium | Obsidian surfaces, stone texture, restrained lighting, no visual clutter |
| Fast | One-click cards, short labels, obvious arrows, command composer |
| Trustworthy | Calm hierarchy, clear status, readable copy, visible AI disclaimer |

## Avoid

Do not make the dashboard look like a gaming HUD, hacker terminal, cryptocurrency exchange, or generic neon cyberpunk template. Avoid excessive glassmorphism, rainbow gradients, overly rounded cards, tiny low-contrast text, decorative 3D objects, animated-looking noise, and too many competing accent colors.

The desired result is a **luxury operational interface**: dark, tactile, crisp, intelligent, and immediately understandable.

## Short recreation prompt

Create a high-end desktop SaaS dashboard for an adaptable AI business command hub. Use an obsidian-black canvas with subtle dark granite stone cards, crisp warm-white typography, electric teal system accents, and selective hot-pink action states. Combine premium tactile stone surfaces with restrained futuristic neon edge lighting and faint teal data-grid lines. Use a narrow collapsible left navigation rail, a large center workspace titled “Your Command Hub, In One Place,” six one-click tool cards wired to real feature views, a large AI command composer, and a right-side chat panel titled “COMMAND AI” with pop-out, collapse, and close controls. The UI must be crystal-clear, powerful, sleek, spacious, highly usable, and visually expensive. Use strong condensed display typography for headings and clean modern sans-serif text for controls. Keep glow precise and limited; avoid gaming aesthetics, clutter, excessive gradients, and illegible microtext.

## References

This brief is derived from the supplied blended Command Hub visual mock-up and does not rely on external factual sources.
