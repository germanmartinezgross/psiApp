const express = require('express');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const multer  = require('multer');
const XLSX    = require('xlsx');
const db      = require('./database');

const app    = express();
const PORT   = 3000;
const upload = multer({ dest: os.tmpdir() });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PACIENTES ───────────────────────────────────────────────────────────────

app.get('/api/pacientes', (req, res) => {
  const { buscar, obra_social, estado, deudores } = req.query;
  // Por defecto muestra activos; estado=inactivo muestra los dados de baja
  const filtroActivo = estado === 'inactivo' ? '0' : '1';
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM sesiones   WHERE paciente_id = p.id) AS total_sesiones,
      (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE paciente_id = p.id AND estado = 'pendiente') AS monto_pendiente,
      (SELECT COUNT(*) FROM pagos      WHERE paciente_id = p.id AND estado = 'pendiente') AS pagos_pendientes,
      (SELECT MAX(fecha) FROM sesiones WHERE paciente_id = p.id) AS ultima_sesion,
      COALESCE((SELECT saldo FROM credito_paciente WHERE paciente_id = p.id), 0) AS credito
    FROM pacientes p
    WHERE p.activo = ${filtroActivo}`;
  const params = [];
  if (buscar) {
    sql += ` AND (p.nombre LIKE ? OR p.apellido LIKE ? OR p.dni LIKE ?)`;
    const t = `%${buscar}%`;
    params.push(t, t, t);
  }
  if (obra_social === 'Particular') {
    sql += ` AND p.obra_social = 'Particular'`;
  } else if (obra_social === 'La Ventana') {
    sql += ` AND p.obra_social = 'La Ventana'`;
  } else if (obra_social === 'La Casita') {
    sql += ` AND (p.obra_social NOT IN ('Particular','La Ventana') OR p.obra_social IS NULL)`;
  }
  if (deudores === '1') {
    sql += ` AND (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE paciente_id = p.id AND estado = 'pendiente') > 0`;
  }
  sql += ` ORDER BY p.nombre, p.apellido`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/pacientes/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM pacientes WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json(p);
});

app.post('/api/pacientes', (req, res) => {
  const f = req.body;
  if (!f.nombre || !f.apellido)
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  const r = db.prepare(`
    INSERT INTO pacientes
      (nombre, apellido, dni, fecha_nacimiento, telefono, obra_social, valor_hora,
       diagnostico, imc, conductas_actuales, frecuencia, medicacion,
       estado_tto, fecha_inicio_tto,
       medica_clinica, psiquiatra, nutricionista,
       red_familiar, motivo_consulta, notas_generales)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    f.nombre, f.apellido,
    f.dni||null, f.fecha_nacimiento||null, f.telefono||null, f.obra_social||null,
    f.valor_hora||null,
    f.diagnostico||null, f.imc||null, f.conductas_actuales||null, f.frecuencia||null,
    f.medicacion||null, f.estado_tto||null, f.fecha_inicio_tto||null,
    f.medica_clinica||null, f.psiquiatra||null, f.nutricionista||null,
    f.red_familiar||null, f.motivo_consulta||null, f.notas_generales||null
  );
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/pacientes/:id', (req, res) => {
  const f = req.body;
  if (!f.nombre || !f.apellido)
    return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
  db.prepare(`
    UPDATE pacientes SET
      nombre=?, apellido=?, dni=?, fecha_nacimiento=?, telefono=?, obra_social=?, valor_hora=?,
      diagnostico=?, imc=?, conductas_actuales=?, frecuencia=?, medicacion=?,
      estado_tto=?, fecha_inicio_tto=?,
      medica_clinica=?, psiquiatra=?, nutricionista=?,
      red_familiar=?, motivo_consulta=?, notas_generales=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    f.nombre, f.apellido,
    f.dni||null, f.fecha_nacimiento||null, f.telefono||null, f.obra_social||null,
    f.valor_hora||null,
    f.diagnostico||null, f.imc||null, f.conductas_actuales||null, f.frecuencia||null,
    f.medicacion||null, f.estado_tto||null, f.fecha_inicio_tto||null,
    f.medica_clinica||null, f.psiquiatra||null, f.nutricionista||null,
    f.red_familiar||null, f.motivo_consulta||null, f.notas_generales||null,
    req.params.id
  );
  res.json({ ok: true });
});

// Baja: guarda el motivo (alta/desercion/derivacion) y desactiva
app.delete('/api/pacientes/:id', (req, res) => {
  const { motivo_baja } = req.body || {};
  db.prepare(`
    UPDATE pacientes SET activo=0, motivo_baja=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(motivo_baja||null, req.params.id);
  res.json({ ok: true });
});

// Reactivar paciente inactivo
app.post('/api/pacientes/:id/reactivar', (req, res) => {
  db.prepare(`
    UPDATE pacientes SET activo=1, motivo_baja=NULL, updated_at=datetime('now','localtime') WHERE id=?
  `).run(req.params.id);
  res.json({ ok: true });
});

// Eliminar definitivamente (borra todos los datos relacionados)
app.delete('/api/pacientes/:id/eliminar', (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM pagos    WHERE paciente_id=?').run(id);
  db.prepare('DELETE FROM sesiones WHERE paciente_id=?').run(id);
  db.prepare('DELETE FROM credito_paciente WHERE paciente_id=?').run(id);
  db.prepare('DELETE FROM pacientes WHERE id=?').run(id);
  res.json({ ok: true });
});

// ─── SESIONES ────────────────────────────────────────────────────────────────

/**
 * Crea o actualiza un evento en Google Calendar para una sesión.
 * Retorna el gcal_event_id creado, o null si Google no está conectado.
 */
