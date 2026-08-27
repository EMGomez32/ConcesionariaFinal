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
import TasacionesScreen from '../screens/TasacionesScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';

const navTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: colors.bg,
        card: colors.bgSecondary,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
        notification: colors.accent,
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
        <Stack.Navigator screenOptions={{ ...headerStyle }}>
            <Stack.Screen
                name="Mostrador"
                component={MostradorScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen name="AtencionDetalle" component={AtencionDetalleScreen} options={{ title: 'Atención' }} />
        </Stack.Navigator>
    );
}

const Clientes = () => <PlaceholderScreen title="Clientes" icon="users" />;
const Vehiculos = () => <PlaceholderScreen title="Vehículos" icon="truck" />;

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
                        MostradorTab: 'user-check', Clientes: 'users', Vehiculos: 'truck', Tasaciones: 'clipboard',
                    };
                    return <Feather name={icon[route.name] ?? 'circle'} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="MostradorTab" component={MostradorStack} options={{ title: 'Mostrador', headerShown: false }} />
            <Tab.Screen name="Clientes" component={Clientes} />
            <Tab.Screen name="Vehiculos" component={Vehiculos} options={{ title: 'Vehículos' }} />
            <Tab.Screen name="Tasaciones" component={TasacionesScreen} />
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
