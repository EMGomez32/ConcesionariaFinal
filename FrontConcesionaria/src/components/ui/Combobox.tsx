import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { useCampoIds } from './useCampoIds';

export interface ComboboxOption {
    value: string | number;
    label: string;
    /** Texto secundario debajo del nombre (DNI, dominio, sucursal…). También se busca. */
    sub?: string;
    disabled?: boolean;
}

export interface ComboboxProps {
    label?: string;
    id?: string;
    options: ComboboxOption[];
    /** Valor elegido. `null`, `undefined` o '' = sin selección. */
    value: string | number | null | undefined;
    /** Se llama al elegir una opción, o con (null, null) al limpiar. */
    onChange: (value: string | number | null, option: ComboboxOption | null) => void;
    placeholder?: string;
    error?: string;
    hint?: string;
    /** Muestra "Buscando…" en la lista (búsqueda remota en curso). */
    loading?: boolean;
    /**
     * Búsqueda remota: se llama con el texto tipeado (con 250 ms de debounce). Si
     * se pasa, el componente NO filtra: muestra `options` tal como llegan.
     */
    onSearch?: (texto: string) => void;
    /** Texto cuando no hay opciones que mostrar. */
    emptyText?: string;
    /**
     * Etiqueta del valor elegido cuando su opción no está en `options` (búsqueda
     * remota al editar un registro: el cliente guardado no vino en la página).
     */
    selectedLabel?: string;
    disabled?: boolean;
    required?: boolean;
    /** Muestra la X para dejarlo vacío (por defecto, si no es `required`). */
    clearable?: boolean;
    name?: string;
    /** Métrica compacta (13px), igual que <Input dense>. */
    dense?: boolean;
    /** Clases extra para el wrapper .input-group. */
    containerClassName?: string;
}

const DEBOUNCE_MS = 250;
/** Alto máximo de la lista (18rem) y mínimo de espacio libre para abrir hacia abajo. */
const ALTO_LISTA = 288;
const ESPACIO_MINIMO = 200;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mismoValor = (a: unknown, b: unknown) => a != null && b != null && a !== '' && String(a) === String(b);

/**
 * Select con búsqueda (patrón ARIA "combobox" con lista: input + listbox).
 * Para listas largas (clientes, unidades, proveedores) donde un <select> obliga
 * a scrollear cientos de opciones.
 *
 * Teclado: ↓/↑ recorren las opciones (abren la lista si está cerrada), Enter
 * elige la marcada, Escape cierra la lista (si ya estaba cerrada, el Escape
 * sigue de largo: cierra el modal que lo contenga), Tab sale sin cambiar nada.
 * Al tipear se marca la primera coincidencia, así "jos" + Enter elige a José.
 */