async function syncGcalEvento({ gcalEventId, paciente, fecha, hora, duracion_minutos, notas }) {
  if (!gauth) return null;
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client || !tokens) return null;

  try {
    const { google } = require('googleapis');
    client.setCredentials(tokens);
    client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));
    const cal = google.calendar({ version: 'v3', auth: client });

    // Armar fechas: si hay hora usamos datetime, si no usamos date (evento de día completo)
    let startObj, endObj;
    if (hora) {
      const tz      = 'America/Argentina/Buenos_Aires';
      const startDT = `${fecha}T${hora}:00`;
      const durMin  = duracion_minutos || 50;
      // Calcular hora de fin
      const [h, m]  = hora.split(':').map(Number);
      const endMin  = h * 60 + m + durMin;
      const endH    = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
      const endM    = String(endMin % 60).padStart(2, '0');
      const endDT   = `${fecha}T${endH}:${endM}:00`;
      startObj = { dateTime: startDT, timeZone: tz };
      endObj   = { dateTime: endDT,   timeZone: tz };
    } else {
      startObj = { date: fecha };
      endObj   = { date: fecha };
    }

    const eventBody = {
      summary:     `🧠 Sesión — ${paciente.apellido}, ${paciente.nombre}`,
      description: notas || '',
      start:       startObj,
      end:         endObj,
    };

    if (gcalEventId) {
      // Actualizar evento existente
      await cal.events.update({ calendarId: 'primary', eventId: gcalEventId, requestBody: eventBody });
      return gcalEventId;
    } else {
      // Crear evento nuevo
      const r = await cal.events.insert({ calendarId: 'primary', requestBody: eventBody });
      return r.data.id;
    }
  } catch (err) {
    console.warn('Google Calendar sync error (no bloqueante):', err.message);
    return gcalEventId || null; // devuelve el id previo si ya tenía
  }
}

/**
 * Elimina un evento de Google Calendar si existe.
 */
async function deleteGcalEvento(gcalEventId) {
  if (!gcalEventId || !gauth) return;
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client || !tokens) return;
  try {
    const { google } = require('googleapis');
    client.setCredentials(tokens);
    const cal = google.calendar({ version: 'v3', auth: client });
    await cal.events.delete({ calendarId: 'primary', eventId: gcalEventId });
  } catch (err) {
    if (err.code !== 404 && err.code !== 410) // 404/410 = ya no existe, ignorar
      console.warn('Google Calendar delete error:', err.message);
  }
}

app.get('/api/pacientes/:id/sesiones', (req, res) => {
  res.json(db.prepare(
    `SELECT * FROM sesiones WHERE paciente_id=? ORDER BY fecha DESC, hora DESC`
  ).all(req.params.id));
});

app.post('/api/sesiones', async (req, res) => {
  const { paciente_id, fecha, hora, duracion_minutos, tipo_sesion, notas } = req.body;
  if (!paciente_id || !fecha)
    return res.status(400).json({ error: 'paciente_id y fecha son requeridos' });

  const paciente = db.prepare('SELECT nombre, apellido, obra_social, valor_hora FROM pacientes WHERE id=?').get(paciente_id);

  const r = db.prepare(`
    INSERT INTO sesiones (paciente_id, fecha, hora, duracion_minutos, tipo_sesion, notas)
    VALUES (?,?,?,?,?,?)
  `).run(paciente_id, fecha, hora||null, duracion_minutos||45, tipo_sesion||'individual', notas||null);

  // Sincronizar con Google Calendar
  const gcalId = await syncGcalEvento({
    gcalEventId: null, paciente, fecha, hora, duracion_minutos, notas,
  });
  if (gcalId) {
    db.prepare(`UPDATE sesiones SET gcal_event_id=? WHERE id=?`).run(gcalId, r.lastInsertRowid);
  }

  // Auto-pago: Particular siempre; La Ventana siempre; La Casita NUNCA
  const tipoGrupal = ['vincular','familiar'].includes(tipo_sesion);
  const esCasita   = !paciente?.obra_social ||
    !['Particular','La Ventana'].includes(paciente.obra_social);

  let pagoR = null;
  if (!esCasita) {
    let monto = 0;
    if (paciente.obra_social === 'Particular') {
      monto = paciente.valor_hora || 0;
    } else if (paciente.obra_social === 'La Ventana') {
      if (tipoGrupal) {
        // Vincular o Familiar → valor grupal de La Ventana
        const cfg = db.prepare(`SELECT valor FROM configuracion WHERE clave='valor_hora_ventana_grupal'`).get();
        monto = cfg ? parseFloat(cfg.valor) : 70000;
      } else {
        // Individual → valor estándar de La Ventana
        const cfg = db.prepare(`SELECT valor FROM configuracion WHERE clave='valor_hora_ventana'`).get();
        monto = cfg ? parseFloat(cfg.valor) : 38500;
      }
    }

    // Verificar si tiene crédito disponible
    const credRow = db.prepare('SELECT saldo FROM credito_paciente WHERE paciente_id=?').get(paciente_id);
    const credito  = credRow ? credRow.saldo : 0;

    if (credito >= monto && monto > 0) {
      // Descuenta del crédito, no genera línea de pago
      const nuevoSaldo = credito - monto;
      db.prepare(`INSERT OR REPLACE INTO credito_paciente (paciente_id, saldo, updated_at)
        VALUES (?, ?, datetime('now','localtime'))`).run(paciente_id, nuevoSaldo);
      pagoR = { monto: 0, credito_usado: monto, saldo_restante: nuevoSaldo };
    } else {
      pagoR = db.prepare(`
        INSERT INTO pagos (paciente_id, fecha, monto, moneda, estado, metodo, notas)
        VALUES (?,?,?,?,?,?,?)
      `).run(paciente_id, fecha, monto, 'pesos', 'pendiente', 'transferencia', `Sesión del ${fecha}`);
      pagoR = { id: pagoR.lastInsertRowid, monto };
    }
  }

  res.json({ id: r.lastInsertRowid, gcal: !!gcalId, pago: pagoR });
});

