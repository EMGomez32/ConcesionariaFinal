import React, { useRef, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, KeyboardAvoidingView, Alert,
    ViewStyle, TextStyle, TextInputProps, StyleProp, Insets,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, fonts, fontSize, accentGradient, touchMin, Palette } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { esErrorDeRed, mensajeDeError } from '../lib/errores';

/** Lo que le falta a un objetivo táctil para llegar a 44 pt, repartido a los lados. */
export const hitSlopPara = (ancho: number, alto: number): Insets => {
    const h = Math.max(0, Math.ceil((touchMin - ancho) / 2));
    const v = Math.max(0, Math.ceil((touchMin - alto) / 2));
    return { top: v, bottom: v, left: h, right: h };
};

/** Cerrar sesión pide confirmación: un toque sin querer no saca al usuario de la app. */
export const confirmarCerrarSesion = (onConfirm: () => void) => Alert.alert(
    '¿Cerrar sesión?',
    'Para volver a entrar vas a necesitar tu correo y tu contraseña.',
    [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: onConfirm },
    ],
);

/** Botón primario con el gradiente de marca. */
export function GradientButton({
    title, onPress, loading, disabled, style, accessibilityHint,
}: {
    title: string;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    accessibilityHint?: string;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    const off = disabled || loading;
    return (
        <Pressable
            onPress={off ? undefined : onPress}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: !!off, busy: !!loading }}
            style={({ pressed }) => [{ opacity: off ? 0.6 : pressed ? 0.85 : 1 }, style]}
        >
            <LinearGradient
                colors={accentGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.btn}
            >
                {loading
                    ? <ActivityIndicator color={colors.onAccent} />
                    : <Text style={s.btnText}>{title}</Text>}
            </LinearGradient>
        </Pressable>
    );
}

/** Botón secundario (borde, sin relleno). `danger` para acciones destructivas. */
export function GhostButton({
    title, onPress, style, icon, danger, disabled, accessibilityHint,
}: {
    title: string;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    icon?: keyof typeof Feather.glyphMap;
    danger?: boolean;
    disabled?: boolean;
    accessibilityHint?: string;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    const color = danger ? colors.danger : colors.text;
    return (
        <Pressable
            onPress={disabled ? undefined : onPress}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: !!disabled }}
            style={({ pressed }) => [s.ghost, pressed && s.pressed, disabled && { opacity: 0.6 }, style]}
        >
            {icon ? <Feather name={icon} size={17} color={color} /> : null}
            <Text style={[s.ghostText, { color }]}>{title}</Text>
        </Pressable>
    );
}

/** Botón de solo ícono: SIEMPRE con `label` (lo lee el lector de pantalla) y 44 pt de objetivo. */
export function IconButton({
    icon, label, onPress, color, size = 18, style, bordered = true, hint,
}: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    onPress?: () => void;
    color?: string;
    size?: number;
    style?: StyleProp<ViewStyle>;
    bordered?: boolean;
    hint?: string;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
            hitSlop={bordered ? undefined : hitSlopPara(size + 8, size + 8)}
            style={({ pressed }) => [bordered ? s.iconBtn : s.iconBtnPlain, pressed && s.pressed, style]}
        >
            <Feather name={icon} size={size} color={color ?? colors.textSecondary} />
        </Pressable>
    );
}

export function Field({
    label, style, right, inputStyle, ...props
}: {
    label?: string;
    style?: StyleProp<ViewStyle>;
    /** Algo a la derecha dentro del campo (p. ej. mostrar/ocultar la contraseña). */
    right?: React.ReactNode;
    inputStyle?: StyleProp<TextStyle>;
} & TextInputProps) {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <View style={style}>
            {label ? <Text style={s.label}>{label}</Text> : null}
            <View style={s.inputBox}>
                <TextInput
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel={label ?? props.placeholder}
                    style={[s.input, inputStyle]}
                    {...props}
                />
                {right}
            </View>
        </View>
    );
}

export type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'cyan' | 'muted';
/** Color de TEXTO de cada tono (todos ≥ 4,5:1 sobre su tinte en las dos paletas). */
const toneColor = (c: Palette, tone: BadgeTone): string => ({
    accent: c.accentText,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    violet: c.accent2,
    cyan: c.accent3,
    muted: c.textSecondary,
}[tone]);

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
    const s = useStyles();
    const { colors } = useTheme();
    const c = toneColor(colors, tone);
    return (
        <View style={[s.badge, { borderColor: c + '66', backgroundColor: c + '1f' }]}>
            <Text style={[s.badgeText, { color: c }]}>{label}</Text>
        </View>
    );
}

