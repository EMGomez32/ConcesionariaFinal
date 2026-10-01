import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, T } from '../components/ui';
import { num } from '../api/atenciones.api';
import { presupuestosApi, PresupuestoItem, ESTADO_PRESUPUESTO_LABEL } from '../api/presupuestos.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const itemVeh = (i: PresupuestoItem) => i.vehiculo ? [i.vehiculo.marca, i.vehiculo.modelo, i.vehiculo.dominio].filter(Boolean).join(' ') : (i.vehiculoId ? `Unidad #${i.vehiculoId}` : 'Ítem');

export default function PresupuestoDetalleScreen({ route }: any) {
    const id: number = route.params?.id;
    const q = useQuery({ queryKey: ['presupuesto', id], queryFn: () => presupuestosApi.getById(id) });
    const p = q.data;

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
    if (!p) return <View style={s.center}><T.Muted>No se pudo cargar el presupuesto.</T.Muted></View>;

    const m = p.moneda;
    const est = ESTADO_PRESUPUESTO_LABEL[p.estado];

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            <T.H1>{p.nroPresupuesto}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' }}>
                <Badge label={est.label} tone={est.tone} />
                {p.cliente?.nombre ? <T.Muted>{p.cliente.nombre}</T.Muted> : null}
            </View>
            {p.validoHasta ? <T.Muted style={{ marginTop: spacing.xs }}>Válido hasta {new Date(p.validoHasta).toLocaleDateString('es-AR')}</T.Muted> : null}

            <Card style={{ marginTop: spacing.lg }}>
                <T.H2>Unidades</T.H2>
                {(p.items ?? []).length === 0
                    ? <T.Muted style={{ marginTop: spacing.sm }}>Sin ítems.</T.Muted>
                    : (p.items ?? []).map((i) => (
                        <View key={i.id} style={s.item}>
                            <View style={{ flex: 1 }}>
                                <T.Body style={{ fontWeight: '600' }}>{itemVeh(i)}</T.Body>
                                {num(i.descuento) ? <T.Muted>Lista {money(i.precioLista, m)} · desc. {money(i.descuento, m)}</T.Muted> : null}
                            </View>
                            <Text style={s.itemPrecio}>{money(i.precioFinal, m)}</Text>
                        </View>
                    ))}
            </Card>

            {(p.extras ?? []).length ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Extras</T.H2>
                    {(p.extras ?? []).map((e, idx) => (
                        <View key={e.id ?? idx} style={s.item}>
                            <T.Body style={{ flex: 1 }}>{e.descripcion || 'Extra'}</T.Body>
                            <Text style={s.itemPrecio}>{money(e.monto, m)}</Text>
                        </View>
                    ))}
                </Card>
            ) : null}

            {p.canje ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Canje</T.H2>
                    <View style={s.item}>
                        <View style={{ flex: 1 }}>
                            <T.Body style={{ fontWeight: '600' }}>{p.canje.descripcion || 'Usado en parte de pago'}</T.Body>
                            <T.Muted>{[p.canje.dominio, p.canje.anio, p.canje.km != null ? `${Number(p.canje.km).toLocaleString('es-AR')} km` : null].filter(Boolean).join(' · ')}</T.Muted>
                        </View>
                        <Text style={[s.itemPrecio, { color: colors.warning }]}>− {money(p.canje.valorTomado, m)}</Text>
                    </View>
                </Card>
            ) : null}

            <Card style={{ marginTop: spacing.md }}>
                <View style={s.item}>
                    <Text style={s.totalK}>Total</Text>
                    <Text style={s.totalV}>{money(p.total, m)}</Text>
                </View>
            </Card>

            {p.observaciones ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Observaciones</T.H2>
                    <T.Body style={{ marginTop: spacing.sm }}>{p.observaciones}</T.Body>
                </Card>
            ) : null}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 8 },
    itemPrecio: { color: colors.text, fontSize: fontSize.base, fontWeight: '700' },
    totalK: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700' },
    totalV: { color: colors.accent, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800' },
});
