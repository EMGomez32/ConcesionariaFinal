import { StyleSheet, useColorScheme } from 'react-native';
import { darkColors, lightColors, Palette } from './tokens';

/**
 * Tema activo según el sistema (claro/oscuro). Si el sistema no informa ninguno
 * ('unspecified' o null), queda el oscuro: es el aspecto original de la marca.
 *
 * Los objetos de tema son constantes (uno por esquema), así que sirven de clave
 * de caché para los estilos de `makeStyles`.
 */
export interface Theme {
    dark: boolean;
    colors: Palette;
}

const DARK: Theme = { dark: true, colors: darkColors };
const LIGHT: Theme = { dark: false, colors: lightColors };

export function useTheme(): Theme {
    return useColorScheme() === 'light' ? LIGHT : DARK;
}

/**
 * Hoja de estilos que depende del tema. Reemplaza al `StyleSheet.create` a nivel
 * de módulo (que congelaba los colores al importar):
 *
 *   const useStyles = makeStyles((colors) => ({ root: { backgroundColor: colors.bg } }));
 *   ...
 *   const s = useStyles();
 *
 * Crea UNA hoja por paleta y la reutiliza (no se recrea en cada render).
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Palette) => T) {
    const cache = new Map<Palette, T>();
    return function useStyles(): T {
        const { colors } = useTheme();
        let hoja = cache.get(colors);
        if (!hoja) {
            hoja = StyleSheet.create(factory(colors));
            cache.set(colors, hoja);
        }
        return hoja;
    };
}
