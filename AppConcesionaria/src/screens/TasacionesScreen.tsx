import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { Card, Badge, Field, GradientButton, GhostButton, Segmented, Sheet, T, BadgeTone } from '../components/ui';
import { errorMessage } from '../api/client';
import { num } from '../api/atenciones.api';
import {
    tasacionesApi, Tasacion, CondicionTasacion, CONDICION_LABEL, CONDICIONES, estaPendiente, hoyLocal,
} from '../api/tasaciones.api';

const money = (v: any, m = 'ARS') => {
    const n = num(v);
    if (n == null) return 'A convenir';
    return `${m === 'USD' ? 'US$' : '$'}${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};
const COND_TONE: Record<CondicionTasacion, BadgeTone> = {
    excelente: 'success', muy_bueno: 'cyan', bueno: 'accent', regular: 'warning', malo: 'danger',
};
const soloDigitos = (s?: string | null) => (s ?? '').replace(/\D+/g, '');

export default function TasacionesScreen() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');

    const q = useQuery({
        queryKey: ['tasaciones', search],
        queryFn: () => tasacionesApi.list(search.trim() || undefined, 1, 50),
    });
    const items = q.data?.results ?? [];

    // ── Alta ──────────────────────────────────────────────────────────────
    const [altaOpen, setAltaOpen] = useState(false);
    const [f, setF] = useState({ marca: '', modelo: '', dominio: '', anio: '', km: '', condicion: 'bueno' as CondicionTasacion, valor: '', moneda: 'ARS' as 'ARS' | 'USD', obs: '' });
    const setFF = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

    const crear = useMutation({
        mutationFn: () => tasacionesApi.create({
            marca: f.marca.trim(), modelo: f.modelo.trim(), dominio: f.dominio.trim(), fecha: hoyLocal(),
            anio: f.anio ? Number(f.anio) : undefined, km: f.km ? Number(f.km) : undefined,
            condicion: f.condicion, valorEstimado: f.valor ? Number(f.valor) : undefined,
            moneda: f.moneda, observaciones: f.obs.trim() || undefined,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['tasaciones'] });
            setAltaOpen(false);
            setF({ marca: '', modelo: '', dominio: '', anio: '', km: '', condicion: 'bueno', valor: '', moneda: 'ARS', obs: '' });
        },
        onError: (e) => Alert.alert('No se pudo registrar', errorMessage(e)),
    });

    const abrirAlta = () => setAltaOpen(true);
    const guardarAlta = () => {
        if (!f.marca.trim() || !f.modelo.trim()) return Alert.alert('Faltan datos', 'Marca y modelo son obligatorios.');
        if (!f.dominio.trim()) return Alert.alert('Falta el dominio', 'Sin la patente el tasador no sabe qué auto revisar.');
        crear.mutate();
    };

    // ── Tasar (completar en el lugar) ────────────────────────────────────────
    const [tasar, setTasar] = useState<Tasacion | null>(null);
    const [tDominio, setTDominio] = useState('');
    const [tValor, setTValor] = useState('');
    const [tMoneda, setTMoneda] = useState<'ARS' | 'USD'>('ARS');
    const [tObs, setTObs] = useState('');

    const abrirTasar = (t: Tasacion) => {
        setTasar(t); setTDominio(t.dominio ?? ''); setTValor(num(t.valorEstimado) != null ? String(num(t.valorEstimado)) : '');
        setTMoneda(t.moneda); setTObs(t.observaciones ?? '');
    };
    const completar = useMutation({
        mutationFn: () => tasacionesApi.update(tasar!.id, {
            dominio: tDominio.trim(), valorEstimado: Number(tValor), moneda: tMoneda, observaciones: tObs.trim() || undefined,
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasaciones'] }); setTasar(null); },
        onError: (e) => Alert.alert('No se pudo completar', errorMessage(e)),
    });
    const guardarTasar = () => {
        if (!tDominio.trim()) return Alert.alert('Falta el dominio', 'Es obligatorio para tasar.');
        const v = Number(tValor);
        if (!tValor.trim() || !Number.isFinite(v) || v < 0) return Alert.alert('Valor inválido', 'Poné un valor de tasación válido.');
        completar.mutate();
    };

    const eliminar = useMutation({
        mutationFn: (id: number) => tasacionesApi.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasaciones'] }),
        onError: (e) => Alert.alert('No se pudo eliminar', errorMessage(e)),
    });
    const confirmarBorrar = (t: Tasacion) =>
        Alert.alert('Eliminar tasación', `¿Eliminar la de ${t.marca} ${t.modelo}?`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: () => eliminar.mutate(t.id) },
        ]);

    const enviarWhatsapp = (t: Tasacion) => {
        const tel = soloDigitos(t.cliente?.telefono);
        const veh = `${t.marca} ${t.modelo}${t.anio ? ` ${t.anio}` : ''}`;
        const val = num(t.valorEstimado) != null ? ` Valor estimado: ${money(t.valorEstimado, t.moneda)}.` : '';
        const msg = encodeURIComponent(`Hola${t.cliente?.nombre ? ` ${t.cliente.nombre}` : ''}, te paso la tasación de tu ${veh}.${val} Es orientativa y sujeta a inspección.`);
        Linking.openURL(tel ? `https://wa.me/${tel}?text=${msg}` : `https://wa.me/?text=${msg}`).catch(() => Alert.alert('No se pudo abrir WhatsApp'));
    };

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={(t) => String(t.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.accent} />}
                ListHeaderComponent={
                    <View>
                        <View style={s.header}>
                            <View style={s.iconBadge}><Feather name="clipboard" size={20} color={colors.accent} /></View>
                            <T.H1>Tasaciones</T.H1>
                        </View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Valuá el usado que trae el cliente.</T.Muted>
                        <GradientButton title="Nueva tasación" onPress={abrirAlta} />
                        <Field placeholder="Buscar por marca, modelo, dominio o cliente…" value={search} onChangeText={setSearch} style={{ marginTop: spacing.md }} />
                    </View>
                }
                renderItem={({ item }) => {
                    const pend = estaPendiente(item);
                    return (
                        <Card style={{ marginTop: spacing.md }}>
                            <View style={s.rowTop}>
                                <Text style={s.veh}>{[item.marca, item.modelo, item.anio].filter(Boolean).join(' ')}</Text>
                                <Badge label={CONDICION_LABEL[item.condicion].toUpperCase()} tone={COND_TONE[item.condicion]} />
                            </View>
                            <Text style={[s.valor, pend && { color: colors.accent }]}>{money(item.valorEstimado, item.moneda)}</Text>
                            <T.Muted style={{ marginTop: 2 }}>
                                {item.dominio ? `${item.dominio} · ` : ''}{item.km != null ? `${Number(item.km).toLocaleString('es-AR')} km` : ''}
                            </T.Muted>
                            {item.cliente?.nombre ? <T.Muted style={{ marginTop: 2 }}>{item.cliente.nombre}</T.Muted> : null}
                            {item.observaciones ? <T.Muted style={{ marginTop: spacing.xs }}>{item.observaciones}</T.Muted> : null}

                            <View style={s.actions}>
                                {pend ? (
                                    <Pressable onPress={() => abrirTasar(item)} style={s.tasarBtn}>
                                        <Feather name="dollar-sign" size={15} color={colors.onAccent} />
                                        <Text style={s.tasarText}>Tasar</Text>
                                    </Pressable>
                                ) : null}
                                <Pressable onPress={() => enviarWhatsapp(item)} style={s.iconAction}><Feather name="message-circle" size={17} color={colors.textSecondary} /></Pressable>
                                <Pressable onPress={() => confirmarBorrar(item)} style={s.iconAction}><Feather name="trash-2" size={17} color={colors.textMuted} /></Pressable>
                            </View>
                        </Card>
                    );
                }}
                ListEmptyComponent={
                    q.isLoading
                        ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
                        : <T.Muted style={{ textAlign: 'center', marginTop: spacing.xl }}>No hay tasaciones.</T.Muted>
                }
            />

            {/* Alta */}
            <Sheet
                visible={altaOpen} onClose={() => setAltaOpen(false)}
                title="Nueva tasación" subtitle="Valuación del usado que trae el cliente."
                footer={<>
                    <GhostButton title="Cancelar" onPress={() => setAltaOpen(false)} style={{ flex: 1 }} />
                    <GradientButton title="Guardar" loading={crear.isPending} onPress={guardarAlta} style={{ flex: 1 }} />
                </>}
            >
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Field label="Marca *" placeholder="Toyota" value={f.marca} onChangeText={(v) => setFF('marca', v)} style={{ flex: 1 }} />
                    <Field label="Modelo *" placeholder="Corolla" value={f.modelo} onChangeText={(v) => setFF('modelo', v)} style={{ flex: 1 }} />
                </View>
                <Field label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" value={f.dominio} onChangeText={(v) => setFF('dominio', v)} style={{ marginTop: spacing.sm }} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Field label="Año" keyboardType="numeric" value={f.anio} onChangeText={(v) => setFF('anio', v)} style={{ flex: 1 }} />
                    <Field label="Km" keyboardType="numeric" value={f.km} onChangeText={(v) => setFF('km', v)} style={{ flex: 1 }} />
                </View>
                <Text style={s.miniLabel}>CONDICIÓN</Text>
                <Segmented value={f.condicion} onChange={(v) => setFF('condicion', v)} options={CONDICIONES.map((c) => ({ value: c, label: CONDICION_LABEL[c].split(' ')[0] }))} style={{ marginTop: spacing.xs }} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Field label="Valor estimado" keyboardType="numeric" placeholder="Opcional" value={f.valor} onChangeText={(v) => setFF('valor', v)} style={{ flex: 1 }} />
                    <View style={{ width: 130 }}>
                        <Text style={[s.miniLabel, { marginTop: 0 }]}>MONEDA</Text>
                        <Segmented value={f.moneda} onChange={(v) => setFF('moneda', v)} options={[{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }]} style={{ marginTop: spacing.xs }} />
                    </View>
                </View>
                <Field label="Observaciones" placeholder="Detalles del estado, a reparar…" value={f.obs} onChangeText={(v) => setFF('obs', v)} style={{ marginTop: spacing.sm }} />
            </Sheet>

            {/* Tasar (completar en el lugar) */}
            <Sheet
                visible={!!tasar} onClose={() => setTasar(null)}
                title="Tasar el usado"
                subtitle={tasar ? `${tasar.marca} ${tasar.modelo}${tasar.anio ? ` · ${tasar.anio}` : ''}` : ''}
                footer={<>
                    <GhostButton title="Cancelar" onPress={() => setTasar(null)} style={{ flex: 1 }} />
                    <GradientButton title="Guardar tasación" loading={completar.isPending} onPress={guardarTasar} style={{ flex: 1 }} />
                </>}
            >
                <Field label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" value={tDominio} onChangeText={setTDominio} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Field label="Valor estimado *" keyboardType="numeric" placeholder="12000000" value={tValor} onChangeText={setTValor} style={{ flex: 1 }} />
                    <View style={{ width: 130 }}>
                        <Text style={[s.miniLabel, { marginTop: 0 }]}>MONEDA</Text>
                        <Segmented value={tMoneda} onChange={setTMoneda} options={[{ value: 'ARS', label: '$' }, { value: 'USD', label: 'US$' }]} style={{ marginTop: spacing.xs }} />
                    </View>
                </View>
                <Field label="Observaciones" placeholder="Ajustes al valor, a reparar…" value={tObs} onChangeText={setTObs} style={{ marginTop: spacing.sm }} />
            </Sheet>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs, marginTop: spacing.sm },
    iconBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent + '22', alignItems: 'center', justifyContent: 'center' },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    veh: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    valor: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    tasarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
    tasarText: { color: colors.onAccent, fontWeight: '800', fontSize: fontSize.sm },
    iconAction: { width: 40, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.md },
});
