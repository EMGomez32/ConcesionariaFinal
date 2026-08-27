import React from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../theme/tokens';
import { Card, Badge, T } from '../components/ui';
import { atencionesApi, MOTIVO_LABEL } from '../api/atenciones.api';

export default function AtencionDetalleScreen({ route }: any) {
    const id: number = route.params?.id;
    const q = useQuery({ queryKey: ['atencion', id], queryFn: () => atencionesApi.getById(id) });
    const a: any = q.data;

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
    if (!a) return <View style={s.center}><T.Muted>No se pudo cargar la atención.</T.Muted></View>;

    const cliente = a.cliente ? [a.cliente.nombre, a.cliente.apellido].filter(Boolean).join(' ') : 'Sin cliente';
    const abierta = a.estado === 'abierta';

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg }}>
            <T.H1>{cliente}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' }}>
                <Badge label={abierta ? 'ABIERTA' : 'CERRADA'} tone={abierta ? 'warning' : 'muted'} />
                <T.Muted>{MOTIVO_LABEL[a.motivo as keyof typeof MOTIVO_LABEL] ?? a.motivo}</T.Muted>
            </View>

            <Card style={{ marginTop: spacing.lg }}>
                <T.H2>Relevamiento</T.H2>
                <T.Muted style={{ marginTop: spacing.sm }}>
                    {a.presupuestoMin || a.presupuestoMax
                        ? `Presupuesto: ${a.presupuestoMin ?? '—'} a ${a.presupuestoMax ?? '—'} ${a.moneda ?? ''}`
                        : 'Sin relevamiento cargado todavía.'}
                </T.Muted>
                {a.observaciones ? <T.Body style={{ marginTop: spacing.md }}>{a.observaciones}</T.Body> : null}
            </Card>

            <Card style={{ marginTop: spacing.md }}>
                <T.H2>Unidades de la visita</T.H2>
                {(a.vehiculos ?? []).length === 0
                    ? <T.Muted style={{ marginTop: spacing.sm }}>Todavía no se mostró ninguna unidad.</T.Muted>
                    : (a.vehiculos ?? []).map((v: any) => (
                        <T.Body key={v.id} style={{ marginTop: spacing.sm }}>
                            {v.vehiculo ? `${v.vehiculo.marca} ${v.vehiculo.modelo}` : `Unidad #${v.vehiculoId}`}
                            {v.tipo === 'sugerida' ? '  · sugerida' : ''}
                        </T.Body>
                    ))}
            </Card>

            <T.Muted style={{ marginTop: spacing.xl, textAlign: 'center' }}>
                El flujo completo (relevamiento, sugerencias, permuta, cierre) llega en las próximas iteraciones.
            </T.Muted>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
