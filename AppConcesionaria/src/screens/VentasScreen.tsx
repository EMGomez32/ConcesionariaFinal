import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, GhostButton, T } from '../components/ui';
import { num } from '../api/atenciones.api';
import { ventasApi, Venta, ESTADO_ENTREGA_LABEL } from '../api/ventas.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR') : '');
const veh = (v: Venta) => v.vehiculo ? [v.vehiculo.marca, v.vehiculo.modelo].filter(Boolean).join(' ') : `Unidad #${v.vehiculoId}`;

export default function VentasScreen({ navigation }: any) {
    const [search, setSearch] = useState('');
    const q = useQuery({ queryKey: ['ventas', search], queryFn: () => ventasApi.list(search.trim() || undefined, 1, 50) });
    const items = q.data?.results ?? [];

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={(v) => String(v.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.accent} />}
                ListHeaderComponent={
                    <View>
                        <T.H1 style={{ marginTop: spacing.sm }}>Ventas</T.H1>
                        <T.Muted style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>Las operaciones cerradas.</T.Muted>
                        <GhostButton title="+  Registrar venta" onPress={() => navigation.navigate('VentaNueva')} />
                        <Field placeholder="Buscar por cliente, vehículo o dominio…" value={search} onChangeText={setSearch} style={{ marginTop: spacing.md }} />
                    </View>
                }
                renderItem={({ item }) => {
                    const ent = ESTADO_ENTREGA_LABEL[item.estadoEntrega];
                    return (
                        <Card style={{ marginTop: spacing.md }} onPress={() => navigation.navigate('VentaDetalle', { id: item.id })}>
                            <View style={s.rowTop}>
                                <Text style={s.veh}>{veh(item)}</Text>
                                <Badge label={ent.label} tone={ent.tone} />
                            </View>
                            <Text style={s.precio}>{money(item.precioVenta, item.moneda)}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {[item.cliente?.nombre, fecha(item.fechaVenta)].filter(Boolean).join(' · ')}
                            </T.Muted>
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    q.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>No hay ventas.</T.Muted>
                }
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    veh: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
});
