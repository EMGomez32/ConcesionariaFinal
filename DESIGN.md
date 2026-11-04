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
  text-muted: "#646c80"
  text-on-accent: "#04060d"
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
    textColor: "{colors.text-on-accent}"
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
    textColor: "#047052"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
---

# Design System: AUTENZA

## Overview

**Creative North Star: "La Cabina Fintech"**

AUTENZA es la cabina de mando de una concesionaria: una herramienta de trabajo donde el personal opera el negocio entero —vehículos, ventas, financiación, postventa, fiscalidad— durante todo el día. La base es de producto financiero premium: superficies claras y neutras (`#f6f7fb`) sobre las que flotan tarjetas blancas con bordes de un pelo, una barra lateral navy casi negra (`#0a0f1f`) que ancla la navegación, y números en cifras tabulares que se alinean columna a columna. Es sobria a propósito: la densidad de datos y la escaneabilidad mandan sobre la expresión.

Sobre esa base corre un acento futurista —emerald como color de acción, con violet y cyan para categorizar— y un vocabulario de *glows* de color y un gradiente aurora (emerald→cyan→violet). Ese neón es **señal, no papel tapiz**: aparece cuando algo significa algo (una acción primaria, un estado, un foco, una métrica destacada), no como decoración de fondo. El sistema tiene destellos disponibles (fondo aurora, tilt 3D en las stat-cards, barrido de brillo en el botón primario, texto con gradiente), pero la dirección es utilitaria: se usan con cuentagotas y nunca compiten con los datos.

Dos temas completos —claro (`:root`) y oscuro (`[data-theme="dark"]`)— que reencuadran los mismos roles (ver **Tema** abajo: sigue al sistema hasta que el usuario elige). Todo respeta `prefers-reduced-motion` y todo interactivo tiene anillo de foco visible.

### Tema
- **Sin elección del usuario, la app sigue al sistema:** `prefers-color-scheme` decide claro u oscuro, y si el sistema cambia con la app abierta (modo oscuro automático de noche), la app cambia en vivo.
- **El toggle del TopBar guarda una elección explícita** en localStorage (`autenza-theme`, v1: `{ elegido: "light" | "dark" }`). Desde ahí el sistema ya no la pisa. `seguirSistema()` del store la olvida (para una preferencia "Automático").
- **Sin flash:** el script inline de `index.html` aplica la misma regla antes del primer pintado (lee `elegido`, o el `theme` del formato viejo v0, y si no hay, `matchMedia`). `src/store/themeStore.ts` la mantiene en sync después.
- Las pantallas de auth (login, recupero) son siempre oscuras: escenario navy fijo.

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
- **Tinta** (`#0f172a`) texto principal · **Tinta Media** (`#475569`) secundario · **Tinta Tenue** (`#646c80` en claro, `#8590ab` en oscuro) muted/placeholder/etiquetas. Es texto, así que cumple 4.5:1 en los dos temas (ver tabla de contraste abajo).
- **Borde** (`#e2e6ef`) hairline por defecto · **Borde Fuerte** (`#cdd3e0`) en hover/énfasis.

### Status
- **success** `#10b981` (= emerald) · **warning** `#f59e0b` · **danger** `#ef4444` · **info** `#06b6d4` (= cyan). Se usan solo por su significado.
- danger y warning exponen canales `--danger-rgb` / `--warning-rgb` para tonales translúcidos (badges, rings, glows — mismo patrón que `--accent-rgb`), y danger un par oscuro `--danger-hover` (`#dc2626`) que cierra su gradiente, paralelo a `--accent-hover`.
- danger suma `--danger-strong` (`#b91c1c`) para el CIERRE del gradiente del botón destructivo. Existe por contraste, no por estética: con `danger` (rojo 500) el texto blanco encima da 3.76:1 y el piso AA para 15px/600 es 4.5:1; con el par hover→strong el botón va de 4.83:1 a 6.47:1. `danger` a secas se sigue usando como COLOR DE TEXTO, donde oscurecerlo empeoraría la lectura sobre fondo oscuro.
- El scrim de modales es `--overlay-scrim` (`rgba(15,23,42,0.75)`, tinta slate translúcida): único overlay del sistema.

