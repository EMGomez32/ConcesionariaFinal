import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, Segmented, T, BadgeTone } from '../components/ui';
import { num } from '../api/atenciones.api';
import { vehiculosApi, Vehiculo, EstadoVehiculo, ESTADO_VEHICULO_LABEL } from '../api/vehiculos.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return 'Consultar';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const ESTADO_TONE: Record<EstadoVehiculo, BadgeTone> = {
    publicado: 'success', reservado: 'warning', preparacion: 'cyan', vendido: 'muted', devuelto: 'danger',
};
type Filtro = 'publicado' | 'reservado' | 'todos';

export default function VehiculosScreen() {
    const [search, setSearch] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('publicado');

    const q = useQuery({
        queryKey: ['vehiculos', search, filtro],
        queryFn: () => vehiculosApi.list(
            { search: search.trim() || undefined, estado: filtro === 'todos' ? undefined : filtro },
            1, 50,
        ),
    });
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
                        <View style={s.header}>
                            <View style={s.iconBadge}><Feather name="truck" size={20} color={colors.accent} /></View>
                            <T.H1>Stock</T.H1>
                        </View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Las unidades para ofrecer en el salón.</T.Muted>
                        <Field placeholder="Buscar por marca, modelo o dominio…" value={search} onChangeText={setSearch} />
                        <Segmented
                            value={filtro} onChange={setFiltro}
                            options={[{ value: 'publicado', label: 'Publicados' }, { value: 'reservado', label: 'Reservados' }, { value: 'todos', label: 'Todos' }]}
                            style={{ marginTop: spacing.md }}
                        />
                    </View>
                }
                renderItem={({ item }) => (
                    <Card style={{ marginTop: spacing.md }}>
                        <View style={s.rowTop}>
                            <Text style={s.veh}>{[item.marca, item.modelo, item.version, item.anio].filter(Boolean).join(' ')}</Text>
                            <Badge label={ESTADO_VEHICULO_LABEL[item.estado].toUpperCase()} tone={ESTADO_TONE[item.estado]} />
                        </View>
                        <Text style={s.precio}>{money(item.precioLista, item.moneda)}</Text>
                        <T.Muted style={{ marginTop: 2 }}>
                            {[
                                item.dominio,
                                item.kmIngreso != null ? `${Number(item.kmIngreso).toLocaleString('es-AR')} km` : null,
                                item.color,
                            ].filter(Boolean).join(' · ')}
                        </T.Muted>
                        {item.sucursal?.nombre ? <T.Muted style={{ marginTop: 2 }}>{item.sucursal.nombre}</T.Muted> : null}
                    </Card>
                )}
                ListEmptyComponent={
                    q.isLoading
                        ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>No hay unidades en esta vista.</T.Muted>
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
    veh: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
});
