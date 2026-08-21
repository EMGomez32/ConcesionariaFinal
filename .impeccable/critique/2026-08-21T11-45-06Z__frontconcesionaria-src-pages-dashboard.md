---
target: dashboard
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T11-45-06Z
slug: frontconcesionaria-src-pages-dashboard
---
# Critique — Dashboard AUTENZA (Resumen Operativo)

Method: dual-agent (A: design review · B: detector determinista + browser evidence) — sin degradar

## Design Health Score — 24/40 (Aceptable)

| # | Heurística | Score | Key Issue |
|---|-----------|:----:|-----------|
| 1 | Visibility of System Status | 2 | "Sincronizar" refresca solo la mitad de las queries; sin "actualizado hace X"; error de stats pinta 0 como dato real |
| 2 | Match System / Real World | 3 | Lenguaje y ciclo de negocio fieles; overclaim "en tiempo real" (es caché) |
| 3 | User Control & Freedom | 2 | Período clavado al mes; único control es "Sincronizar" |
| 4 | Consistency & Standards | 2 | Colores fuera de token (#0ea5e9, #ea580c), salto h1→h3, valor de finance cards a 1.4rem |
| 5 | Error Prevention | 3 | Bajo riesgo; el modal de meta valida bien |
| 6 | Recognition vs Recall | 3 | Todo etiquetado, sub-labels explican el cálculo |
| 7 | Flexibility & Efficiency | 2 | Deep-links (bien); sin export, filtros, atajos, marcar atendida |
| 8 | Aesthetic & Minimalist | 2 | 5 tonos de acento compiten con los datos |
| 9 | Error Recovery | 2 | Finanzas/alertas con error+Reintentar; stats/stock/tendencia no → ceros fabricados |
| 10 | Help & Documentation | 3 | Tour driver.js + sub-labels |

## Design Specificity Verdict
Autorizado a medias: la mitad de abajo (taxonomía de acciones, multi-moneda honesta, objetivo de doble vara) está escrita para una concesionaria; la fila hero de 4 KPIs es template de admin. Oportunidad perdida: producto multi-tenant/multi-sucursal sin ninguna afordancia de sucursal ni tenant; super_admin ve panel mono-local.
Detector (Assessment B): 3 hallazgos, exit 2, 0 falsos positivos — side-tab (borde lateral 3px, :325, "AI-tell"); layout-transition ×2 (:49 width, :425 height, justificación funcional). Review y detector convergen en las alert cards.
Browser: overlay no ejecutado (requiere stack autenticado completo).

## Priority Issues
- [P1] "Sincronizar" refresca medio dashboard y falla en silencio → ceros fabricados (?? 0 indistinguible de dato real). Fix: refetch por rol, error+Reintentar en stats/stock/tendencia, "Actualizado hace X". → /impeccable harden
- [P1] Contraste inaccesible en las cifras clave (counts de alerta ≈1.9-2.4:1 sobre blanco; labels text-muted ≈2.9:1). Fix: cifra en --text-primary, color solo en ícono/badge, verificar 4.5:1. → /impeccable audit
- [P2] Paleta fuera de token + borde lateral 3px rompen Signal-Not-Wallpaper (#0ea5e9/#ea580c/#8b5cf6 hardcodeados, no viran en dark). Fix: mapear a 4 roles de estado, var(--*), diferenciar por ícono+label. → /impeccable colorize (o quieter)
- [P2] Vista admin sobrecargada: 7+5 tarjetas de peso idéntico sin jerarquía de urgencia (carga cognitiva crítica ≈5/8). Fix: ordenar por urgencia, colapsar los "0", más peso a la card de mayor riesgo. → /impeccable layout (o distill)
- [P2] Gating por cargo, no por trabajo: cobrador y postventa no ven su cola (mora/turnos bajo isAdmin). Fix: visibilidad por dato-relevante-al-rol; auditoría sigue admin-only. → /impeccable shape

## Persona Red Flags
- Alex (power user): período fijo, "Sincronizar" no confiable, sin export/atajos/marcar-atendida, facturado solo por hover.
- Sam (accesibilidad): contraste <4.5:1 (labels) y <3:1 (cifras de alerta); salto h1→h3; skeletons sin aria-busy/aria-live; AnimatedNumber ignora prefers-reduced-motion; barras de tendencia no-focusables con dato en title.
- Cobrador (dominio): pantalla vacía de su trabajo; mora/cobranzas bajo isAdmin no se renderizan; sin ruta corta a cobranza.

## Minor Observations
- super_admin por la misma rama isAdmin (:59): sin selector de sucursal/tenant.
- Hex hardcodeado (145, 155-156, 382, 425): no vira en dark theme.
- layout-transition (:49 width, :425 height): pasar a transform scaleX/scaleY.
- "Actividad Reciente" sin "ver todo"; header "en tiempo real" es caché; tour setTimeout(700ms) frágil en red lenta.

## Questions to Consider
1. Multi-tenant sin dimensión de sucursal/tenant en la landing: ¿por qué super_admin ve lo mismo que un admin mono-local?
2. Gating por cargo vs trabajo del día: ¿cuál es el primer clic real de cada rol?
3. "$X en mora" en rojo: ¿debería ofrecer el próximo paso en vez de solo linkear a un reporte?
