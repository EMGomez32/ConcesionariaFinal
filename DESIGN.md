---
name: AUTENZA
description: Cabina fintech utilitaria para la gestión integral de concesionarias — base sobria, neón como señal.
colors:
  accent-emerald: "#10b981"
  accent-emerald-deep: "#059669"
  accent-violet: "#8b5cf6"
  accent-cyan: "#06b6d4"
  navy-sidebar: "#0a0f1f"
  navy-light: "#1e293b"
  bg-primary: "#f6f7fb"
  bg-secondary: "#eef0f6"
  bg-card: "#ffffff"
  text-primary: "#0f172a"
  text-secondary: "#475569"
  text-muted: "#8a93a6"
  border: "#e2e6ef"
  border-strong: "#cdd3e0"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  info: "#06b6d4"
typography:
  display:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent-emerald}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-secondary:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  input-control:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "0.7rem 0.9rem"
  card:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  badge:
    textColor: "{colors.accent-emerald}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
---

# Design System: AUTENZA

## Overview

**Creative North Star: "La Cabina Fintech"**

AUTENZA es la cabina de mando de una concesionaria: una herramienta de trabajo donde el personal opera el negocio entero —vehículos, ventas, financiación, postventa, fiscalidad— durante todo el día. La base es de producto financiero premium: superficies claras y neutras (`#f6f7fb`) sobre las que flotan tarjetas blancas con bordes de un pelo, una barra lateral navy casi negra (`#0a0f1f`) que ancla la navegación, y números en cifras tabulares que se alinean columna a columna. Es sobria a propósito: la densidad de datos y la escaneabilidad mandan sobre la expresión.

Sobre esa base corre un acento futurista —emerald como color de acción, con violet y cyan para categorizar— y un vocabulario de *glows* de color y un gradiente aurora (emerald→cyan→violet). Ese neón es **señal, no papel tapiz**: aparece cuando algo significa algo (una acción primaria, un estado, un foco, una métrica destacada), no como decoración de fondo. El sistema tiene destellos disponibles (fondo aurora, tilt 3D en las stat-cards, barrido de brillo en el botón primario, texto con gradiente), pero la dirección es utilitaria: se usan con cuentagotas y nunca compiten con los datos.

Tema claro por defecto, con un tema oscuro completo (`[data-theme="dark"]`) que reencuadra los mismos roles. Todo respeta `prefers-reduced-motion` y tiene anillos de foco visibles.

**Key Characteristics:**
- Base fintech sobria (grises fríos + navy) con acentos neón funcionales.
- Emerald = acción; violet = premium/categoría; cyan = datos/info.
- Superficies planas en reposo; profundidad y glow solo como respuesta a estado.
- Space Grotesk para titulares y números; Inter para todo el texto de UI.
- Cifras siempre en `tabular-nums`; etiquetas en micro-mayúsculas.
- Formas tipo píldora para acciones; radios de 12–16px para contenedores.

## Colors

Una base neutra fría iluminada por un trío de acentos neón de rol fijo; el color casi siempre carga significado, no adorno.

### Primary
- **Emerald Acción** (`#10b981`): el único color de acción. Botón primario (como gradiente hacia `#059669`), enlaces/acento de foco (`--ring`), fila de tabla en hover, estado activo de tabs, y el estado `success`. Su versión profunda **Emerald Profundo** (`#059669`) cierra el gradiente y el hover.

### Secondary
- **Violet Premium** (`#8b5cf6`): highlights y chips "premium", categorización secundaria. Nunca para acciones primarias.

### Tertiary
- **Cyan Dato** (`#06b6d4`): señales de datos, visualizaciones e `info`. Tercer color de categorización.

### Neutral
- **Navy Cabina** (`#0a0f1f`): barra lateral y superficies oscuras de anclaje; el mismo valor es el fondo del tema oscuro. **Navy Claro** (`#1e293b`) para sus escalones.
- **Lienzo** (`#f6f7fb`) y **Lienzo Hundido** (`#eef0f6`): fondo de página y zonas rebajadas (headers de tabla, footers de modal).
- **Tarjeta** (`#ffffff`): toda superficie elevada.
- **Tinta** (`#0f172a`) texto principal · **Tinta Media** (`#475569`) secundario · **Tinta Tenue** (`#8a93a6`) muted/placeholder/etiquetas.
- **Borde** (`#e2e6ef`) hairline por defecto · **Borde Fuerte** (`#cdd3e0`) en hover/énfasis.

### Status
- **success** `#10b981` (= emerald) · **warning** `#f59e0b` · **danger** `#ef4444` · **info** `#06b6d4` (= cyan). Se usan solo por su significado.

### Named Rules
**The Signal-Not-Wallpaper Rule.** El neón (acentos, glows, gradiente aurora) marca significado —acción, estado, foco, una métrica que importa— y nunca decora un fondo denso de datos. Si un glow no comunica estado, sobra.

**The Emerald-Acts Rule.** Emerald es el único color de acción. Violet y cyan categorizan y señalan datos, pero jamás pintan un CTA primario.

