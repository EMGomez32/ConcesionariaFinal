import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertCircle, FileDown, X } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { clientesApi } from '../../api/clientes.api';
import type { ImportClienteFila } from '../../api/clientes.api';
import { ORIGEN_LEAD_LABEL, ORIGENES_LEAD } from '../../types/cliente.types';
import type { OrigenLead } from '../../types/cliente.types';
import { useUIStore } from '../../store/uiStore';

/** Destino posible de cada columna de la planilla. */
type Destino = 'ignorar' | 'nombre' | 'telefono' | 'email' | 'dni' | 'observaciones' | 'canal' | 'vendedor';

const DESTINOS: { value: Destino; label: string }[] = [
    { value: 'ignorar', label: 'Ignorar' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'telefono', label: 'Teléfono' },
    { value: 'email', label: 'Email' },
    { value: 'dni', label: 'DNI' },
    { value: 'observaciones', label: 'Observaciones' },
    { value: 'canal', label: 'Canal' },
    { value: 'vendedor', label: 'Vendedor' },
];

/** lower + sin acentos, para comparar encabezados y valores "a la criolla". */
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Auto-detección del destino de una columna por su encabezado. */
const detectarDestino = (encabezado: string): Destino => {
    const h = normalizar(encabezado);
    if (/nombre|cliente|razon/.test(h)) return 'nombre';
    if (/tel|cel|whatsapp|movil/.test(h)) return 'telefono';
    if (/mail|correo/.test(h)) return 'email';
    if (/dni|doc|cuit|cuil/.test(h)) return 'dni';
    if (/obs|nota|coment/.test(h)) return 'observaciones';
    if (/canal|origen|fuente/.test(h)) return 'canal';
    if (/vendedor|asesor/.test(h)) return 'vendedor';
    return 'ignorar';
};

/**
 * Normaliza el VALOR de la columna Canal a un OrigenLead. Sin reconocer →
 * undefined: el backend aplica `opciones.origenDefault` en ese caso.
 */
const canalPorValor = (valor: string): OrigenLead | undefined => {
    const v = normalizar(valor).replace(/\s+/g, '');
    if (!v) return undefined;
    if (v.includes('derueda')) return 'deruedas';
    if (v.includes('insta') || v === 'ig') return 'instagram';
    if (v.includes('face') || v === 'fb') return 'facebook';
    if (v.includes('whatsapp') || v === 'wsp' || v === 'wa') return 'whatsapp';
    if (v.includes('web') || v.includes('pagina')) return 'web';
    if (v.includes('mostrador') || v.includes('local')) return 'mostrador';
    if (v.includes('referido') || v.includes('recomendado')) return 'referido';
    return undefined;
};

/** Celda cruda de SheetJS → texto (los teléfonos/DNI suelen venir como number). */
const celdaATexto = (celda: unknown): string => {
    if (celda == null) return '';
    if (typeof celda === 'number') return String(celda);
    return String(celda).trim();
};

/** Fila de datos + su número REAL en la planilla (el encabezado es la fila 1). */
interface FilaFuente {
    filaExcel: number;
    celdas: unknown[];
}

interface ResultadoAcumulado {
    creados: number;
    actualizados: number;
    salteados: number;
    /** `fila` ya es el número de fila GLOBAL de la planilla (como se ve en Excel). */
    errores: { fila: number; motivo: string }[];
}

interface ImportClientesModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Vendedores asignables (la misma lista que usa "Nueva consulta"). */
    vendedores: { id: number; nombre: string }[];
}

/** Tamaño de lote del envío (el backend acepta hasta 300 por request). */
const TAMANO_LOTE = 200;

/**
 * Wizard de importación masiva de clientes desde una planilla (XLSX/XLS/CSV):
 * 1) subir el archivo, 2) mapear columnas y opciones, 3) confirmar e importar
 * en lotes secuenciales con resumen final y descarga de errores.
 */
