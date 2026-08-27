import React from 'react';
import {
    View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Modal, ScrollView,
    ViewStyle, TextStyle, TextInputProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, fonts, fontSize, accentGradient } from '../theme/tokens';

/** Botón primario con el gradiente de marca. */
export function GradientButton({
    title, onPress, loading, disabled, style,
}: {
    title: string;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
}) {
    const off = disabled || loading;
    return (
        <Pressable onPress={off ? undefined : onPress} style={[{ opacity: off ? 0.6 : 1 }, style]}>
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

/** Botón secundario (borde, sin relleno). */
export function GhostButton({ title, onPress, style }: { title: string; onPress?: () => void; style?: ViewStyle }) {
    return (
        <Pressable onPress={onPress} style={[s.ghost, style]}>
            <Text style={s.ghostText}>{title}</Text>
        </Pressable>
    );
}

export function Field({
    label, style, ...props
}: { label?: string; style?: ViewStyle } & TextInputProps) {
    return (
        <View style={style}>
            {label ? <Text style={s.label}>{label}</Text> : null}
            <TextInput
                placeholderTextColor={colors.textMuted}
                style={s.input}
                {...props}
            />
        </View>
    );
}

export type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'cyan' | 'muted';
const TONE: Record<BadgeTone, string> = {
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    violet: colors.accent2,
    cyan: colors.accent3,
    muted: colors.textMuted,
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
    const c = TONE[tone];
    return (
        <View style={[s.badge, { borderColor: c + '66', backgroundColor: c + '1f' }]}>
            <Text style={[s.badgeText, { color: c }]}>{label}</Text>
        </View>
    );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
    const Comp: any = onPress ? Pressable : View;
    return <Comp onPress={onPress} style={[s.card, style]}>{children}</Comp>;
}

/** Selector segmentado (pestañas tipo pill). */
export function Segmented<V extends string>({
    value, options, onChange, style,
}: {
    value: V;
    options: { value: V; label: string }[];
    onChange: (v: V) => void;
    style?: ViewStyle;
}) {
    return (
        <View style={[s.seg, style]}>
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && s.segItemOn]}>
                        <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Modal centrado con título + cuerpo desplazable + botones al pie. */
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
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.backdrop}>
                <View style={s.sheet}>
                    <Text style={s.sheetTitle}>{title}</Text>
                    {subtitle ? <Text style={s.sheetSub}>{subtitle}</Text> : null}
                    <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingVertical: spacing.md }} keyboardShouldPersistTaps="handled">
                        {children}
                    </ScrollView>
                    {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
                </View>
            </View>
        </Modal>
    );
}

export const T = {
    H1: ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.h1, style]}>{children}</Text>,
    H2: ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.h2, style]}>{children}</Text>,
    Body: ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.body, style]}>{children}</Text>,
    Muted: ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => <Text style={[s.muted, style]}>{children}</Text>,
};

const s = StyleSheet.create({
    btn: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    btnText: { color: colors.onAccent, fontFamily: fonts.brandBold, fontSize: fontSize.md, fontWeight: '700' },
    ghost: { height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    ghostText: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
    label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    input: {
        backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
        paddingHorizontal: spacing.lg, height: 52, color: colors.text, fontSize: fontSize.md,
    },
    badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.3 },
    card: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
    h1: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '700' },
    h2: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.lg, fontWeight: '700' },
    body: { color: colors.text, fontSize: fontSize.base },
    muted: { color: colors.textMuted, fontSize: fontSize.sm },

    seg: { flexDirection: 'row', backgroundColor: colors.bgSecondary, borderRadius: radius.pill, padding: 4 },
    segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
    segItemOn: { backgroundColor: colors.accent },
    segText: { color: colors.textSecondary, fontWeight: '700', fontSize: fontSize.sm },
    segTextOn: { color: colors.onAccent },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
    sheet: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: spacing.xl },
    sheetTitle: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.lg, fontWeight: '700' },
    sheetSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
    sheetFooter: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
