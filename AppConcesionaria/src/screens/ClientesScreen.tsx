import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Linking, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, T } from '../components/ui';
import { clientesApi, Cliente, ESTADO_LEAD_LABEL, ORIGEN_LEAD_LABEL } from '../api/clientes.api';

const nombre = (c: Cliente) => [c.nombre, c.apellido].filter(Boolean).join(' ');
const soloDigitos = (s?: string | null) => (s ?? '').replace(/\D+/g, '');

export default function ClientesScreen() {
    const [search, setSearch] = useState('');
    const q = useQuery({
        queryKey: ['clientes', search],
        queryFn: () => clientesApi.list(search.trim() || undefined, 1, 50),
    });
    const items = q.data?.results ?? [];

    const llamar = (tel?: string | null) => { const d = soloDigitos(tel); if (d) Linking.openURL(`tel:${d}`); };
    const whatsapp = (c: Cliente) => {
        const d = soloDigitos(c.telefono);
        if (!d) return;
        Linking.openURL(`https://wa.me/${d}?text=${encodeURIComponent(`Hola ${c.nombre},`)}`);
    };

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={(c) => String(c.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.accent} />}
                ListHeaderComponent={
                    <View>
                        <View style={s.header}>
                            <View style={s.iconBadge}><Feather name="users" size={20} color={colors.accent} /></View>
                            <T.H1>Clientes</T.H1>
                        </View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Tu cartera.</T.Muted>
                        <Field placeholder="Buscar por nombre, teléfono o DNI…" value={search} onChangeText={setSearch} />
                    </View>
                }
                renderItem={({ item }) => {
                    const est = item.estadoLead ? ESTADO_LEAD_LABEL[item.estadoLead] : null;
                    return (
                        <Card style={{ marginTop: spacing.md }}>
                            <View style={s.rowTop}>
                                <Text style={s.nombre}>{nombre(item)}</Text>
                                {est ? <Badge label={est.label} tone={est.tone} /> : null}
                            </View>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.telefono, item.origenLead ? ORIGEN_LEAD_LABEL[item.origenLead] : null].filter(Boolean).join(' · ') || 'Sin teléfono'}
                            </T.Muted>
                            {item.observaciones ? <T.Muted style={{ marginTop: spacing.xs }} >{item.observaciones}</T.Muted> : null}
                            {item.telefono ? (
                                <View style={s.actions}>
                                    <Pressable onPress={() => llamar(item.telefono)} style={s.action}>
                                        <Feather name="phone" size={15} color={colors.textSecondary} />
                                        <Text style={s.actionText}>Llamar</Text>
                                    </Pressable>
                                    <Pressable onPress={() => whatsapp(item)} style={s.action}>
                                        <Feather name="message-circle" size={15} color={colors.textSecondary} />
                                        <Text style={s.actionText}>WhatsApp</Text>
                                    </Pressable>
                                </View>
                            ) : null}
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    q.isLoading
                        ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>No hay clientes.</T.Muted>
                }
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs, marginTop: spacing.sm },
    iconBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    nombre: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    actionText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
});
