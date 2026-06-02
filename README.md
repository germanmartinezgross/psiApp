# 🧠 PsiApp — Gestión de Pacientes

App local para gestión de pacientes de psicóloga.
Tecnologías: Node.js · Express · SQLite · HTML/CSS/JS vanilla

---

## Requisitos previos

- **Node.js** v18 o superior → https://nodejs.org
- Eso es todo. No hace falta instalar nada más.

---

## Instalación (primera vez)

```bash
# 1. Ir a la carpeta del proyecto
cd psi-app

# 2. Instalar dependencias
npm install
```

> ⚠️ Si `npm install` falla en Windows por `better-sqlite3`,
> asegurate de tener instalado el **Build Tools para Visual Studio**:
> https://visualstudio.microsoft.com/visual-cpp-build-tools/

---

## Uso diario

```bash
# En la carpeta del proyecto:
npm start
```

Luego abrir el navegador en: **http://localhost:3000**

Para cerrar la app: `Ctrl + C` en la terminal.

---

## Funcionalidades

| Sección | Qué podés hacer |
|---|---|
| **Panel** | Ver resumen: pacientes activos, sesiones del mes, pagos pendientes |
| **Pacientes** | Listar, buscar, agregar y dar de baja pacientes |
| **Ficha paciente** | Ver y editar datos personales, historia clínica, motivo de consulta |
| **Sesiones** | Registrar sesiones con fecha, hora, duración y notas |
| **Pagos** | Registrar pagos con monto, estado (pagado/pendiente) y método |
| **Exportar Excel** | Descargar todos los datos en un archivo `.xlsx` |

---

## Datos guardados

Los datos se guardan en:
```
psi-app/
└── data/
    └── pacientes.db    ← base de datos SQLite (un solo archivo)
```

**Para hacer backup**: copiar ese archivo `pacientes.db` a donde quieras.

---

## Estructura del proyecto

```
psi-app/
├── server.js        ← servidor Node.js + rutas API
├── database.js      ← configuración de la base de datos
├── package.json     ← dependencias del proyecto
├── data/
│   └── pacientes.db ← base de datos (se crea automáticamente)
└── public/
    ├── index.html   ← estructura de la app
    ├── style.css    ← estilos visuales
    └── app.js       ← lógica del frontend
```

---

## Migración futura a Google Sheets

Cuando se quiera migrar, el camino más directo es:
1. Exportar a Excel y subir los datos como migración inicial.
2. Reemplazar `database.js` con llamadas a la API de Google Sheets.
3. La UI no necesita cambios.

---

## Modo desarrollo (con auto-reload)

```bash
npm run dev
```

Requiere nodemon (ya incluido en devDependencies).
