import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { spacing, fontSize } from '../theme/tokens';
import { makeStyles } from '../theme/theme';
import { Chips, Field, GradientButton, KeyboardSafeView, Segmented } from '../components/ui';
import { EntityPicker, PickerItem } from '../components/EntityPicker';
import { errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { clientesApi, clienteAOpcion } from '../api/clientes.api';
import { vehiculosApi, unidadAOpcion, DatosUnidad, ESTADOS_OFRECIBLES } from '../api/vehiculos.api';
import { ventasApi, FormaPagoVenta, FORMAS_PAGO, FORMA_PAGO_LABEL } from '../api/ventas.api';
import { hoyLocal } from '../api/tasaciones.api';
import { formatMontoInput, montoATexto, parseMonto } from '../lib/formato';

/**
 * Alta de una venta. Puede llegar con el cliente y/o la unidad ya elegidos
 * (`route.params` = { cliente?, vehiculo? }). Al registrarla se abre su detalle
 * con la confirmación.
 */
export default function VentaNuevaScreen({ navigation, route }: any) {
    const s = useStyles();
    const qc = useQueryClient();
    const user = useAuthStore((st) => st.user);
    const inicial = route?.params ?? {};

    const [cliente, setCliente] = useState<PickerItem | null>(inicial.cliente ?? null);
    const [vehiculo, setVehiculo] = useState<PickerItem<DatosUnidad> | null>(inicial.vehiculo ?? null);
    const [precio, setPrecio] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [formaPago, setFormaPago] = useState<FormaPagoVenta>('contado');
    const [obs, setObs] = useState('');

    /** Al elegir la unidad se precargan el precio de lista y la moneda (se pueden cambiar). */
    const elegirUnidad = (it: PickerItem<DatosUnidad>) => {
        setVehiculo(it);
        if (it.data) {
            setMoneda(it.data.moneda);
            setPrecio(it.data.precioLista != null ? montoATexto(it.data.precioLista) : '');
        }
    };
    useEffect(() => {
        if (inicial.vehiculo) elegirUnidad(inicial.vehiculo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const crear = useMutation({
        mutationFn: () => ventasApi.create({
            sucursalId: user!.sucursalId!, clienteId: cliente!.id, vendedorId: user!.id, vehiculoId: vehiculo!.id,
            precioVenta: parseMonto(precio) ?? 0, moneda, formaPago, fechaVenta: hoyLocal(),
            observaciones: obs.trim() || undefined,
        }),
        onSuccess: (v) => {
            qc.invalidateQueries({ queryKey: ['ventas'] });
            qc.invalidateQueries({ queryKey: ['vehiculos'] });
            navigation.replace('VentaDetalle', { id: v.id, creada: true });
        },
        onError: (e) => Alert.alert('No se pudo registrar la venta', errorMessage(e)),
    });

    const submit = () => {
        if (!user?.sucursalId) return Alert.alert('Sin sucursal', 'Tu usuario no tiene una sucursal asignada; no se puede registrar la venta.');
        if (!cliente) return Alert.alert('Falta el cliente', 'Elegí a quién le vendés.');
        if (!vehiculo) return Alert.alert('Falta la unidad', 'Elegí la unidad que se vende.');
        const p = parseMonto(precio);
        if (p == null || !(p > 0)) return Alert.alert('Precio inválido', 'Poné el precio de venta.');
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
                        // Sólo lo que se puede vender: nada vendido ni devuelto.
                        fetchPage={(q, page, limit) => vehiculosApi.list({ search: q || undefined, estado: ESTADOS_OFRECIBLES }, page, limit)}
                        toItem={unidadAOpcion}
                        onSelect={elegirUnidad}
                    />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                    <Field label="Precio de venta" placeholder="0" keyboardType="numeric" value={precio} onChangeText={(v) => setPrecio(formatMontoInput(v))} style={{ flex: 1 }} />
                    <View style={{ width: 130 }}>
                        <Text style={s.miniLabel}>MONEDA</Text>
                        <Segmented
                            value={moneda} onChange={setMoneda} accessibilityLabel="Moneda"
                            options={[{ value: 'ARS', label: '$', accessibilityLabel: 'Pesos' }, { value: 'USD', label: 'US$', accessibilityLabel: 'Dólares' }]}
                            style={{ marginTop: spacing.sm }}
                        />
                    </View>
                </View>

                <Text style={[s.miniLabel, { marginTop: spacing.lg }]}>FORMA DE PAGO</Text>
                <Chips
                    value={formaPago}
                    onChange={setFormaPago}
                    accessibilityLabel="Forma de pago"
                    options={FORMAS_PAGO.map((fp) => ({ value: fp, label: FORMA_PAGO_LABEL[fp] }))}
                    style={{ marginTop: spacing.sm }}
                />

                <Field label="Observaciones" placeholder="Opcional" value={obs} onChangeText={setObs} style={{ marginTop: spacing.lg }} />

                <GradientButton title="Registrar venta" loading={crear.isPending} onPress={submit} style={{ marginTop: spacing.xl }} />
            </ScrollView>
        </KeyboardSafeView>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
}));
