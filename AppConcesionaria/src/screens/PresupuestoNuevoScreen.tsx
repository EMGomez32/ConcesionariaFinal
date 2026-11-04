import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spacing, radius, fontSize } from '../theme/tokens';
import { makeStyles } from '../theme/theme';
import { Chips, Field, GradientButton, KeyboardSafeView, Segmented, T } from '../components/ui';
import { EntityPicker, PickerItem } from '../components/EntityPicker';
import { errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { clientesApi, clienteAOpcion } from '../api/clientes.api';
import { vehiculosApi, unidadAOpcion, DatosUnidad, ESTADOS_OFRECIBLES } from '../api/vehiculos.api';
import { presupuestosApi } from '../api/presupuestos.api';
import { formatMontoInput, formatMoneda, montoATexto, parseMonto } from '../lib/formato';
import { hoyLocal } from '../api/tasaciones.api';

const enDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Alta de un presupuesto. Puede llegar con el cliente y/o la unidad ya elegidos
 * (desde una atención, la ficha del cliente o la de la unidad): `route.params`
 * = { cliente?: PickerItem, vehiculo?: PickerItem<DatosUnidad> }.
 * Al crear, se abre el detalle con la confirmación (no se vuelve a la lista).
 */
export default function PresupuestoNuevoScreen({ navigation, route }: any) {
    const s = useStyles();
    const qc = useQueryClient();
    const user = useAuthStore((st) => st.user);
    const inicial = route?.params ?? {};

    const [cliente, setCliente] = useState<PickerItem | null>(inicial.cliente ?? null);
    const [vehiculo, setVehiculo] = useState<PickerItem<DatosUnidad> | null>(inicial.vehiculo ?? null);
    const [precioLista, setPrecioLista] = useState('');
    const [descuento, setDescuento] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [validoHasta, setValidoHasta] = useState('');
    const [obs, setObs] = useState('');

    /** Al elegir la unidad se precargan su precio de lista y su moneda (se pueden cambiar). */
    const elegirUnidad = (it: PickerItem<DatosUnidad>) => {
        setVehiculo(it);
        if (it.data) {
            setMoneda(it.data.moneda);
            setPrecioLista(it.data.precioLista != null ? montoATexto(it.data.precioLista) : '');
        }
    };
    // La unidad que vino precargada también trae su precio.
    useEffect(() => {
        if (inicial.vehiculo) elegirUnidad(inicial.vehiculo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const lista = parseMonto(precioLista) ?? 0;
    const desc = parseMonto(descuento) ?? 0;
    const precioFinal = Math.max(0, lista - desc);

    const crear = useMutation({
        mutationFn: () => presupuestosApi.create({
            sucursalId: user!.sucursalId!, clienteId: cliente!.id, vendedorId: user!.id,
            moneda, fechaCreacion: hoyLocal(), validoHasta: validoHasta || undefined,
            observaciones: obs.trim() || undefined,
            items: [{ vehiculoId: vehiculo!.id, precioLista: lista, descuento: desc || undefined, precioFinal }],
        }),
        onSuccess: (p) => {
            qc.invalidateQueries({ queryKey: ['presupuestos'] });
            navigation.replace('PresupuestoDetalle', { id: p.id, creado: true });
        },
        onError: (e) => Alert.alert('No se pudo crear el presupuesto', errorMessage(e)),
    });

    const submit = () => {
        if (!user?.sucursalId) return Alert.alert('Sin sucursal', 'Tu usuario no tiene una sucursal asignada.');
        if (!cliente) return Alert.alert('Falta el cliente', 'Elegí a quién le hacés el presupuesto.');
        if (!vehiculo) return Alert.alert('Falta la unidad', 'Elegí la unidad que vas a presupuestar.');
        if (!(lista > 0)) return Alert.alert('Precio inválido', 'Poné el precio de lista.');
        if (!(desc >= 0) || desc > lista) return Alert.alert('Descuento inválido', 'El descuento no puede superar el precio de lista.');
        crear.mutate();
    };

    return (
        <KeyboardSafeView style={s.root}>
            <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <EntityPicker
                    label="Cliente" placeholder="Elegí un cliente" value={cliente}
                    queryKey={['picker', 'clientes']}
                    fetchPage={(q, page, limit) => clientesApi.list(q || undefined, page, limit)}
                    toItem={clienteAOpcion}
                    onSelect={setCliente}
                />
                <View style={{ marginTop: spacing.lg }}>
                    <EntityPicker<DatosUnidad>
                        label="Unidad" placeholder="Elegí una unidad" value={vehiculo}
                        queryKey={['picker', 'unidades']}
                        // Sólo lo que se puede ofrecer: nada vendido ni devuelto.
                        fetchPage={(q, page, limit) => vehiculosApi.list({ search: q || undefined, estado: ESTADOS_OFRECIBLES }, page, limit)}
                        toItem={unidadAOpcion}
                        onSelect={elegirUnidad}
                    />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                    <Field label="Precio de lista" placeholder="0" keyboardType="numeric" value={precioLista} onChangeText={(v) => setPrecioLista(formatMontoInput(v))} style={{ flex: 1 }} />
                    <Field label="Descuento" placeholder="0" keyboardType="numeric" value={descuento} onChangeText={(v) => setDescuento(formatMontoInput(v))} style={{ flex: 1 }} />
                </View>
                <View style={{ width: 180, marginTop: spacing.md }}>
                    <Text style={s.miniLabel}>MONEDA</Text>
                    <Segmented value={moneda} onChange={setMoneda} accessibilityLabel="Moneda" options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} style={{ marginTop: spacing.sm }} />
                </View>

                <View style={s.totalBox} accessible accessibilityLabel={`Precio final: ${formatMoneda(precioFinal, moneda)}`}>
                    <T.Muted>Precio final</T.Muted>
                    <Text style={s.total}>{formatMoneda(precioFinal, moneda)}</Text>
                </View>

                <Text style={[s.miniLabel, { marginTop: spacing.lg }]}>VÁLIDO HASTA</Text>
                <Chips
                    value={validoHasta}
                    accessibilityLabel="Válido hasta"
                    onChange={(v) => setValidoHasta(validoHasta === v ? '' : v)}
                    options={[['7 días', 7], ['15 días', 15], ['30 días', 30]].map(([lbl, n]) => ({ value: enDias(n as number), label: lbl as string }))}
                    style={{ marginTop: spacing.sm }}
                />

                <Field label="Observaciones" placeholder="Opcional" value={obs} onChangeText={setObs} style={{ marginTop: spacing.lg }} />

                <GradientButton title="Crear presupuesto" loading={crear.isPending} onPress={submit} style={{ marginTop: spacing.xl }} />
                <T.Muted style={{ textAlign: 'center', marginTop: spacing.md }}>Una unidad por presupuesto.</T.Muted>
            </ScrollView>
        </KeyboardSafeView>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
    totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
    total: { color: colors.accentText, fontSize: fontSize.xl, fontWeight: '800', fontVariant: ['tabular-nums'] },
}));
