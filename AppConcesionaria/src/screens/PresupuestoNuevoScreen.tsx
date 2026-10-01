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
import { presupuestosApi } from '../api/presupuestos.api';
import { num } from '../api/atenciones.api';
import { hoyLocal } from '../api/tasaciones.api';

const nombreCli = (c: { nombre: string; apellido?: string | null }) => [c.nombre, c.apellido].filter(Boolean).join(' ');
const money = (n: number, m: string) => `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
const enDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function PresupuestoNuevoScreen({ navigation }: any) {
    const qc = useQueryClient();
    const user = useAuthStore((s) => s.user);

    const [cliente, setCliente] = useState<PickerItem | null>(null);
    const [vehiculo, setVehiculo] = useState<PickerItem | null>(null);
    const [precioLista, setPrecioLista] = useState('');
    const [descuento, setDescuento] = useState('');
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [validoHasta, setValidoHasta] = useState('');
    const [obs, setObs] = useState('');

    const lista = num(precioLista) ?? 0;
    const desc = num(descuento) ?? 0;
    const precioFinal = Math.max(0, lista - desc);

    const crear = useMutation({
        mutationFn: () => presupuestosApi.create({
            sucursalId: user!.sucursalId!, clienteId: cliente!.id, vendedorId: user!.id,
            moneda, fechaCreacion: hoyLocal(), validoHasta: validoHasta || undefined,
            observaciones: obs.trim() || undefined,
            items: [{ vehiculoId: vehiculo!.id, precioLista: lista, descuento: desc || undefined, precioFinal }],
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['presupuestos'] }); navigation.goBack(); },
        onError: (e) => Alert.alert('No se pudo crear el presupuesto', errorMessage(e)),
    });

    const submit = () => {
        if (!user?.sucursalId) return Alert.alert('Sin sucursal', 'Tu usuario no tiene una sucursal asignada.');
        if (!cliente) return Alert.alert('Falta el cliente');
        if (!vehiculo) return Alert.alert('Falta el vehículo');
        if (lista <= 0) return Alert.alert('Precio inválido', 'Poné el precio de lista.');
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
                    onSelect={(it) => { setVehiculo(it); }}
                />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <Field label="Precio de lista" placeholder="0" keyboardType="numeric" value={precioLista} onChangeText={setPrecioLista} style={{ flex: 1 }} />
                <Field label="Descuento" placeholder="0" keyboardType="numeric" value={descuento} onChangeText={setDescuento} style={{ flex: 1 }} />
            </View>
            <View style={{ width: 160, marginTop: spacing.md }}>
                <Text style={s.miniLabel}>MONEDA</Text>
                <Segmented value={moneda} onChange={setMoneda} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} style={{ marginTop: spacing.sm }} />
            </View>

            <View style={s.totalBox}>
                <T.Muted>Precio final</T.Muted>
                <Text style={s.total}>{money(precioFinal, moneda)}</Text>
            </View>

            <Text style={[s.miniLabel, { marginTop: spacing.lg }]}>VÁLIDO HASTA</Text>
            <View style={s.chips}>
                {[['7 días', 7], ['15 días', 15], ['30 días', 30]].map(([lbl, n]) => {
                    const val = enDias(n as number);
                    const on = validoHasta === val;
                    return (
                        <Pressable key={lbl as string} onPress={() => setValidoHasta(on ? '' : val)} style={[s.chip, on && s.chipOn]}>
                            <Text style={[s.chipText, on && { color: colors.onAccent }]}>{lbl}</Text>
                        </Pressable>
                    );
                })}
            </View>

            <Field label="Observaciones" placeholder="Opcional" value={obs} onChangeText={setObs} style={{ marginTop: spacing.lg }} />

            <GradientButton title="Crear presupuesto" loading={crear.isPending} onPress={submit} style={{ marginTop: spacing.xl }} />
            <T.Muted style={{ textAlign: 'center', marginTop: spacing.md }}>Por ahora una unidad por presupuesto; extras y canje llegan después.</T.Muted>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
    totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
    total: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '800' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },
});
