import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { colors, spacing, radius, fontSize } from '../theme/tokens';
import { Field, GradientButton, Segmented, T } from '../components/ui';
import { EntityPicker, PickerItem } from '../components/EntityPicker';
import { errorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { clientesApi } from '../api/clientes.api';
import { vehiculosApi } from '../api/vehiculos.api';
import { ventasApi, FormaPagoVenta, FORMAS_PAGO, FORMA_PAGO_LABEL } from '../api/ventas.api';
import { num } from '../api/atenciones.api';
import { hoyLocal } from '../api/tasaciones.api';

const nombreCli = (c: { nombre: string; apellido?: string | null }) => [c.nombre, c.apellido].filter(Boolean).join(' ');

export default function VentaNuevaScreen({ navigation }: any) {
    const qc = useQueryClient();
    const user = useAuthStore((s) => s.user);

    const [cliente, setCliente] = useState<PickerItem | null>(null);
    const [vehiculo, setVehiculo] = useState<PickerItem | null>(null);
    const [precio, setPrecio] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [formaPago, setFormaPago] = useState<FormaPagoVenta>('contado');
    const [obs, setObs] = useState('');

    const crear = useMutation({
        mutationFn: () => ventasApi.create({
            sucursalId: user!.sucursalId!, clienteId: cliente!.id, vendedorId: user!.id, vehiculoId: vehiculo!.id,
            precioVenta: Number(precio), moneda, formaPago, fechaVenta: hoyLocal(),
            observaciones: obs.trim() || undefined,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['ventas'] }); navigation.goBack(); },
        onError: (e) => Alert.alert('No se pudo registrar la venta', errorMessage(e)),
    });

    const submit = () => {
        if (!user?.sucursalId) return Alert.alert('Sin sucursal', 'Tu usuario no tiene una sucursal asignada; no se puede registrar la venta.');
        if (!cliente) return Alert.alert('Falta el cliente');
        if (!vehiculo) return Alert.alert('Falta el vehículo');
        const p = num(precio);
        if (p == null || p <= 0) return Alert.alert('Precio inválido', 'Poné el precio de venta.');
        crear.mutate();
    };

    return (
        <ScrollView style={s.root} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <EntityPicker
                label="Cliente" placeholder="Elegí un cliente" value={cliente}
                fetch={(q) => clientesApi.list(q || undefined, 1, 30).then((r) => r.results.map((c) => ({ id: c.id, label: nombreCli(c), sub: c.telefono ?? undefined })))}
                onSelect={setCliente}
            />
            <View style={{ marginTop: spacing.lg }}>
                <EntityPicker
                    label="Vehículo" placeholder="Elegí una unidad" value={vehiculo}
                    fetch={(q) => vehiculosApi.list({ search: q || undefined }, 1, 30).then((r) => r.results.map((v) => ({
                        id: v.id, label: [v.marca, v.modelo, v.anio].filter(Boolean).join(' '), sub: v.dominio ?? undefined,
                    })))}
                    onSelect={setVehiculo}
                />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <Field label="Precio de venta" placeholder="0" keyboardType="numeric" value={precio} onChangeText={setPrecio} style={{ flex: 1 }} />
                <View style={{ width: 130 }}>
                    <Text style={s.miniLabel}>MONEDA</Text>
                    <Segmented value={moneda} onChange={setMoneda} options={[{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }]} style={{ marginTop: spacing.sm }} />
                </View>
            </View>

            <Text style={[s.miniLabel, { marginTop: spacing.lg }]}>FORMA DE PAGO</Text>
            <View style={s.chips}>
                {FORMAS_PAGO.map((fp) => {
                    const on = fp === formaPago;
                    return (
                        <Pressable key={fp} onPress={() => setFormaPago(fp)} style={[s.chip, on && s.chipOn]}>
                            <Text style={[s.chipText, on && { color: colors.onAccent }]}>{FORMA_PAGO_LABEL[fp]}</Text>
                        </Pressable>
                    );
                })}
            </View>

            <Field label="Observaciones" placeholder="Opcional" value={obs} onChangeText={setObs} style={{ marginTop: spacing.lg }} />

            <GradientButton title="Registrar venta" loading={crear.isPending} onPress={submit} style={{ marginTop: spacing.xl }} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
});