app.put('/api/sesiones/:id', async (req, res) => {
  const { fecha, hora, duracion_minutos, tipo_sesion, notas } = req.body;
  const sesion   = db.prepare('SELECT gcal_event_id, paciente_id FROM sesiones WHERE id=?').get(req.params.id);
  const paciente = sesion ? db.prepare('SELECT nombre, apellido FROM pacientes WHERE id=?').get(sesion.paciente_id) : null;

  db.prepare(`UPDATE sesiones SET fecha=?, hora=?, duracion_minutos=?, tipo_sesion=?, notas=? WHERE id=?`)
    .run(fecha, hora||null, duracion_minutos||45, tipo_sesion||'individual', notas||null, req.params.id);

  if (paciente) {
    const gcalId = await syncGcalEvento({
      gcalEventId: sesion.gcal_event_id, paciente, fecha, hora, duracion_minutos, notas,
    });
    if (gcalId && gcalId !== sesion.gcal_event_id) {
      db.prepare(`UPDATE sesiones SET gcal_event_id=? WHERE id=?`).run(gcalId, req.params.id);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/sesiones/:id', async (req, res) => {
  const sesion = db.prepare('SELECT gcal_event_id FROM sesiones WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM sesiones WHERE id=?').run(req.params.id);
  // Eliminar del calendario (no bloquea si falla)
  if (sesion?.gcal_event_id) await deleteGcalEvento(sesion.gcal_event_id);
  res.json({ ok: true });
});

// ─── PAGOS ───────────────────────────────────────────────────────────────────

app.get('/api/pacientes/:id/pagos', (req, res) => {
  res.json(db.prepare(
    `SELECT * FROM pagos WHERE paciente_id=? ORDER BY fecha DESC`
  ).all(req.params.id));
});

app.post('/api/pagos', (req, res) => {
  const { paciente_id, fecha, monto, moneda, estado, metodo, notas } = req.body;
  if (!paciente_id || !fecha || monto === undefined)
    return res.status(400).json({ error: 'paciente_id, fecha y monto son requeridos' });
  const r = db.prepare(`
    INSERT INTO pagos (paciente_id, fecha, monto, moneda, estado, metodo, notas)
    VALUES (?,?,?,?,?,?,?)
  `).run(paciente_id, fecha, monto, moneda||'pesos', estado||'pagado', metodo||'efectivo', notas||null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/pagos/:id', (req, res) => {
  const { fecha, monto, moneda, estado, metodo, notas } = req.body;
  db.prepare(`UPDATE pagos SET fecha=?, monto=?, moneda=?, estado=?, metodo=?, notas=? WHERE id=?`)
    .run(fecha, monto, moneda||'pesos', estado, metodo, notas||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/pagos/:id', (req, res) => {
  db.prepare('DELETE FROM pagos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Marcar pago como pagado (pago rápido)
app.post('/api/pagos/:id/pagar', (req, res) => {
  db.prepare(`UPDATE pagos SET estado='pagado', metodo='transferencia' WHERE id=?`)
    .run(req.params.id);
  res.json({ ok: true });
});

// Registrar crédito (pago de más) para un paciente
app.get('/api/pacientes/:id/credito', (req, res) => {
  const row = db.prepare('SELECT saldo FROM credito_paciente WHERE paciente_id=?').get(req.params.id);
  res.json({ saldo: row ? row.saldo : 0 });
});

app.post('/api/pacientes/:id/registrar-pago', (req, res) => {
  const { monto, fecha, moneda, metodo, notas } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const pacienteId = req.params.id;
  const fechaPago  = fecha || new Date().toISOString().split('T')[0];
  const metodoPago = metodo || 'transferencia';
  const monedaPago = moneda || 'pesos';

  const resultado = db.transaction(() => {
    // Traer pendientes del más viejo al más nuevo (con su fecha original)
    const pendientes = db.prepare(`
      SELECT id, monto, fecha FROM pagos
      WHERE paciente_id=? AND estado='pendiente'
      ORDER BY fecha ASC, id ASC
    `).all(pacienteId);

    let restante       = monto;
    const pagadosAhora = [];

    for (const pago of pendientes) {
      if (restante <= 0) break;

      if (restante >= pago.monto) {
        // Cubre completo: marcar como pagado
        db.prepare(`UPDATE pagos SET estado='pagado', metodo=? WHERE id=?`)
          .run(metodoPago, pago.id);
        restante -= pago.monto;
        pagadosAhora.push({ id: pago.id, monto: pago.monto });
      } else {
        // Pago parcial: ajustar el monto del pendiente existente a la diferencia
        // y crear un registro pagado por lo que se cubrió
        const diferencia = pago.monto - restante;
        // El pendiente original queda con la diferencia que falta
        db.prepare(`UPDATE pagos SET monto=? WHERE id=?`).run(diferencia, pago.id);
        // Insertar el fragmento que se pagó ahora
        db.prepare(`
          INSERT INTO pagos (paciente_id, fecha, monto, moneda, estado, metodo, notas)
          VALUES (?,?,?,?,?,?,?)
        `).run(pacienteId, pago.fecha, restante, monedaPago, 'pagado', metodoPago,
               notas || 'Pago parcial');
        pagadosAhora.push({ id: pago.id, monto: restante });
        restante = 0;
      }
    }

    // Si después de cubrir pendientes sobra plata → acumular como crédito
    let saldoCredito = 0;
    if (restante > 0) {
      // Insertar solo si no cubría ningún pendiente (pago adelantado puro)
      // o si hay sobrante tras cubrir todo
      db.prepare(`
        INSERT INTO pagos (paciente_id, fecha, monto, moneda, estado, metodo, notas)
        VALUES (?,?,?,?,?,?,?)
      `).run(pacienteId, fechaPago, restante, monedaPago, 'pagado', metodoPago,
             notas || 'Pago adelantado / crédito');

      db.prepare(`
        INSERT INTO credito_paciente (paciente_id, saldo, updated_at)
        VALUES (?, ?, datetime('now','localtime'))
        ON CONFLICT(paciente_id) DO UPDATE SET
          saldo = saldo + excluded.saldo,
          updated_at = datetime('now','localtime')
      `).run(pacienteId, restante);

      const row = db.prepare('SELECT saldo FROM credito_paciente WHERE paciente_id=?').get(pacienteId);
      saldoCredito = row ? row.saldo : restante;
    }

    return { pagadosAhora, restante, saldoCredito };
  })();

  res.json({ ok: true, ...resultado });
});

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────

app.get('/api/config/:clave', (req, res) => {
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave=?').get(req.params.clave);
  res.json({ valor: row ? row.valor : null });
});

app.put('/api/config/:clave', (req, res) => {
  const { valor } = req.body;
  db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?,?)').run(req.params.clave, String(valor));
  res.json({ ok: true });
});

// ─── ESTADÍSTICAS ────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const mesActual = new Date().toISOString().slice(0, 7);

  const totalPacientes = db.prepare(
    `SELECT COUNT(*) AS n FROM pacientes WHERE activo=1`
  ).get().n;

  const sesionesMes = db.prepare(
    `SELECT COUNT(*) AS n FROM sesiones WHERE strftime('%Y-%m', fecha) = ?`
  ).get(mesActual).n;

  const { pendientes, montoPendiente } = db.prepare(
    `SELECT COUNT(*) AS pendientes, COALESCE(SUM(monto),0) AS montoPendiente
     FROM pagos WHERE estado='pendiente'`
  ).get();

  const pacientesParticular = db.prepare(
    `SELECT COUNT(*) AS n FROM pacientes WHERE activo=1 AND obra_social='Particular'`
  ).get().n;

  const pacientesVentana = db.prepare(
    `SELECT COUNT(*) AS n FROM pacientes WHERE activo=1 AND obra_social='La Ventana'`
  ).get().n;

  const pacientesCasita = db.prepare(
    `SELECT COUNT(*) AS n FROM pacientes WHERE activo=1
     AND (obra_social NOT IN ('Particular','La Ventana') OR obra_social IS NULL)`
  ).get().n;

  const cfgVentana = db.prepare(`SELECT valor FROM configuracion WHERE clave='valor_hora_ventana'`).get();
  const valorHoraVentana = cfgVentana ? parseFloat(cfgVentana.valor) : 38500;

  const cfgVentanaGrupal = db.prepare(`SELECT valor FROM configuracion WHERE clave='valor_hora_ventana_grupal'`).get();
  const valorHoraVentanaGrupal = cfgVentanaGrupal ? parseFloat(cfgVentanaGrupal.valor) : 70000;

  const proximasSesiones = db.prepare(`
    SELECT s.*, p.nombre, p.apellido
    FROM sesiones s
    JOIN pacientes p ON p.id = s.paciente_id
    WHERE s.fecha = date('now','localtime') AND p.activo = 1
    ORDER BY s.hora ASC
    LIMIT 10
  `).all();

  // Recordatorio: Particulares sin aumento en más de 3 meses
  const hace3meses = new Date();
  hace3meses.setMonth(hace3meses.getMonth() - 3);
  const recordatorioAumento = db.prepare(`
    SELECT COUNT(*) AS n FROM pacientes
    WHERE activo=1 AND obra_social='Particular'
    AND (updated_at < ? OR updated_at IS NULL)
  `).get(hace3meses.toISOString().split('T')[0]).n;

  const notasDashboard = db.prepare(`SELECT valor FROM configuracion WHERE clave='notas_dashboard'`).get()?.valor || '';

  res.json({
    totalPacientes, sesionesMes, pendientes, montoPendiente,
    pacientesParticular, pacientesVentana, pacientesCasita,
    valorHoraVentana, valorHoraVentanaGrupal, proximasSesiones,
    recordatorioAumento, notasDashboard,
  });
});

// ─── EXPORTAR EXCEL ──────────────────────────────────────────────────────────

/** Genera el workbook con las 3 hojas y retorna el buffer .xlsx */
function generarExcelBuffer() {
  const wb = XLSX.utils.book_new();

  const pacientes = db.prepare(`
    SELECT id, apellido, nombre, dni, fecha_nacimiento, telefono, obra_social, valor_hora,
           diagnostico, imc, conductas_actuales, frecuencia, medicacion,
           estado_tto, fecha_inicio_tto,
           medica_clinica, psiquiatra, nutricionista,
           nombre_padre, tel_padre, nombre_madre, tel_madre,
           motivo_consulta, notas_generales, created_at
    FROM pacientes WHERE activo=1 ORDER BY apellido, nombre
  `).all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pacientes), 'Pacientes');

  const sesiones = db.prepare(`
    SELECT s.id, p.apellido || ', ' || p.nombre AS paciente,
           s.fecha, s.hora, s.duracion_minutos, s.notas
    FROM sesiones s JOIN pacientes p ON p.id = s.paciente_id
    ORDER BY s.fecha DESC
  `).all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sesiones), 'Sesiones');

  const pagos = db.prepare(`
    SELECT pa.id, p.apellido || ', ' || p.nombre AS paciente,
           pa.fecha, pa.monto, pa.moneda, pa.estado, pa.metodo, pa.notas
    FROM pagos pa JOIN pacientes p ON p.id = pa.paciente_id
    ORDER BY pa.fecha DESC
  `).all();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagos), 'Pagos');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Descarga local
