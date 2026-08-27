import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing } from '../theme/tokens';
import { T } from '../components/ui';

/** Pantalla "en construcción" para las secciones que todavía no se implementaron. */
export default function PlaceholderScreen({ title, icon }: { title: string; icon: keyof typeof Feather.glyphMap }) {
    return (
        <View style={s.root}>
            <View style={s.badge}><Feather name={icon} size={28} color={colors.accent} /></View>
            <T.H2 style={{ marginTop: spacing.lg }}>{title}</T.H2>
            <T.Muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                Esta sección llega en las próximas iteraciones.
            </T.Muted>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    badge: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
});