const Combobox = ({
    label,
    id,
    options,
    value,
    onChange,
    placeholder = 'Buscá o elegí una opción',
    error,
    hint,
    loading = false,
    onSearch,
    emptyText = 'No hay resultados',
    selectedLabel,
    disabled = false,
    required = false,
    clearable,
    name,
    dense = false,
    containerClassName = '',
}: ComboboxProps) => {
    const { campoId, mensajeId, descripcion } = useCampoIds(id, undefined, !!(error || hint));
    const listaId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const listaRef = useRef<HTMLUListElement>(null);
    const contRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    const [abierto, setAbierto] = useState(false);
    // Mientras el usuario tipea, el input muestra SU texto; si no, la etiqueta elegida.
    const [editando, setEditando] = useState(false);
    const [texto, setTexto] = useState('');
    const [activo, setActivo] = useState(-1);
    // La última opción elegida acá: con búsqueda remota, al cambiar `options` la
    // elegida puede no venir más y hay que seguir mostrando su nombre.
    const [ultimaElegida, setUltimaElegida] = useState<ComboboxOption | null>(null);

    const elegida = options.find((o) => mismoValor(o.value, value))
        ?? (ultimaElegida && mismoValor(ultimaElegida.value, value) ? ultimaElegida : null);
    const hayValor = value != null && value !== '';
    const etiquetaElegida = elegida?.label ?? (hayValor ? selectedLabel ?? String(value) : '');

    const visibles = useMemo(() => {
        if (onSearch || !editando || !texto.trim()) return options;
        const q = normalizar(texto.trim());
        return options.filter((o) => normalizar(`${o.label} ${o.sub ?? ''}`).includes(q));
    }, [options, onSearch, editando, texto]);

    // Búsqueda remota con debounce. Sólo llama al callback (no hay setState acá).
    const onSearchRef = useRef(onSearch);
    useEffect(() => { onSearchRef.current = onSearch; });
    useEffect(() => {
        if (!editando || !onSearchRef.current) return;
        const t = setTimeout(() => onSearchRef.current?.(texto), DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [texto, editando]);

    // Si cambian las opciones (llegó la búsqueda remota), el marcado no puede
    // quedar apuntando afuera de la lista.
    const activoValido = activo >= 0 && activo < visibles.length ? activo : -1;

    // La lista va en un portal a <body> con posición fija: dentro de un modal, el
    // cuerpo (overflow) y el panel (overflow hidden + transform) la recortaban.
    // Se ubica pegada al campo, y hacia arriba si abajo no queda lugar. El estilo
    // se escribe directo en el nodo (no es estado de React: no re-renderiza al
    // scrollear).
    useLayoutEffect(() => {
        if (!abierto) return;
        const ubicar = () => {
            const cont = contRef.current;
            const pop = popupRef.current;
            if (!cont || !pop) return;
            const r = cont.getBoundingClientRect();
            const abajo = window.innerHeight - r.bottom;
            const haciaArriba = abajo < ESPACIO_MINIMO && r.top > abajo;
            pop.style.left = `${r.left}px`;
            pop.style.width = `${r.width}px`;
            pop.style.maxHeight = `${Math.max(120, Math.min(ALTO_LISTA, (haciaArriba ? r.top : abajo) - 12))}px`;
            pop.style.top = haciaArriba ? '' : `${r.bottom + 4}px`;
            pop.style.bottom = haciaArriba ? `${window.innerHeight - r.top + 4}px` : '';
        };
        ubicar();
        window.addEventListener('resize', ubicar);
        window.addEventListener('scroll', ubicar, true);
        return () => {
            window.removeEventListener('resize', ubicar);
            window.removeEventListener('scroll', ubicar, true);
        };
    }, [abierto]);

    // La opción marcada siempre a la vista.
    useEffect(() => {
        if (!abierto || activoValido < 0) return;
        const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${activoValido}"]`);
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [abierto, activoValido]);

    const primeraHabilitada = (lista: ComboboxOption[], desde: number, paso: 1 | -1) => {
        for (let i = desde; i >= 0 && i < lista.length; i += paso) {
            if (!lista[i].disabled) return i;
        }
        return -1;
    };

    const cerrar = () => {
        setAbierto(false);
        setEditando(false);
        setTexto('');
        setActivo(-1);
    };

    const elegir = (op: ComboboxOption) => {
        if (op.disabled) return;
        setUltimaElegida(op);
        onChange(op.value, op);
        cerrar();
    };

    const limpiar = () => {
        setUltimaElegida(null);
        onChange(null, null);
        cerrar();
        inputRef.current?.focus();
    };

    const abrir = () => {
        if (disabled) return;
        setAbierto(true);
        const i = visibles.findIndex((o) => mismoValor(o.value, value));
        setActivo(i >= 0 ? i : primeraHabilitada(visibles, 0, 1));
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;
        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                if (!abierto) { abrir(); return; }
                const sig = primeraHabilitada(visibles, activoValido + 1, 1);
                if (sig >= 0) setActivo(sig);
                return;
            }
            case 'ArrowUp': {
                e.preventDefault();
                if (!abierto) { abrir(); return; }
                const ant = primeraHabilitada(visibles, (activoValido < 0 ? visibles.length : activoValido) - 1, -1);
                if (ant >= 0) setActivo(ant);
                return;
            }
            case 'Enter': {
                // Con la lista abierta, Enter elige (y no envía el formulario).
                if (!abierto) return;
                e.preventDefault();
                const op = visibles[activoValido];
                if (op) elegir(op);
                return;
            }
            case 'Escape': {
                if (!abierto) return; // que lo use el modal / el menú
                e.preventDefault();
                e.stopPropagation();
                cerrar();
                return;
            }
            case 'Tab': {
                if (abierto) cerrar();
                return;
            }
        }
    };

    const mostrarLimpiar = (clearable ?? !required) && hayValor && !disabled;
    const opcionId = (i: number) => `${listaId}-op-${i}`;

    return (
        <div className={`input-group ${dense ? 'input-group--dense' : ''} ${containerClassName}`}>
            {label && <label className="input-label" htmlFor={campoId}>{label}</label>}
            <div ref={contRef} className={`input-container cbx ${error ? 'has-error' : ''}`}>
                <input
                    ref={inputRef}
                    id={campoId}
                    name={name}
                    type="text"
                    role="combobox"
                    aria-expanded={abierto}
                    aria-controls={listaId}
                    aria-autocomplete="list"
                    aria-activedescendant={abierto && activoValido >= 0 ? opcionId(activoValido) : undefined}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={descripcion}
                    aria-required={required || undefined}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={disabled}
                    className={`input-control ${dense ? 'input-control--dense' : ''}`}
                    placeholder={placeholder}
                    value={editando ? texto : etiquetaElegida}
                    onChange={(e) => {
                        setEditando(true);
                        setTexto(e.target.value);
                        setAbierto(true);
                        // Se marca la primera coincidencia: tipear + Enter elige.
                        setActivo(0);
                    }}
                    onClick={() => { if (!abierto) abrir(); }}
                    onKeyDown={onKeyDown}
                    onBlur={() => { if (abierto || editando) cerrar(); }}
                />
                <span className="cbx-acciones">
                    {mostrarLimpiar && (
                        <button
                            type="button"
                            className="cbx-boton"
                            aria-label={label ? `Limpiar ${label}` : 'Limpiar'}
                            tabIndex={-1}
                            // mousedown + preventDefault: no le saca el foco al input.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={limpiar}
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        className="cbx-boton"
                        aria-label={abierto ? 'Cerrar opciones' : 'Mostrar opciones'}
                        tabIndex={-1}
                        disabled={disabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            if (abierto) { cerrar(); return; }
                            inputRef.current?.focus();
                            abrir();
                        }}
                    >
                        <ChevronDown size={16} aria-hidden="true" />
                    </button>
                </span>

                {createPortal(
                <div ref={popupRef} className="cbx-popup" hidden={!abierto}>
                    <ul
                        ref={listaRef}
                        id={listaId}
                        role="listbox"
                        aria-label={label}
                        className="cbx-lista"
                    >
                        {!loading && visibles.map((op, i) => (
                            <li
                                key={String(op.value)}
                                id={opcionId(i)}
                                role="option"
                                data-indice={i}
                                aria-selected={mismoValor(op.value, value)}
                                aria-disabled={op.disabled || undefined}
                                className={`cbx-opcion ${i === activoValido ? 'is-activa' : ''}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => { if (!op.disabled) setActivo(i); }}
                                onClick={() => elegir(op)}
                            >
                                <span>{op.label}</span>
                                {op.sub && <span className="cbx-opcion-sub">{op.sub}</span>}
                            </li>
                        ))}
                    </ul>
                    {loading && <div className="cbx-msg" role="status">Buscando…</div>}
                    {!loading && visibles.length === 0 && <div className="cbx-msg" role="status">{emptyText}</div>}
                </div>,
                document.body,
                )}
            </div>
            {error
                ? <span id={mensajeId} className="input-feedback input-feedback-error">{error}</span>
                : hint
                    ? <span id={mensajeId} className="input-feedback">{hint}</span>
                    : null}
        </div>
    );
};

export default Combobox;