app.get('/api/export', (req, res) => {
  const buf   = generarExcelBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename=psiapp-export-${fecha}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ─── GOOGLE DRIVE ─────────────────────────────────────────────────────────────

// Carga google-auth de forma segura (no rompe el servidor si googleapis no está instalado)
let gauth = null;
try { gauth = require('./google-auth'); } catch (e) {
  console.log('ℹ️  google-auth no disponible (falta googleapis o google-credentials.json)');
}

/** Desconectar Google — borra los tokens locales */
app.post('/api/google/disconnect', (req, res) => {
  try { fs.unlinkSync(path.join(__dirname, 'google-tokens.json')); } catch (_) {}
  res.json({ ok: true });
});

/** Estado de la conexión con Google Drive */
app.get('/api/google/status', (req, res) => {
  if (!gauth || !gauth.getCredentials()) return res.json({ estado: 'sin_credenciales' });
  if (!gauth.getTokens())                return res.json({ estado: 'sin_autorizar' });
  res.json({ estado: 'conectado' });
});

/** Inicia el flujo OAuth — abre esto en una ventana nueva del navegador */
app.get('/api/google/auth', (req, res) => {
  if (!gauth) return res.status(500).send('googleapis no está instalado. Corré npm install.');
  const client = gauth.createClient();
  if (!client) return res.status(400).send('Falta el archivo google-credentials.json.');
  res.redirect(gauth.getAuthUrl(client));
});

/** Callback OAuth: Google redirige acá con el código de autorización */
app.get('/api/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.send(`<html><body>
      <p>❌ Autorización cancelada: ${error || 'sin código'}.</p>
      <script>window.close();</script>
    </body></html>`);
  }
  try {
    const client = gauth.createClient();
    const { tokens } = await client.getToken(code);
    gauth.saveTokens(tokens);
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:2rem">
      <h2>✅ Google Drive conectado</h2>
      <p>Ya podés cerrar esta ventana y volver a PsiApp.</p>
      <script>
        window.opener && window.opener.postMessage('google-auth-success', '*');
        setTimeout(() => window.close(), 1500);
      </script>
    </body></html>`);
  } catch (e) {
    res.status(500).send(`<html><body><p>Error: ${e.message}</p></body></html>`);
  }
});