export function Card({
    children, style, onPress, accessibilityLabel, accessibilityHint,
}: {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityHint?: string;
}) {
    const s = useStyles();
    if (!onPress) return <View style={[s.card, style]}>{children}</View>;
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            style={({ pressed }) => [s.card, pressed && s.cardPressed, style]}
        >
            {children}
        </Pressable>
    );
}

/** Selector segmentado (pestañas tipo pill). Cada opción mide ≥ 44 pt de alto. */
export function Segmented<V extends string>({
    value, options, onChange, style, accessibilityLabel,
}: {
    value: V | '';
    options: { value: V; label: string; accessibilityLabel?: string }[];
    onChange: (v: V) => void;
    style?: StyleProp<ViewStyle>;
    /** Qué se elige ("Moneda", "Estado"…): lo anuncia el lector de pantalla. */
    accessibilityLabel?: string;
}) {
    const s = useStyles();
    return (
        <View style={[s.seg, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <Pressable
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="tab"
                        accessibilityLabel={o.accessibilityLabel ?? o.label}
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [s.segItem, on && s.segItemOn, pressed && !on && s.pressed]}
                    >
                        <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Opciones en chips que hacen salto de línea (para etiquetas largas: "Muy bueno"). */
export function Chips<V extends string>({
    value, options, onChange, style, accessibilityLabel,
}: {
    value: V | '' | null;
    options: { value: V; label: string }[];
    onChange: (v: V) => void;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
}) {
    const s = useStyles();
    return (
        <View style={[s.chips, style]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <Pressable
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="radio"
                        accessibilityLabel={o.label}
                        accessibilityState={{ selected: on, checked: on }}
                        style={({ pressed }) => [s.chip, on && s.chipOn, pressed && !on && s.pressed]}
                    >
                        <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Casilla con su texto; toda la fila es el objetivo táctil. */
export function Checkbox({
    checked, onChange, label, style,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    style?: StyleProp<ViewStyle>;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <Pressable
            onPress={() => onChange(!checked)}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked }}
            style={({ pressed }) => [s.check, pressed && s.pressed, style]}
        >
            <View style={[s.checkbox, checked && s.checkboxOn]}>
                {checked ? <Feather name="check" size={16} color={colors.onAccent} /> : null}
            </View>
            <Text style={s.checkText}>{label}</Text>
        </Pressable>
    );
}

/**
 * Contenedor que corre el contenido para que el teclado no tape el botón de
 * guardar. Mide su propia posición en la ventana y la usa como offset (así sirve
 * con o sin header, sin depender del alto del header).
 */
export function KeyboardSafeView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    const ref = useRef<View>(null);
    const [offset, setOffset] = useState(0);
    return (
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset} style={[{ flex: 1 }, style]}>
            <View
                ref={ref}
                style={{ flex: 1 }}
                onLayout={() => ref.current?.measureInWindow((_x, y) => { if (Number.isFinite(y)) setOffset(y); })}
            >
                {children}
            </View>
        </KeyboardAvoidingView>
    );
}

/** Modal centrado con título + cuerpo desplazable + botones al pie. El teclado no tapa el pie. */
export function Sheet({
    visible, onClose, title, subtitle, children, footer,
}: {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    const s = useStyles();
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                <View style={[s.backdrop, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
                    <View style={s.sheet} accessibilityViewIsModal>
                        <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>
                        {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
                        <ScrollView
                            style={s.sheetBody}
                            contentContainerStyle={{ paddingVertical: spacing.md }}
                            keyboardShouldPersistTaps="handled"
                        >
                            {children}
                        </ScrollView>
                        {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/** Aviso destacado (confirmación de un alta, advertencia). */
export function Banner({
    tone = 'success', title, text, style,
}: {
    tone?: 'success' | 'warning' | 'danger';
    title: string;
    text?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    const c = toneColor(colors, tone);
    const icon = tone === 'success' ? 'check-circle' : 'alert-triangle';
    return (
        <View style={[s.banner, { borderColor: c + '66', backgroundColor: c + '14' }, style]} accessibilityRole="alert">
            <Feather name={icon} size={18} color={c} />
            <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>{title}</Text>
                {text ? <Text style={s.bannerText}>{text}</Text> : null}
            </View>
        </View>
    );
}

/** Error de carga con el motivo y "Reintentar" (distinto de "no hay datos"). */
export function ErrorCarga({
    que, error, onRetry, style,
}: {
    /** Qué no se pudo cargar: "los clientes", "la venta"… */
    que: string;
    error: unknown;
    onRetry: () => void;
    style?: StyleProp<ViewStyle>;
}) {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <View style={[s.errorBox, style]} accessibilityRole="alert">
            <Feather name={esErrorDeRed(error) ? 'wifi-off' : 'alert-circle'} size={22} color={colors.textMuted} />
            <Text style={s.errorTitle}>No pudimos cargar {que}.</Text>
            <Text style={s.errorText}>{mensajeDeError(error)}</Text>
            <GhostButton title="Reintentar" icon="refresh-cw" onPress={onRetry} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
        </View>
    );
}

/**
 * Lo que va en `ListEmptyComponent`: cargando / error con reintento / vacío.
 * Recibe el estado de la query de react-query.
 */
export function EstadoLista({
    q, que, vacio,
}: {
    q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
    que: string;
    vacio: string;
}) {
    const { colors } = useTheme();
    if (q.isLoading) return <ActivityIndicator color={colors.accentText} style={{ marginTop: spacing.xl }} accessibilityLabel="Cargando" />;
    if (q.isError) return <ErrorCarga que={que} error={q.error} onRetry={() => { q.refetch(); }} style={{ marginTop: spacing.lg }} />;
    return <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>{vacio}</T.Muted>;
}

/** Pie de una lista paginada: cargando la página siguiente o error al traerla. */
export function PieLista({
    cargandoMas, errorMas, onRetry, mostrando, total,
}: {
    cargandoMas: boolean;
    errorMas: boolean;
    onRetry: () => void;
    mostrando: number;
    total?: number;
}) {
    const { colors } = useTheme();
    if (cargandoMas) return <ActivityIndicator color={colors.accentText} style={{ marginVertical: spacing.lg }} accessibilityLabel="Cargando más" />;
    if (errorMas) {
        return (
            <GhostButton title="No pudimos cargar más · Reintentar" icon="refresh-cw" onPress={onRetry} style={{ marginTop: spacing.md }} />
        );
    }
    if (total != null && total > 0 && mostrando > 0) {
        return <T.Muted style={{ textAlign: 'center', marginTop: spacing.lg }}>{mostrando === total ? `Son todos (${total}).` : `Mostrando ${mostrando} de ${total}.`}</T.Muted>;
    }
    return null;
}

export const T = {
    H1: ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
        const s = useStyles();
        return <Text style={[s.h1, style]} accessibilityRole="header">{children}</Text>;
    },
    H2: ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
        const s = useStyles();
        return <Text style={[s.h2, style]} accessibilityRole="header">{children}</Text>;
    },
    Body: ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
        const s = useStyles();
        return <Text style={[s.body, style]}>{children}</Text>;
    },
    Muted: ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
        const s = useStyles();
        return <Text style={[s.muted, style]}>{children}</Text>;
    },
};

const useStyles = makeStyles((colors) => ({
    pressed: { opacity: 0.7 },
    btn: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    btnText: { color: colors.onAccent, fontFamily: fonts.brandBold, fontSize: fontSize.md, fontWeight: '700' },
    ghost: {
        minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.inputBorder,
        flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl,
    },
    ghostText: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
    iconBtn: {
        width: touchMin, height: touchMin, borderRadius: radius.md, borderWidth: 1, borderColor: colors.inputBorder,
        alignItems: 'center', justifyContent: 'center',
    },
    iconBtnPlain: { padding: 4, alignItems: 'center', justifyContent: 'center' },
    label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    inputBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.md,
    },
    input: { flex: 1, paddingHorizontal: spacing.lg, height: 52, color: colors.text, fontSize: fontSize.md },
    badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.3 },
    card: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
    cardPressed: { backgroundColor: colors.bgElevated, borderColor: colors.borderStrong },
    h1: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '700' },
    h2: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.lg, fontWeight: '700' },
    body: { color: colors.text, fontSize: fontSize.base },
    muted: { color: colors.textMuted, fontSize: fontSize.sm },

    seg: { flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: radius.pill, padding: 4 },
    // El borde marca el elegido también en claro, donde el relleno emerald contra el
    // riel da 2,2:1; con el borde `accentText` el indicador llega a 6,7:1.
    segItem: { flex: 1, minHeight: touchMin, paddingHorizontal: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    segItemOn: { backgroundColor: colors.accent, borderColor: colors.accentText },
    segText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.sm },
    segTextOn: { color: colors.onAccent },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
        minHeight: touchMin, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill,
        borderWidth: 1, borderColor: colors.inputBorder,
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accentText },
    chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
    chipTextOn: { color: colors.onAccent, fontWeight: '700' },

    check: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchMin, marginTop: spacing.md },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accentText },
    checkText: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },

    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', paddingHorizontal: spacing.lg },
    sheet: { maxHeight: '100%', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.xl },
    sheetBody: { flexGrow: 0, flexShrink: 1 },
    sheetTitle: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.lg, fontWeight: '700' },
    sheetSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
    sheetFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },

    banner: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
    bannerTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.base },
    bannerText: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },

    errorBox: { alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl },
    errorTitle: { color: colors.text, fontWeight: '700', fontSize: fontSize.base, marginTop: spacing.sm, textAlign: 'center' },
    errorText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs, textAlign: 'center' },
}));
