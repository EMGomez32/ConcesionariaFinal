import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize } from '../theme/tokens';
import { T } from '../components/ui';
import { useAuthStore } from '../store/authStore';

const ITEMS: { route: string; label: string; icon: keyof typeof Feather.glyphMap; desc: string }[] = [
    { route: 'Presupuestos', label: 'Presupuestos', icon: 'file-text', desc: 'Cotizaciones para el cliente' },
    { route: 'Ventas', label: 'Ventas', icon: 'dollar-sign', desc: 'Operaciones cerradas y pagos' },
    { route: 'Tasaciones', label: 'Tasaciones', icon: 'clipboard', desc: 'Valuar el usado que trae el cliente' },
];

export default function MasScreen({ navigation }: any) {
    const user = useAuthStore((s) => s.user);
    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg }}>
            <T.H1 style={{ marginTop: spacing.sm }}>Más</T.H1>
            {user ? <T.Muted style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>{user.nombre} · {user.roles.join(', ')}</T.Muted> : null}

            {ITEMS.map((it) => (
                <Pressable key={it.route} onPress={() => navigation.navigate(it.route)} style={s.row}>
                    <View style={s.icon}><Feather name={it.icon} size={20} color={colors.accent} /></View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.label}>{it.label}</Text>
                        <T.Muted>{it.desc}</T.Muted>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textMuted} />
                </Pressable>
            ))}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
    icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    label: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
});
