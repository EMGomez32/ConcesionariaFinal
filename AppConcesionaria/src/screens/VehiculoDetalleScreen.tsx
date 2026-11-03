import React, { useState } from 'react';
import { View, Text, ScrollView, Image, ActivityIndicator, Linking, Alert, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, GradientButton, GhostButton, T, ErrorCarga } from '../components/ui';
import {
    vehiculosApi, ESTADO_VEHICULO_LABEL, ESTADO_VEHICULO_TONE, TIPO_VEHICULO_LABEL, fotosDeUnidad, unidadAOpcion,
} from '../api/vehiculos.api';
import { formatKm, formatMoneda, mensajeUnidad, waShareLink } from '../lib/formato';

function Fila({ k, v }: { k: string; v?: string | number | null }) {
    const s = useStyles();
    if (v === null || v === undefined || v === '') return null;
    return (
        <View style={s.fila} accessible accessibilityLabel={`${k}: ${v}`}>
            <T.Muted>{k}</T.Muted>
            <Text style={s.filaV}>{v}</Text>
        </View>
    );
}

/**
 * Ficha de una unidad para mostrar en el salón: fotos, precio con su moneda y los
 * datos que se le dicen al cliente. NUNCA el precio de compra, el piso ni el
 * proveedor (el backend ya los recorta para el vendedor; acá tampoco se pintan).
 */
export default function VehiculoDetalleScreen({ route, navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const id: number = route.params?.id;
    const q = useQuery({ queryKey: ['vehiculo', id], queryFn: () => vehiculosApi.getById(id) });
    const v = q.data;
    const [foto, setFoto] = useState(0);

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accentText} accessibilityLabel="Cargando" /></View>;
    if (!v) {
        return (
            <View style={[s.center, { padding: spacing.lg }]}>
                <ErrorCarga que="la unidad" error={q.error} onRetry={() => { q.refetch(); }} style={{ alignSelf: 'stretch' }} />
            </View>
        );
    }

    const titulo = [v.marca, v.modelo, v.version].filter(Boolean).join(' ');
    const fotos = fotosDeUnidad(v);
    const anchoFoto = width - spacing.lg * 2;
    const ofrecible = v.estado !== 'vendido' && v.estado !== 'devuelto';

    const compartir = () => {
        Linking.openURL(waShareLink(mensajeUnidad(v))).catch(() =>
            Alert.alert('No pudimos abrir WhatsApp', 'Revisá que esté instalado en el teléfono.'));
    };
    const opcion = unidadAOpcion(v);

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            {fotos.length ? (
                <View>
                    <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => setFoto(Math.round(e.nativeEvent.contentOffset.x / anchoFoto))}
                        style={{ borderRadius: radius.lg }}
                        accessibilityLabel={`Fotos de la unidad: ${fotos.length}`}
                    >
                        {fotos.map((uri, i) => (
                            <Image
                                key={uri}
                                source={{ uri }}
                                style={[s.foto, { width: anchoFoto, height: anchoFoto * 0.66 }]}
                                resizeMode="cover"
                                accessibilityLabel={`Foto ${i + 1} de ${fotos.length} de ${titulo}`}
                            />
                        ))}
                    </ScrollView>
                    {fotos.length > 1 ? (
                        <T.Muted style={{ textAlign: 'center', marginTop: spacing.xs }}>{`Foto ${foto + 1} de ${fotos.length} · deslizá para ver más`}</T.Muted>
                    ) : null}
                </View>
            ) : (
                <View style={[s.sinFoto, { height: anchoFoto * 0.5 }]}>
                    <Feather name="camera-off" size={26} color={colors.textMuted} />
                    <T.Muted style={{ marginTop: spacing.xs }}>Esta unidad todavía no tiene fotos.</T.Muted>
                </View>
            )}

            <T.H1 style={{ marginTop: spacing.lg, fontSize: fontSize.xl }}>{titulo}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge label={ESTADO_VEHICULO_LABEL[v.estado].toUpperCase()} tone={ESTADO_VEHICULO_TONE[v.estado]} />
                {v.anio ? <T.Muted>{v.anio}</T.Muted> : null}
            </View>
            <Text style={s.precio}>{formatMoneda(v.precioLista, v.moneda, 'Precio a consultar')}</Text>

            <Card style={{ marginTop: spacing.lg }}>
                <Fila k="Año" v={v.anio} />
                <Fila k="Kilómetros" v={formatKm(v.kmIngreso)} />
                <Fila k="Color" v={v.color} />
                <Fila k="Dominio" v={v.dominio} />
                <Fila k="Estado" v={ESTADO_VEHICULO_LABEL[v.estado]} />
                <Fila k="Sucursal" v={v.sucursal?.nombre} />
                <Fila k="Tipo" v={v.tipo ? (TIPO_VEHICULO_LABEL[v.tipo] ?? v.tipo) : null} />
            </Card>

            <GradientButton
                title="Compartir por WhatsApp"
                onPress={compartir}
                accessibilityHint="Abre WhatsApp con un mensaje armado para elegir a quién mandarlo"
                style={{ marginTop: spacing.lg }}
            />
            {ofrecible ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    <GhostButton
                        title="Crear presupuesto"
                        icon="file-text"
                        onPress={() => navigation.navigate('PresupuestoNuevo', { vehiculo: opcion })}
                    />
                    <GhostButton
                        title="Registrar venta"
                        icon="dollar-sign"
                        onPress={() => navigation.navigate('VentaNueva', { vehiculo: opcion })}
                    />
                </View>
            ) : null}
        </ScrollView>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    foto: { backgroundColor: colors.bgElevated },
    sinFoto: { borderRadius: radius.lg, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    precio: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.md, fontVariant: ['tabular-nums'] },
    fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
    filaV: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
}));
