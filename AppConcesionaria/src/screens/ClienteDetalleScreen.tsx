import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { spacing, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, GradientButton, GhostButton, T, ErrorCarga } from '../components/ui';
import { clientesApi, clienteAOpcion, ESTADO_LEAD_LABEL, ORIGEN_LEAD_LABEL } from '../api/clientes.api';
import { llamarCliente, nombreCliente, whatsappCliente } from './ClientesScreen';

function Fila({ k, v }: { k: string; v?: string | null }) {
    const s = useStyles();
    if (!v) return null;
    return (
        <View style={s.fila} accessible accessibilityLabel={`${k}: ${v}`}>
            <T.Muted>{k}</T.Muted>
            <Text style={s.filaV} selectable>{v}</Text>
        </View>
    );
}

/** Ficha del cliente: sus datos, contacto directo y atajos para presupuestar o vender. */
export default function ClienteDetalleScreen({ route, navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const id: number = route.params?.id;
    const q = useQuery({ queryKey: ['cliente', id], queryFn: () => clientesApi.getById(id) });
    const c = q.data;

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accentText} accessibilityLabel="Cargando" /></View>;
    if (!c) {
        return (
            <View style={[s.center, { padding: spacing.lg }]}>
                <ErrorCarga que="el cliente" error={q.error} onRetry={() => { q.refetch(); }} style={{ alignSelf: 'stretch' }} />
            </View>
        );
    }

    const est = c.estadoLead ? ESTADO_LEAD_LABEL[c.estadoLead] : null;
    const ultima = c.ultimaInteraccionEn ? new Date(c.ultimaInteraccionEn).toLocaleDateString('es-AR') : null;
    const opcion = clienteAOpcion(c);
    const mail = () => {
        if (c.email) Linking.openURL(`mailto:${c.email}`).catch(() => Alert.alert('No pudimos abrir el correo'));
    };

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            <T.H1 style={{ fontSize: fontSize.xl }}>{nombreCliente(c)}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                {est ? <Badge label={est.label} tone={est.tone} /> : null}
                {c.origenLead ? <T.Muted>Llegó por {ORIGEN_LEAD_LABEL[c.origenLead]}</T.Muted> : null}
            </View>

            {c.telefono ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                    <GradientButton title="Escribir por WhatsApp" onPress={() => whatsappCliente(c)} />
                    <GhostButton title={`Llamar al ${c.telefono}`} icon="phone" onPress={() => llamarCliente(c.telefono)} />
                </View>
            ) : (
                <T.Muted style={{ marginTop: spacing.lg }}>Sin teléfono cargado.</T.Muted>
            )}

            <Card style={{ marginTop: spacing.lg }}>
                <Fila k="Teléfono" v={c.telefono} />
                <Fila k="Email" v={c.email} />
                <Fila k="DNI" v={c.dni} />
                <Fila k="Domicilio" v={c.direccion} />
                <Fila k="Vendedor" v={c.vendedorAsignado?.nombre} />
                <Fila k="Último contacto" v={ultima} />
            </Card>
            {c.email ? <GhostButton title="Mandar un email" icon="mail" onPress={mail} style={{ marginTop: spacing.md }} /> : null}

            {c.observaciones ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Observaciones</T.H2>
                    <T.Body style={{ marginTop: spacing.sm }}>{c.observaciones}</T.Body>
                </Card>
            ) : null}

            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                <GhostButton title="Crear presupuesto" icon="file-text" onPress={() => navigation.navigate('PresupuestoNuevo', { cliente: opcion })} />
                <GhostButton title="Registrar venta" icon="dollar-sign" onPress={() => navigation.navigate('VentaNueva', { cliente: opcion })} />
            </View>
        </ScrollView>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
    filaV: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
}));