## Typography

**Display Font:** Space Grotesk (con fallback Inter, sans-serif)
**Body Font:** Inter (con fallback -apple-system, Segoe UI, Roboto, sans-serif)
**Label/Mono Font:** JetBrains Mono (con fallback ui-monospace, Menlo)

**Character:** Space Grotesk aporta un titular geométrico y técnico, con tracking negativo apretado, que suena a instrumento de precisión; Inter (con `ss01`, `cv11`, `cv02`) hace el trabajo silencioso del texto de UI a cuerpos chicos. La pareja se lee "fintech de ingeniería", no editorial.

### Hierarchy
- **Display** (Space Grotesk, 700, `2.25rem` / `--text-3xl`, lh 1, ls -0.03em): valores de stat y títulos de página (a menudo con `-webkit-text-fill-color: transparent` sobre un gradiente sutil).
- **Headline** (Space Grotesk, 700, `1.75rem` / `--text-2xl`, lh 1.15, ls -0.02em): encabezados de sección; los `h1..h6` heredan Space Grotesk 700.
- **Title** (Space Grotesk, 600, `1.125rem` / `--text-lg`, ls -0.01em): headers de card y de modal.
- **Body** (Inter, 400–500, `0.9375rem` / `--text-base`, lh 1.5): texto general; celdas de tabla en `--text-sm` (0.8125rem) 500.
- **Label** (Inter, 600–900, `0.75rem`↓ / `--text-xs`, ls 0.04–0.12em, UPPERCASE): etiquetas de input, headers de tabla, etiquetas de métrica (`.stat-tile-label` llega a 900 / 0.625rem).

### Named Rules
**The Space-Grotesk-Headlines Rule.** Space Grotesk es solo para titulares, valores de stat y números destacados. Inter carga todo el texto corrido y de controles. No mezclar.

**The Tabular-Numbers Rule.** Toda cifra monetaria o de cantidad va en `font-variant-numeric: tabular-nums` para que las columnas alineen. Un número que baila entre filas es un bug.

## Layout

Modelo de columna centrada: `.page-container` a `max-width: 1440px`, padding `2.5rem` (baja a 1.75 / 1.1 / 0.85rem en 1024 / 768 / 480px), con `gap` vertical de `2rem` entre bloques. El encabezado de página (`.page-header`) es un `space-between` que colapsa a columna en ≤768px.

Existe una capa de utilidades tipo Tailwind **reimplementada a mano** (Tailwind nunca se instaló): grillas de 1/2/12 columnas, `col-span-*`, y variantes `md:` / `lg:` en 640 / 768 / 1024px. Las grillas de datos usan auto-fit: `.stats-grid` es `repeat(auto-fit, minmax(240px, 1fr))`. Ritmo espacial sobre base 4px (`--space-1`…`--space-12`).

**Breakpoints:** sm 640 · md 768 · lg 1024 · (colapsos a 480px). Mobile-first en las utilidades; max-width en las capas del design system.

## Elevation & Depth

Sistema **plano en reposo**: las superficies se separan por un borde hairline (`#e2e6ef`) y una sombra casi invisible, no por elevación. La profundidad y el color aparecen como *respuesta a estado*. Junto a las sombras neutras de slate existe un set paralelo de **glows de color** (emerald/violet/cyan) reservado para lo premium/futurista.

### Shadow Vocabulary
- **xs** (`0 1px 2px rgba(15,23,42,0.05)`): reposo de tablas, filtros, botón secundario.
- **sm** (`0 1px 3px …, 0 1px 2px …`): reposo de cards.
- **md** (`0 4px 12px -2px rgba(15,23,42,0.08)`): card en hover.
- **lg** (`0 12px 24px -8px …`): stat-card en hover.
- **xl** (`0 24px 48px -12px …`): modales.
- **glow-accent / glow-violet / glow-cyan** (`0 0 0 1px … , 0 8px 32px -8px …`): hover del botón primario, cards `.glow`, skip-link. Son señal, no ambiente.

### Named Rules
**The Flat-At-Rest Rule.** En reposo, las superficies son planas: hairline + sombra mínima. Sombra elevada y glow de color solo como respuesta a hover, foco o selección.

## Shapes

Lenguaje de dos radios: **píldora** (`999px`) para todo lo accionable —botones, badges, segmented tabs, search-box, chips— y **esquinas suaves de 12–16px** para lo que contiene —cards (`16px` / `--radius-lg`), inputs (`12px` / `--radius-md`), contenedores de tabla (`16px`)—, subiendo a `24px` (`--radius-xl`) en stat-cards y badges vacíos. Bordes de 1px omnipresentes (hairline); nada de esquinas vivas. Superficies "glass" opcionales con `backdrop-filter: blur(14px) saturate(140%)`.

### Named Rules
**The Pill-for-Actions Rule.** Lo que se toca es píldora; lo que contiene es 12–16px. Un botón con esquina de 8px o una card con forma de píldora rompen el sistema.

