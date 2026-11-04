import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spacing, fontSize } from '../theme/tokens';
import { makeStyles } from '../theme/theme';
import { Field, GhostButton, GradientButton, Segmented, Sheet, BadgeTone } from './ui';
import { errorMessage } from '../api/client';
import { num } from '../api/atenciones.api';
import { tasacionesApi, Tasacion, CondicionTasacion } from '../api/tasaciones.api';
import { formatMoneda, formatMontoInput, montoATexto, parseMonto, waLink } from '../lib/formato';

/** Piezas que comparten la lista de tasaciones y su detalle. */

export const COND_TONE: Record<CondicionTasacion, BadgeTone> = {
    excelente: 'success', muy_bueno: 'cyan', bueno: 'accent', regular: 'warning', malo: 'danger',
};

/** Valor de una tasación; sin valor todavía, "A convenir" (pendiente). */
export const valorTasacion = (t: Pick<Tasacion, 'valorEstimado' | 'moneda'>) =>
    formatMoneda(num(t.valorEstimado), t.moneda, 'A convenir');

export const MONEDAS = [
    { value: 'ARS' as const, label: '$', accessibilityLabel: 'Pesos' },
    { value: 'USD' as const, label: 'US$', accessibilityLabel: 'Dólares' },
];

/** Abre WhatsApp con la tasación para el cliente (no envía nada solo). */
export const enviarTasacionWhatsapp = (t: Tasacion) => {
    const veh = `${t.marca} ${t.modelo}${t.anio ? ` ${t.anio}` : ''}`;
    const val = num(t.valorEstimado) != null ? ` Valor estimado: ${valorTasacion(t)}.` : '';
    const msg = `Hola${t.cliente?.nombre ? ` ${t.cliente.nombre}` : ''}, te paso la tasación de tu ${veh}.${val} Es orientativa y sujeta a inspección.`;
    Linking.openURL(waLink(t.cliente?.telefono, msg)).catch(() => Alert.alert('No pudimos abrir WhatsApp', 'Revisá que esté instalado en el teléfono.'));
};

/** Confirmación antes de eliminar (rojo, destructivo). */
export const confirmarEliminarTasacion = (t: Tasacion, onConfirm: () => void) =>
    Alert.alert('Eliminar tasación', `¿Eliminar la de ${t.marca} ${t.modelo}? No se puede deshacer.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: onConfirm },
    ]);

/** Completar una tasación pendiente EN EL LUGAR (PATCH, no crea otra). */
export function TasarSheet({ tasacion, onClose }: { tasacion: Tasacion | null; onClose: () => void }) {
    const s = useStyles();
    const qc = useQueryClient();
    const [dominio, setDominio] = useState('');
    const [valor, setValor] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [obs, setObs] = useState('');

    useEffect(() => {
        if (!tasacion) return;
        setDominio(tasacion.dominio ?? ''); setValor(montoATexto(num(tasacion.valorEstimado)));
        setMoneda(tasacion.moneda); setObs(tasacion.observaciones ?? '');
    }, [tasacion]);

    const completar = useMutation({
        mutationFn: () => tasacionesApi.update(tasacion!.id, {
            dominio: dominio.trim(), valorEstimado: parseMonto(valor) ?? 0, moneda, observaciones: obs.trim() || undefined,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasaciones'] });
            qc.invalidateQueries({ queryKey: ['tasacion', tasacion!.id] });
            onClose();
            Alert.alert('Tasación guardada', 'Ya figura con su valor.');
        },
        onError: (e) => Alert.alert('No se pudo completar', errorMessage(e)),
    });
    const guardar = () => {
        if (!dominio.trim()) return Alert.alert('Falta el dominio', 'Es obligatorio para tasar.');
        const v = parseMonto(valor);
        if (v == null || !Number.isFinite(v) || v < 0) return Alert.alert('Valor inválido', 'Poné un valor de tasación válido.');
        completar.mutate();
    };

    return (
        <Sheet
            visible={!!tasacion} onClose={onClose}
            title="Tasar el usado"
            subtitle={tasacion ? `${tasacion.marca} ${tasacion.modelo}${tasacion.anio ? ` · ${tasacion.anio}` : ''}` : ''}
            footer={<>
                <GhostButton title="Cancelar" onPress={onClose} style={{ flex: 1, paddingHorizontal: spacing.md }} />
                <GradientButton title="Guardar" loading={completar.isPending} onPress={guardar} style={{ flex: 1 }} />
            </>}
        >
            <Field
                label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoComplete="off"
                value={dominio} onChangeText={setDominio}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Field label="Valor estimado *" keyboardType="numeric" placeholder="12.000.000" value={valor} onChangeText={(v) => setValor(formatMontoInput(v))} style={{ flex: 1 }} />
                <View style={{ width: 130 }}>
                    <Text style={s.miniLabel}>MONEDA</Text>
                    <Segmented value={moneda} onChange={setMoneda} accessibilityLabel="Moneda" options={MONEDAS} style={{ marginTop: spacing.xs }} />
                </View>
            </View>
            <Field label="Observaciones" placeholder="Ajustes al valor, a reparar…" value={obs} onChangeText={setObs} style={{ marginTop: spacing.sm }} />
        </Sheet>
    );
}

const useStyles = makeStyles((colors) => ({
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
}));
