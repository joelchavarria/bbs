# Google Sheets RSVP Setup

Sheet link recibido:
`https://docs.google.com/spreadsheets/d/1OOGJAi14gcjfCAtzFxMHV_kMd8tNMn396iP2yGjrLvE/edit?usp=sharing`

## 1) Crea la pestaña
Nombre sugerido: `RSVP`

## 2) Encabezados (fila 1)
En este orden:

1. `timestamp`
2. `invitado_id`
3. `nombre`
4. `familia`
5. `asistencia`
6. `personas`
7. `mensaje`
8. `origen`
9. `ip`
10. `user_agent`

## 3) Apps Script
En Google Sheets: `Extensions` -> `Apps Script`

Pega este código en `Code.gs`:

```javascript
const SHEET_NAME = 'RSVP';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const ss = SpreadsheetApp.openById('1OOGJAi14gcjfCAtzFxMHV_kMd8tNMn396iP2yGjrLvE');
    const sh = ss.getSheetByName(SHEET_NAME);

    if (!sh) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Sheet not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    sh.appendRow([
      data.creadoEn || new Date().toISOString(),
      data.invitadoId || '',
      data.nombre || '',
      data.familia || '',
      data.asistencia || '',
      data.personas || 0,
      data.mensaje || '',
      'web-baby-shower',
      '',
      data.userAgent || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

## 4) Deploy Web App
- `Deploy` -> `New deployment`
- Type: `Web app`
- Execute as: `Me`
- Who has access: `Anyone`
- Copia la URL del Web App

## 5) Configura tu frontend
Crea archivo `.env.local` en la raíz del proyecto con:

```bash
VITE_RSVP_WEBHOOK="AQUI_LA_URL_DEL_WEB_APP"
```

Luego reinicia:

```bash
npm run dev
```
