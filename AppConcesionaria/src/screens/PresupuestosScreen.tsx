import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, T } from '../components/ui';
import { num } from '../api/atenciones.api';
import { presupuestosApi, Presupuesto, ESTADO_PRESUPUESTO_LABEL } from '../api/presupuestos.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');

export default function PresupuestosScreen({ navigation }: any) {
    const [search, setSearch] = useState('');
    const q = useQuery({ queryKey: ['presupuestos', search], queryFn: () => presupuestosApi.list(search.trim() || undefined, 1, 50) });
    const items = q.data?.results ?? [];

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={(p) => String(p.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.accent} />}
                ListHeaderComponent={
                    <View>
                        <T.H1 style={{ marginTop: spacing.sm }}>Presupuestos</T.H1>
                        <T.Muted style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>Las cotizaciones para el cliente.</T.Muted>
                        <Field placeholder="Buscar por número o cliente…" value={search} onChangeText={setSearch} />
                    </View>
                }
                renderItem={({ item }) => {
                    const est = ESTADO_PRESUPUESTO_LABEL[item.estado];
                    return (
                        <Card style={{ marginTop: spacing.md }} onPress={() => navigation.navigate('PresupuestoDetalle', { id: item.id })}>
                            <View style={s.rowTop}>
                                <Text style={s.nro}>{item.nroPresupuesto}</Text>
                                <Badge label={est.label} tone={est.tone} />
                            </View>
                            <Text style={s.total}>{money(item.total, item.moneda)}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.cliente?.nombre, fecha(item.fechaCreacion)].filter(Boolean).join(' · ')}
                            </T.Muted>
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    q.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>No hay presupuestos.</T.Muted>
                }
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    nro: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    total: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
});
