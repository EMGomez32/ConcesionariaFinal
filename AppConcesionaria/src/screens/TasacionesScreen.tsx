import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { spacing, radius, fonts, fontSize, touchMin } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import {
    Card, Badge, Chips, Field, GradientButton, GhostButton, IconButton, Segmented, Sheet, T, EstadoLista, PieLista,
} from '../components/ui';
import {
    COND_TONE, MONEDAS, TasarSheet, confirmarEliminarTasacion, enviarTasacionWhatsapp, valorTasacion,
} from '../components/Tasacion';
import { errorMessage } from '../api/client';
import { formatKm, formatMontoInput, parseMonto } from '../lib/formato';
import {
    tasacionesApi, Tasacion, CondicionTasacion, CONDICION_LABEL, CONDICIONES, estaPendiente, hoyLocal,
} from '../api/tasaciones.api';
import { useDebounced, useListaPaginada } from '../hooks/useListaPaginada';

const VACIO = { marca: '', modelo: '', dominio: '', anio: '', km: '', condicion: 'bueno' as CondicionTasacion, valor: '', moneda: 'ARS' as 'ARS' | 'USD', obs: '' };

export default function TasacionesScreen({ navigation }: any) {
    const s = useStyles();
    const { colors } = useTheme();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const busqueda = useDebounced(search.trim());

    const lista = useListaPaginada(
        ['tasaciones', busqueda],
        (page, limit) => tasacionesApi.list(busqueda || undefined, page, limit),
    );

    // ── Alta ──────────────────────────────────────────────────────────────
    const [altaOpen, setAltaOpen] = useState(false);
    const [f, setF] = useState(VACIO);
    const setFF = <K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) => setF((p) => ({ ...p, [k]: v }));

    const crear = useMutation({
        mutationFn: () => tasacionesApi.create({
            marca: f.marca.trim(), modelo: f.modelo.trim(), dominio: f.dominio.trim(), fecha: hoyLocal(),
            anio: f.anio ? Number(f.anio) : undefined, km: parseMonto(f.km) ?? undefined,
            condicion: f.condicion, valorEstimado: parseMonto(f.valor) ?? undefined,
            moneda: f.moneda, observaciones: f.obs.trim() || undefined,
        }),
        onSuccess: (t) => {
            qc.invalidateQueries({ queryKey: ['tasaciones'] });
            setAltaOpen(false);
            setF(VACIO);
            // Se abre la tasación recién creada, con la confirmación arriba.
            navigation.navigate('TasacionDetalle', { id: t.id, creada: true });
        },
        onError: (e) => Alert.alert('No se pudo registrar', errorMessage(e)),
    });

    const guardarAlta = () => {
        if (!f.marca.trim() || !f.modelo.trim()) return Alert.alert('Faltan datos', 'Marca y modelo son obligatorios.');
        if (!f.dominio.trim()) return Alert.alert('Falta el dominio', 'Sin la patente el tasador no sabe qué auto revisar.');
        crear.mutate();
    };

    // ── Tasar (completar en el lugar) ────────────────────────────────────────
    const [tasar, setTasar] = useState<Tasacion | null>(null);

    const eliminar = useMutation({
        mutationFn: (id: number) => tasacionesApi.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tasaciones'] }),
        onError: (e) => Alert.alert('No se pudo eliminar', errorMessage(e)),
    });

    return (
        <View style={s.root}>
            <FlatList
                data={lista.items}
                keyExtractor={(t) => String(t.id)}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={lista.refrescando} onRefresh={lista.refrescar} tintColor={colors.accentText} />}
                onEndReached={lista.cargarMas}
                onEndReachedThreshold={0.4}
                ListHeaderComponent={
                    <View>
                        <T.Muted style={{ marginBottom: spacing.lg }}>Valuá el usado que trae el cliente.</T.Muted>
                        <GradientButton title="Nueva tasación" onPress={() => setAltaOpen(true)} />
                        <Field
                            placeholder="Buscar por marca, modelo, dominio o cliente…"
                            accessibilityLabel="Buscar tasaciones"
                            autoCorrect={false}
                            value={search}
                            onChangeText={setSearch}
                            style={{ marginTop: spacing.md }}
                            right={lista.buscando ? <ActivityIndicator color={colors.accentText} style={{ marginRight: spacing.md }} /> : null}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    const pend = estaPendiente(item);
                    const veh = [item.marca, item.modelo, item.anio].filter(Boolean).join(' ');
                    return (
                        <Card style={{ marginTop: spacing.md }}>
                            <Pressable
                                onPress={() => navigation.navigate('TasacionDetalle', { id: item.id })}
                                accessibilityRole="button"
                                accessibilityLabel={`${veh}, ${CONDICION_LABEL[item.condicion]}, ${valorTasacion(item)}`}
                                accessibilityHint="Abre la tasación"
                                style={({ pressed }) => pressed && { opacity: 0.7 }}
                            >
                                <View style={s.rowTop}>
                                    <Text style={s.veh}>{veh}</Text>
                                    <Badge label={CONDICION_LABEL[item.condicion].toUpperCase()} tone={COND_TONE[item.condicion]} />
                                </View>
                                <Text style={[s.valor, pend && { color: colors.accentText }]}>{valorTasacion(item)}</Text>
                                <T.Muted style={{ marginTop: 2 }}>
                                    {[item.dominio, formatKm(item.km)].filter(Boolean).join(' · ')}
                                </T.Muted>
                                {item.cliente?.nombre ? <T.Muted style={{ marginTop: 2 }}>{item.cliente.nombre}</T.Muted> : null}
                                {item.observaciones ? <T.Muted style={{ marginTop: spacing.xs }} >{item.observaciones}</T.Muted> : null}
                            </Pressable>

                            <View style={s.actions}>
                                {pend ? (
                                    <Pressable
                                        onPress={() => setTasar(item)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Tasar ${veh}`}
                                        style={({ pressed }) => [s.tasarBtn, pressed && { opacity: 0.85 }]}
                                    >
                                        <Feather name="dollar-sign" size={15} color={colors.onAccent} />
                                        <Text style={s.tasarText}>Tasar</Text>
                                    </Pressable>
                                ) : null}
                                <IconButton icon="message-circle" label={`Enviar la tasación de ${veh} por WhatsApp`} onPress={() => enviarTasacionWhatsapp(item)} />
                                <IconButton
                                    icon="trash-2" label={`Eliminar la tasación de ${veh}`} color={colors.danger}
                                    onPress={() => confirmarEliminarTasacion(item, () => eliminar.mutate(item.id))}
                                />
                            </View>
                        </Card>
                    );
                }}
                ListEmptyComponent={<EstadoLista q={lista.q} que="las tasaciones" vacio={busqueda ? 'Ninguna tasación coincide con la búsqueda.' : 'No hay tasaciones.'} />}
                ListFooterComponent={
                    <PieLista
                        cargandoMas={lista.q.isFetchingNextPage}
                        errorMas={lista.q.isFetchNextPageError}
                        onRetry={lista.cargarMas}
                        mostrando={lista.items.length}
                        total={lista.total}
                    />
                }
            />

            {/* Alta */}
            <Sheet
                visible={altaOpen} onClose={() => setAltaOpen(false)}
                title="Nueva tasación" subtitle="Valuación del usado que trae el cliente."
                footer={<>
                    <GhostButton title="Cancelar" onPress={() => setAltaOpen(false)} style={{ flex: 1, paddingHorizontal: spacing.md }} />
                    <GradientButton title="Guardar" loading={crear.isPending} onPress={guardarAlta} style={{ flex: 1 }} />
                </>}
            >
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Field label="Marca *" placeholder="Toyota" value={f.marca} onChangeText={(v) => setFF('marca', v)} style={{ flex: 1 }} />
                    <Field label="Modelo *" placeholder="Corolla" value={f.modelo} onChangeText={(v) => setFF('modelo', v)} style={{ flex: 1 }} />
                </View>
                <Field
                    label="Dominio *" placeholder="AB123CD" autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoComplete="off"
                    value={f.dominio} onChangeText={(v) => setFF('dominio', v)} style={{ marginTop: spacing.sm }}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Field label="Año" keyboardType="numeric" value={f.anio} onChangeText={(v) => setFF('anio', v.replace(/\D/g, '').slice(0, 4))} style={{ flex: 1 }} />
                    <Field label="Km" keyboardType="numeric" value={f.km} onChangeText={(v) => setFF('km', formatMontoInput(v))} style={{ flex: 1 }} />
                </View>
                <Text style={s.miniLabel}>CONDICIÓN</Text>
                <Chips
                    value={f.condicion}
                    onChange={(v) => setFF('condicion', v)}
                    accessibilityLabel="Condición del usado"
                    options={CONDICIONES.map((c) => ({ value: c, label: CONDICION_LABEL[c] }))}
                    style={{ marginTop: spacing.xs }}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <Field label="Valor estimado" keyboardType="numeric" placeholder="Opcional" value={f.valor} onChangeText={(v) => setFF('valor', formatMontoInput(v))} style={{ flex: 1 }} />
                    <View style={{ width: 130 }}>
                        <Text style={[s.miniLabel, { marginTop: 0 }]}>MONEDA</Text>
                        <Segmented value={f.moneda} onChange={(v) => setFF('moneda', v)} accessibilityLabel="Moneda" options={MONEDAS} style={{ marginTop: spacing.xs }} />
                    </View>
                </View>
                <Field label="Observaciones" placeholder="Detalles del estado, a reparar…" value={f.obs} onChangeText={(v) => setFF('obs', v)} style={{ marginTop: spacing.sm }} />
            </Sheet>

            <TasarSheet tasacion={tasar} onClose={() => setTasar(null)} />
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    veh: { color: colors.text, fontFamily: fonts.brand, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
    valor: { color: colors.text, fontFamily: fonts.brandBold, fontSize: fontSize.xl, fontWeight: '800', marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    tasarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, minHeight: touchMin, paddingHorizontal: 16, borderRadius: radius.pill },
    tasarText: { color: colors.onAccent, fontWeight: '800', fontSize: fontSize.sm },
    miniLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginTop: spacing.md },
}));