## Components

### Buttons
- **Shape:** píldora (`--radius-pill`, 999px). Inter 600, `--text-base`, gap 0.5rem para el ícono. Hover `translateY(-1px)`, active `scale(0.98)`, foco `box-shadow: 0 0 0 3px var(--ring)`.
- **Primary:** gradiente emerald (`--accent-gradient`, `#10b981`→`#059669`), texto blanco, sombra emerald tenue; en hover pasa a `--glow-accent` y dispara un barrido de brillo (`::after`). Padding `0.75rem 1.5rem`.
- **Secondary:** fondo card, texto tinta, borde hairline, sombra xs → en hover sube a bg-elevated + borde fuerte.
- **Danger:** gradiente rojo (`#ef4444`→`#dc2626`). **Outline:** transparente con borde fuerte que vira a emerald en hover. **Ghost:** transparente, texto secundario, hover con fondo rebajado.
- **Tamaños:** `sm` (0.5/1rem, text-sm), base, `lg` (0.95/2rem, text-lg). Estado `is-loading` con spinner.

### Chips / Badges
- **Style:** píldora, UPPERCASE, `--text-xs`, 600, ls 0.06em, fondo translúcido al 10% del acento con borde al 20%.
- **Variantes:** emerald / violet / cyan / navy (neutro) / warning / danger. `.icon-badge` es la versión cuadrada 44px (radio 12px) para íconos.

### Cards / Containers
- **Corner Style:** `--radius-lg` (16px); `--radius-xl` (24px) en stat-cards.
- **Background:** `--bg-card` (#fff) sobre `--bg-primary`.
- **Shadow Strategy:** ver Elevation — sm en reposo, md en hover; `.card.glow` añade glow emerald.
- **Border:** hairline `#e2e6ef` → `#cdd3e0` en hover.
- **Internal Padding:** `--space-6` (24px). `.glass` para superficies frosted.

### Inputs / Fields
- **Style:** `--radius-md` (12px), fondo card, borde hairline, Inter `--text-base`. Etiqueta en micro-mayúsculas (`.input-label`). Soporta ícono a la izquierda y botón "revelar" a la derecha; selects con chevron SVG propio.
- **Focus:** borde emerald + `box-shadow: 0 0 0 3px var(--ring)`; el ícono vira a emerald.
- **Error / Disabled:** borde danger + halo rojo (`.has-error`); disabled con fondo rebajado y cursor `not-allowed`.

### Data Table
- **Header:** fondo `--bg-secondary`, texto muted UPPERCASE `0.7rem` ls 0.12em.
- **Body:** celdas `--text-sm` 500 en `tabular-nums`; fila en hover con `--accent-light`. Contenedor con `overflow-x:auto` y esquinas redondeadas. Estados de vacío (`.dt-empty`) y de error (`.dt-empty-badge.is-error`, en danger) diferenciados.

### Signature: Stat Card + Segmented Tabs
- **Stat Card:** tarjeta de métrica con valor en Space Grotesk display, etiqueta en micro-mayúsculas 900, ícono marca-de-agua en la esquina (opacity 0.06) y —opcional— *tilt 3D* en hover (`rotateX/rotateY` + glow emerald). Usar el tilt con criterio (dirección utilitaria).
- **Segmented Tabs** (`.segmented`): control tipo píldora; el segmento activo toma el gradiente emerald y su sombra. En ≤640px ocupa el ancho completo.

## Do's and Don'ts

### Do:
- **Do** reservar el gradiente emerald para la **única** acción primaria de cada vista; lo demás es `.btn-secondary` / `.btn-outline` / `.btn-ghost`.
- **Do** poner toda cifra monetaria o de cantidad en `tabular-nums` (celdas de tabla y valores de stat ya lo hacen).
- **Do** mantener las superficies planas con borde hairline y dejar que el hover revele profundidad (`--shadow-md`, glow).
- **Do** etiquetar métricas y headers con micro-mayúsculas (`--text-xs`↓, ls 0.08–0.12em, `--text-muted`).
- **Do** usar los colores de estado (success emerald, warning ámbar, danger rojo, info cyan) solo por su significado.
- **Do** respetar `prefers-reduced-motion` y los anillos de foco (`0 0 0 3px var(--ring)`) en todo interactivo.

### Don't:
- **Don't** convertir el fondo aurora ni los glows en decoración ambiente detrás de vistas densas de datos: la cabina es utilitaria primero.
- **Don't** usar violet o cyan para acciones primarias —emerald actúa, violet/cyan categorizan.
- **Don't** introducir un cuarto tono de acento, ni radios o sombras fuera de la escala de tokens.
- **Don't** renderizar números en Space Grotesk de cuerpo ni perder la alineación tabular.
- **Don't** poner sombra elevada en reposo: la profundidad es una respuesta a estado, no un estado por defecto.
- **Don't** dar forma de píldora a un contenedor ni esquina viva a un botón (rompe el Pill-for-Actions).