/** Exporta el Excel y lo sube a Google Drive */
app.get('/api/export-drive', async (req, res) => {
  if (!gauth) return res.status(500).json({ error: 'googleapis no está instalado. Corré npm install.' });

  const client = gauth.createClient();
  if (!client) return res.status(400).json({ error: 'Falta google-credentials.json.' });

  const tokens = gauth.getTokens();
  if (!tokens)  return res.status(401).json({ estado: 'sin_autorizar', error: 'No autorizado.' });

  try {
    const { google }   = require('googleapis');
    const { Readable } = require('stream');

    client.setCredentials(tokens);
    // Guarda el nuevo refresh_token si Google lo renueva
    client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));

    const buf   = generarExcelBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    const nombre = `psiapp-export-${fecha}.xlsx`;

    const drive = google.drive({ version: 'v3', auth: client });
    const resp  = await drive.files.create({
      requestBody: { name: nombre,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Readable.from(buf),
      },
      fields: 'id,name,webViewLink',
    });

    res.json({ ok: true, nombre: resp.data.name, link: resp.data.webViewLink });

  } catch (err) {
    console.error('Drive export error:', err.message);
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      // Token expirado o revocado — borrar y pedir reautorización
      try { require('fs').unlinkSync(require('path').join(__dirname, 'google-tokens.json')); } catch (_) {}
      res.status(401).json({ estado: 'sin_autorizar', error: 'Sesión expirada. Reconectá Google Drive.' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── CALENDARIO ──────────────────────────────────────────────────────────────

app.get('/api/calendar/events', async (req, res) => {
  const y = parseInt(req.query.year)  || new Date().getFullYear();
  const m = parseInt(req.query.month) || new Date().getMonth() + 1; // 1-indexed

  const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
  const endDate   = new Date(y, m, 0).toISOString().split('T')[0];

  // Sesiones PsiApp para el mes (siempre disponibles)
  // Excluimos las que ya tienen gcal_event_id porque aparecerán como eventos de Google
  const sesiones = db.prepare(`
    SELECT s.fecha, s.hora, s.duracion_minutos, s.gcal_event_id, s.tipo_sesion,
           p.nombre, p.apellido, p.id AS paciente_id
    FROM sesiones s
    JOIN pacientes p ON p.id = s.paciente_id
    WHERE s.fecha >= ? AND s.fecha <= ? AND p.activo = 1
    ORDER BY s.fecha, s.hora
  `).all(startDate, endDate);

  // Intentar obtener eventos de Google Calendar
  let gcalEventos = [];
  let gcalEstado  = 'no_conectado';

  if (gauth) {
    const client = gauth.createClient();
    const tokens = gauth.getTokens();
    if (!client)  { gcalEstado = 'sin_credenciales'; }
    else if (!tokens) { gcalEstado = 'sin_autorizar'; }
    else {
      try {
        const { google } = require('googleapis');
        client.setCredentials(tokens);
        client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));

        const cal    = google.calendar({ version: 'v3', auth: client });
        const gcalR  = await cal.events.list({
          calendarId: 'primary',
          timeMin:  new Date(y, m - 1, 1).toISOString(),
          timeMax:  new Date(y, m, 0, 23, 59, 59).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 500,
        });

        gcalEventos = (gcalR.data.items || []).map(ev => {
          const startRaw = ev.start?.dateTime || ev.start?.date || '';
          const fecha    = startRaw.slice(0, 10);
          const hora = ev.start?.dateTime
            ? (() => {
                const d = new Date(ev.start.dateTime);
                // Forzar 24h con hourCycle h23 para evitar "8:30 a. m." en locale es-AR
                const partes = d.toLocaleString('es-AR', {
                  hour: '2-digit', minute: '2-digit',
                  timeZone: 'America/Argentina/Buenos_Aires',
                  hourCycle: 'h23',
                });
                // Extraer solo HH:MM (eliminar cualquier sufijo AM/PM si existiera)
                const match = partes.match(/(\d{1,2}):(\d{2})/);
                if (!match) return null;
                return String(parseInt(match[1])).padStart(2,'0') + ':' + match[2];
              })()
            : null;
          return { fecha, hora, titulo: ev.summary || '(sin título)', id: ev.id };
        });

        // Filtrar eventos de GCal que ya están representados como sesiones PsiApp
        // (evita que aparezcan dos veces los eventos creados por la app)
        const gcalIdsEnDB = new Set(
          sesiones.filter(s => s.gcal_event_id).map(s => s.gcal_event_id)
        );
        gcalEventos = gcalEventos.filter(e => !gcalIdsEnDB.has(e.id));
        gcalEstado = 'conectado';

      } catch (err) {
        // Log completo en terminal para diagnóstico
        const errMsg    = err.message || '';
        const errCode   = err.code || err.status || (err.response?.status);
        const errReason = err.errors?.[0]?.reason
          || err.response?.data?.error
          || err.response?.data?.error?.errors?.[0]?.reason
          || '';

        console.error('Calendar API error →', { code: errCode, msg: errMsg, reason: errReason });

        const esInsuficiente =
          errCode === 403 ||
          errMsg.includes('insufficient') ||
          errMsg.includes('ACCESS_DENIED') ||
          errMsg.includes('Request had insufficient') ||
          errReason === 'insufficientPermissions' ||
          errReason === 'accessNotConfigured';

        const esInvalido =
          errCode === 401 ||
          errMsg.includes('invalid_grant') ||
          errMsg.includes('Token has been expired') ||
          errMsg.includes('Invalid Credentials');

        if (esInsuficiente) {
          gcalEstado = 'scope_insuficiente';
          // Borrar tokens para forzar reautorización con los scopes nuevos
          try { fs.unlinkSync(path.join(__dirname, 'google-tokens.json')); } catch (_) {}
        } else if (esInvalido) {
          gcalEstado = 'sin_autorizar';
          try { fs.unlinkSync(path.join(__dirname, 'google-tokens.json')); } catch (_) {}
        } else {
          gcalEstado = 'error';
          console.error('Calendar API error (detalle completo):', JSON.stringify(err?.response?.data || err, null, 2));
        }
      }
    }
  }

  res.json({ sesiones, gcalEventos, gcalEstado, year: y, month: m });
});

// Debug — muestra el error exacto en JSON (solo para el desarrollador)
app.get('/api/google/debug', async (req, res) => {
  if (!gauth) return res.json({ error: 'gauth no cargado' });
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client)  return res.json({ error: 'sin credenciales' });
  if (!tokens)  return res.json({ error: 'sin tokens' });
  try {
    const { google } = require('googleapis');
    client.setCredentials(tokens);
    const cal   = google.calendar({ version: 'v3', auth: client });
    const r     = await cal.calendarList.list({ maxResults: 1 });
    res.json({ ok: true, calendarios: r.data.items?.map(c => c.summary) });
  } catch (err) {
    res.json({
      error: err.message,
      code:  err.code || err.status,
      data:  err.response?.data,
    });
  }
});



