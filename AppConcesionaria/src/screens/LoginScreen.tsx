import React, { useState } from 'react';
import { View, Text, Image, ScrollView, Alert, Linking, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, fonts, fontSize, touchMin } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/theme';
import { Banner, Field, GradientButton, GhostButton, IconButton, KeyboardSafeView, T } from '../components/ui';
import { login, loginSegundoFactor, useAuthStore } from '../store/authStore';
import { mensajeDeError } from '../lib/errores';
import { WEB_BASE_URL } from '../config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ISOTIPO = require('../../assets/isotipo.png');

export default function LoginScreen() {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const avisoSesion = useAuthStore((st) => st.avisoSesion);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [verPassword, setVerPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Segundo paso (cuenta con verificación en dos pasos).
    const [mfaToken, setMfaToken] = useState<string | null>(null);
    const [codigo, setCodigo] = useState('');
    const [conRecuperacion, setConRecuperacion] = useState(false);

    const onSubmit = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Faltan datos', 'Ingresá tu correo y tu contraseña.');
            return;
        }
        setLoading(true);
        try {
            const r = await login(email.trim(), password);
            // Con sesión, el gate de navegación reacciona al store: no hace falta navegar a mano.
            if (r.tipo === 'segundo-factor') { setMfaToken(r.mfaToken); setCodigo(''); }
        } catch (e) {
            Alert.alert('No pudimos entrar', mensajeDeError(e, 'No pudimos iniciar sesión. Revisá tus datos.'));
        } finally {
            setLoading(false);
        }
    };

    const onCodigo = async () => {
        if (!mfaToken) return;
        if (!codigo.trim()) {
            Alert.alert('Falta el código', conRecuperacion ? 'Ingresá uno de tus códigos de recuperación.' : 'Ingresá el código de 6 dígitos de tu app.');
            return;
        }
        setLoading(true);
        try {
            await loginSegundoFactor(mfaToken, codigo.trim(), conRecuperacion);
        } catch (e) {
            Alert.alert('No pudimos verificar el código', mensajeDeError(e, 'Revisá el código y probá de nuevo.'));
        } finally {
            setLoading(false);
        }
    };

    const olvideContrasena = () => {
        const url = `${WEB_BASE_URL}/forgot-password`;
        Linking.openURL(url).catch(() => Alert.alert('No pudimos abrir la página', `Entrá desde el navegador a ${url}`));
    };

    return (
        <View style={s.root}>
            <KeyboardSafeView>
                <ScrollView
                    contentContainerStyle={[s.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={s.brand}>
                        <Image source={ISOTIPO} style={s.logo} accessibilityLabel="AUTENZA" accessibilityIgnoresInvertColors />
                        <Text style={s.wordmark}>AUTENZA</Text>
                        <Text style={s.tagline}>Sistema de gestión para concesionarias</Text>
                    </View>

                    {avisoSesion && !mfaToken ? <Banner tone="warning" title={avisoSesion} style={{ marginBottom: spacing.lg }} /> : null}

                    {!mfaToken ? (
                        <View style={s.card}>
                            <T.H2 style={{ marginBottom: 4 }}>Te damos la bienvenida</T.H2>
                            <T.Muted>Iniciá sesión para entrar a tu panel.</T.Muted>

                            <Field
                                label="Correo electrónico"
                                placeholder="tu@email.com"
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoCorrect={false}
                                autoComplete="email"
                                textContentType="username"
                                value={email}
                                onChangeText={setEmail}
                                returnKeyType="next"
                                style={{ marginTop: spacing.xl }}
                            />
                            <Field
                                label="Contraseña"
                                placeholder="Tu contraseña"
                                secureTextEntry={!verPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="password"
                                textContentType="password"
                                value={password}
                                onChangeText={setPassword}
                                onSubmitEditing={onSubmit}
                                returnKeyType="go"
                                style={{ marginTop: spacing.lg }}
                                right={
                                    <IconButton
                                        icon={verPassword ? 'eye-off' : 'eye'}
                                        label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                        onPress={() => setVerPassword((v) => !v)}
                                        bordered={false}
                                        size={20}
                                        style={s.ojo}
                                    />
                                }
                            />

                            <Pressable
                                onPress={olvideContrasena}
                                accessibilityRole="link"
                                accessibilityHint="Abre la página para recuperar la contraseña en el navegador"
                                style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}
                            >
                                <Text style={s.linkText}>¿Olvidaste tu contraseña?</Text>
                            </Pressable>

                            <GradientButton title="Iniciar sesión" onPress={onSubmit} loading={loading} style={{ marginTop: spacing.md }} />
                        </View>
                    ) : (
                        <View style={s.card}>
                            <T.H2 style={{ marginBottom: 4 }}>Verificación en dos pasos</T.H2>
                            <T.Muted>
                                {conRecuperacion
                                    ? 'Ingresá uno de los códigos de recuperación que guardaste. Cada uno sirve una sola vez.'
                                    : 'Abrí tu app autenticadora e ingresá el código de 6 dígitos.'}
                            </T.Muted>
                            <Field
                                label={conRecuperacion ? 'Código de recuperación' : 'Código'}
                                placeholder={conRecuperacion ? 'xxxx-xxxx' : '123456'}
                                keyboardType={conRecuperacion ? 'default' : 'number-pad'}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete={conRecuperacion ? 'off' : 'one-time-code'}
                                textContentType="oneTimeCode"
                                value={codigo}
                                onChangeText={setCodigo}
                                onSubmitEditing={onCodigo}
                                returnKeyType="go"
                                autoFocus
                                style={{ marginTop: spacing.xl }}
                            />
                            <Pressable
                                onPress={() => { setConRecuperacion((v) => !v); setCodigo(''); }}
                                accessibilityRole="button"
                                style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}
                            >
                                <Text style={s.linkText}>{conRecuperacion ? 'Usar el código de la app' : 'Usar un código de recuperación'}</Text>
                            </Pressable>
                            <GradientButton title="Verificar y entrar" onPress={onCodigo} loading={loading} style={{ marginTop: spacing.md }} />
                            <GhostButton
                                title="Volver"
                                onPress={() => { setMfaToken(null); setCodigo(''); setConRecuperacion(false); }}
                                style={{ marginTop: spacing.md }}
                            />
                        </View>
                    )}

                    <Text style={[s.footer, { color: colors.textMuted }]}>© 2026 AUTENZA</Text>
                </ScrollView>
            </KeyboardSafeView>
        </View>
    );
}

const useStyles = makeStyles((colors) => ({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
    brand: { alignItems: 'center', marginBottom: spacing.xxl },
    logo: { width: 88, height: 88 },
    wordmark: { color: colors.text, fontSize: fontSize.xl, letterSpacing: 6, fontFamily: fonts.brandBold, fontWeight: '700', marginTop: spacing.md },
    tagline: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' },
    card: {
        backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
        borderRadius: radius.xl, padding: spacing.xl,
    },
    ojo: { width: touchMin, height: touchMin, marginRight: 4 },
    link: { alignSelf: 'flex-end', minHeight: touchMin, justifyContent: 'center', marginTop: spacing.xs },
    linkText: { color: colors.accentText, fontSize: fontSize.sm, fontWeight: '600' },
    footer: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xxl },
}));
