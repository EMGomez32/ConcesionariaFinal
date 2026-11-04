import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { spacing, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Banner, T, ErrorCarga } from '../components/ui';
import { num } from '../api/atenciones.api';
import { ventasApi, Venta, FORMA_PAGO_LABEL, ESTADO_ENTREGA_LABEL } from '../api/ventas.api';
import { fechaDia, formatMoneda as money, metodoPagoLegible } from '../lib/formato';

const veh = (v: Venta) => v.vehiculo ? [v.vehiculo.marca, v.vehiculo.modelo, v.vehiculo.dominio].filter(Boolean).join(' ') : `Unidad #${v.vehiculoId}`;

function Fila({ k, v }: { k: string; v: string }) {
    const s = useStyles();
    return (
        <View style={s.fila} accessible accessibilityLabel={`${k}: ${v}`}>
            <T.Muted>{k}</T.Muted>
            <Text style={s.filaV}>{v}</Text>
        </View>
    );
}

export default function VentaDetalleScreen({ route }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const id: number = route.params?.id;
    /** Recién registrada desde la app: se confirma arriba. */
    const creada: boolean = !!route.params?.creada;
    const q = useQuery({ queryKey: ['venta', id], queryFn: () => ventasApi.getById(id) });
    const v = q.data;

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accentText} accessibilityLabel="Cargando" /></View>;
    if (!v) {
        return (
            <View style={[s.center, { padding: spacing.lg }]}>
                <ErrorCarga que="la venta" error={q.error} onRetry={() => { q.refetch(); }} style={{ alignSelf: 'stretch' }} />
            </View>
        );
    }

    const pagado = (v.pagos ?? []).reduce((acc, p) => acc + (num(p.monto) ?? 0), 0);
    const total = num(v.precioVenta) ?? 0;
    const saldo = total - pagado;
    const ent = ESTADO_ENTREGA_LABEL[v.estadoEntrega];

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
            {creada ? (
                <Banner title="Venta registrada" text="Ya figura en Ventas. Los pagos se cargan desde la web." style={{ marginBottom: spacing.lg }} />
            ) : null}
            <T.H1 style={{ fontSize: fontSize.xl }}>{veh(v)}</T.H1>
            <View style={{ marginTop: spacing.sm }}><Badge label={ent.label} tone={ent.tone} /></View>
            <Text style={s.precio}>{money(v.precioVenta, v.moneda)}</Text>

            <Card style={{ marginTop: spacing.lg }}>
                <Fila k="Cliente" v={v.cliente?.nombre ?? '—'} />
                <Fila k="Vendedor" v={v.vendedor?.nombre ?? '—'} />
                <Fila k="Forma de pago" v={FORMA_PAGO_LABEL[v.formaPago] ?? v.formaPago} />
                <Fila k="Fecha" v={v.fechaVenta ? fechaDia(v.fechaVenta) : '—'} />
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <T.H2>Pagos</T.H2>
                {(v.pagos ?? []).length === 0
                    ? <T.Muted style={{ marginTop: spacing.sm }}>Sin pagos registrados.</T.Muted>
                    : (v.pagos ?? []).map((p) => (
                        <View key={p.id} style={s.fila}>
                            <T.Muted>{metodoPagoLegible(p.metodo)}{p.referencia ? ` · ${p.referencia}` : ''}</T.Muted>
                            <Text style={s.filaV}>{money(p.monto, v.moneda)}</Text>
                        </View>
                    ))}
                <View style={s.sep} />
                <Fila k="Total" v={money(total, v.moneda)} />
                <Fila k="Pagado" v={money(pagado, v.moneda)} />
                <View style={s.fila} accessible accessibilityLabel={`Saldo: ${money(saldo, v.moneda)}`}>
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

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.md, fontVariant: ['tabular-nums'] },
    fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
    filaV: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
    sep: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
}));