### Tinta sobre acento
El acento de AUTENZA es un emerald/cyan muy luminoso en los dos temas, así que **el texto blanco encima no llega al piso de contraste**: daba 1.85:1 en oscuro y 2.54:1 en claro, contra el 4.5:1 que exige WCAG AA para los tamaños que usa la UI (botones 15px/600, tabs 13px/700 — ninguno califica como texto grande).

Todo texto que vaya **sobre `--accent` o sobre `--accent-gradient`** usa `--text-on-accent` (`#04060d`), que lo lleva a entre 5.37:1 y 10.97:1 según el punto del gradiente. El gradiente de marca **no se toca**: es binding. Aplica a `.btn-primary` (texto y spinner de carga), `.segmented-btn.is-active`, `.icon-btn:hover`, `.skip-link`, el botón "Siguiente/Listo" del tour (`tour.css`), el ícono del avatar del TopBar, el contador de filtros activos y el contador de notificaciones (sobre violet). El isotipo blanco sobre el gradiente neón es la marca (gráfico, no texto) y no cambia.

`--text-white` queda para superficies oscuras que no son el acento (hoy: los botones destructivos, sobre el par danger-hover/danger-strong, y el navy del sidebar y del login).

### Texto de estado (`--*-text`)
Los colores de acento y de estado son luminosos: sirven para fondos, bordes, íconos y glows, pero **como color de texto sobre superficies claras no contrastan** (warning daba 1.99:1, cyan 2.22, emerald 2.31, danger 3.29). Para texto existen sus variantes: `--accent-text` / `--success-text` (`#047052`), `--warning-text` (`#9a4a07`), `--danger-text` (`#b91c1c`), `--info-text` (`#0b6a84`), `--accent-2-text` (`#6d28d9`). En oscuro son los tonos luminosos (que ya contrastan), salvo danger, que sube a `#f87171`. Las usan los badges, las utilidades `.text-accent/-success/-warning/-danger/-info/-accent-2`, el mensaje de error de los campos y los hover de texto (outline, paginación, breadcrumb). Regla: **texto → `--*-text`; fondo, borde o ícono → el token base**.

