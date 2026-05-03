# Minerva

Lightweight UI to chat with **Gemini Nano** on-device using Chrome’s [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Data stays in the browser’s `localStorage`; there is no custom backend or sign-in.

**Author:** Pablo Medina

## Requirements

- A recent Chrome build with the API enabled (experimental flags as described in Google’s documentation).
- Run the app on `localhost` or another origin allowed by Google for development.

## Development

```cmd
cd minerva
npm install
npm run dev
```

Then open `http://localhost:5174`.

## Build

```cmd
npm run build
npm run preview
```

## License

Minerva is released under the **MIT License**. Copyright © 2026 Pablo Medina.

The full license text is in the [`LICENSE`](LICENSE) file in the repository root. By using or distributing this software, you agree to the terms stated there.

## Language policy

- **Source code, comments, JSDoc, and this README** are maintained in **English**.
- **User-visible strings** live in **`src/i18n.ts`** (`en` base dictionary; `es` / `es-AR` overrides). The UI must use the translator (`t('…')`), not hardcoded copy in components.
