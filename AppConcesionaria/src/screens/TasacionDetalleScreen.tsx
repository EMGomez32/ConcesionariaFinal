import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { spacing, fonts, fontSize } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Card, Badge, Banner, GradientButton, GhostButton, T, ErrorCarga } from '../components/ui';
import {
    COND_TONE, TasarSheet, confirmarEliminarTasacion, enviarTasacionWhatsapp, valorTasacion,
} from '../components/Tasacion';
import { errorMessage } from '../api/client';
import { tasacionesApi, CONDICION_LABEL, estaPendiente } from '../api/tasaciones.api';
import { fechaDia, formatKm } from '../lib/formato';

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

/** Detalle de una tasación: todos sus datos y las acciones (tasar, WhatsApp, eliminar). */
export default function TasacionDetalleScreen({ route, navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const qc = useQueryClient();
    const id: number = route.params?.id;
    const creada: boolean = !!route.params?.creada;
    const q = useQuery({ queryKey: ['tasacion', id], queryFn: () => tasacionesApi.getById(id) });
    const t = q.data;
    const [tasando, setTasando] = useState(false);

    const eliminar = useMutation({
        mutationFn: () => tasacionesApi.remove(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasaciones'] }); navigation.goBack(); },
        onError: (e) => Alert.alert('No se pudo eliminar', errorMessage(e)),
    });

    if (q.isLoading) return <View style={s.center}><ActivityIndicator color={colors.accentText} accessibilityLabel="Cargando" /></View>;
    if (!t) {
        return (
            <View style={[s.center, { padding: spacing.lg }]}>
                <ErrorCarga que="la tasación" error={q.error} onRetry={() => { q.refetch(); }} style={{ alignSelf: 'stretch' }} />
            </View>
        );
    }

    const pend = estaPendiente(t);

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
            {creada ? (
                <Banner
                    title="Tasación registrada"
                    text={pend ? 'Quedó pendiente: falta ponerle el valor.' : 'Ya figura en Tasaciones.'}
                    style={{ marginBottom: spacing.lg }}
                />
            ) : null}
            <T.H1 style={{ fontSize: fontSize.xl }}>{[t.marca, t.modelo, t.anio].filter(Boolean).join(' ')}</T.H1>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge label={CONDICION_LABEL[t.condicion].toUpperCase()} tone={COND_TONE[t.condicion]} />
                {pend ? <Badge label="PENDIENTE" tone="warning" /> : null}
            </View>
            <Text style={[s.valor, pend && { color: colors.accentText }]}>{valorTasacion(t)}</Text>

            <Card style={{ marginTop: spacing.lg }}>
                <Fila k="Dominio" v={t.dominio} />
                <Fila k="Año" v={t.anio} />
                <Fila k="Kilómetros" v={formatKm(t.km)} />
                <Fila k="Condición" v={CONDICION_LABEL[t.condicion]} />
                <Fila k="Fecha" v={fechaDia(t.fecha)} />
                <Fila k="Cliente" v={t.cliente?.nombre} />
                <Fila k="Tasador" v={t.tasador?.nombre} />
            </Card>

            {t.observaciones ? (
                <Card style={{ marginTop: spacing.md }}>
                    <T.H2>Observaciones</T.H2>
                    <T.Body style={{ marginTop: spacing.sm }}>{t.observaciones}</T.Body>
                </Card>
            ) : null}

            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                {pend ? <GradientButton title="Tasar" onPress={() => setTasando(true)} /> : null}
                <GhostButton title="Enviar por WhatsApp" icon="message-circle" onPress={() => enviarTasacionWhatsapp(t)} />
                <GhostButton
                    title="Eliminar" icon="trash-2" danger disabled={eliminar.isPending}
                    onPress={() => confirmarEliminarTasacion(t, () => eliminar.mutate())}
                />
            </View>

            <TasarSheet tasacion={tasando ? t : null} onClose={() => setTasando(false)} />
        </ScrollView>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    valor: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.md, fontVariant: ['tabular-nums'] },
    fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
    filaV: { color: colors.text, fontSize: fontSize.base, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
}));
