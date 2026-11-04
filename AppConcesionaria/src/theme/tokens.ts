/**
 * Tokens de marca AUTENZA para la app móvil.
 *
 * Dos paletas con los MISMOS roles (oscura y clara), espejo de los temas del front
 * web (FrontConcesionaria/src/index.css). La app sigue el tema del sistema (ver
 * `theme/theme.ts`); si el sistema no informa ninguno, arranca en oscuro, que es
 * como se ve el login de la marca. El gradiente emerald→cyan→violet es el mismo en
 * los dos temas (regla de DESIGN.md: no se toca).
 *
 * Contraste (WCAG AA, calculado; ver el informe de la fase 2):
 *  - `textMuted`: oscuro 5,44:1 sobre bgCard y 5,05:1 sobre bgElevated; claro
 *    5,38:1 sobre bgCard y 4,98:1 sobre bgElevated (antes #6b7693: 3,93 y 3,64).
 *  - Los tonos (`accentText`, `success`, `warning`, `danger`, `accent2`, `accent3`)
 *    son colores de TEXTO: dan ≥ 4,5:1 como badge de 12 pt (texto sobre su propio
 *    tinte al 12 %) sobre bgCard y bgElevated en los dos temas.
 *  - `inputBorder`: ≥ 3:1 contra el fondo del input y lo que lo rodea.
 *  - `accent` es RELLENO (botón, segmento elegido): encima va `onAccent`, nunca
 *    blanco. Como texto suelto sobre blanco no llega (2,54:1): para eso `accentText`.
 */

export interface Palette {
    // Fondos.
    bg: string;
    bgSecondary: string;
    bgCard: string;
    bgElevated: string;

    // Acentos de marca.
    /** Relleno de acción (botón, segmento o chip elegido). */
    accent: string;
    /** El acento como TEXTO o ícono sobre una superficie. */
    accentText: string;
    /** Violeta (texto/badge). */
    accent2: string;
    /** Cian (texto/badge). */
    accent3: string;
    /** Tinta para texto SOBRE el acento/gradiente (muy luminoso en los dos temas). */
    onAccent: string;

    // Texto.
    text: string;
    textSecondary: string;
    textMuted: string;

    // Líneas.
    border: string;
    borderStrong: string;
    /** Borde de inputs y checkboxes: ≥ 3:1 contra lo que los rodea. */
    inputBorder: string;

    // Estados (texto/badge).
    success: string;
    danger: string;
    warning: string;
    info: string;

    /** Velo detrás de los modales. */
    overlay: string;
}

export const darkColors: Palette = {
    bg: '#06080f',
    bgSecondary: '#0f1424',
    bgCard: '#11172a',
    bgElevated: '#161e36',

    accent: '#14d8a3',
    accentText: '#14d8a3',
    accent2: '#a78bfa',
    accent3: '#22d3ee',
    onAccent: '#04060d',

    text: '#f5f7fb',
    textSecondary: '#b6bdce',
    textMuted: '#848ea9',

    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    inputBorder: '#646d88',

    success: '#34d399',
    danger: '#f87171',
    warning: '#f59e0b',
    info: '#22d3ee',

    overlay: 'rgba(0,0,0,0.6)',
};

export const lightColors: Palette = {
    bg: '#f6f7fb',
    bgSecondary: '#eef0f6',
    bgCard: '#ffffff',
    bgElevated: '#f4f6fb',

    accent: '#10b981',
    accentText: '#065f46',
    accent2: '#6d28d9',
    accent3: '#155e75',
    onAccent: '#04060d',

    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#5f6b80',

    border: '#e2e6ef',
    borderStrong: '#cdd3e0',
    inputBorder: '#848ca0',

    success: '#065f46',
    danger: '#b91c1c',
    warning: '#92400e',
    info: '#155e75',

    overlay: 'rgba(15,23,42,0.55)',
};

/** Gradiente de marca (emerald → cyan → violet). Para expo-linear-gradient. */
export const brandGradient = ['#10b981', '#06b6d4', '#8b5cf6'] as const;
/** Gradiente corto emerald→cyan, para botones primarios (como los CTA del web). */
export const accentGradient = ['#14d8a3', '#06b6d4'] as const;

export const radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 22,
    pill: 999,
} as const;

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
} as const;

/** Objetivo táctil mínimo (pt), como piden Apple (44) y Material (48 dp). */
export const touchMin = 44;

/** Familias de fuente (se cargan con expo-font en App.tsx). */
export const fonts = {
    // Space Grotesk para títulos/marca; el system font para el cuerpo.
    brand: 'SpaceGrotesk_600SemiBold',
    brandBold: 'SpaceGrotesk_700Bold',
    body: undefined as string | undefined, // system default
} as const;

export const fontSize = {
    xs: 12,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 26,
    xxl: 34,
} as const;
