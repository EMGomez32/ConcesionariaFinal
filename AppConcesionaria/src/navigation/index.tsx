import React from 'react';
import { Pressable } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import { colors, fonts } from '../theme/tokens';
import { useAuthStore } from '../store/authStore';
import LoginScreen from '../screens/LoginScreen';
import MostradorScreen from '../screens/MostradorScreen';
import AtencionDetalleScreen from '../screens/AtencionDetalleScreen';
import ClientesScreen from '../screens/ClientesScreen';
import VehiculosScreen from '../screens/VehiculosScreen';
import TasacionesScreen from '../screens/TasacionesScreen';
import VentasScreen from '../screens/VentasScreen';
import VentaDetalleScreen from '../screens/VentaDetalleScreen';
import PresupuestosScreen from '../screens/PresupuestosScreen';
import PresupuestoDetalleScreen from '../screens/PresupuestoDetalleScreen';
import MasScreen from '../screens/MasScreen';

const navTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: colors.bg, card: colors.bgSecondary, text: colors.text,
        border: colors.border, primary: colors.accent, notification: colors.accent,
    },
};

const headerStyle = {
    headerStyle: { backgroundColor: colors.bgSecondary },
    headerTitleStyle: { color: colors.text, fontFamily: fonts.brand },
    headerTintColor: colors.text,
    headerShadowVisible: false,
} as const;

function LogoutButton() {
    const logout = useAuthStore((s) => s.logout);
    return (
        <Pressable onPress={logout} hitSlop={12} style={{ paddingHorizontal: 12 }}>
            <Feather name="log-out" size={20} color={colors.textSecondary} />
        </Pressable>
    );
}

const Stack = createNativeStackNavigator();

function MostradorStack() {
    return (
        <Stack.Navigator screenOptions={headerStyle}>
            <Stack.Screen name="Mostrador" component={MostradorScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AtencionDetalle" component={AtencionDetalleScreen} options={{ title: 'Atención' }} />
        </Stack.Navigator>
    );
}

/** "Más" agrupa las secciones que no son de uso constante: documentos y tasación. */
function MasStack() {
    return (
        <Stack.Navigator screenOptions={{ ...headerStyle, headerRight: () => <LogoutButton /> }}>
            <Stack.Screen name="Mas" component={MasScreen} options={{ title: 'Más' }} />
            <Stack.Screen name="Presupuestos" component={PresupuestosScreen} />
            <Stack.Screen name="PresupuestoDetalle" component={PresupuestoDetalleScreen} options={{ title: 'Presupuesto' }} />
            <Stack.Screen name="Ventas" component={VentasScreen} />
            <Stack.Screen name="VentaDetalle" component={VentaDetalleScreen} options={{ title: 'Venta' }} />
            <Stack.Screen name="Tasaciones" component={TasacionesScreen} />
        </Stack.Navigator>
    );
}

const Tab = createBottomTabNavigator();

function AppTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                ...headerStyle,
                headerRight: () => <LogoutButton />,
                tabBarStyle: { backgroundColor: colors.bgSecondary, borderTopColor: colors.border },
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarIcon: ({ color, size }) => {
                    const icon: Record<string, keyof typeof Feather.glyphMap> = {
                        MostradorTab: 'user-check', Clientes: 'users', Vehiculos: 'truck', MasTab: 'more-horizontal',
                    };
                    return <Feather name={icon[route.name] ?? 'circle'} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="MostradorTab" component={MostradorStack} options={{ title: 'Mostrador', headerShown: false }} />
            <Tab.Screen name="Clientes" component={ClientesScreen} />
            <Tab.Screen name="Vehiculos" component={VehiculosScreen} options={{ title: 'Stock' }} />
            <Tab.Screen name="MasTab" component={MasStack} options={{ title: 'Más', headerShown: false }} />
        </Tab.Navigator>
    );
}

export default function RootNavigator() {
    const user = useAuthStore((s) => s.user);
    return (
        <NavigationContainer theme={navTheme}>
            {user ? <AppTabs /> : <LoginScreen />}
        </NavigationContainer>
    );
}