app.post('/api/import-excel', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  const tmpPath = req.file.path;

  // Convierte fecha de Excel (serial numérico o string) a YYYY-MM-DD
  function safeDate(val) {
    if (!val && val !== 0) return null;
    if (typeof val === 'number') {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(val) * 86400 * 1000);
      return isNaN(d) ? null : d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    if (!s) return null;
    // Formato YYYY-MM-DD (como lo exporta la app)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }

  // Busca paciente_id a partir de "Apellido, Nombre" (columna "paciente" en Sesiones/Pagos)
  function resolverPacienteId(nombreCompleto) {
    if (!nombreCompleto) return null;
    const str = String(nombreCompleto).trim();
    const coma = str.indexOf(',');
    if (coma === -1) return null;
    const apellido = str.slice(0, coma).trim();
    const nombre   = str.slice(coma + 1).trim();
    const p = db.prepare(
      `SELECT id FROM pacientes WHERE LOWER(TRIM(apellido))=LOWER(?) AND LOWER(TRIM(nombre))=LOWER(?)`
    ).get(apellido, nombre);
    return p ? p.id : null;
  }

  try {
    const wb = XLSX.readFile(tmpPath);

    // Obtiene una hoja como array de objetos (busca por nombre case-insensitive)
    const getSheet = (nombre) => {
      const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === nombre.toLowerCase());
      if (!sheetName) return [];
      return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
    };

    const stats = {
      pacientes: { actualizados: 0, insertados: 0, errores: 0 },
      sesiones:  { actualizadas: 0, insertadas: 0, errores: 0 },
      pagos:     { actualizados: 0, insertados: 0, errores: 0 },
    };

    const importar = db.transaction(() => {

      // ── HOJA: Pacientes ───────────────────────────────────────────────────
      for (const row of getSheet('pacientes')) {
        const nombre   = String(row.nombre   || '').trim();
        const apellido = String(row.apellido || '').trim();
        if (!nombre || !apellido) continue;

        const id     = parseInt(row.id);
        const existe = id && db.prepare('SELECT id FROM pacientes WHERE id=?').get(id);

        try {
          const vals = [
            nombre, apellido,
            row.dni||null, safeDate(row.fecha_nacimiento), row.telefono||null,
            row.obra_social||null, row.valor_hora||null,
            row.diagnostico||null, row.imc||null,
            row.conductas_actuales||null, row.frecuencia||null, row.medicacion||null,
            row.estado_tto||null, safeDate(row.fecha_inicio_tto),
            row.medica_clinica||null, row.psiquiatra||null, row.nutricionista||null,
            row.nombre_padre||null, row.tel_padre||null,
            row.nombre_madre||null, row.tel_madre||null,
            row.motivo_consulta||null, row.notas_generales||null,
          ];
          if (existe) {
            db.prepare(`
              UPDATE pacientes SET
                nombre=?, apellido=?, dni=?, fecha_nacimiento=?, telefono=?,
                obra_social=?, valor_hora=?, diagnostico=?, imc=?,
                conductas_actuales=?, frecuencia=?, medicacion=?,
                estado_tto=?, fecha_inicio_tto=?,
                medica_clinica=?, psiquiatra=?, nutricionista=?,
                nombre_padre=?, tel_padre=?, nombre_madre=?, tel_madre=?,
                motivo_consulta=?, notas_generales=?,
                updated_at=datetime('now','localtime')
              WHERE id=?
            `).run(...vals, id);
            stats.pacientes.actualizados++;
          } else {
            db.prepare(`
              INSERT INTO pacientes
                (nombre, apellido, dni, fecha_nacimiento, telefono,
                 obra_social, valor_hora, diagnostico, imc,
                 conductas_actuales, frecuencia, medicacion,
                 estado_tto, fecha_inicio_tto,
                 medica_clinica, psiquiatra, nutricionista,
                 nombre_padre, tel_padre, nombre_madre, tel_madre,
                 motivo_consulta, notas_generales)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `).run(...vals);
            stats.pacientes.insertados++;
          }
        } catch (e) { stats.pacientes.errores++; }
      }

      // ── HOJA: Sesiones ────────────────────────────────────────────────────
      for (const row of getSheet('sesiones')) {
        const fecha = safeDate(row.fecha);
        if (!fecha) continue;

        const id     = parseInt(row.id);
        const existe = id && db.prepare('SELECT id FROM sesiones WHERE id=?').get(id);

        try {
          if (existe) {
            db.prepare(`
              UPDATE sesiones SET fecha=?, hora=?, duracion_minutos=?, notas=? WHERE id=?
            `).run(fecha, row.hora||null, parseInt(row.duracion_minutos)||50, row.notas||null, id);
            stats.sesiones.actualizadas++;
          } else {
            const pacienteId = resolverPacienteId(row.paciente);
            if (!pacienteId) { stats.sesiones.errores++; continue; }
            db.prepare(`
              INSERT INTO sesiones (paciente_id, fecha, hora, duracion_minutos, notas)
              VALUES (?,?,?,?,?)
            `).run(pacienteId, fecha, row.hora||null, parseInt(row.duracion_minutos)||50, row.notas||null);
            stats.sesiones.insertadas++;
          }
        } catch (e) { stats.sesiones.errores++; }
      }

      // ── HOJA: Pagos ───────────────────────────────────────────────────────
      for (const row of getSheet('pagos')) {
        const fecha = safeDate(row.fecha);
        const monto = parseFloat(row.monto);
        if (!fecha || isNaN(monto)) continue;

        const id     = parseInt(row.id);
        const existe = id && db.prepare('SELECT id FROM pagos WHERE id=?').get(id);

        try {
          if (existe) {
            db.prepare(`
              UPDATE pagos SET fecha=?, monto=?, moneda=?, estado=?, metodo=?, notas=? WHERE id=?
            `).run(fecha, monto, row.moneda||'pesos', row.estado||'pagado', row.metodo||'efectivo', row.notas||null, id);
            stats.pagos.actualizados++;
          } else {
            const pacienteId = resolverPacienteId(row.paciente);
            if (!pacienteId) { stats.pagos.errores++; continue; }
            db.prepare(`
              INSERT INTO pagos (paciente_id, fecha, monto, moneda, estado, metodo, notas)
              VALUES (?,?,?,?,?,?,?)
            `).run(pacienteId, fecha, monto, row.moneda||'pesos', row.estado||'pagado', row.metodo||'efectivo', row.notas||null);
            stats.pagos.insertados++;
          }
        } catch (e) { stats.pagos.errores++; }
      }

    }); // fin transaction

    importar();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    res.json(stats);

  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error('Import-excel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── IMPORTAR HISTORIAL CLÍNICO DESDE DOCX ───────────────────────────────────

app.post('/api/pacientes/:id/importar-historial', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  const tmpPath = req.file.path;

  try {
    let mammoth;
    try { mammoth = require('mammoth'); }
    catch { return res.status(500).json({ error: 'Falta instalar mammoth. Corré npm install.' }); }

    const anio = parseInt(req.body.anio) || new Date().getFullYear();
    const pacienteId = req.params.id;

    // Extraer texto plano del docx
    const result = await mammoth.extractRawText({ path: tmpPath });
    const texto  = result.value;

    // ── Parser de sesiones ────────────────────────────────────────────────────
    // Detecta líneas que son solo una fecha (DD/M, D/M, D/M/AA, o fracciones unicode como ¼ ½ ¾)
    // Fracciones unicode: ¼=1/4, ½=1/2, ¾=3/4, ⅓=1/3, ⅔=2/3, ⅕=1/5, etc.

    const FRACCIONES = {
      '¼':'1/4','½':'1/2','¾':'3/4','⅓':'1/3','⅔':'2/3',
      '⅕':'1/5','⅖':'2/5','⅗':'3/5','⅘':'4/5','⅙':'1/6',
      '⅚':'5/6','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8',
    };

    function normalizarLinea(l) {
      let s = l.trim();
      for (const [frac, rep] of Object.entries(FRACCIONES)) s = s.replace(frac, rep);
      return s;
    }

    function parsearFecha(linea) {
      const s = normalizarLinea(linea);
      // Patrones: "16/3", "16/3/25", "16/03/2025", con posible texto después
      const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(\s.*)?$/);
      if (!m) return null;
      const dia = parseInt(m[1]);
      const mes = parseInt(m[2]);
      if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
      let year = anio;
      if (m[3]) {
        const y = parseInt(m[3]);
        year = y < 100 ? 2000 + y : y;
      }
      const fecha = `${year}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
      return fecha;
    }

    // Dividir en líneas y agrupar por sesión
    const lineas = texto.split('\n');
    const sesiones = [];
    let sesionActual = null;

    for (const lineaRaw of lineas) {
      const fecha = parsearFecha(lineaRaw);
      if (fecha) {
        if (sesionActual) sesiones.push(sesionActual);
        sesionActual = { fecha, notasLineas: [] };
      } else if (sesionActual) {
        sesionActual.notasLineas.push(lineaRaw);
      }
    }
    if (sesionActual) sesiones.push(sesionActual);

    if (!sesiones.length) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      return res.status(400).json({ error: 'No se encontraron fechas en el archivo. Verificá el formato.' });
    }

    // Insertar sesiones (sin duplicar si ya existe la misma fecha para el paciente)
    let insertadas = 0;
    let saltadas   = 0;

    const insertSesion = db.prepare(`
      INSERT INTO sesiones (paciente_id, fecha, hora, duracion_minutos, tipo_sesion, notas)
      VALUES (?, ?, '09:00', 45, 'individual', ?)
    `);
    const existeSesion = db.prepare(
      `SELECT id FROM sesiones WHERE paciente_id=? AND fecha=?`
    );

    const insertarTodo = db.transaction(() => {
      for (const s of sesiones) {
        const notas = s.notasLineas
          .join('\n')
          .trim()
          .replace(/\n{3,}/g, '\n\n'); // colapsar líneas en blanco excesivas

        if (existeSesion.get(pacienteId, s.fecha)) {
          saltadas++;
          continue;
        }
        insertSesion.run(pacienteId, s.fecha, notas || null);
        insertadas++;
      }
    });
    insertarTodo();

    try { fs.unlinkSync(tmpPath); } catch (_) {}
    res.json({ insertadas, saltadas, total: sesiones.length });

  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error('Importar historial error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERAR WORD: HISTORIA CLÍNICA ──────────────────────────────────────────

async function generarHistoriaDocx(pacienteId) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

  const paciente = db.prepare('SELECT * FROM pacientes WHERE id=?').get(pacienteId);
  if (!paciente) throw new Error('Paciente no encontrado');

  const sesiones = db.prepare(`
    SELECT fecha, hora, tipo_sesion, notas FROM sesiones
    WHERE paciente_id=? ORDER BY fecha ASC, hora ASC
  `).all(pacienteId);

  const nombre = `${paciente.nombre} ${paciente.apellido}`;

  // Formatear fecha DD/MM/YYYY
  function fmtFecha(f) {
    if (!f) return '';
    const [y, m, d] = f.split('-');
    return `${d}/${m}/${y}`;
  }

  const children = [
    // Título del documento
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `Historia Clínica — ${nombre}`, bold: true })],
      spacing: { after: 400 },
    }),
  ];

  if (!sesiones.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Sin sesiones registradas.', italics: true, color: '888888' })],
    }));
  }

  for (const s of sesiones) {
    const tipoLabel = s.tipo_sesion && s.tipo_sesion !== 'individual'
      ? ` (${s.tipo_sesion})` : '';

    // Subtítulo = solo fecha (sin hora)
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: `${fmtFecha(s.fecha)}${tipoLabel}` })],
      spacing: { before: 360, after: 120 },
    }));

    // Notas de sesión
    if (s.notas) {
      const lineas = s.notas.split('\n');
      for (const linea of lineas) {
        children.push(new Paragraph({
          children: [new TextRun({ text: linea || '' })],
          spacing: { after: 80 },
        }));
      }
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Sin notas.', italics: true, color: '888888' })],
        spacing: { after: 80 },
      }));
    }
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 24 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Arial', color: '1F3864' },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '2E75B6' },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, nombre, paciente };
}

// Descarga Word de un paciente a la PC
app.get('/api/pacientes/:id/export-historia', async (req, res) => {
  try {
    const { buffer, nombre } = await generarHistoriaDocx(req.params.id);
    const filename = `Historia Clinica - ${nombre}.docx`
      .replace(/[<>:"/\\|?*]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subir Word de un paciente a Drive
app.get('/api/pacientes/:id/export-historia-drive', async (req, res) => {
  if (!gauth) return res.status(500).json({ error: 'Google no configurado' });
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client || !tokens) return res.status(401).json({ estado: 'sin_autorizar' });
  try {
    const { google } = require('googleapis');
    const { Readable } = require('stream');
    client.setCredentials(tokens);
    client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));

    const { buffer, nombre } = await generarHistoriaDocx(req.params.id);
    const filename = `Historia Clinica - ${nombre}.docx`;
    const drive = google.drive({ version: 'v3', auth: client });
    const resp  = await drive.files.create({
      requestBody: { name: filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      media: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: Readable.from(buffer) },
      fields: 'id,name,webViewLink',
    });
    res.json({ ok: true, nombre: resp.data.name, link: resp.data.webViewLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXPORT COMPLETO ──────────────────────────────────────────────────────────

async function generarExportCompleto() {
  const archiver = require('archiver');

  const pacientes = db.prepare(
    `SELECT id, nombre, apellido, obra_social, diagnostico FROM pacientes WHERE activo=1 ORDER BY nombre, apellido`
  ).all();

  // Generar Word para cada paciente y acumular
  const archivos = [];
  for (const p of pacientes) {
    try {
      const { buffer } = await generarHistoriaDocx(p.id);
      const filename = `Historia Clinica - ${p.nombre} ${p.apellido}.docx`
        .replace(/[<>:"/\\|?*]/g, '_');
      archivos.push({ buffer, filename, paciente: p });
    } catch { /* ignorar pacientes sin sesiones o error */ }
  }

  // Generar Excel con listado e hipervínculo a cada Word (ruta relativa dentro del ZIP)
  const XLSX = require('xlsx');
  const wb   = XLSX.utils.book_new();

  // Construir filas con fórmula HYPERLINK apuntando a la subcarpeta historias/
  const filas = archivos.map(a => ({
    Nombre:       a.paciente.nombre,
    Apellido:     a.paciente.apellido,
    'Obra Social':a.paciente.obra_social || '',
    'Diagnóstico':a.paciente.diagnostico || '',
    'Historia Clínica': { // celda con fórmula HYPERLINK
      f: `HYPERLINK("historias/${a.filename}","Abrir")`,
      t: 's',
    },
  }));

  const ws = XLSX.utils.json_to_sheet(filas);

  // Estilo de hipervínculo para la columna E (índice 4)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 4 })];
    if (cell) {
      cell.s = { font: { color: { rgb: '0563C1' }, underline: true } };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
  const excelBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return { archivos, excelBuf };
}

// Descargar ZIP completo a la PC
app.get('/api/export/completo', async (req, res) => {
  try {
    const archiver = require('archiver');
    const { archivos, excelBuf } = await generarExportCompleto();
    const fecha = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Disposition', `attachment; filename="PsiApp-Completo-${fecha}.zip"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(excelBuf, { name: `Pacientes-${fecha}.xlsx` });
    for (const a of archivos) {
      archive.append(a.buffer, { name: `historias/${a.filename}` });
    }
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subir export completo a Drive
app.post('/api/export/completo-drive', async (req, res) => {
  if (!gauth) return res.status(500).json({ error: 'Google no configurado' });
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client || !tokens) return res.status(401).json({ estado: 'sin_autorizar' });
  try {
    const { google } = require('googleapis');
    const { Readable } = require('stream');
    client.setCredentials(tokens);
    client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));
    const drive = google.drive({ version: 'v3', auth: client });

    const fecha = new Date().toISOString().slice(0, 10);
    const { archivos, excelBuf } = await generarExportCompleto();

    // Crear carpeta en Drive
    const carpeta = await drive.files.create({
      requestBody: { name: `PsiApp-Completo-${fecha}`, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id,webViewLink',
    });
    const carpetaId = carpeta.data.id;

    // Subir cada Word y guardar su URL
    for (const a of archivos) {
      const resp = await drive.files.create({
        requestBody: { name: a.filename, parents: [carpetaId],
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        media: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          body: Readable.from(a.buffer) },
        fields: 'id,webViewLink',
      });
      a.driveLink = resp.data.webViewLink;
    }

    // Regenerar Excel con hipervínculos reales a Drive (sobreescribir el anterior)
    const XLSX2 = require('xlsx');
    const wb2   = XLSX2.utils.book_new();
    const filasDrive = archivos.map(a => ({
      Nombre:       a.paciente.nombre,
      Apellido:     a.paciente.apellido,
      'Obra Social':a.paciente.obra_social || '',
      'Diagnóstico':a.paciente.diagnostico || '',
      'Historia Clínica': a.driveLink
        ? { f: `HYPERLINK("${a.driveLink}","Abrir en Drive")`, t: 's' }
        : a.filename,
    }));
    XLSX2.utils.book_append_sheet(wb2, XLSX2.utils.json_to_sheet(filasDrive), 'Pacientes');
    const excelDriveBuf = XLSX2.write(wb2, { type: 'buffer', bookType: 'xlsx' });

    // Subir Excel (con links reales)
    await drive.files.create({
      requestBody: { name: `Pacientes-${fecha}.xlsx`, parents: [carpetaId],
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Readable.from(excelDriveBuf) },
    });

    res.json({ ok: true, carpeta: carpeta.data.webViewLink, total: archivos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUP DE LA CARPETA DATA ────────────────────────────────────────────────

app.get('/api/export/backup', (req, res) => {
  try {
    const archiver = require('archiver');
    const fecha    = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="PsiApp-Backup-${fecha}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    archive.directory(path.join(__dirname, 'data'), 'data');
    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/export/backup-drive', async (req, res) => {
  if (!gauth) return res.status(500).json({ error: 'Google no configurado' });
  const client = gauth.createClient();
  const tokens = gauth.getTokens();
  if (!client || !tokens) return res.status(401).json({ estado: 'sin_autorizar' });
  try {
    const { google } = require('googleapis');
    const archiver   = require('archiver');
    const { PassThrough } = require('stream');

    client.setCredentials(tokens);
    client.on('tokens', t => gauth.saveTokens({ ...tokens, ...t }));

    // Generar el ZIP en memoria usando un PassThrough stream
    const pass    = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(pass);
    archive.directory(path.join(__dirname, 'data'), 'data');
    archive.finalize();

    const fecha    = new Date().toISOString().slice(0, 10);
    const drive    = google.drive({ version: 'v3', auth: client });
    const resp     = await drive.files.create({
      requestBody: { name: `PsiApp-Backup-${fecha}.zip`,
        mimeType: 'application/zip' },
      media: { mimeType: 'application/zip', body: pass },
      fields: 'id,name,webViewLink',
    });
    res.json({ ok: true, nombre: resp.data.name, link: resp.data.webViewLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CERRAR SERVIDOR ─────────────────────────────────────────────────────────

app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  console.log('\n🔴 PsiApp cerrada desde el navegador.\n');
  setTimeout(() => process.exit(0), 300);
});

// ─── INICIO ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         PsiApp - Gestión Pacientes       ║
╠══════════════════════════════════════════╣
║  ✅  Servidor corriendo                  ║
║  🌐  Abrí: http://localhost:${PORT}         ║
║  🔴  Para cerrar: Ctrl + C               ║
╚══════════════════════════════════════════╝
  `);
});
