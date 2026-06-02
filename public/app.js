// ─── CACHE ───────────────────────────────────────────────────────────────────
const cache = { paciente: null, sesiones: [], pagos: [] };

// ─── API HELPER ─────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

// ─── UTILIDADES ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '–';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}
function fmtMoney(n) {
  if (n === null || n === undefined) return '–';
  return '$\u00A0' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function openModal(title, bodyHTML, onConfirm, confirmLabel = 'Guardar') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const btn = document.getElementById('modal-confirm');
  btn.textContent = confirmLabel;
  btn.className = ['Eliminar','Dar de baja'].includes(confirmLabel) ? 'btn btn-danger' : 'btn btn-primary';
  btn.onclick = async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Guardando...';
    try { await onConfirm(); }
    catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = orig; }
  };
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────
function router() {
  const hash  = window.location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  const page  = parts[0] === 'paciente' ? 'pacientes' : (parts[0] || '');
  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', a.dataset.page === (page || 'inicio'))
  );
  if (!parts.length || hash === '/')            renderDashboard();
  else if (parts[0] === 'pacientes')            renderPacientes();
  else if (parts[0] === 'paciente' && parts[1]) renderFicha(parts[1], parts[2] || 'datos');
  else if (parts[0] === 'calendario')           renderCalendario();
  else                                          renderDashboard();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function renderDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-initial">Cargando...</div>';
  try {
    const s = await api('GET', '/stats');

    const proximasHTML = s.proximasSesiones.length
      ? s.proximasSesiones.map(x => `
          <div class="list-item">
            <div>
              <strong>${esc(x.apellido)}, ${esc(x.nombre)}</strong>
              <span class="text-light">${x.hora ? x.hora : 'Sin hora'}</span>
            </div>
            <a href="#/paciente/${x.paciente_id}" class="btn btn-sm btn-ghost">Ver →</a>
          </div>`).join('')
      : '<p class="empty-state">No hay sesiones programadas para hoy.</p>';

    const recordatorioHTML = s.recordatorioAumento > 0 ? `
      <div class="recordatorio-banner">
        💡 <strong>Recordatorio:</strong> Hay ${s.recordatorioAumento} paciente${s.recordatorioAumento > 1 ? 's' : ''}
        Particular${s.recordatorioAumento > 1 ? 'es' : ''} sin actualización en más de 3 meses.
        <a href="#/pacientes" onclick="setTimeout(()=>renderPacientes('','Particular'),100)" style="color:var(--primary);margin-left:.5rem">Revisar →</a>
      </div>` : '';

    app.innerHTML = `
      <div class="page-header">
        <h1>Panel Principal</h1>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="modalActualizarDesdeExcel()">⬆ Actualizar desde Excel</button>
          <button class="btn btn-ghost" onclick="modalModificarValores(${s.valorHoraVentana}, ${s.valorHoraVentanaGrupal})">⚙️ Valores hora</button>
        </div>
      </div>

      ${recordatorioHTML}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${s.totalPacientes}</div>
          <div class="stat-label">Pacientes activos</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📅</div>
          <div class="stat-value">${s.sesionesMes}</div>
          <div class="stat-label">Sesiones este mes</div>
        </div>
        <div class="stat-card ${s.pendientes > 0 ? 'stat-warning' : ''}">
          <div class="stat-icon">💰</div>
          <div class="stat-value">${s.pendientes}</div>
          <div class="stat-label">Pagos pendientes</div>
          ${s.pendientes > 0 ? `<div class="stat-sub">${fmtMoney(s.montoPendiente)}</div>` : ''}
        </div>
      </div>

      <p class="stats-section-label">Distribución por espacio</p>
      <div class="stats-grid">
        <div class="stat-card stat-particular">
          <div class="stat-icon">🧍</div>
          <div class="stat-value">${s.pacientesParticular}</div>
          <div class="stat-label">Particulares</div>
        </div>
        <div class="stat-card stat-ventana">
          <div class="stat-icon">🪟</div>
          <div class="stat-value">${s.pacientesVentana}</div>
          <div class="stat-label">La Ventana</div>
          <div class="stat-sub">${fmtMoney(s.valorHoraVentana)} ind · ${fmtMoney(s.valorHoraVentanaGrupal)} grup</div>
        </div>
        <div class="stat-card stat-casita">
          <div class="stat-icon">🏡</div>
          <div class="stat-value">${s.pacientesCasita}</div>
          <div class="stat-label">La Casita</div>
        </div>
      </div>

      <div class="card notas-dashboard-card">
        <div class="card-header">
          <h2>📝 Notas</h2>
          <button class="btn btn-ghost btn-sm" onclick="toggleNotasDashboard()">✏️ Editar</button>
        </div>
        <div id="notas-dashboard-vista" class="notas-dashboard-texto">
          ${s.notasDashboard
            ? esc(s.notasDashboard).replace(/\n/g, '<br>')
            : '<span class="text-light" style="font-style:italic">Sin notas. Hacé clic en Editar para agregar.</span>'}
        </div>
        <div id="notas-dashboard-editor" style="display:none;padding:.75rem 1.4rem 1rem">
          <textarea id="notas-dashboard-input" class="form-textarea"
            rows="4" placeholder="Escribí tus notas aquí..."
            style="width:100%;resize:vertical">${esc(s.notasDashboard)}</textarea>
          <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:.5rem">
            <button class="btn btn-ghost btn-sm" onclick="toggleNotasDashboard()">Cancelar</button>
            <button class="btn btn-primary btn-sm" onclick="guardarNotasDashboard()">Guardar</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>📅 Sesiones de hoy</h2>
          <a href="#/calendario" class="btn btn-sm btn-ghost">Ver calendario →</a>
        </div>
        <div class="list">${proximasHTML}</div>
      </div>`;
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="color:red;padding:2rem">Error: ${e.message}</p>`;
  }
}

function toggleNotasDashboard() {
  const vista   = document.getElementById('notas-dashboard-vista');
  const editor  = document.getElementById('notas-dashboard-editor');
  if (!vista || !editor) return;
  const editando = editor.style.display !== 'none';
  vista.style.display  = editando ? '' : 'none';
  editor.style.display = editando ? 'none' : '';
  if (!editando) document.getElementById('notas-dashboard-input')?.focus();
}

async function guardarNotasDashboard() {
  const texto = document.getElementById('notas-dashboard-input')?.value || '';
  try {
    await api('PUT', '/config/notas_dashboard', { valor: texto });
    // Actualizar vista sin recargar toda la página
    const vista = document.getElementById('notas-dashboard-vista');
    if (vista) {
      vista.innerHTML = texto
        ? esc(texto).replace(/\n/g, '<br>')
        : '<span class="text-light" style="font-style:italic">Sin notas. Hacé clic en Editar para agregar.</span>';
    }
    toggleNotasDashboard();
    showToast('Notas guardadas ✓');
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  }
}

// ─── MODAL: MODIFICAR VALORES HORA ───────────────────────────────────────────
function modalModificarValores(valorVentana, valorVentanaGrupal) {
  openModal('Modificar valores hora', `
    <p class="text-light" style="margin-bottom:1rem">
      Estos valores se aplican automáticamente al generar pagos para cada tipo de paciente.
    </p>
    <div class="form-group">
      <label class="form-label">🪟 La Ventana — sesiones individuales (pesos)</label>
      <input id="f-valor-ventana" class="form-input" type="number"
        min="0" step="100" value="${valorVentana || 38500}"
        style="font-size:1.1rem;font-weight:700;text-align:right">
    </div>
    <div class="form-group" style="margin-top:.75rem">
      <label class="form-label">🪟 La Ventana — sesiones familiares/vinculares (pesos)</label>
      <input id="f-valor-casita" class="form-input" type="number"
        min="0" step="100" value="${valorVentanaGrupal || 70000}"
        style="font-size:1.1rem;font-weight:700;text-align:right">
      <small class="text-light">Aplica cuando el tipo de sesión es Vincular o Familiar</small>
    </div>`,
  async () => {
    const vVentana = parseFloat(document.getElementById('f-valor-ventana').value);
    const vGrupal  = parseFloat(document.getElementById('f-valor-casita').value);
    if (isNaN(vVentana) || vVentana < 0) throw new Error('Ingresá un valor válido para individual.');
    if (isNaN(vGrupal)  || vGrupal < 0)  throw new Error('Ingresá un valor válido para grupal.');
    await Promise.all([
      api('PUT', '/config/valor_hora_ventana',        { valor: vVentana }),
      api('PUT', '/config/valor_hora_ventana_grupal', { valor: vGrupal }),
    ]);
    closeModal();
    showToast('Valores actualizados ✓');
    renderDashboard();
  }, 'Guardar');
}

// ─── MODAL: ACTUALIZAR DESDE EXCEL ───────────────────────────────────────────
function modalActualizarDesdeExcel() {
  openModal('Actualizar base de datos desde Excel', `
    <p>Subí el archivo Excel en el <strong>mismo formato que usa el exportar</strong> (3 hojas: Pacientes, Sesiones, Pagos).</p>

    <div class="import-rules">
      <div class="import-rule">
        <span class="import-rule-icon">🔄</span>
        <span>Si el registro <strong>ya existe</strong> (mismo ID) → se <strong>actualiza</strong> con los nuevos datos</span>
      </div>
      <div class="import-rule">
        <span class="import-rule-icon">➕</span>
        <span>Si el registro <strong>no tiene ID</strong> o es nuevo → se <strong>inserta</strong> como registro nuevo</span>
      </div>
      <div class="import-rule">
        <span class="import-rule-icon">🔒</span>
        <span>Los registros que <strong>no estén en el Excel</strong> no se tocan</span>
      </div>
    </div>

    <div class="form-group" style="margin-top:1rem">
      <label class="form-label">Archivo Excel (.xlsx)</label>
      <input id="f-archivo-import" class="form-input" type="file" accept=".xlsx">
    </div>
    <div id="import-progreso" style="display:none;padding:.75rem;background:var(--primary-light);border-radius:7px;font-size:.88rem;color:var(--primary)">
      ⏳ Procesando... esto puede tardar unos segundos.
    </div>`,
  async () => {
    const fileInput = document.getElementById('f-archivo-import');
    const file = fileInput?.files?.[0];
    if (!file) throw new Error('Seleccioná un archivo Excel primero.');
    if (!file.name.endsWith('.xlsx')) throw new Error('El archivo debe ser .xlsx (el mismo formato que usa "Exportar Excel").');

    document.getElementById('import-progreso').style.display = 'block';

    const formData = new FormData();
    formData.append('archivo', file);

    const res  = await fetch('/api/import-excel', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error al procesar el archivo.');

    closeModal();

    // Construir mensaje detallado
    const { pacientes: p, sesiones: s, pagos: pg } = data;
    const lineas = [
      `📋 Pacientes: ${p.actualizados} actualizados, ${p.insertados} nuevos${p.errores ? `, ${p.errores} con error` : ''}`,
      `📅 Sesiones: ${s.actualizadas} actualizadas, ${s.insertadas} nuevas${s.errores ? `, ${s.errores} con error` : ''}`,
      `💰 Pagos: ${pg.actualizados} actualizados, ${pg.insertados} nuevos${pg.errores ? `, ${pg.errores} con error` : ''}`,
    ];

    // Modal de resultado (no toast, porque hay mucha info)
    openModal('Importación completada ✓',
      `<div style="display:flex;flex-direction:column;gap:.75rem">
        ${lineas.map(l => `<div style="padding:.6rem .9rem;background:var(--primary-light);border-radius:7px;font-size:.9rem">${l}</div>`).join('')}
        ${(p.errores || s.errores || pg.errores)
          ? `<p class="text-light" style="font-size:.82rem;margin-top:.25rem">
               ⚠ Los errores suelen ocurrir cuando una sesión o pago nuevo no tiene un paciente reconocible en la columna "paciente".
             </p>`
          : '<p class="text-light" style="font-size:.82rem">Todo se procesó sin errores.</p>'}
      </div>`,
      async () => { closeModal(); renderDashboard(); },
      'Listo'
    );
    // Ocultar cancelar en este modal de resultado
    document.querySelector('.modal-footer .btn-ghost').style.display = 'none';

  }, 'Importar');
}


// ─── LISTA PACIENTES ─────────────────────────────────────────────────────────
let _filtroObraSocial = '';
let _filtroEstado     = 'activo'; // 'activo' | 'inactivo'
let _filtroDeudores   = false;

async function renderPacientes(buscar = '', obraSocial = _filtroObraSocial) {
  _filtroObraSocial = obraSocial;
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-initial">Cargando...</div>';
  try {
    const params = new URLSearchParams();
    if (buscar)             params.set('buscar',      buscar);
    if (obraSocial)         params.set('obra_social', obraSocial);
    if (_filtroEstado === 'inactivo') params.set('estado', 'inactivo');
    if (_filtroDeudores)    params.set('deudores',    '1');
    const qs   = params.toString() ? '?' + params.toString() : '';
    const list = await api('GET', `/pacientes${qs}`);

    const MOTIVO_BADGE = {
      alta:       'badge-success',
      desercion:  'badge-danger',
      derivacion: 'badge-info',
    };
    const MOTIVO_LABEL = {
      alta: 'Alta', desercion: 'Deserción', derivacion: 'Derivación',
    };

    const cardsHTML = list.length
      ? list.map(p => `
          <div class="paciente-card card">
            <div class="paciente-avatar">${esc(p.nombre[0])}${esc(p.apellido[0])}</div>
            <div class="paciente-info">
              <h3>${esc(p.apellido)}, ${esc(p.nombre)}
                ${p.motivo_baja ? `<span class="badge ${MOTIVO_BADGE[p.motivo_baja]||'badge-neutral'}" style="font-size:.7rem;margin-left:.3rem">${MOTIVO_LABEL[p.motivo_baja]||p.motivo_baja}</span>` : ''}
              </h3>
              <div class="paciente-meta">
                ${p.dni        ? `<span>DNI: ${esc(p.dni)}</span>` : ''}
                ${p.telefono   ? `<span>📞 ${esc(p.telefono)}</span>` : ''}
                ${p.diagnostico? `<span class="badge badge-info">${esc(p.diagnostico)}</span>` : ''}
                ${p.obra_social? `<span class="badge badge-neutral">${esc(p.obra_social)}</span>` : ''}
                <span>📋 ${p.total_sesiones} sesión${p.total_sesiones !== 1 ? 'es' : ''}</span>
                ${p.ultima_sesion ? `<span class="text-light">Última: ${fmtDate(p.ultima_sesion)}</span>` : ''}
                ${p.pagos_pendientes > 0
                  ? `<span class="badge badge-warning">⚠ ${fmtMoney(p.monto_pendiente)} pendiente</span>`
                  : ''}
                ${p.credito > 0 ? `<span class="badge badge-success">Crédito: ${fmtMoney(p.credito)}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:.4rem;flex-shrink:0">
              ${_filtroEstado === 'inactivo' ? `
                <button class="btn btn-ghost btn-sm" onclick="reactivarPaciente(${p.id}, '${esc(p.nombre)}')">↩ Reactivar</button>
                <button class="btn btn-danger btn-sm" onclick="eliminarPacienteDefinitivo(${p.id}, '${esc(p.nombre)} ${esc(p.apellido)}')">🗑 Eliminar</button>
              ` : `
                <a href="#/paciente/${p.id}" class="btn btn-primary btn-sm">Ver ficha →</a>
              `}
            </div>
          </div>`).join('')
      : `<div class="empty-state">
           <p>No se encontraron pacientes con ese criterio.</p>
         </div>`;

    const filtrosEspacio = [
      { val: '',           label: 'Todos los espacios' },
      { val: 'Particular', label: '🧍 Particular' },
      { val: 'La Ventana', label: '🪟 La Ventana' },
      { val: 'La Casita',  label: '🏡 La Casita'  },
    ];

    app.innerHTML = `
      <div class="page-header">
        <h1>Pacientes <span style="font-size:1rem;font-weight:400;color:var(--text-light)">(${list.length})</span></h1>
        <button class="btn btn-primary" onclick="modalNuevoPaciente()">+ Nuevo paciente</button>
      </div>

      <div class="pacientes-toolbar">
        <div class="search-bar" style="margin:0;flex:1;min-width:180px">
          <input id="search-input" class="form-input"
            type="text" placeholder="🔍 Buscar por nombre, apellido o DNI..."
            value="${esc(buscar)}" oninput="debounceSearch(this.value)">
        </div>
        <div class="filtro-chips">
          <button class="chip ${_filtroEstado==='activo'?'chip-active':''}"
            onclick="_setFiltroEstado('activo')">Activas</button>
          <button class="chip ${_filtroEstado==='inactivo'?'chip-active chip-inactive':''}"
            onclick="_setFiltroEstado('inactivo')">Inactivos</button>
          <button class="chip ${_filtroDeudores?'chip-active chip-deudor':''}"
            onclick="_toggleDeudores()">💸 Deudoras</button>
        </div>
      </div>

      <div class="filtro-chips" style="margin-bottom:1rem;flex-wrap:wrap">
        ${filtrosEspacio.map(f => `
          <button class="chip ${obraSocial === f.val ? 'chip-active' : ''}"
            onclick="renderPacientes(document.getElementById('search-input')?.value||'', '${f.val}')">
            ${f.label}
          </button>`).join('')}
      </div>

      <div class="paciente-list">${cardsHTML}</div>`;

    if (buscar) {
      const inp = document.getElementById('search-input');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="color:red;padding:2rem">Error: ${e.message}</p>`;
  }
}

function _setFiltroEstado(val) {
  _filtroEstado = val;
  renderPacientes(document.getElementById('search-input')?.value||'', _filtroObraSocial);
}
function _toggleDeudores() {
  _filtroDeudores = !_filtroDeudores;
  renderPacientes(document.getElementById('search-input')?.value||'', _filtroObraSocial);
}

let _searchTimer;
function debounceSearch(val) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => renderPacientes(val, _filtroObraSocial), 300);
}

// ─── FICHA PACIENTE ──────────────────────────────────────────────────────────
async function renderFicha(id, tab = 'datos') {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-initial">Cargando...</div>';
  try {
    const p = await api('GET', `/pacientes/${id}`);
    cache.paciente = p;

    const tabs = [
      { id: 'datos',    label: '👤 Datos' },
      { id: 'sesiones', label: '📅 Sesiones' },
      { id: 'pagos',    label: '💰 Pagos' },
    ];

    let tabContent = '';
    if (tab === 'datos')    tabContent = renderDatosTab();
    if (tab === 'sesiones') tabContent = await renderSesionesTab(id);
    if (tab === 'pagos')    tabContent = await renderPagosTab(id);

    app.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <a href="#/pacientes" class="btn btn-ghost btn-sm">← Volver</a>
          <h1>${esc(p.apellido)}, ${esc(p.nombre)}</h1>
        </div>
        <button class="btn btn-danger btn-sm" onclick="confirmarBajaPaciente()">Dar de baja</button>
      </div>
      <div class="tabs">
        ${tabs.map(t => `
          <button class="tab ${tab === t.id ? 'active' : ''}"
            onclick="window.location.hash='#/paciente/${id}/${t.id}'">${t.label}
          </button>`).join('')}
      </div>
      <div class="tab-content">${tabContent}</div>`;
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="color:red;padding:2rem">Error: ${e.message}</p>`;
  }
}

// ─── TAB: DATOS ──────────────────────────────────────────────────────────────
function renderDatosTab() {
  const p = cache.paciente;

  const campo = (label, val) => val
    ? `<div class="dato-item"><span class="dato-label">${label}</span><span class="dato-value">${esc(String(val))}</span></div>`
    : '';

  const seccion = (titulo, items) => {
    const html = items.map(([l, v]) => campo(l, v)).join('');
    return html ? `<div class="section-divider">${titulo}</div><div class="datos-grid">${html}</div>` : '';
  };

  const bloqueTexto = (titulo, val) => val
    ? `<div class="datos-extra-label">${titulo}</div><p class="text-block">${esc(val)}</p>`
    : '';

  return `
    <div class="card">
      <div class="card-header">
        <h2>Datos personales</h2>
        <button class="btn btn-primary btn-sm" onclick="modalEditarPaciente()">✏️ Editar</button>
      </div>

      ${seccion('Datos personales', [
        ['Nombre completo',    `${p.apellido}, ${p.nombre}`],
        ['DNI',                p.dni],
        ['Edad',               p.edad ? `${p.edad} años` : null],
        ['Teléfono',           p.telefono],
        ['Obra Social',        p.obra_social],
        ['Valor hora',         p.obra_social === 'Particular' && p.valor_hora ? fmtMoney(p.valor_hora) : null],
      ])}

      ${seccion('Datos clínicos', [
        ['Diagnóstico',           p.diagnostico],
        ['IMC',                   p.imc],
        ['Frecuencia',            p.frecuencia],
        ['Medicación',            p.medicacion],
        ['Estado de tratamiento', p.estado_tto],
        ['Inicio de tratamiento', p.fecha_inicio_tto ? fmtDate(p.fecha_inicio_tto) : null],
      ])}

      ${p.conductas_actuales ? bloqueTexto('Conductas actuales', p.conductas_actuales) : ''}

      ${seccion('Equipo tratante', [
        ['Médica clínica', p.medica_clinica],
        ['Psiquiatra',     p.psiquiatra],
        ['Nutricionista',  p.nutricionista],
      ])}

      ${(p.contacto_emergencia_nombre || p.contacto_emergencia_tel)
        ? seccion('Contacto de emergencia', [
            ['Nombre',    p.contacto_emergencia_nombre],
            ['Teléfono',  p.contacto_emergencia_tel],
          ])
        : ''}

      ${(() => {
        let integrantes = [];
        try { integrantes = JSON.parse(p.red_familiar || '[]'); } catch {}
        if (!integrantes.length) return '';
        return `<div class="section-divider">Red familiar</div>
          <div class="datos-grid">
            ${integrantes.map(m => `
              <div class="dato-item">
                <span class="dato-label">${esc(m.vinculo||'Integrante')}</span>
                <span class="dato-value">${esc(m.nombre)}${m.telefono ? ` · ${esc(m.telefono)}` : ''}</span>
              </div>`).join('')}
          </div>`;
      })()}

      ${bloqueTexto('Motivo de consulta', p.motivo_consulta)}
      ${bloqueTexto('Antecedentes relevantes', p.antecedentes)}
      ${bloqueTexto('Objetivos terapéuticos', p.objetivos)}
      ${bloqueTexto('Notas generales', p.notas_generales)}

      ${!p.motivo_consulta && !p.notas_generales && !p.diagnostico ? `
        <p class="empty-state" style="padding:1.5rem">
          No hay datos clínicos cargados aún.
          <button class="btn-link" onclick="modalEditarPaciente()">Editar para agregar →</button>
        </p>` : ''}
    </div>`;
}

// ─── TAB: SESIONES ───────────────────────────────────────────────────────────
async function renderSesionesTab(pacienteId) {
  const sesiones = await api('GET', `/pacientes/${pacienteId}/sesiones`);
  cache.sesiones = sesiones;

  const itemsHTML = sesiones.length
    ? sesiones.map(s => `
        <div class="sesion-item">
          <div class="sesion-header">
            <div style="display:flex;align-items:center;gap:.6rem">
              <strong>${fmtDate(s.fecha)}</strong>
              ${s.hora ? `<span class="text-light">${s.hora}</span>` : ''}
              <span class="badge badge-neutral">${s.duracion_minutos} min</span>
            </div>
            <div class="sesion-actions">
              <button class="btn btn-sm btn-ghost" onclick="modalEditarSesion(${s.id}, ${pacienteId})">✏️ Editar</button>
              <button class="btn btn-sm btn-danger" onclick="confirmarEliminarSesion(${s.id}, ${pacienteId})">🗑</button>
            </div>
          </div>
          ${s.notas
            ? `<p class="sesion-notas">${esc(s.notas)}</p>`
            : `<p class="text-light" style="font-style:italic;font-size:.85rem">Sin notas registradas.</p>`}
        </div>`).join('')
    : '<p class="empty-state">No hay sesiones registradas para este paciente.</p>';

  return `
    <div class="card">
      <div class="card-header">
        <h2>Sesiones (${sesiones.length})</h2>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="modalExportarHistoria(${pacienteId})">📄 Exportar Historia</button>
          <button class="btn btn-ghost btn-sm" onclick="modalImportarHistorial(${pacienteId})">📥 Importar historial</button>
          <button class="btn btn-primary" onclick="modalNuevaSesion(${pacienteId})">+ Nueva sesión</button>
        </div>
      </div>
      <div class="sesion-list">${itemsHTML}</div>
    </div>`;
}

// ─── MODAL: IMPORTAR HISTORIAL CLÍNICO ───────────────────────────────────────
function modalImportarHistorial(pacienteId) {
  const anioActual = new Date().getFullYear();
  openModal('Importar historial clínico', `
    <p>Subí un archivo <strong>.docx</strong> con notas de sesiones anteriores.</p>
    <div class="import-rules" style="margin-top:.75rem">
      <div class="import-rule">
        <span class="import-rule-icon">📅</span>
        <span>El archivo debe tener <strong>fechas como títulos</strong> (ej: <code>16/3</code>, <code>6/4</code>) y el texto de la sesión a continuación</span>
      </div>
      <div class="import-rule">
        <span class="import-rule-icon">⏰</span>
        <span>Todas las sesiones importadas quedan con hora <strong>09:00</strong> — podés editarlas después</span>
      </div>
      <div class="import-rule">
        <span class="import-rule-icon">🔒</span>
        <span>Si ya existe una sesión con la misma fecha, se <strong>saltea</strong> sin modificarla</span>
      </div>
    </div>
    <div class="form-row" style="margin-top:1rem">
      <div class="form-group">
        <label class="form-label">Archivo .docx</label>
        <input id="f-historial-file" class="form-input" type="file" accept=".docx">
      </div>
      <div class="form-group">
        <label class="form-label">Año de las sesiones</label>
        <input id="f-historial-anio" class="form-input" type="number"
          value="${anioActual}" min="2000" max="${anioActual + 1}"
          style="font-size:1.05rem;font-weight:600;text-align:center">
      </div>
    </div>
    <div id="historial-progreso" style="display:none;margin-top:.5rem;padding:.65rem .9rem;background:var(--primary-light);border-radius:7px;font-size:.875rem;color:var(--primary)">
      ⏳ Procesando archivo...
    </div>`,
  async () => {
    const file = document.getElementById('f-historial-file')?.files?.[0];
    const anio = document.getElementById('f-historial-anio').value;
    if (!file) throw new Error('Seleccioná un archivo .docx primero.');
    if (!file.name.endsWith('.docx')) throw new Error('El archivo debe ser .docx');

    document.getElementById('historial-progreso').style.display = 'block';

    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('anio', anio);

    const res  = await fetch(`/api/pacientes/${pacienteId}/importar-historial`, {
      method: 'POST', body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al procesar el archivo.');

    closeModal();

    // Modal de resultado
    openModal('Historial importado ✓',
      `<div style="display:flex;flex-direction:column;gap:.65rem">
        <div style="padding:.7rem 1rem;background:var(--primary-light);border-radius:7px;font-size:.95rem">
          📅 <strong>${data.insertadas}</strong> sesión${data.insertadas !== 1 ? 'es' : ''} importada${data.insertadas !== 1 ? 's' : ''}
        </div>
        ${data.saltadas > 0 ? `
        <div style="padding:.7rem 1rem;background:var(--bg);border-radius:7px;font-size:.9rem;color:var(--text-light)">
          ⏭ ${data.saltadas} sesión${data.saltadas !== 1 ? 'es' : ''} ya existía${data.saltadas !== 1 ? 'n' : ''} (no modificada${data.saltadas !== 1 ? 's' : ''})
        </div>` : ''}
        <p class="text-light" style="font-size:.82rem">
          Las sesiones quedaron con hora 09:00. Podés editarlas individualmente si necesitás cambiar la hora o el tipo.
        </p>
      </div>`,
      async () => { closeModal(); renderFicha(pacienteId, 'sesiones'); },
      'Ver sesiones'
    );
    document.querySelector('.modal-footer .btn-ghost').style.display = 'none';
  }, 'Importar');
}


async function renderPagosTab(pacienteId) {
  const [pagos, creditoRes] = await Promise.all([
    api('GET', `/pacientes/${pacienteId}/pagos`),
    fetch(`/api/pacientes/${pacienteId}/credito`).then(r => r.ok ? r.json() : { saldo: 0 }).catch(() => ({ saldo: 0 })),
  ]);
  cache.pagos = pagos;
  const credito = creditoRes?.saldo || 0;

  const totalPagadoPesos  = pagos.filter(p => p.estado==='pagado' && p.moneda==='pesos').reduce((s,p)=>s+p.monto,0);
  const totalPagadoUSD    = pagos.filter(p => p.estado==='pagado' && p.moneda==='dolares').reduce((s,p)=>s+p.monto,0);
  const totalPendiente    = pagos.filter(p => p.estado!=='pagado').reduce((s,p)=>s+p.monto,0);
  const badgeCls = { pagado:'badge-success', pendiente:'badge-warning' };

  const tableHTML = pagos.length
    ? `<table class="table">
        <thead><tr>
          <th>Fecha</th><th>Monto</th><th>Moneda</th><th>Estado</th>
          <th>Método</th><th>Notas</th><th></th>
        </tr></thead>
        <tbody>
          ${pagos.map(p => `
            <tr>
              <td>${fmtDate(p.fecha)}</td>
              <td><strong>${p.moneda==='dolares'?'USD':'$'}&nbsp;${Number(p.monto).toLocaleString('es-AR')}</strong></td>
              <td><span class="badge ${p.moneda==='dolares'?'badge-info':'badge-neutral'}">${p.moneda==='dolares'?'USD':'Pesos'}</span></td>
              <td><span class="badge ${badgeCls[p.estado]||'badge-neutral'}">${p.estado}</span></td>
              <td>${esc(p.metodo)}</td>
              <td>${esc(p.notas)||'–'}</td>
              <td class="td-actions">
                ${p.estado === 'pendiente'
                  ? `<button class="btn btn-sm btn-primary" onclick="pagoRapido(${p.id}, ${pacienteId})" title="Marcar como pagado">✓ Cobrado</button>`
                  : ''}
                <button class="btn btn-sm btn-ghost" onclick="modalEditarPago(${p.id}, ${pacienteId})">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="confirmarEliminarPago(${p.id}, ${pacienteId})">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : '<p class="empty-state">No hay pagos registrados para este paciente.</p>';

  return `
    <div class="card">
      <div class="card-header">
        <h2>Pagos</h2>
        <button class="btn btn-primary" onclick="modalNuevoPago(${pacienteId})">+ Registrar pago</button>
      </div>
      <div class="pagos-summary">
        <div class="pago-sum-item"><span>Cobrado (pesos)</span><strong class="text-success">${fmtMoney(totalPagadoPesos)}</strong></div>
        ${totalPagadoUSD > 0 ? `<div class="pago-sum-item"><span>Cobrado (USD)</span><strong class="text-success">USD&nbsp;${Number(totalPagadoUSD).toLocaleString('es-AR')}</strong></div>` : ''}
        <div class="pago-sum-item"><span>Pendiente</span><strong class="${totalPendiente>0?'text-warning':''}">${fmtMoney(totalPendiente)}</strong></div>
        ${credito > 0 ? `<div class="pago-sum-item"><span>Crédito disponible</span><strong class="text-success">${fmtMoney(credito)}</strong></div>` : ''}
      </div>
      <div class="table-wrapper">${tableHTML}</div>
    </div>`;
}

// ─── FORM: PACIENTE ──────────────────────────────────────────────────────────

// Muestra/oculta el campo valor_hora según obra social seleccionada
function toggleValorHora(val) {
  const g = document.getElementById('valor-hora-group');
  if (g) g.style.display = val === 'Particular' ? '' : 'none';
}

function _formPaciente(p = {}) {
  const selOS  = (v) => v === p.obra_social  ? 'selected' : '';
  const selFrq = (v) => v === p.frecuencia   ? 'selected' : '';
  const mostrarValorHora = (p.obra_social || '') === 'Particular';

  return `
    <div class="form-section-title">Datos personales</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input id="f-nombre" class="form-input" type="text" value="${esc(p.nombre||'')}" placeholder="Ej: María">
      </div>
      <div class="form-group">
        <label class="form-label">Apellido *</label>
        <input id="f-apellido" class="form-input" type="text" value="${esc(p.apellido||'')}" placeholder="Ej: González">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">DNI</label>
        <input id="f-dni" class="form-input" type="text" value="${esc(p.dni||'')}" placeholder="Ej: 30456789">
      </div>
      <div class="form-group">
        <label class="form-label">Edad</label>
        <input id="f-edad" class="form-input" type="number" min="1" max="120" value="${p.edad||''}" placeholder="Ej: 25">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input id="f-tel" class="form-input" type="text" value="${esc(p.telefono||'')}" placeholder="Ej: 11-4567-8901">
      </div>
      <div class="form-group">
        <label class="form-label">Obra Social</label>
        <select id="f-os" class="form-select" onchange="toggleValorHora(this.value)">
          <option value="">– Sin especificar –</option>
          <option value="Particular" ${selOS('Particular')}>Particular</option>
          <option value="La Ventana" ${selOS('La Ventana')}>La Ventana</option>
        </select>
      </div>
    </div>
    <div id="valor-hora-group" class="form-group" style="${mostrarValorHora ? '' : 'display:none'}">
      <label class="form-label">
        Valor hora a cobrar *
        <span style="font-weight:normal;color:var(--text-light)">(obligatorio para Particular)</span>
      </label>
      <input id="f-valor-hora" class="form-input" type="number"
        min="0" step="100" value="${p.valor_hora||''}" placeholder="Ej: 15000"
        style="font-size:1.05rem;font-weight:600">
    </div>

    <div class="form-section-title">Datos clínicos</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Diagnóstico</label>
        <input id="f-dx" class="form-input" type="text" value="${esc(p.diagnostico||'')}" placeholder="Ej: ANr, BN, OSFED">
      </div>
      <div class="form-group">
        <label class="form-label">IMC</label>
        <input id="f-imc" class="form-input" type="number" step="0.01" min="5" max="80" value="${p.imc||''}" placeholder="Ej: 21.5">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Conductas actuales</label>
      <textarea id="f-conductas" class="form-textarea" rows="2"
        placeholder="Ej: restricción, vómitos, atracones, AF...">${esc(p.conductas_actuales||'')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Frecuencia de sesiones</label>
        <select id="f-frecuencia" class="form-select">
          <option value="">– Sin especificar –</option>
          <option value="Semanal"        ${selFrq('Semanal')}>Semanal</option>
          <option value="Quincenal"      ${selFrq('Quincenal')}>Quincenal</option>
          <option value="Cada 3 semanas" ${selFrq('Cada 3 semanas')}>Cada 3 semanas</option>
          <option value="Mensual"        ${selFrq('Mensual')}>Mensual</option>
          <option value="Otra"           ${selFrq('Otra')}>Otra</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Medicación</label>
        <input id="f-medicacion" class="form-input" type="text" value="${esc(p.medicacion||'')}" placeholder="Ej: fluoxetina 20mg">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado de tratamiento</label>
        <input id="f-tto" class="form-input" type="text" value="${esc(p.estado_tto||'')}" placeholder="Ej: RP yo / EE">
      </div>
      <div class="form-group">
        <label class="form-label">Inicio de tratamiento</label>
        <input id="f-inicio" class="form-input" type="date" value="${p.fecha_inicio_tto||''}">
      </div>
    </div>

    <div class="form-section-title">Equipo tratante</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Médica clínica</label>
        <input id="f-medica" class="form-input" type="text" value="${esc(p.medica_clinica||'')}" placeholder="Nombre y/o institución">
      </div>
      <div class="form-group">
        <label class="form-label">Psiquiatra</label>
        <input id="f-psiquiatra" class="form-input" type="text" value="${esc(p.psiquiatra||'')}" placeholder="Nombre y/o institución">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nutricionista</label>
      <input id="f-nutri" class="form-input" type="text" value="${esc(p.nutricionista||'')}" placeholder="Nombre y/o institución">
    </div>

    <div class="form-section-title">Contacto de emergencia</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nombre</label>
        <input id="f-ce-nombre" class="form-input" type="text" value="${esc(p.contacto_emergencia_nombre||'')}" placeholder="Nombre completo">
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input id="f-ce-tel" class="form-input" type="text" value="${esc(p.contacto_emergencia_tel||'')}" placeholder="Ej: 11-5678-9012">
      </div>
    </div>

    <div class="form-section-title">Red familiar</div>
    <div id="red-familiar-container">
      ${_renderRedFamiliar(p.red_familiar)}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" style="margin-top:.5rem"
      onclick="_agregarIntegranteRed()">+ Agregar integrante</button>

    <div class="form-section-title">Historia clínica</div>
    <div class="form-group">
      <label class="form-label">Motivo de consulta</label>
      <textarea id="f-motivo" class="form-textarea" rows="3"
        placeholder="Motivo de consulta inicial...">${esc(p.motivo_consulta||'')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Notas generales</label>
      <textarea id="f-notas" class="form-textarea" rows="4"
        placeholder="Observaciones generales, evolución...">${esc(p.notas_generales||'')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Antecedentes relevantes</label>
      <textarea id="f-antecedentes" class="form-textarea" rows="4"
        placeholder="Antecedentes clínicos, familiares, personales...">${esc(p.antecedentes||'')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Objetivos terapéuticos</label>
      <textarea id="f-objetivos" class="form-textarea" rows="4"
        placeholder="Objetivos acordados para el tratamiento...">${esc(p.objetivos||'')}</textarea>
    </div>`;
}

function _renderRedFamiliar(redFamiliarJSON) {
  let integrantes = [];
  try { integrantes = JSON.parse(redFamiliarJSON || '[]'); } catch { integrantes = []; }
  if (!integrantes.length) integrantes = [{ nombre: '', vinculo: '', telefono: '' }];
  return integrantes.map((m, i) => `
    <div class="red-familiar-row" id="rf-row-${i}">
      <div class="form-row" style="flex:1">
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input rf-nombre" type="text" value="${esc(m.nombre||'')}" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label class="form-label">Vínculo</label>
          <input class="form-input rf-vinculo" type="text" value="${esc(m.vinculo||'')}" placeholder="Madre, Padre, Pareja...">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-input rf-telefono" type="text" value="${esc(m.telefono||'')}" placeholder="Ej: 11-5678-9012">
        </div>
      </div>
      ${i > 0 ? `<button type="button" class="btn btn-danger btn-sm" style="align-self:flex-end;margin-bottom:.1rem"
        onclick="document.getElementById('rf-row-${i}').remove()">🗑</button>` : ''}
    </div>`).join('');
}

function _agregarIntegranteRed() {
  const c = document.getElementById('red-familiar-container');
  const i = c.querySelectorAll('.red-familiar-row').length;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="red-familiar-row" id="rf-row-${i}">
      <div class="form-row" style="flex:1">
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input rf-nombre" type="text" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label class="form-label">Vínculo</label>
          <input class="form-input rf-vinculo" type="text" placeholder="Madre, Padre, Pareja...">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-input rf-telefono" type="text" placeholder="Ej: 11-5678-9012">
        </div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" style="align-self:flex-end;margin-bottom:.1rem"
        onclick="this.closest('.red-familiar-row').remove()">🗑</button>
    </div>`;
  c.appendChild(div.firstElementChild);
}

function _collectRedFamiliar() {
  const rows = document.querySelectorAll('.red-familiar-row');
  const integrantes = [];
  rows.forEach(row => {
    const nombre   = row.querySelector('.rf-nombre')?.value.trim() || '';
    const vinculo  = row.querySelector('.rf-vinculo')?.value.trim() || '';
    const telefono = row.querySelector('.rf-telefono')?.value.trim() || '';
    if (nombre || vinculo || telefono) integrantes.push({ nombre, vinculo, telefono });
  });
  return integrantes.length ? JSON.stringify(integrantes) : null;
}


function _collectPaciente() {
  const nombre      = document.getElementById('f-nombre').value.trim();
  const apellido    = document.getElementById('f-apellido').value.trim();
  const obra_social = document.getElementById('f-os').value;
  if (!nombre || !apellido) throw new Error('El nombre y apellido son obligatorios.');
  const imcVal       = parseFloat(document.getElementById('f-imc').value);
  const valorHoraVal = parseFloat(document.getElementById('f-valor-hora')?.value || '');
  if (obra_social === 'Particular' && (isNaN(valorHoraVal) || valorHoraVal <= 0)) {
    throw new Error('El valor hora es obligatorio para pacientes Particulares.');
  }
  return {
    nombre, apellido,
    dni:               document.getElementById('f-dni').value.trim()          || null,
    edad:              parseInt(document.getElementById('f-edad').value) || null,
    telefono:          document.getElementById('f-tel').value.trim()          || null,
    obra_social:       obra_social                                             || null,
    valor_hora:        !isNaN(valorHoraVal) && valorHoraVal > 0 ? valorHoraVal: null,
    diagnostico:       document.getElementById('f-dx').value.trim()           || null,
    imc:               !isNaN(imcVal) && imcVal > 0 ? imcVal                  : null,
    conductas_actuales:document.getElementById('f-conductas').value.trim()    || null,
    frecuencia:        document.getElementById('f-frecuencia').value          || null,
    medicacion:        document.getElementById('f-medicacion').value.trim()   || null,
    estado_tto:        document.getElementById('f-tto').value.trim()          || null,
    fecha_inicio_tto:  document.getElementById('f-inicio').value              || null,
    medica_clinica:    document.getElementById('f-medica').value.trim()       || null,
    psiquiatra:        document.getElementById('f-psiquiatra').value.trim()   || null,
    nutricionista:     document.getElementById('f-nutri').value.trim()        || null,
    contacto_emergencia_nombre: document.getElementById('f-ce-nombre').value.trim() || null,
    contacto_emergencia_tel:    document.getElementById('f-ce-tel').value.trim()    || null,
    red_familiar:      _collectRedFamiliar(),
    motivo_consulta:   document.getElementById('f-motivo').value.trim()       || null,
    notas_generales:   document.getElementById('f-notas').value.trim()        || null,
    antecedentes:      document.getElementById('f-antecedentes').value.trim() || null,
    objetivos:         document.getElementById('f-objetivos').value.trim()    || null,
  };
}

function modalNuevoPaciente() {
  openModal('Nuevo paciente', _formPaciente(), async () => {
    const data = _collectPaciente();
    const { id } = await api('POST', '/pacientes', data);
    closeModal();
    showToast('Paciente creado ✓');
    window.location.hash = `#/paciente/${id}`;
  });
}

function modalEditarPaciente() {
  const p = cache.paciente;
  openModal('Editar paciente', _formPaciente(p), async () => {
    const data = _collectPaciente();
    await api('PUT', `/pacientes/${p.id}`, data);
    closeModal();
    showToast('Datos actualizados ✓');
    renderFicha(p.id, 'datos');
  });
}

function modalNuevaSesion(pacienteId) {
  openModal('Nueva sesión', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input id="f-fecha" class="form-input" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Hora *</label>
        ${_selectHora()}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Duración (minutos)</label>
        <input id="f-dur" class="form-input" type="number" value="45" min="1" max="480">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de sesión</label>
        <div class="tipo-sesion-group">
          ${['individual','vincular','familiar','equipo'].map(t => `
            <label class="tipo-sesion-option">
              <input type="radio" name="tipo_sesion" value="${t}" ${t==='individual'?'checked':''}>
              <span>${t.charAt(0).toUpperCase()+t.slice(1)}</span>
            </label>`).join('')}
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas de sesión</label>
      <textarea id="f-notas" class="form-textarea" rows="6"
        placeholder="Temas tratados, observaciones, evolución..."></textarea>
    </div>
    <p class="text-light" style="font-size:.82rem;margin-top:.25rem">
      💡 Al guardar se generará automáticamente un pago pendiente (salvo La Casita).
    </p>`,
  async () => {
    const fecha = document.getElementById('f-fecha').value;
    const hora  = document.getElementById('f-hora').value;
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!hora)  throw new Error('La hora es obligatoria.');
    const tipoSel = document.querySelector('input[name="tipo_sesion"]:checked');
    const result = await api('POST', '/sesiones', {
      paciente_id: pacienteId, fecha, hora,
      duracion_minutos: parseInt(document.getElementById('f-dur').value) || 45,
      tipo_sesion:      tipoSel ? tipoSel.value : 'individual',
      notas:            document.getElementById('f-notas').value.trim() || null,
    });
    closeModal();
    let msg = 'Sesión registrada ✓';
    if (result.pago?.credito_usado) msg += ` · Crédito usado: ${fmtMoney(result.pago.credito_usado)}`;
    else if (result.pago?.monto > 0) msg += ` · Pago de ${fmtMoney(result.pago.monto)} generado`;
    if (result.gcal) msg += ' · 📅 Google Calendar';
    showToast(msg);
    renderFicha(pacienteId, 'sesiones');
  });
}

function modalEditarSesion(sesionId, pacienteId) {
  const s = cache.sesiones.find(x => x.id === sesionId);
  if (!s) return showToast('Error: sesión no encontrada', 'error');
  openModal('Editar sesión', `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input id="f-fecha" class="form-input" type="date" value="${s.fecha||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Hora *</label>
        ${_selectHora(s.hora||'')}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Duración (minutos)</label>
        <input id="f-dur" class="form-input" type="number" value="${s.duracion_minutos||45}" min="1" max="480">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de sesión</label>
        <div class="tipo-sesion-group">
          ${['individual','vincular','familiar','equipo'].map(t => `
            <label class="tipo-sesion-option">
              <input type="radio" name="tipo_sesion" value="${t}" ${(s.tipo_sesion||'individual')===t?'checked':''}>
              <span>${t.charAt(0).toUpperCase()+t.slice(1)}</span>
            </label>`).join('')}
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas de sesión</label>
      <textarea id="f-notas" class="form-textarea" rows="6">${esc(s.notas||'')}</textarea>
    </div>`,
  async () => {
    const fecha = document.getElementById('f-fecha').value;
    const hora  = document.getElementById('f-hora').value;
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (!hora)  throw new Error('La hora es obligatoria.');
    const tipoSel = document.querySelector('input[name="tipo_sesion"]:checked');
    await api('PUT', `/sesiones/${s.id}`, {
      fecha, hora,
      duracion_minutos: parseInt(document.getElementById('f-dur').value) || 45,
      tipo_sesion: tipoSel ? tipoSel.value : 'individual',
      notas: document.getElementById('f-notas').value.trim() || null,
    });
    closeModal(); showToast('Sesión actualizada ✓'); renderFicha(pacienteId, 'sesiones');
  });
}

// ─── MODAL: PAGOS ────────────────────────────────────────────────────────────
function _formPago(p = {}) {
  const sel = (v, opt) => opt === v ? 'selected' : '';
  const metodoDefault = p.metodo || 'transferencia';
  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input id="f-fecha" class="form-input" type="date" value="${p.fecha||today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Monto *</label>
        <input id="f-monto" class="form-input" type="number" min="0" step="1" value="${p.monto||''}" placeholder="Ej: 5000">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Moneda</label>
        <select id="f-moneda" class="form-select">
          <option value="pesos"   ${sel(p.moneda||'pesos','pesos')}>Pesos $</option>
          <option value="dolares" ${sel(p.moneda,'dolares')}>Dólares USD</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select id="f-estado" class="form-select">
          <option value="pagado"    ${sel(p.estado,'pagado')}>Pagado</option>
          <option value="pendiente" ${sel(p.estado,'pendiente')}>Pendiente</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Método de pago</label>
      <select id="f-metodo" class="form-select">
        <option value="transferencia" ${sel(metodoDefault,'transferencia')}>Transferencia</option>
        <option value="efectivo"      ${sel(metodoDefault,'efectivo')}>Efectivo</option>
        <option value="tarjeta"       ${sel(metodoDefault,'tarjeta')}>Tarjeta</option>
        <option value="paypal"        ${sel(metodoDefault,'paypal')}>PayPal</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <input id="f-notas" class="form-input" type="text"
        value="${esc(p.notas||'')}" placeholder="Ej: Pago sesiones de junio">
    </div>`;
}

// Pago rápido: marca como pagado directamente sin modal
async function pagoRapido(pagoId, pacienteId) {
  try {
    const res = await fetch(`/api/pagos/${pagoId}/pagar`, { method: 'POST' });
    if (!res.ok) throw new Error('Error al registrar el pago');
    showToast('✓ Cobrado');
    renderFicha(pacienteId, 'pagos');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function modalNuevoPago(pacienteId) {
  const p = cache.paciente;
  const montoDefault = p?.obra_social === 'Particular' && p.valor_hora ? p.valor_hora : '';

  // Mostrar cuánto hay pendiente para dar contexto
  const totalPendiente = cache.pagos
    .filter(x => x.estado === 'pendiente')
    .reduce((s, x) => s + x.monto, 0);

  const infoPendiente = totalPendiente > 0
    ? `<p class="text-light" style="font-size:.85rem;margin-bottom:.75rem">
        💡 Este paciente tiene <strong>${fmtMoney(totalPendiente)}</strong> en pagos pendientes.
        El monto que ingreses se aplicará primero a cancelarlos, y el sobrante quedará como crédito.
      </p>`
    : `<p class="text-light" style="font-size:.85rem;margin-bottom:.75rem">
        💡 No hay pagos pendientes. El monto quedará como crédito para las próximas sesiones.
      </p>`;

  openModal('Registrar pago', `
    ${infoPendiente}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Monto *</label>
        <input id="f-monto" class="form-input" type="number" min="0" step="1"
          value="${montoDefault}" placeholder="Ej: 30000"
          style="font-size:1.1rem;font-weight:700;text-align:right">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input id="f-fecha" class="form-input" type="date" value="${today()}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Moneda</label>
        <select id="f-moneda" class="form-select">
          <option value="pesos">Pesos $</option>
          <option value="dolares">Dólares USD</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Método</label>
        <select id="f-metodo" class="form-select">
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <input id="f-notas" class="form-input" type="text" placeholder="Opcional">
    </div>`,
  async () => {
    const monto = parseFloat(document.getElementById('f-monto').value);
    const fecha = document.getElementById('f-fecha').value;
    if (isNaN(monto) || monto <= 0) throw new Error('Ingresá un monto válido.');
    if (!fecha) throw new Error('La fecha es obligatoria.');

    const res  = await fetch(`/api/pacientes/${pacienteId}/registrar-pago`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto, fecha,
        moneda: document.getElementById('f-moneda').value,
        metodo: document.getElementById('f-metodo').value,
        notas:  document.getElementById('f-notas').value.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    closeModal();

    // Toast con resumen del resultado
    const partes = [];
    if (data.pagadosAhora?.length) {
      const n = data.pagadosAhora.length;
      partes.push(`${n} pago${n>1?'s':''} pendiente${n>1?'s':''} cancelado${n>1?'s':''}`);
    }
    if (data.restante > 0) {
      partes.push(`crédito disponible: ${fmtMoney(data.saldoCredito)}`);
    }
    showToast('Pago registrado ✓' + (partes.length ? ' · ' + partes.join(' · ') : ''));
    renderFicha(pacienteId, 'pagos');
  }, 'Registrar pago');
}

function modalEditarPago(pagoId, pacienteId) {
  const p = cache.pagos.find(x => x.id === pagoId);
  if (!p) return showToast('Error: pago no encontrado', 'error');
  openModal('Editar pago', _formPago(p), async () => {
    const fecha = document.getElementById('f-fecha').value;
    const monto = parseFloat(document.getElementById('f-monto').value);
    if (!fecha) throw new Error('La fecha es obligatoria.');
    if (isNaN(monto) || monto < 0) throw new Error('El monto debe ser un número válido.');
    await api('PUT', `/pagos/${p.id}`, {
      fecha, monto,
      moneda: document.getElementById('f-moneda').value,
      estado: document.getElementById('f-estado').value,
      metodo: document.getElementById('f-metodo').value,
      notas:  document.getElementById('f-notas').value.trim() || null,
    });
    closeModal(); showToast('Pago actualizado ✓'); renderFicha(pacienteId, 'pagos');
  });
}

// ─── CONFIRMACIONES ──────────────────────────────────────────────────────────
function confirmarBajaPaciente() {
  const p = cache.paciente;
  openModal('Finalizar tratamiento',
    `<p>¿Cómo finalizó el tratamiento de <strong>${esc(p.nombre)} ${esc(p.apellido)}</strong>?</p>
     <div class="tipo-sesion-group" style="margin-top:1rem">
       <label class="tipo-sesion-option">
         <input type="radio" name="motivo_baja" value="alta" checked>
         <span>✅ Alta</span>
       </label>
       <label class="tipo-sesion-option">
         <input type="radio" name="motivo_baja" value="desercion">
         <span>❌ Deserción</span>
       </label>
       <label class="tipo-sesion-option">
         <input type="radio" name="motivo_baja" value="derivacion">
         <span>➡️ Derivación</span>
       </label>
     </div>
     <p class="text-light" style="margin-top:1rem;font-size:.85rem">
       El paciente quedará como inactiva y podrás verla filtrando por "Inactivos" en la lista.
     </p>`,
    async () => {
      const motivoSel = document.querySelector('input[name="motivo_baja"]:checked');
      const motivo = motivoSel ? motivoSel.value : 'alta';
      await api('DELETE', `/pacientes/${p.id}`, { motivo_baja: motivo });
      closeModal();
      showToast(`${p.nombre} marcado como inactivo (${motivo})`);
      window.location.hash = '#/pacientes';
    }, 'Confirmar');
}

function confirmarEliminarSesion(sesionId, pacienteId) {
  openModal('Eliminar sesión',
    '<p>¿Estás segura de eliminar esta sesión? <strong>Esta acción no se puede deshacer.</strong></p>',
    async () => {
      await api('DELETE', `/sesiones/${sesionId}`);
      closeModal(); showToast('Sesión eliminada'); renderFicha(pacienteId, 'sesiones');
    }, 'Eliminar');
}

function confirmarEliminarPago(pagoId, pacienteId) {
  openModal('Eliminar pago',
    '<p>¿Estás segura de eliminar este pago? <strong>Esta acción no se puede deshacer.</strong></p>',
    async () => {
      await api('DELETE', `/pagos/${pagoId}`);
      closeModal(); showToast('Pago eliminado'); renderFicha(pacienteId, 'pagos');
    }, 'Eliminar');
}

// ─── EXPORTAR ────────────────────────────────────────────────────────────────

// Exportar historia clínica de UN paciente
function modalExportarHistoria(pacienteId) {
  const p = cache.paciente;
  const nombre = p ? `${p.nombre} ${p.apellido}` : 'este paciente';
  openModal('Exportar Historia Clínica', `
    <p>Genera un archivo Word con todas las sesiones de <strong>${nombre}</strong>, ordenadas por fecha.</p>
    <div class="tipo-sesion-group" style="margin-top:1rem">
      <label class="tipo-sesion-option">
        <input type="radio" name="destino-historia" value="pc" checked>
        <span>⬇ Descargar en esta PC</span>
      </label>
      <label class="tipo-sesion-option">
        <input type="radio" name="destino-historia" value="drive">
        <span>☁️ Subir a Google Drive</span>
      </label>
    </div>`,
  async () => {
    const destino = document.querySelector('input[name="destino-historia"]:checked')?.value;
    if (destino === 'drive') {
      closeModal();
      showToast('Subiendo a Drive...', 'info');
      const res  = await fetch(`/api/pacientes/${pacienteId}/export-historia-drive`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('☁️ Subido: ' + data.nombre);
      if (data.link) window.open(data.link, '_blank');
    } else {
      closeModal();
      window.location.href = `/api/pacientes/${pacienteId}/export-historia`;
    }
  }, 'Exportar');
}

// Modal unificado de exportación global
function modalExportar() {
  openModal('Exportar datos', `
    <div class="form-group">
      <label class="form-label">¿Qué querés exportar?</label>
      <div class="tipo-sesion-group" style="flex-direction:column;gap:.5rem">
        <label class="tipo-sesion-option">
          <input type="radio" name="formato-exp" value="excel" checked>
          <span>📊 <strong>Excel</strong> — datos de pacientes, sesiones y pagos</span>
        </label>
        <label class="tipo-sesion-option">
          <input type="radio" name="formato-exp" value="backup">
          <span>🗄️ <strong>Backup</strong> — ZIP con la carpeta <code>data</code> (base de datos completa)</span>
        </label>
        <label class="tipo-sesion-option">
          <input type="radio" name="formato-exp" value="completo">
          <span>📦 <strong>Completo</strong> — Excel + Historia Clínica (.docx) de cada paciente en un ZIP</span>
        </label>
      </div>
    </div>
    <div class="form-group" style="margin-top:.9rem">
      <label class="form-label">¿Dónde guardar?</label>
      <div class="tipo-sesion-group">
        <label class="tipo-sesion-option">
          <input type="radio" name="destino-exp" value="pc" checked>
          <span>⬇ Esta PC</span>
        </label>
        <label class="tipo-sesion-option">
          <input type="radio" name="destino-exp" value="drive">
          <span>☁️ Google Drive</span>
        </label>
      </div>
    </div>
    <div id="export-progreso" style="display:none;margin-top:.75rem;padding:.65rem .9rem;background:var(--primary-light);border-radius:7px;font-size:.875rem;color:var(--primary)">
      ⏳ Generando archivos, puede tardar unos segundos...
    </div>`,
  async () => {
    const formato = document.querySelector('input[name="formato-exp"]:checked')?.value;
    const destino = document.querySelector('input[name="destino-exp"]:checked')?.value;
    document.getElementById('export-progreso').style.display = 'block';

    try {
      if (formato === 'excel' && destino === 'pc') {
        closeModal();
        window.location.href = '/api/export';
        showToast('Descargando Excel... ⬇', 'info');
      } else if (formato === 'excel' && destino === 'drive') {
        closeModal();
        await _exportarExcelDrive();
      } else if (formato === 'backup' && destino === 'pc') {
        closeModal();
        window.location.href = '/api/export/backup';
        showToast('Descargando backup... ⬇', 'info');
      } else if (formato === 'backup' && destino === 'drive') {
        const res  = await fetch('/api/export/backup-drive', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal();
        showToast('☁️ Backup subido a Drive');
        if (data.link) window.open(data.link, '_blank');
      } else if (formato === 'completo' && destino === 'pc') {
        closeModal();
        window.location.href = '/api/export/completo';
        showToast('Generando ZIP con todos los archivos... ⬇', 'info');
      } else if (formato === 'completo' && destino === 'drive') {
        const res  = await fetch('/api/export/completo-drive', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        closeModal();
        showToast('☁️ ' + data.total + ' archivos subidos a Drive');
        if (data.carpeta) window.open(data.carpeta, '_blank');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  }, 'Exportar');
}

async function _exportarExcelDrive() {
  const { estado } = await fetch('/api/google/status').then(r => r.json());
  if (estado === 'sin_credenciales') { modalSetupDrive(); return; }
  if (estado === 'sin_autorizar') {
    const popup = window.open('/api/google/auth','google-auth','width=520,height=640,left=200,top=100');
    const esc2 = (e) => {
      if (e.data !== 'google-auth-success') return;
      window.removeEventListener('message', esc2); popup?.close();
      checkDriveStatus(); showToast('Google Drive conectado ✓');
    };
    window.addEventListener('message', esc2);
    return;
  }
  showToast('Subiendo a Drive...', 'info');
  const btn = document.getElementById('btn-exportar');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const res  = await fetch('/api/export-drive');
    const data = await res.json();
    if (res.status === 401) { checkDriveStatus(); showToast('Sesión expirada.', 'error'); return; }
    if (!res.ok) throw new Error(data.error);
    showToast('☁️ Guardado en Drive: ' + data.nombre);
    if (data.link) window.open(data.link, '_blank');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Exportar'; }
  }
}

// Compatibilidad con referencias anteriores
function exportarExcel() { modalExportar(); }
function exportarDrive() { modalExportar(); }

async function checkDriveStatus() {
  try {
    const { estado } = await fetch('/api/google/status').then(r => r.json());
    const btnDesc = document.getElementById('btn-drive-desconectar');
    if (btnDesc) btnDesc.style.display = estado === 'conectado' ? '' : 'none';
  } catch {}
}

async function desconectarDrive() {
  openModal('Desconectar Google Drive',
    `<p>¿Desconectar esta PC de Google Drive?</p>
     <p class="text-light" style="margin-top:.5rem;font-size:.85rem">Se borrarán los tokens. La próxima vez vas a tener que autorizar de nuevo.</p>`,
    async () => {
      await fetch('/api/google/disconnect', { method: 'POST' });
      closeModal(); showToast('Google Drive desconectado'); checkDriveStatus();
    }, 'Desconectar');
}

function modalSetupDrive() {
  openModal('Configurar Google Drive', `
    <div class="setup-steps">
      <div class="setup-step"><span class="setup-num">1</span><span>Ir a <a href="https://console.cloud.google.com" target="_blank" style="color:var(--primary)">console.cloud.google.com</a> y crear un proyecto</span></div>
      <div class="setup-step"><span class="setup-num">2</span><span>Activar <strong>Google Drive API</strong></span></div>
      <div class="setup-step"><span class="setup-num">3</span><span>Crear credencial OAuth 2.0 → Aplicación web</span></div>
      <div class="setup-step"><span class="setup-num">4</span><span>URI de redirección: <code>http://localhost:3000/api/google/callback</code></span></div>
      <div class="setup-step"><span class="setup-num">5</span><span>Descargar JSON → guardar como <code>google-credentials.json</code> en <code>psi-app/</code></span></div>
      <div class="setup-step"><span class="setup-num">6</span><span>Correr <code>npm install</code> y reiniciar</span></div>
    </div>`,
    async () => closeModal(), 'Entendido');
  document.querySelector('.modal-footer .btn-ghost').style.display = 'none';
}

// ─── CALENDARIO ──────────────────────────────────────────────────────────────
let _calYear        = new Date().getFullYear();
let _calMonth       = new Date().getMonth();
let _calDia         = null;
let _calVista       = 'mes';   // 'mes' | 'semana' | 'dia'
let _calVistaPrevia = 'mes';
let _calSemanaOffset = 0;

const MESES_CAL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_CAL  = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

/** Parsea YYYY-MM-DD sin desvío de zona horaria */
function _parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _lunesDe(date) {
  const d = new Date(date); // date ya es un objeto Date local (new Date() sin string)
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function _rangoActual() {
  if (_calVista === 'dia' && _calDia) return { inicio: _calDia, fin: _calDia };
  if (_calVista === 'semana') {
    const lunes = _lunesDe(new Date());
    lunes.setDate(lunes.getDate() + _calSemanaOffset * 7);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return { inicio: lunes.toISOString().split('T')[0], fin: domingo.toISOString().split('T')[0], lunes, domingo };
  }
  const inicio = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-01`;
  const fin    = new Date(_calYear, _calMonth+1, 0).toISOString().split('T')[0];
  return { inicio, fin };
}

async function renderCalendario() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-initial">Cargando calendario...</div>';
  try {
    let fetchYear = _calYear, fetchMonth = _calMonth + 1;
    if (_calVista === 'semana') {
      const lunes = _lunesDe(new Date());
      lunes.setDate(lunes.getDate() + _calSemanaOffset * 7);
      fetchYear = lunes.getFullYear(); fetchMonth = lunes.getMonth() + 1;
    } else if (_calVista === 'dia' && _calDia) {
      const [y, m] = _calDia.split('-');
      fetchYear = parseInt(y); fetchMonth = parseInt(m);
    }

    const res  = await fetch(`/api/calendar/events?year=${fetchYear}&month=${fetchMonth}`);
    const data = await res.json();

    const evMap = {};
    for (const s of (data.sesiones || [])) {
      if (!evMap[s.fecha]) evMap[s.fecha] = [];
      evMap[s.fecha].push({ tipo:'sesion', titulo:`🧠 ${s.nombre} ${s.apellido}`,
        hora:s.hora, min:s.duracion_minutos, pacienteId:s.paciente_id, tipo_sesion:s.tipo_sesion });
    }
    for (const e of (data.gcalEventos || [])) {
      if (!evMap[e.fecha]) evMap[e.fecha] = [];
      evMap[e.fecha].push({ tipo:'gcal', titulo:e.titulo, hora:e.hora });
    }

    const bannerGcal = _bannerGcal(data.gcalEstado);
    let gridHTML = '', navTitle = '', gridClass = '';

    if (_calVista === 'mes') {
      navTitle = `${MESES_CAL[_calMonth]} ${_calYear}`;
      gridHTML = _buildMonthGrid(_calYear, _calMonth, evMap);
    } else if (_calVista === 'semana') {
      const { lunes, domingo } = _rangoActual();
      navTitle = `${lunes.getDate()}/${lunes.getMonth()+1} – ${domingo.getDate()}/${domingo.getMonth()+1}/${domingo.getFullYear()}`;
      gridHTML = _buildWeekGrid(lunes, evMap);
      gridClass = 'cal-grid-semana';
    } else {
      const [y,m,d] = _calDia.split('-');
      const dow = DIAS_CAL[_parseLocalDate(_calDia).getDay()===0?6:_parseLocalDate(_calDia).getDay()-1];
      navTitle = `${dow} ${d}/${m}/${y}`;
    }

    const rango      = _rangoActual();
    const listaHTML  = _buildEventList(evMap, rango);
    let panelTitulo  = _calVista==='dia' ? `📅 ${_calDia.split('-').reverse().join('/')}` :
                       _calVista==='semana' ? '📋 Esta semana' : `📋 ${MESES_CAL[_calMonth]}`;
    const btnVolver  = '';

    app.innerHTML = `
      <div class="page-header"><h1>Calendario</h1></div>
      ${bannerGcal}
      <div class="cal-layout">
        <div class="card cal-card">
          <div class="cal-nav">
            <button class="btn btn-ghost btn-sm"
              onclick="calAtras()"
              ${_calVista==='mes' ? 'disabled style="opacity:.35;pointer-events:none"' : ''}>
              ↩ Atrás
            </button>
            <button class="btn btn-ghost btn-sm" onclick="calNavegar(-1)">←</button>
            <h2 style="flex:1;text-align:center">${navTitle}</h2>
            <button class="btn btn-ghost btn-sm" onclick="calNavegar(1)">→</button>
            <button class="btn btn-ghost btn-sm ${_calVista==='mes'?'chip-active':''}" onclick="calSetVista('mes')">Mes</button>
            <button class="btn btn-ghost btn-sm ${_calVista==='semana'?'chip-active':''}" onclick="calSetVista('semana')">Semana</button>
          </div>
          ${_calVista === 'dia'
            ? _buildDayTimeline(_calDia, evMap)
            : _calVista === 'semana'
              ? `<div class="cal-grid-semana-wrapper">
                  <div class="cal-grid cal-grid-semana">
                    ${DIAS_CAL.map(d => `<div class="cal-dow">${d}</div>`).join('')}
                    ${gridHTML}
                  </div>
                 </div>`
              : `<div class="cal-grid">
                  ${DIAS_CAL.map(d => `<div class="cal-dow">${d}</div>`).join('')}
                  ${gridHTML}
                 </div>`}
          <div class="cal-legend">
            <span><span class="cal-dot cal-dot-sesion"></span> Sesiones PsiApp</span>
            ${data.gcalEstado==='conectado' ? '<span><span class="cal-dot cal-dot-gcal"></span> Google Calendar</span>' : ''}
          </div>
        </div>
        <div class="card cal-events-card">
          <div class="card-header">
            <h2>${panelTitulo}</h2>
            <button class="btn btn-primary btn-sm" onclick="modalNuevaSesionCalendario(${_calDia ? `'${_calDia}'` : 'null'})">+ Nueva sesión</button>
          </div>
          <div class="cal-events-list">${listaHTML}</div>
        </div>
      </div>`;
  } catch (e) {
    document.getElementById('app').innerHTML = `<p style="color:red;padding:2rem">Error: ${e.message}</p>`;
  }
}

async function modalNuevaSesionCalendario(fechaPreset) {
  let pacientes = [];
  try { pacientes = await api('GET', '/pacientes'); } catch {}
  // Guardar para el filtro
  window._calPacientesList = pacientes;

  function buildOpciones(lista) {
    if (!lista.length) return '<option value="">No hay pacientes cargados</option>';
    return lista.map(p =>
      `<option value="${p.id}">${esc(p.apellido)}, ${esc(p.nombre)}${p.obra_social ? ` — ${esc(p.obra_social)}` : ''}</option>`
    ).join('');
  }

  const opcionesPacientes = buildOpciones(pacientes);
  const fechaDefault = fechaPreset || today();

  openModal('Nueva sesión', `
    <div class="form-group">
      <label class="form-label">Paciente *</label>
      <input id="f-paciente-buscar" class="form-input" type="text"
        placeholder="🔍 Escribí el nombre para buscar..."
        oninput="filtrarPacientesCal(this.value)"
        autocomplete="off">
      <select id="f-paciente-cal" class="form-select" size="5" style="margin-top:.35rem;height:auto">
        <option value="">— Seleccionar paciente —</option>
        ${opcionesPacientes}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha *</label>
        <input id="f-fecha" class="form-input" type="date" value="${fechaDefault}">
      </div>
      <div class="form-group">
        <label class="form-label">Hora *</label>
        ${_selectHora()}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Duración (minutos)</label>
        <input id="f-dur" class="form-input" type="number" value="45" min="1" max="480">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de sesión</label>
        <div class="tipo-sesion-group">
          ${['individual','vincular','familiar','equipo'].map(t => `
            <label class="tipo-sesion-option">
              <input type="radio" name="tipo_sesion" value="${t}" ${t==='individual'?'checked':''}>
              <span>${t.charAt(0).toUpperCase()+t.slice(1)}</span>
            </label>`).join('')}
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas de sesión</label>
      <textarea id="f-notas" class="form-textarea" rows="5"
        placeholder="Temas tratados, observaciones, evolución..."></textarea>
    </div>
    <p class="text-light" style="font-size:.82rem">
      💡 Se generará pago pendiente automáticamente (salvo La Casita) y se agregará a Google Calendar si está conectado.
    </p>`,
  async () => {
    const pacienteId = document.getElementById('f-paciente-cal').value;
    const fecha      = document.getElementById('f-fecha').value;
    const hora       = document.getElementById('f-hora').value;
    if (!pacienteId) throw new Error('Seleccioná una paciente.');
    if (!fecha)      throw new Error('La fecha es obligatoria.');
    if (!hora)       throw new Error('La hora es obligatoria.');
    const tipoSel = document.querySelector('input[name="tipo_sesion"]:checked');
    const result = await api('POST', '/sesiones', {
      paciente_id:      parseInt(pacienteId),
      fecha, hora,
      duracion_minutos: parseInt(document.getElementById('f-dur').value) || 45,
      tipo_sesion:      tipoSel ? tipoSel.value : 'individual',
      notas:            document.getElementById('f-notas').value.trim() || null,
    });
    closeModal();
    let msg = 'Sesión registrada ✓';
    if (result.pago?.credito_usado) msg += ` · Crédito usado: ${fmtMoney(result.pago.credito_usado)}`;
    else if (result.pago?.monto > 0) msg += ` · Pago de ${fmtMoney(result.pago.monto)} generado`;
    if (result.gcal) msg += ' · 📅 Google Calendar';
    showToast(msg);
    // Actualizar el mes/año según la fecha de la sesión creada y recargar
    const [y, m] = fecha.split('-');
    _calYear  = parseInt(y);
    _calMonth = parseInt(m) - 1;
    renderCalendario();
  });
}

function filtrarPacientesCal(texto) {
  const sel   = document.getElementById('f-paciente-cal');
  if (!sel) return;
  const lista = window._calPacientesList || [];
  const q     = texto.toLowerCase().trim();
  const filtrados = q
    ? lista.filter(p =>
        `${p.nombre} ${p.apellido}`.toLowerCase().includes(q) ||
        `${p.apellido} ${p.nombre}`.toLowerCase().includes(q) ||
        (p.dni||'').includes(q)
      )
    : lista;
  sel.innerHTML = '<option value="">— Seleccionar paciente —</option>' +
    filtrados.map(p =>
      `<option value="${p.id}">${esc(p.apellido)}, ${esc(p.nombre)}${p.obra_social ? ` — ${esc(p.obra_social)}` : ''}</option>`
    ).join('');
}

function _buildMonthGrid(year, month, evMap) {
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month+1, 0).getDate();
  let startDow = firstDay.getDay(); startDow = startDow===0?6:startDow-1;
  let html = '';
  for (let i=0;i<startDow;i++) html += `<div class="cal-cell cal-empty"></div>`;
  for (let d=1;d<=lastDay;d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evs = evMap[dateStr]||[];
    const isToday = today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d;
    html += `
      <div class="cal-cell ${isToday?'cal-today':''} ${_calDia===dateStr?'cal-selected':''} ${evs.length?'cal-has-events':''}"
           onclick="calVerDia('${dateStr}')">
        <span class="cal-day-num">${d}</span>
        <div class="cal-dots">
          ${evs.some(e=>e.tipo==='sesion') ? '<span class="cal-dot cal-dot-sesion"></span>' : ''}
          ${evs.some(e=>e.tipo==='gcal')   ? '<span class="cal-dot cal-dot-gcal"></span>'   : ''}
        </div>
      </div>`;
  }
  return html;
}

function _buildWeekGrid(lunes, evMap) {
  const today = new Date();
  let html = '';
  for (let i=0;i<7;i++) {
    const d = new Date(lunes); d.setDate(lunes.getDate()+i);
    const dateStr = d.toISOString().split('T')[0];
    const evs = evMap[dateStr]||[];
    const isToday = d.toDateString()===new Date().toDateString();
    html += `
      <div class="cal-cell cal-cell-semana ${isToday?'cal-today':''} ${_calDia===dateStr?'cal-selected':''}"
           onclick="calVerDia('${dateStr}')">
        <span class="cal-day-num">${d.getDate()}</span>
        <div class="cal-cell-evs">
          ${evs.slice(0,4).map(e =>
            `<div class="cal-cell-ev cal-cell-ev-${e.tipo}">
              ${e.hora?`<span style="font-weight:700;margin-right:.2rem">${e.hora}</span>`:''}${esc(e.titulo)}
             </div>`).join('')}
          ${evs.length>4?`<div class="cal-cell-ev-more">+${evs.length-4} más</div>`:''}
        </div>
      </div>`;
  }
  return html;
}

function _buildDayTimeline(dateStr, evMap) {
  const evs = evMap[dateStr]||[];
  let html = '<div class="cal-timeline">';
  for (let h=7;h<=21;h++) {
    const horaLabel = `${String(h).padStart(2,'0')}:00`;
    const enEstaHora = evs.filter(e => {
      if (!e.hora) return h === 9;
      const match = e.hora.match(/(\d{1,2}):/);
      return match ? parseInt(match[1]) === h : false;
    });
    html += `
      <div class="cal-timeline-row ${enEstaHora.length?'cal-timeline-row-busy':''}">
        <div class="cal-timeline-hora">${horaLabel}</div>
        <div class="cal-timeline-slot">
          ${enEstaHora.map(e=>`
            <div class="cal-timeline-ev cal-timeline-ev-${e.tipo}">
              <strong>${e.hora||'09:00'}</strong> ${esc(e.titulo)}
              ${e.tipo_sesion&&e.tipo_sesion!=='individual'?`<span class="badge badge-neutral" style="font-size:.68rem;margin-left:.25rem">${e.tipo_sesion}</span>`:''}
              ${e.pacienteId?`<a href="#/paciente/${e.pacienteId}" class="cal-event-link" style="margin-left:auto">Ver →</a>`:''}
            </div>`).join('')}
        </div>
      </div>`;
  }
  html += '</div>';
  return html;
}

function _buildEventList(evMap, rango) {
  let entries = [];
  for (const [fecha, evs] of Object.entries(evMap)) {
    if (fecha >= rango.inicio && fecha <= rango.fin)
      entries.push(...evs.map(e=>({fecha,...e})));
  }
  // Normalizar hora para ordenar correctamente (pad a HH:MM)
  function _horaSort(h) {
    if (!h) return '99:99';
    const match = h.match(/(\d{1,2}):(\d{2})/);
    if (!match) return '99:99';
    return String(parseInt(match[1])).padStart(2, '0') + ':' + match[2];
  }
  entries.sort((a,b) => (a.fecha + _horaSort(a.hora)).localeCompare(b.fecha + _horaSort(b.hora)));
  if (!entries.length) return `<p class="empty-state">No hay eventos en este período.</p>`;
  const grupos = {};
  for (const e of entries) { if (!grupos[e.fecha]) grupos[e.fecha]=[]; grupos[e.fecha].push(e); }
  return Object.entries(grupos).map(([fecha,evs]) => {
    const [,mm,dd] = fecha.split('-');
    const dow = DIAS_CAL[_parseLocalDate(fecha).getDay()===0?6:_parseLocalDate(fecha).getDay()-1];
    return `
      <div class="cal-event-group">
        <div class="cal-event-date">${dow} ${dd}/${mm}</div>
        ${evs.map(e=>`
          <div class="cal-event-item cal-event-${e.tipo}">
            <span class="cal-event-hora">${e.hora||'–'}</span>
            <span class="cal-event-titulo">${esc(e.titulo)}</span>
            ${e.tipo_sesion&&e.tipo_sesion!=='individual'?`<span class="badge badge-neutral" style="font-size:.7rem">${e.tipo_sesion}</span>`:''}
            ${e.tipo==='sesion'&&e.pacienteId?`<a href="#/paciente/${e.pacienteId}" class="cal-event-link">→</a>`:''}
          </div>`).join('')}
      </div>`;
  }).join('');
}

function calVerDia(dateStr) {
  if (_calVista!=='dia') _calVistaPrevia=_calVista;
  _calDia=dateStr; _calVista='dia';
  const [y,m]=dateStr.split('-'); _calYear=parseInt(y); _calMonth=parseInt(m)-1;
  renderCalendario();
}
function calAtras() {
  if      (_calVista === 'dia')    { _calVista = _calVistaPrevia; _calDia = null; }
  else if (_calVista === 'semana') { _calVista = 'mes'; _calDia = null; }
  // mes → deshabilitado, no hace nada
  renderCalendario();
}
function calVolverDesDia() { calAtras(); } // compat
function calSetVista(v)    { _calVista=v; _calDia=null; _calSemanaOffset=0; renderCalendario(); }
function calNavegar(delta) {
  if (_calVista==='dia') {
    const d = _parseLocalDate(_calDia); d.setDate(d.getDate()+delta);
    _calDia = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    _calYear=d.getFullYear(); _calMonth=d.getMonth();
  } else if (_calVista==='semana') {
    _calSemanaOffset+=delta;
  } else {
    _calMonth+=delta;
    if (_calMonth>11){_calYear++;_calMonth=0;}
    if (_calMonth<0) {_calYear--;_calMonth=11;}
  }
  renderCalendario();
}
function calHoy() {
  const hoy=new Date(); _calYear=hoy.getFullYear(); _calMonth=hoy.getMonth();
  _calDia=null; _calSemanaOffset=0;
  if (_calVista==='dia') _calVista=_calVistaPrevia;
  renderCalendario();
}
function _calMes(n) { _calMonth=n; renderCalendario(); }

function _bannerGcal(estado) {
  if (estado==='conectado') return '';
  const msgs = {
    sin_credenciales:   {ico:'🔴',txt:'Google Calendar no está configurado.',btn:null},
    sin_autorizar:      {ico:'🟡',txt:'Conectá Google Calendar para ver tus eventos.',btn:'Conectar'},
    scope_insuficiente: {ico:'🟡',txt:'Necesitás reconectar Google para agregar permisos de Calendar.',btn:'Reconectar'},
    no_conectado:       {ico:'🔵',txt:'Conectá Google Calendar para ver tus eventos.',btn:'Conectar'},
    error:              {ico:'⚠️',txt:'No se pudieron cargar eventos de Google Calendar.',btn:'Reconectar'},
  };
  const {ico,txt,btn}=msgs[estado]||msgs.error;
  return `<div class="cal-gcal-banner"><span>${ico} ${txt}</span>
    ${btn?`<button class="btn btn-primary btn-sm" onclick="conectarGoogleCalendar()">${btn}</button>`:''}</div>`;
}

function conectarGoogleCalendar() {
  const popup=window.open('/api/google/auth','google-auth','width=520,height=640,left=200,top=100');
  const escuchar=(e)=>{
    if(e.data!=='google-auth-success') return;
    window.removeEventListener('message',escuchar); popup?.close();
    checkDriveStatus(); showToast('Google conectado ✓ — recargando calendario...');
    setTimeout(renderCalendario,500);
  };
  window.addEventListener('message',escuchar);
}


function confirmarCerrarServidor() {
  openModal('Cerrar PsiApp',
    `<p>¿Cerrar la aplicación?</p>
     <p class="text-light" style="margin-top:.5rem;font-size:.85rem">
       El servidor se detendrá y la app dejará de funcionar hasta que la vuelvas a iniciar.
     </p>`,
    async () => {
      closeModal();
      showToast('Cerrando...', 'info');
      await fetch('/api/shutdown', { method: 'POST' }).catch(() => {});
      // Mostrar pantalla de cierre
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
          height:100vh;font-family:sans-serif;color:#555;gap:1rem">
          <div style="font-size:3rem">🧠</div>
          <h2 style="margin:0">PsiApp cerrada</h2>
          <p style="margin:0;color:#999">Podés cerrar esta pestaña del navegador.</p>
        </div>`;
    }, 'Cerrar app'
  );
}



function reactivarPaciente(id, nombre) {
  openModal('Reactivar paciente',
    `<p>¿Reactivar a <strong>${esc(nombre)}</strong>?</p>
     <p class="text-light" style="margin-top:.5rem">Volverá a aparecer en la lista de pacientes activos.</p>`,
    async () => {
      await fetch(`/api/pacientes/${id}/reactivar`, { method: 'POST' });
      closeModal();
      showToast(`${nombre} reactivado ✓`);
      renderPacientes('', _filtroObraSocial);
    }, 'Reactivar');
}

function eliminarPacienteDefinitivo(id, nombre) {
  openModal('⚠️ Eliminar permanentemente',
    `<p>Estás por eliminar a <strong>${esc(nombre)}</strong> de forma <strong>irreversible</strong>.</p>
     <p style="margin-top:.75rem;padding:.75rem;background:var(--danger-light);border-radius:7px;font-size:.875rem;color:var(--danger)">
       ⚠ Se borrarán <strong>todos sus datos</strong>, sesiones y pagos. Esta acción no se puede deshacer.
     </p>
     <div class="form-group" style="margin-top:.75rem">
       <label class="form-label">Escribí <strong>ELIMINAR</strong> para confirmar</label>
       <input id="f-confirmar-eliminar" class="form-input" type="text" placeholder="ELIMINAR">
     </div>`,
    async () => {
      const confirmText = document.getElementById('f-confirmar-eliminar').value.trim();
      if (confirmText !== 'ELIMINAR') throw new Error('Escribí ELIMINAR en mayúsculas para confirmar.');
      await fetch(`/api/pacientes/${id}/eliminar`, { method: 'DELETE' });
      closeModal();
      showToast(`${nombre} eliminado definitivamente`);
      renderPacientes('', _filtroObraSocial);
    }, 'Eliminar definitivamente');
}

/** Genera un select de hora cada 15 minutos (07:00–22:00) */
function _selectHora(valorActual = '') {
  const opts = ['<option value="">-- Hora * --</option>'];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 22 && m > 0) break;
      const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      opts.push(`<option value="${val}" ${valorActual === val ? 'selected' : ''}>${val}</option>`);
    }
  }
  return `<select id="f-hora" class="form-select">${opts.join('')}</select>`;
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', () => { router(); checkDriveStatus(); });
