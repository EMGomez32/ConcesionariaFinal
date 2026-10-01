import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, T } from '../components/ui';
import { num } from '../api/atenciones.api';
import { ventasApi, Venta, FORMA_PAGO_LABEL, ESTADO_ENTREGA_LABEL } from '../api/ventas.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return '—';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const veh = (v: Venta) => v.vehiculo ? [v.vehiculo.marca, v.vehiculo.modelo, v.vehiculo.dominio].filter(Boolean).join(' ') : `Unidad #${v.vehiculoId}`;

function Fila({ k, v }: { k: string; v: string }) {
    return (
        <View style={s.fila}>
            <T.Muted>{k}</T.Muted>
            <Text style={s.filaV}>{v}</Text>
        </View>
    );
}

export default function VentaDetalleScreen({ route }: any) {
    const id: number = route.params?.id;
    const q = useQuery({ queryKey: ['venta', id], queryFn: () => ventasApi.getById(id) });
    const v = q.data;

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
    if (!v) return <View style={s.center}><T.Muted>No se pudo cargar la venta.</T.Muted></View>;

    const pagado = (v.pagos ?? []).reduce((acc, p) => acc + (num(p.monto) ?? 0), 0);
    const total = num(v.precioVenta) ?? 0;
    const saldo = total - pagado;
    const ent = ESTADO_ENTREGA_LABEL[v.estadoEntrega];

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            <T.H1>{veh(v)}</T.H1>
            <View style={{ marginTop: spacing.sm }}><Badge label={ent.label} tone={ent.tone} /></View>
            <Text style={s.precio}>{money(v.precioVenta, v.moneda)}</Text>

            <Card style={{ marginTop: spacing.lg }}>
                <Fila k="Cliente" v={v.cliente?.nombre ?? '—'} />
                <Fila k="Vendedor" v={v.vendedor?.nombre ?? '—'} />
                <Fila k="Forma de pago" v={FORMA_PAGO_LABEL[v.formaPago]} />
                <Fila k="Fecha" v={v.fechaVenta ? new Date(v.fechaVenta).toLocaleDateString('es-AR') : '—'} />
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <T.H2>Pagos</T.H2>
                {(v.pagos ?? []).length === 0
                    ? <T.Muted style={{ marginTop: spacing.sm }}>Sin pagos registrados.</T.Muted>
                    : (v.pagos ?? []).map((p) => (
                        <View key={p.id} style={s.fila}>
                            <T.Muted>{p.metodo}{p.referencia ? ` · ${p.referencia}` : ''}</T.Muted>
                            <Text style={s.filaV}>{money(p.monto, v.moneda)}</Text>
                        </View>
                    ))}
                <View style={s.sep} />
                <Fila k="Total" v={money(total, v.moneda)} />
                <Fila k="Pagado" v={money(pagado, v.moneda)} />
                <View style={s.fila}>
                    <Text style={[s.filaV, { color: colors.textSecondary }]}>Saldo</Text>
                    <Text style={[s.filaV, { color: saldo > 0 ? colors.warning : colors.success, fontFamily: fonts.brandBold }]}>{money(saldo, v.moneda)}</Text>
                </View>
            </Card>

            {v.observaciones ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Observaciones</T.H2>
                    <T.Body style={{ marginTop: spacing.sm }}>{v.observaciones}</T.Body>
                </Card>
            ) : null}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.md },
    fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
    filaV: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
    sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
});