const ImportClientesModal: React.FC<ImportClientesModalProps> = ({ isOpen, onClose, vendedores }) => {
    const queryClient = useQueryClient();
    const { addToast } = useUIStore();
    const inputRef = useRef<HTMLInputElement>(null);

    const [paso, setPaso] = useState<1 | 2 | 3>(1);

    // ─ Paso 1: archivo parseado ─
    const [nombreArchivo, setNombreArchivo] = useState('');
    const [errorParseo, setErrorParseo] = useState('');
    const [encabezados, setEncabezados] = useState<string[]>([]);
    const [filasFuente, setFilasFuente] = useState<FilaFuente[]>([]);

    // ─ Paso 2: mapeo por columna + opciones del import ─
    const [mapeo, setMapeo] = useState<Destino[]>([]);
    const [estadoInicial, setEstadoInicial] = useState<'contactado' | 'nuevo'>('contactado');
    const [origenDefault, setOrigenDefault] = useState('');
    const [vendedorDefault, setVendedorDefault] = useState('');
    const [actualizarExistentes, setActualizarExistentes] = useState(true);

    // ─ Paso 3: envío por lotes y resumen ─
    const [importando, setImportando] = useState(false);
    const [progreso, setProgreso] = useState({ lote: 0, totalLotes: 0, procesados: 0 });
    const [resultado, setResultado] = useState<ResultadoAcumulado | null>(null);
    const [errorEnvio, setErrorEnvio] = useState('');

    const reset = () => {
        setPaso(1);
        setNombreArchivo('');
        setErrorParseo('');
        setEncabezados([]);
        setFilasFuente([]);
        setMapeo([]);
        setEstadoInicial('contactado');
        setOrigenDefault('');
        setVendedorDefault('');
        setActualizarExistentes(true);
        setImportando(false);
        setProgreso({ lote: 0, totalLotes: 0, procesados: 0 });
        setResultado(null);
        setErrorEnvio('');
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleClose = () => {
        if (importando) return; // no cerrar a mitad de un envío
        if (resultado) {
            // Hubo importación: refrescar cartera y reporte de consultas.
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            queryClient.invalidateQueries({ queryKey: ['reportes', 'consultas'] });
            addToast(
                `Importación: ${resultado.creados} creados, ${resultado.actualizados} actualizados, ${resultado.salteados} salteados, ${resultado.errores.length} con error`,
                resultado.errores.length > 0 || errorEnvio ? 'info' : 'success'
            );
        }
        onClose();
        reset();
    };

    // ─ Paso 1: parseo de la planilla (SheetJS lee XLSX y CSV por el mismo camino) ─
    const handleArchivo = async (file: File | undefined) => {
        if (!file) return;
        setErrorParseo('');
        let matriz: unknown[][];
        try {
            const libro = XLSX.read(await file.arrayBuffer());
            const hoja = libro.Sheets[libro.SheetNames[0]];
            if (!hoja) throw new Error('sin hojas');
            // blankrows:true conserva las filas vacías intermedias para que el
            // número de fila coincida SIEMPRE con el que se ve en Excel.
            matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: true });
        } catch {
            setErrorParseo('No se pudo leer el archivo. Verificá que sea un Excel (.xlsx / .xls) o CSV válido.');
            return;
        }
        if (matriz.length < 2) {
            setErrorParseo('La planilla necesita una fila de encabezados y al menos una fila de datos.');
            return;
        }
        const encs = (matriz[0] ?? []).map((c, i) => celdaATexto(c) || `Columna ${i + 1}`);
        const fuente = matriz
            .slice(1)
            .map((celdas, i) => ({ filaExcel: i + 2, celdas: celdas ?? [] }))
            .filter((f) => f.celdas.some((c) => celdaATexto(c) !== ''));
        if (fuente.length === 0) {
            setErrorParseo('La planilla no tiene filas con datos debajo del encabezado.');
            return;
        }
        setEncabezados(encs);
        setFilasFuente(fuente);
        setMapeo(encs.map(detectarDestino));
        setNombreArchivo(file.name);
        setResultado(null);
        setErrorEnvio('');
    };

    const quitarArchivo = () => {
        setNombreArchivo('');
        setEncabezados([]);
        setFilasFuente([]);
        setMapeo([]);
        if (inputRef.current) inputRef.current.value = '';
    };

    const nombreMapeado = mapeo.includes('nombre');

    /** Matchea el VALOR de la columna Vendedor contra la lista por nombre normalizado. */
    const vendedorPorValor = (valor: string): number | undefined => {
        const v = normalizar(valor);
        if (!v) return undefined;
        const exacto = vendedores.find((x) => normalizar(x.nombre) === v);
        if (exacto) return exacto.id;
        const parcial = vendedores.find((x) => normalizar(x.nombre).includes(v) || v.includes(normalizar(x.nombre)));
        return parcial?.id;
    };

    // Filas YA mapeadas al contrato del endpoint. Las filas inválidas (p.ej. sin
    // nombre) se mandan igual: el backend valida POR FILA y reporta el motivo.
    const filasImport = useMemo<ImportClienteFila[]>(() => {
        return filasFuente.map(({ celdas }) => {
            const valorDe = (destino: Destino): string => {
                for (let i = 0; i < mapeo.length; i++) {
                    if (mapeo[i] !== destino) continue;
                    const v = celdaATexto(celdas[i]);
                    if (v) return v;
                }
                return '';
            };
            const vendedorId = vendedorPorValor(valorDe('vendedor')) ?? (vendedorDefault ? Number(vendedorDefault) : undefined);
            return {
                nombre: valorDe('nombre') || undefined,
                telefono: valorDe('telefono') || undefined,
                email: valorDe('email') || undefined,
                dni: valorDe('dni') || undefined,
                observaciones: valorDe('observaciones') || undefined,
                // Sin reconocer → undefined y el backend aplica origenDefault.
                origenLead: canalPorValor(valorDe('canal')),
                vendedorAsignadoId: vendedorId,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filasFuente, mapeo, vendedorDefault, vendedores]);

    // ─ Paso 3: envío en lotes SECUENCIALES acumulando el resumen ─
    const handleImportar = async () => {
        setImportando(true);
        setErrorEnvio('');
        const totalLotes = Math.ceil(filasImport.length / TAMANO_LOTE);
        const acumulado: ResultadoAcumulado = { creados: 0, actualizados: 0, salteados: 0, errores: [] };
        try {
            for (let offset = 0; offset < filasImport.length; offset += TAMANO_LOTE) {
                setProgreso({ lote: offset / TAMANO_LOTE + 1, totalLotes, procesados: offset });
                const res = await clientesApi.importar({
                    filas: filasImport.slice(offset, offset + TAMANO_LOTE),
                    opciones: {
                        estadoInicial,
                        origenDefault: origenDefault || undefined,
                        actualizarExistentes,
                    },
                });
                acumulado.creados += res.creados;
                acumulado.actualizados += res.actualizados;
                acumulado.salteados += res.salteados;
                // `indice` del backend = posición dentro del lote → número de fila
                // GLOBAL de la planilla (offset del lote + 2 por el encabezado).
                for (const e of res.errores) {
                    const fuente = filasFuente[offset + e.indice];
                    acumulado.errores.push({ fila: fuente ? fuente.filaExcel : offset + e.indice + 2, motivo: e.motivo });
                }
                setProgreso({ lote: offset / TAMANO_LOTE + 1, totalLotes, procesados: Math.min(offset + TAMANO_LOTE, filasImport.length) });
            }
        } catch (err) {
            const e = err as { message?: string };
            setErrorEnvio(e?.message || 'Error del servidor durante la importación. Los contadores muestran lo procesado hasta el corte.');
        } finally {
            setImportando(false);
            setResultado(acumulado);
        }
    };

    // CSV de errores (fila;motivo) — mismo patrón de descarga de blob que la
    // ficha PDF de VehiculoDetallePage. BOM para que Excel respete los acentos.
    const handleDescargarErrores = () => {
        if (!resultado || resultado.errores.length === 0) return;
        const escapar = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
        const lineas = ['fila;motivo', ...resultado.errores.map((e) => `${e.fila};${escapar(e.motivo)}`)];
        const url = window.URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'errores-import-clientes.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    // Vista previa: primeras 5 filas ya mapeadas, con defaults resueltos como
    // los va a persistir el backend.
    const filasPreview = filasImport.slice(0, 5);
    const nombreVendedor = (id?: number) => (id ? vendedores.find((v) => v.id === id)?.nombre ?? `#${id}` : '');
    const canalPreview = (fila: ImportClienteFila) => {
        const canal = (fila.origenLead ?? (origenDefault || undefined)) as OrigenLead | undefined;
        return canal ? ORIGEN_LEAD_LABEL[canal] : '';
    };

    const PASOS = ['Subir planilla', 'Mapear columnas', 'Confirmar'];

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Importar clientes"
            subtitle="Cargá una planilla (Excel o CSV), mapeá las columnas y confirmá la importación."
            maxWidth="780px"
        >
            <div className="import-wizard">
                <ol className="import-steps" aria-label="Pasos de la importación">
                    {PASOS.map((p, i) => (
                        <li key={p} className={`import-step ${paso === i + 1 ? 'is-active' : ''} ${paso > i + 1 ? 'is-done' : ''}`}>
                            <span className="import-step-num">{i + 1}</span>
                            <span>{p}</span>
                        </li>
                    ))}
                </ol>

                {/* ─ Paso 1: subir ─ */}
                {paso === 1 && (
                    <div>
                        {!nombreArchivo && (
                            <button
                                type="button"
                                className="import-dropzone"
                                onClick={() => inputRef.current?.click()}
                            >
                                <span className="import-dropzone-icon"><Upload size={20} /></span>
                                <span className="import-dropzone-text">
                                    <strong>Elegí la planilla a importar</strong>
                                    <span>Formatos aceptados: .xlsx, .xls o .csv — la primera fila debe ser el encabezado.</span>
                                </span>
                            </button>
                        )}
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={(e) => handleArchivo(e.target.files?.[0])}
                            style={{ display: 'none' }}
                        />

                        {nombreArchivo && (
                            <div className="import-file">
                                <FileSpreadsheet size={18} className="text-accent" />
                                <div className="import-file-info">
                                    <span className="import-file-name">{nombreArchivo}</span>
                                    <small>{filasFuente.length} filas de datos detectadas · {encabezados.length} columnas</small>
                                </div>
                                <button type="button" className="icon-btn" onClick={quitarArchivo} aria-label="Quitar archivo">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {errorParseo && (
                            <div className="import-alert" role="alert">
                                <AlertCircle size={14} />
                                <span>{errorParseo}</span>
                            </div>
                        )}

                        <div className="form-actions">
                            <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                            <Button variant="primary" disabled={filasFuente.length === 0} onClick={() => setPaso(2)}>
                                Continuar
                            </Button>
                        </div>
                    </div>
                )}

                {/* ─ Paso 2: mapeo + opciones ─ */}
                {paso === 2 && (
                    <div>
                        <p className="import-hint">
                            Indicá a qué dato corresponde cada columna de la planilla. Las columnas en «Ignorar» no se importan.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            {encabezados.map((enc, i) => (
                                <Select
                                    key={i}
                                    dense
                                    label={enc}
                                    hint={celdaATexto(filasFuente[0]?.celdas[i]) ? `Ej: ${celdaATexto(filasFuente[0]?.celdas[i])}` : undefined}
                                    value={mapeo[i]}
                                    onChange={(e) => setMapeo((m) => m.map((d, j) => (j === i ? (e.target.value as Destino) : d)))}
                                >
                                    {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </Select>
                            ))}
                        </div>

                        {!nombreMapeado && (
                            <div className="import-alert" role="alert">
                                <AlertCircle size={14} />
                                <span>Mapeá una columna como «Nombre» para poder continuar: es el único dato obligatorio.</span>
                            </div>
                        )}

                        <h3 className="import-subtitle">Opciones del import</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Select
                                dense
                                label="Etapa inicial"
                                value={estadoInicial}
                                onChange={(e) => setEstadoInicial(e.target.value as 'contactado' | 'nuevo')}
                            >
                                <option value="contactado">Cartera histórica (no dispara alertas)</option>
                                <option value="nuevo">Leads frescos a trabajar</option>
                            </Select>
                            <Select
                                dense
                                label="Canal por defecto"
                                placeholder="Sin canal por defecto"
                                value={origenDefault}
                                onChange={(e) => setOrigenDefault(e.target.value)}
                            >
                                {ORIGENES_LEAD.map((o) => <option key={o} value={o}>{ORIGEN_LEAD_LABEL[o]}</option>)}
                            </Select>
                            <Select
                                dense
                                label="Vendedor por defecto"
                                placeholder="Sin asignar"
                                value={vendedorDefault}
                                onChange={(e) => setVendedorDefault(e.target.value)}
                            >
                                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                            </Select>
                            <label className="import-check">
                                <input
                                    type="checkbox"
                                    checked={actualizarExistentes}
                                    onChange={(e) => setActualizarExistentes(e.target.checked)}
                                />
                                <span>Completar datos faltantes de clientes existentes</span>
                            </label>
                        </div>

                        <div className="form-actions">
                            <Button variant="secondary" onClick={() => setPaso(1)}>Atrás</Button>
                            <Button variant="primary" disabled={!nombreMapeado} onClick={() => setPaso(3)}>
                                Continuar
                            </Button>
                        </div>
                    </div>
                )}

                {/* ─ Paso 3: confirmar / progreso / resumen ─ */}
                {paso === 3 && !resultado && (
                    <div>
                        <p className="import-hint">
                            Vista previa de las primeras {filasPreview.length} filas ya mapeadas. Se van a importar <strong>{filasImport.length}</strong> clientes en total.
                        </p>
                        <div className="import-preview-wrap">
                            <table className="import-preview">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        <th>Teléfono</th>
                                        <th>Email</th>
                                        <th>DNI</th>
                                        <th>Canal</th>
                                        <th>Vendedor</th>
                                        <th>Observaciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filasPreview.map((f, i) => (
                                        <tr key={i}>
                                            <td>{f.nombre || <span className="text-danger">Sin nombre</span>}</td>
                                            <td>{f.telefono || '-'}</td>
                                            <td>{f.email || '-'}</td>
                                            <td>{f.dni || '-'}</td>
                                            <td>{canalPreview(f) || '-'}</td>
                                            <td>{nombreVendedor(f.vendedorAsignadoId) || '-'}</td>
                                            <td className="import-preview-obs">{f.observaciones || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {importando && (
                            <div className="import-progress" role="status">
                                <div className="import-progress-track">
                                    <div
                                        className="import-progress-fill"
                                        style={{ width: `${Math.round((progreso.procesados / Math.max(filasImport.length, 1)) * 100)}%` }}
                                    />
                                </div>
                                <small>lote {progreso.lote} de {progreso.totalLotes} · {progreso.procesados} procesados</small>
                            </div>
                        )}

                        <div className="form-actions">
                            <Button variant="secondary" onClick={() => setPaso(2)} disabled={importando}>Atrás</Button>
                            <Button variant="primary" onClick={handleImportar} loading={importando}>
                                Importar {filasImport.length} clientes
                            </Button>
                        </div>
                    </div>
                )}

                {/* ─ Resumen final ─ */}
                {paso === 3 && resultado && (
                    <div>
                        <div className="import-resumen">
                            <div className="import-contador">
                                <span className="import-contador-num text-success">{resultado.creados}</span>
                                <span className="import-contador-tag">Creados</span>
                            </div>
                            <div className="import-contador">
                                <span className="import-contador-num">{resultado.actualizados}</span>
                                <span className="import-contador-tag">Actualizados</span>
                            </div>
                            <div className="import-contador">
                                <span className="import-contador-num">{resultado.salteados}</span>
                                <span className="import-contador-tag">Salteados</span>
                            </div>
                            <div className="import-contador">
                                <span className="import-contador-num text-danger">{resultado.errores.length}</span>
                                <span className="import-contador-tag">Errores</span>
                            </div>
                        </div>

                        {errorEnvio && (
                            <div className="import-alert" role="alert">
                                <AlertCircle size={14} />
                                <span>{errorEnvio}</span>
                            </div>
                        )}

                        <div className="form-actions">
                            {resultado.errores.length > 0 && (
                                <Button variant="secondary" onClick={handleDescargarErrores}>
                                    <FileDown size={16} />
                                    Descargar errores (CSV)
                                </Button>
                            )}
                            <Button variant="primary" onClick={handleClose}>Cerrar</Button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .import-wizard { display: flex; flex-direction: column; gap: var(--space-4); }
                .import-steps { display: flex; gap: var(--space-3); list-style: none; padding: 0; margin: 0; flex-wrap: wrap; }
                .import-step { display: flex; align-items: center; gap: 0.4rem; font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
                .import-step-num { display: flex; align-items: center; justify-content: center; width: 1.4rem; height: 1.4rem; border-radius: 50%; border: 1px solid var(--border); font-size: var(--text-2xs); }
                .import-step.is-active { color: var(--text-primary); }
                .import-step.is-active .import-step-num { border-color: var(--accent); color: var(--accent); }
                .import-step.is-done .import-step-num { background: var(--accent); border-color: var(--accent); color: var(--bg-primary); }
                .import-dropzone { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-6) var(--space-4); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-lg); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; text-align: center; transition: border-color .15s, background .15s, color .15s; }
                .import-dropzone:hover { border-color: var(--accent); color: var(--accent); }
                .import-dropzone-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--bg-card); border: 1px solid var(--border); color: inherit; }
                .import-dropzone-text { display: flex; flex-direction: column; gap: 0.2rem; font-size: var(--text-sm); }
                .import-dropzone-text span { font-size: var(--text-xs); color: var(--text-muted); }
                .import-file { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
                .import-file-info { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
                .import-file-name { font-weight: 700; font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .import-file-info small { color: var(--text-muted); font-size: var(--text-xs); }
                .import-alert { display: flex; align-items: center; gap: 0.5rem; margin-top: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--danger); border-radius: var(--radius-md); color: var(--danger); font-size: var(--text-xs); font-weight: 600; }
                .import-hint { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-3); }
                .import-subtitle { font-size: var(--text-xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin: var(--space-5) 0 var(--space-3); }
                .import-check { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: var(--text-xs); color: var(--text-secondary); align-self: end; padding-bottom: 0.4rem; }
                .import-check input[type="checkbox"] { width: 1rem; height: 1rem; cursor: pointer; accent-color: var(--accent); }
                .import-preview-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
                .import-preview { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
                .import-preview th { text-align: left; padding: 0.5rem 0.75rem; background: var(--bg-secondary); color: var(--text-muted); font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
                .import-preview td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
                .import-preview-obs { max-width: 220px; }
                .import-progress { display: flex; flex-direction: column; gap: 0.35rem; margin-top: var(--space-4); }
                .import-progress-track { height: 6px; border-radius: 999px; background: var(--bg-secondary); overflow: hidden; }
                .import-progress-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .3s ease; }
                .import-progress small { color: var(--text-muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
                .import-resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); }
                .import-contador { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
                .import-contador-num { font-size: var(--text-2xl); font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
                .import-contador-tag { font-size: var(--text-2xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
            `}</style>
        </Modal>
    );
};

export default ImportClientesModal;
