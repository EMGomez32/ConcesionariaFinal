/**
 * Tokens de marca AUTENZA para la app móvil.
 *
 * Espejo del tema OSCURO del front web (FrontConcesionaria/src/index.css): la app
 * arranca en dark, que es como se ve el login de la marca. Los colores y el
 * gradiente emerald→cyan→violet son los mismos, para que web y móvil se sientan
 * la misma marca. No cambiar el gradiente (regla de DESIGN.md).
 */

export const colors = {
    // Fondos (dark).
    bg: '#06080f',
    bgSecondary: '#0f1424',
    bgCard: '#11172a',
    bgElevated: '#161e36',

    // Acentos de marca.
    accent: '#14d8a3',        // emerald (variante dark)
    accentHover: '#10b981',
    accent2: '#8b5cf6',       // violet
    accent3: '#06b6d4',       // cyan
    /** Tinta para texto SOBRE el acento/gradiente (muy luminoso). */
    onAccent: '#04060d',

    // Texto.
    text: '#f5f7fb',
    textSecondary: '#b6bdce',
    textMuted: '#6b7693',

    // Líneas.
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',

    // Estados.
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#06b6d4',
} as const;

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
