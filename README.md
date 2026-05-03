# Minerva

Interfaz liviana para chatear con **Gemini Nano** en el dispositivo, usando la [Prompt API de Chrome](https://developer.chrome.com/docs/ai/prompt-api). Los datos quedan en `localStorage` del navegador; no hay servidor propio ni inicio de sesión.

**Autor:** Pablo Medina · **Licencia:** MIT (texto en `LICENSE`).

## Requisitos

- Chrome reciente con la API habilitada (flags de experimentación según la documentación de Google).
- Ejecutar en `localhost` o el origen que indique Google para desarrollo.

## Desarrollo

```cmd
cd minerva
npm install
npm run dev
```

Abre `http://localhost:5174`.

## Build

```cmd
npm run build
npm run preview
```
