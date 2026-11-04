import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { T } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { rolesLegibles } from '../lib/formato';

const ITEMS: { route: string; label: string; icon: keyof typeof Feather.glyphMap; desc: string }[] = [
    { route: 'Presupuestos', label: 'Presupuestos', icon: 'file-text', desc: 'Los presupuestos para cada cliente' },
    { route: 'Ventas', label: 'Ventas', icon: 'dollar-sign', desc: 'Las ventas registradas y sus pagos' },
    { route: 'Tasaciones', label: 'Tasaciones', icon: 'clipboard', desc: 'Valuar el usado que trae el cliente' },
];

export default function MasScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const user = useAuthStore((st) => st.user);
    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg }}>
            {user ? <T.Muted style={{ marginBottom: spacing.lg }}>{user.nombre} · {rolesLegibles(user.roles)}</T.Muted> : null}

            {ITEMS.map((it) => (
                <Pressable
                    key={it.route}
                    onPress={() => navigation.navigate(it.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`${it.label}. ${it.desc}`}
                    style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                >
                    <View style={s.icon}><Feather name={it.icon} size={20} color={colors.accentText} /></View>
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

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
    rowPressed: { backgroundColor: colors.bgElevated, borderColor: colors.borderStrong },
    icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    label: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
}));
