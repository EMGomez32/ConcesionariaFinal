import React, { useMemo } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import { fonts, Palette } from '../theme/tokens';
import { Theme, useTheme } from '../theme/theme';
import { useAuthStore } from '../store/authStore';
import { IconButton, confirmarCerrarSesion } from '../components/ui';
import LoginScreen from '../screens/LoginScreen';
import SinAppScreen from '../screens/SinAppScreen';
import MostradorScreen from '../screens/MostradorScreen';
import AtencionDetalleScreen from '../screens/AtencionDetalleScreen';
import ClientesScreen from '../screens/ClientesScreen';
import ClienteDetalleScreen from '../screens/ClienteDetalleScreen';
import VehiculosScreen from '../screens/VehiculosScreen';
import VehiculoDetalleScreen from '../screens/VehiculoDetalleScreen';
import TasacionesScreen from '../screens/TasacionesScreen';
import TasacionDetalleScreen from '../screens/TasacionDetalleScreen';
import VentasScreen from '../screens/VentasScreen';
import VentaDetalleScreen from '../screens/VentaDetalleScreen';
import VentaNuevaScreen from '../screens/VentaNuevaScreen';
import PresupuestosScreen from '../screens/PresupuestosScreen';
import PresupuestoDetalleScreen from '../screens/PresupuestoDetalleScreen';
import PresupuestoNuevoScreen from '../screens/PresupuestoNuevoScreen';
import MasScreen from '../screens/MasScreen';

const navThemeDe = ({ dark, colors }: Theme): NavTheme => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
        ...base,
        colors: {
            ...base.colors,
            background: colors.bg, card: colors.bgSecondary, text: colors.text,
            border: colors.border, primary: colors.accentText, notification: colors.accent,
        },
    };
};

const headerDe = (colors: Palette): NativeStackNavigationOptions => ({
    headerStyle: { backgroundColor: colors.bgSecondary },
    headerTitleStyle: { color: colors.text, fontFamily: fonts.brand },
    headerTintColor: colors.text,
    headerShadowVisible: false,
});

/** Cerrar sesión (con confirmación) en el header. */
function LogoutButton() {
    const logout = useAuthStore((s) => s.logout);
    return (
        <IconButton
            icon="log-out" label="Cerrar sesión" bordered={false} size={20} style={{ marginHorizontal: 4 }}
            onPress={() => confirmarCerrarSesion(() => { logout(); })}
        />
    );
}

const Stack = createNativeStackNavigator();

/**
 * Presupuestos y ventas (alta y detalle) en CADA stack que los abre: desde la
 * atención, la ficha del cliente o la de la unidad se crean sin saltar de pestaña,
 * y "atrás" vuelve a donde se estaba.
 */
const documentos = (
    <Stack.Group>
        <Stack.Screen name="PresupuestoDetalle" component={PresupuestoDetalleScreen} options={{ title: 'Presupuesto' }} />
        <Stack.Screen name="PresupuestoNuevo" component={PresupuestoNuevoScreen} options={{ title: 'Nuevo presupuesto' }} />
        <Stack.Screen name="VentaDetalle" component={VentaDetalleScreen} options={{ title: 'Venta' }} />
        <Stack.Screen name="VentaNueva" component={VentaNuevaScreen} options={{ title: 'Registrar venta' }} />
    </Stack.Group>
);

function MostradorStack() {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={headerDe(colors)}>
            <Stack.Screen name="Mostrador" component={MostradorScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AtencionDetalle" component={AtencionDetalleScreen} options={{ title: 'Atención' }} />
            <Stack.Screen name="VehiculoDetalle" component={VehiculoDetalleScreen} options={{ title: 'Unidad' }} />
            {documentos}
        </Stack.Navigator>
    );
}

function ClientesStack() {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={headerDe(colors)}>
            <Stack.Screen name="ClientesLista" component={ClientesScreen} options={{ title: 'Clientes', headerRight: () => <LogoutButton /> }} />
            <Stack.Screen name="ClienteDetalle" component={ClienteDetalleScreen} options={{ title: 'Cliente' }} />
            {documentos}
        </Stack.Navigator>
    );
}

function StockStack() {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={headerDe(colors)}>
            <Stack.Screen name="StockLista" component={VehiculosScreen} options={{ title: 'Stock', headerRight: () => <LogoutButton /> }} />
            <Stack.Screen name="VehiculoDetalle" component={VehiculoDetalleScreen} options={{ title: 'Unidad' }} />
            {documentos}
        </Stack.Navigator>
    );
}

/** "Más" agrupa las secciones que no son de uso constante: documentos y tasación. */
function MasStack() {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={{ ...headerDe(colors), headerRight: () => <LogoutButton /> }}>
            <Stack.Screen name="Mas" component={MasScreen} options={{ title: 'Más' }} />
            <Stack.Screen name="Presupuestos" component={PresupuestosScreen} />
            <Stack.Screen name="Ventas" component={VentasScreen} />
            <Stack.Screen name="Tasaciones" component={TasacionesScreen} />
            <Stack.Screen name="TasacionDetalle" component={TasacionDetalleScreen} options={{ title: 'Tasación' }} />
            {documentos}
        </Stack.Navigator>
    );
}

const Tab = createBottomTabNavigator();

function AppTabs() {
    const { colors } = useTheme();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: { backgroundColor: colors.bgSecondary, borderTopColor: colors.border },
                tabBarActiveTintColor: colors.accentText,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarIcon: ({ color, size }) => {
                    const icon: Record<string, keyof typeof Feather.glyphMap> = {
                        MostradorTab: 'user-check', Clientes: 'users', Vehiculos: 'truck', MasTab: 'more-horizontal',
                    };
                    return <Feather name={icon[route.name] ?? 'circle'} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="MostradorTab" component={MostradorStack} options={{ title: 'Mostrador' }} />
            <Tab.Screen name="Clientes" component={ClientesStack} options={{ title: 'Clientes' }} />
            <Tab.Screen name="Vehiculos" component={StockStack} options={{ title: 'Stock' }} />
            <Tab.Screen name="MasTab" component={MasStack} options={{ title: 'Más' }} />
        </Tab.Navigator>
    );
}

/** El tasador PURO sólo valúa usados: la app se reduce a Tasaciones, sin tabs. */
function TasadorStack() {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={{ ...headerDe(colors), headerRight: () => <LogoutButton /> }}>
            <Stack.Screen name="Tasaciones" component={TasacionesScreen} />
            <Stack.Screen name="TasacionDetalle" component={TasacionDetalleScreen} options={{ title: 'Tasación' }} />
        </Stack.Navigator>
    );
}

/** Roles con la app completa (Mostrador, Clientes, Stock, Más). */
const ROLES_APP = ['admin', 'super_admin', 'vendedor'];

export default function RootNavigator() {
    const theme = useTheme();
    const navTheme = useMemo(() => navThemeDe(theme), [theme]);
    const user = useAuthStore((s) => s.user);
    const roles = user?.roles ?? [];
    const appCompleta = roles.some((r) => ROLES_APP.includes(r));
    // Tasador puro: rol tasador y ninguno de los que tienen la app completa.
    const esTasador = roles.includes('tasador');
    return (
        <NavigationContainer theme={navTheme}>
            {!user ? <LoginScreen />
                : appCompleta ? <AppTabs />
                    : esTasador ? <TasadorStack />
                        // cobrador, postventa, lectura: todavía no tienen pantallas en la app.
                        : <SinAppScreen />}
        </NavigationContainer>
    );
}
