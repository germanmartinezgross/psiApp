// Usa el módulo SQLite integrado en Node.js 22 — sin compilar nada, sin dependencias nativas.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new DatabaseSync(path.join(dataDir, 'pacientes.db'));

// Configuración inicial
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ── Shims de compatibilidad con la API de better-sqlite3 ─────────────────────
// Permite que server.js funcione sin cambios.

/** db.pragma('table_info(x)') → array de columnas */
db.pragma = function(sql) {
  return db.prepare('PRAGMA ' + sql).all();
};

/** db.transaction(fn)() → ejecuta fn dentro de BEGIN/COMMIT, hace ROLLBACK si falla */
db.transaction = function(fn) {
  return function(...args) {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
};

// ── Esquema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS pacientes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre            TEXT NOT NULL,
    apellido          TEXT NOT NULL,
    dni               TEXT,
    fecha_nacimiento  TEXT,
    telefono          TEXT,
    obra_social       TEXT,
    valor_hora        REAL,
    diagnostico       TEXT,
    imc               REAL,
    conductas_actuales TEXT,
    frecuencia        TEXT,
    medicacion        TEXT,
    estado_tto        TEXT,
    fecha_inicio_tto  TEXT,
    medica_clinica    TEXT,
    psiquiatra        TEXT,
    nutricionista     TEXT,
    red_familiar      TEXT,
    motivo_consulta   TEXT,
    notas_generales   TEXT,
    motivo_baja       TEXT,
    activo            INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at        TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id       INTEGER NOT NULL,
    fecha             TEXT NOT NULL,
    hora              TEXT,
    duracion_minutos  INTEGER DEFAULT 45,
    tipo_sesion       TEXT DEFAULT 'individual',
    notas             TEXT,
    gcal_event_id     TEXT,
    created_at        TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id       INTEGER NOT NULL,
    fecha             TEXT NOT NULL,
    monto             REAL NOT NULL,
    moneda            TEXT DEFAULT 'pesos',
    estado            TEXT DEFAULT 'pagado',
    metodo            TEXT DEFAULT 'transferencia',
    notas             TEXT,
    created_at        TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS credito_paciente (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id       INTEGER NOT NULL UNIQUE,
    saldo             REAL DEFAULT 0,
    updated_at        TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

db.prepare(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('valor_hora_ventana', '42000')`).run();
db.prepare(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('valor_hora_ventana_grupal', '49000')`).run();
db.prepare(`INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('notas_dashboard', '')`).run();

// ── Migraciones seguras ───────────────────────────────────────────────────────
const colsPacientes = db.pragma('table_info(pacientes)').map(c => c.name);
const nuevasPacientes = [
  ['diagnostico',        'TEXT'],
  ['imc',                'REAL'],
  ['conductas_actuales', 'TEXT'],
  ['frecuencia',         'TEXT'],
  ['medicacion',         'TEXT'],
  ['estado_tto',         'TEXT'],
  ['fecha_inicio_tto',   'TEXT'],
  ['medica_clinica',     'TEXT'],
  ['psiquiatra',         'TEXT'],
  ['nutricionista',      'TEXT'],
  ['nombre_padre',       'TEXT'],
  ['tel_padre',          'TEXT'],
  ['nombre_madre',       'TEXT'],
  ['tel_madre',          'TEXT'],
  ['valor_hora',         'REAL'],
  ['red_familiar',       'TEXT'],
  ['motivo_baja',        'TEXT'],
];
for (const [col, type] of nuevasPacientes) {
  if (!colsPacientes.includes(col)) {
    db.exec(`ALTER TABLE pacientes ADD COLUMN ${col} ${type}`);
  }
}

const colsPagos = db.pragma('table_info(pagos)').map(c => c.name);
if (!colsPagos.includes('moneda')) {
  db.exec(`ALTER TABLE pagos ADD COLUMN moneda TEXT DEFAULT 'pesos'`);
}

const colsSesiones = db.pragma('table_info(sesiones)').map(c => c.name);
if (!colsSesiones.includes('gcal_event_id')) {
  db.exec(`ALTER TABLE sesiones ADD COLUMN gcal_event_id TEXT`);
}
if (!colsSesiones.includes('tipo_sesion')) {
  db.exec(`ALTER TABLE sesiones ADD COLUMN tipo_sesion TEXT DEFAULT 'individual'`);
}

module.exports = db;