### Contraste medido (WCAG 2.x, AA = 4.5:1 para texto)
| Par | Antes | Ahora |
|---|---|---|
| Tinta Tenue claro sobre card / lienzo / lienzo hundido | 3.09 / 2.88 / 2.71 | 5.25 / 4.91 / 4.61 |
| Tinta Tenue oscuro sobre card / lienzo / hundido / elevado | 3.93 / 4.42 / 4.05 / 3.64 | 5.57 / 6.27 / 5.74 / 5.16 |
| Título de sección del sidebar (blanco 0.55) sobre navy claro / oscuro | 2.85 / 2.78 (blanco 0.32) | 6.22 / 6.27 |
| Bajada del logo del sidebar (blanco 0.55) | 4.51 / 4.47 (blanco 0.45) | 6.22 / 6.27 |
| Badge warning claro (sobre su tinte en card / lienzo hundido) | 1.99 / 1.77 | 5.79 / 5.15 |
| Badge emerald claro | 2.31 / 2.05 | 5.55 / 4.93 |
| Badge cyan claro | 2.22 / 1.96 | 5.63 / 4.97 |
| Badge danger claro | 3.29 / 2.92 | 5.66 / 5.03 |
| Badge violet claro | 3.75 / 3.31 | 6.29 / 5.55 |
| Badge danger oscuro (card / elevado) | 4.33 / 4.01 | 5.88 / 5.46 |
| Contador de notificaciones (tinta sobre violet claro / oscuro) | 4.23 / 2.72 (blanco) | 4.78 / 7.44 |
| Botón "Siguiente" del tour (tinta sobre #10b981 / #059669) | 2.54 / 3.77 (blanco) | 7.98 / 5.37 |

Los ratios se calculan con la fórmula de luminancia relativa de WCAG, componiendo los translúcidos sobre su superficie real (el badge es el acento al 10% sobre la card).

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
- **Label** (Inter, 600–900, `0.75rem`↓, ls 0.08–0.12em, UPPERCASE): etiquetas de input (`--text-xs`), headers de tabla y labels de filtro (**Micro-label** `--text-2xs` = 0.7rem, 700), y etiquetas de métrica (**Nano-label** `--text-3xs` = 0.625rem, 900, `.stat-tile-label`). Los pasos micro son SÓLO para labels con tracking, nunca texto corrido. Las utilidades `.text-xs/.text-sm/.text-xl` son alias exactos de los tokens homónimos.

### Named Rules
**The Space-Grotesk-Headlines Rule.** Space Grotesk es solo para titulares, valores de stat y números destacados. Inter carga todo el texto corrido y de controles. No mezclar.

**The Tabular-Numbers Rule.** Toda cifra monetaria o de cantidad va en `font-variant-numeric: tabular-nums` para que las columnas alineen. Un número que baila entre filas es un bug.

## Layout

Modelo de columna centrada: `.page-container` a `max-width: 1440px`, padding `2.5rem` (baja a 1.75 / 1.1 / 0.85rem en 1024 / 768 / 480px), con `gap` vertical de `2rem` entre bloques.

**Encabezado de página (`.page-header`):** `space-between` con `flex-wrap`. **El título (`.header-title h1`) no se parte en dos renglones:** va en una línea y, si título + acciones no entran (p.ej. "Financiación externa" con tres botones a 1280px), son las acciones las que bajan a un segundo renglón. El subtítulo ajusta dentro del ancho del título. En ≤768px colapsa a columna y el título sí puede cortar.

**Filtros plegables (`.filtros-plegables` o `<FiltrosPlegables>`):** en escritorio (≥1024px) la barra de filtros se ve siempre; en tablet y teléfono arranca plegada detrás de un botón "Filtros (n)" con la cantidad de filtros activos y un "Limpiar filtros". La estructura a mano está documentada en `index.css`; el componente (`src/components/ui/FiltrosPlegables.tsx`) recibe `activos`, `onLimpiar` y los controles como hijos, y pasa `data-tour` a la barra.

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
- **Shape:** píldora (`--radius-pill`, 999px). Inter 600, `--text-base`, gap 0.5rem para el ícono. Hover `translateY(-1px)`, active `scale(0.98)`, foco `box-shadow: var(--focus-ring)` (= `0 0 0 3px var(--ring)`).
- **Primary:** gradiente emerald (`--accent-gradient`, `#10b981`→`#059669`), texto en tinta `--text-on-accent` (nunca blanco), sombra emerald tenue; en hover pasa a `--glow-accent` y dispara un barrido de brillo (`::after`). Padding `0.75rem 1.5rem`.
- **Secondary:** fondo card, texto tinta, borde hairline, sombra xs → en hover sube a bg-elevated + borde fuerte.
- **Danger:** gradiente rojo (`#ef4444`→`#dc2626`). **Outline:** transparente con borde fuerte que vira a emerald en hover. **Ghost:** transparente, texto secundario, hover con fondo rebajado.
- **Tamaños:** `sm` (0.5/1rem, text-sm), base, `lg` (0.95/2rem, text-lg).
- **Cargando (`<Button loading>`):** spinner en la tinta del botón (`currentColor`) + **el mismo texto** del botón ("Guardar" sigue diciendo "Guardar"; nunca "Cargando..."), o `loadingText` si se pasa ("Guardando…"). Queda deshabilitado y con `aria-busy`.

### Chips / Badges
- **Style:** píldora, UPPERCASE, `--text-xs`, 600, ls 0.06em, fondo translúcido al 10% del acento con borde al 20%; el TEXTO va en la variante `--*-text` del color (ver "Texto de estado").
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
- **Accesibilidad (automática en `<Input>`, `<Select>`, `<Textarea>`, `<Combobox>`):** si la página no pasa `id`, el componente genera uno (`useId`), así la etiqueta queda asociada (clic en la etiqueta enfoca el campo; el lector de pantalla lo nombra). El error y la ayuda se conectan con `aria-describedby`, y el error marca `aria-invalid`. El `<Select>` con `options` trae la opción vacía "Elegí una opción".
- **Select con búsqueda (`<Combobox>`):** para listas largas (clientes, unidades, proveedores). Patrón ARIA combobox (input + listbox): ↓/↑ recorren, Enter elige, Escape cierra la lista, opción con texto secundario (`sub`, también se busca), búsqueda local sin tildes o remota con `onSearch` (250 ms de debounce). La lista va en un portal con posición fija: no la recorta el cuerpo de un modal.
- **Error / Disabled:** borde danger + halo rojo (`.has-error`); disabled con fondo rebajado y cursor `not-allowed`.
- **Las dos familias (canon y legacy):** `.input-*` es el CANON y lo que usa código nuevo — idealmente vía los componentes `<Input>`, `<Select>` y `<Textarea>` (`src/components/ui`), que ya lo envuelven: control a `--text-base` (15px), etiqueta micro-caps `.input-label`. `.form-*` (`.form-label` sentence-case + `.form-input`/`.form-input-select` a `--text-sm`, 13px) es la capa LEGACY de los formularios densos operativos (~20 páginas): sus valores están anclados a la rampa para que no vuelva a derivar, se mantiene pero no se extiende. Regla al convivir: en una misma vista no mezclar los dos estilos de etiqueta — si un form legacy necesita etiqueta nueva, va `.input-label` (micro-caps, el canon). Las copias locales de `.form-*` en bloques `<style>` de páginas son redundantes con la capa global: eliminarlas al tocar esas páginas. Migración de fondo: gradual, página por página, hacia los componentes de `ui/`.

### Data Table
- **Header:** fondo `--bg-secondary`, texto muted UPPERCASE `0.7rem` ls 0.12em.
- **Body:** celdas `--text-sm` 500 en `tabular-nums`, padding `0.625rem 1rem` (header `0.7rem 1rem`, sin cortes); fila en hover con `--accent-light`. Contenedor con `overflow-x:auto` y esquinas redondeadas.
- **Densidad (`<DataTable>`, clase `dt-compacta`):** cada celda en un renglón → filas de ~52–56px (medido: 55px con las columnas de Ventas a 1280px; eran 120px). Si la tabla no entra, scrollea de costado. Columnas de texto libre: `wrap: true` en la columna (corta con ancho mínimo de 14rem); `.line-clamp-*` sigue cortando y `.truncate` recorta a 16rem. Los botones de ícono de la fila bajan a 32px.
- **Filas clicables (`onRowClick`):** entran al orden de tabulación, se abren con Enter o Espacio, muestran la manito y el anillo de foco (outline `--ring`). Conservan el rol de fila; `rowLabel` les da un nombre corto.
- **Estados:** cargando (skeleton), error (`error={query.error}` + `onRetry` → mensaje en español y "Reintentar"; se distingue del vacío con `.dt-empty-badge.is-error`) y vacío (`emptyMessage`, `emptyHint`, `emptyAction` para el CTA y `onClearFilters` → "Limpiar filtros").

### Modal
- `role="dialog"` + `aria-modal`, nombrado por su título (`aria-labelledby`) y descripto por el subtítulo.
- Al abrir enfoca el primer campo del cuerpo (o el pie: en una confirmación, "Cancelar"), salvo que el contenido ya tenga `autoFocus`. Retiene el foco con Tab / Shift+Tab, Escape cierra sólo el modal de arriba (con uno encima de otro) y al cerrar el foco vuelve al botón que lo abrió.

### Accesibilidad global
- **Foco visible en todo interactivo:** `:focus-visible` pinta `var(--focus-ring)` en botones, links, campos, `[tabindex]` y filas clicables, más un outline transparente que el modo de alto contraste de Windows sí dibuja. No hay ningún `outline: none` global. Los `[tabindex="-1"]` (destinos de foco programático: el `<main>`, el panel de un modal) quedan sin anillo.
- **Menú lateral en móvil:** se cierra al navegar, al tocar un ítem y con Escape; cerrado es `inert` (no recibe foco ni lo lee el lector de pantalla); al abrirlo el foco entra al panel y al cerrarlo vuelve al botón "Abrir menú".
- **Avisos (toasts):** los de error duran 7 s (warning 6 s, info 4 s, éxito 3 s) y no se apilan repetidos.

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
