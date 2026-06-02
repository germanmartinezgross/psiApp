/**
 * google-auth.js — manejo de credenciales OAuth2 para Google Drive
 *
 * Requiere el archivo google-credentials.json en la raíz del proyecto.
 * Ver instrucciones de configuración en PSIAPP_INSTRUCCIONES.md
 */

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const TOKENS_PATH      = path.join(__dirname, 'google-tokens.json');
const REDIRECT_URI     = 'http://localhost:3000/api/google/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
];

/** Lee las credenciales del archivo JSON descargado de Google Cloud. */
function getCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Crea un cliente OAuth2 con las credenciales del proyecto. */
function createClient() {
  const creds = getCredentials();
  if (!creds) return null;
  const { client_id, client_secret } = creds.installed || creds.web;
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

/** Lee los tokens guardados localmente (acceso + refresh). */
function getTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Guarda los tokens en disco para no volver a autorizar. */
function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

/** Genera la URL a la que redirigir para que el usuario autorice. */
function getAuthUrl(client) {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // fuerza refresh_token incluso si ya autorizó antes
  });
}

module.exports = { createClient, getTokens, saveTokens, getAuthUrl, getCredentials };
