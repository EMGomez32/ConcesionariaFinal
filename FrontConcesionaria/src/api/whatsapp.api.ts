import apiClient from './client';

/**
 * Cuentas de WhatsApp vinculadas a la concesionaria (dispositivo vinculado tipo
 * WhatsApp Web: el número SIGUE funcionando en el celular).
 *
 * Ciclo de vida del vínculo:
 *   desconectado → conectando → esperando_qr → conectado
 *                                    ↑              ↓
 *                              reconectando ←───────┘   (caída de red)
 *   error: el proveedor no pudo levantar la sesión (ver `error`/`ultimoError`).
 */
export type EstadoWhatsappCuenta =
    | 'desconectado'
    | 'conectando'
    | 'esperando_qr'
    | 'conectado'
    | 'reconectando'
    | 'error';

/** Salud del número frente al anti-ban (la calcula el backend, acá sólo se muestra). */
export type SaludNumeroWhatsapp = 'normal' | 'ralentizado' | 'pausado';

export interface WhatsappCuenta {
    id: number;
    alias: string;
    /** El número se conoce recién cuando la sesión quedó vinculada. */
    numero: string | null;
    estado: EstadoWhatsappCuenta;
    activa: boolean;
    ultimoError: string | null;
    saludEstado: SaludNumeroWhatsapp;
    /** Hay credenciales guardadas: al conectar NO va a pedir QR de nuevo. */
    tieneSesion: boolean;
}

/**
 * Respuesta de las acciones de sesión (conectar/desconectar/cerrar-sesion) y del
 * GET de estado que poletea el modal del QR.
 * `qr` es un data-URL (`data:image/png;base64,...`) listo para un <img src>, y
 * sólo viene mientras el estado es `esperando_qr`.
 */
export interface EstadoSesionWhatsapp {
    estado: EstadoWhatsappCuenta;
    qr: string | null;
    numero: string | null;
    error: string | null;
}

export interface CreateWhatsappCuentaDto {
    alias: string;
}

export const whatsappApi = {
    getCuentas: () =>
        apiClient.get<WhatsappCuenta[]>('/whatsapp/cuentas'),

    createCuenta: (data: CreateWhatsappCuentaDto) =>
        apiClient.post<WhatsappCuenta>('/whatsapp/cuentas', data),

    /** Levanta la sesión: si no hay credenciales guardadas devuelve el QR para escanear. */
    conectar: (id: number) =>
        apiClient.post<EstadoSesionWhatsapp>(`/whatsapp/cuentas/${id}/conectar`),

    /** Baja el socket pero CONSERVA la sesión (al reconectar no pide QR). */
    desconectar: (id: number) =>
        apiClient.post<EstadoSesionWhatsapp>(`/whatsapp/cuentas/${id}/desconectar`),

    /** Borra las credenciales: la próxima vinculación vuelve a pedir QR. */
    cerrarSesion: (id: number) =>
        apiClient.post<EstadoSesionWhatsapp>(`/whatsapp/cuentas/${id}/cerrar-sesion`),

    /** Polleado cada 2s mientras el modal del QR está abierto. */
    getEstado: (id: number) =>
        apiClient.get<EstadoSesionWhatsapp>(`/whatsapp/cuentas/${id}/estado`),
};

export default whatsappApi;
