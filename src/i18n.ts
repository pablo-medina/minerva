import { LS_LANG, LS_THEME } from './constants';
import type { AppLang, ThemeMode } from './types';

type Dict = Record<string, string>;

const en: Dict = {
  'brand.name': 'Minerva',
  'about.title': 'About Minerva',
  'about.open': 'About Minerva',
  'about.lead': 'Chat in your browser. No server, no account.',
  'about.author': 'Author',
  'about.license': 'License',
  'about.mitNotice': 'This project is open source under the MIT License.',
  'about.copyright': '© 2026 Pablo Medina',
  'dialog.close': 'Close',
  'dialog.back': 'Back',
  'gate.loading': 'Checking browser support…',
  'gate.unsupported': 'This browser does not expose the Prompt API',
  'gate.unsupportedHint':
    'Use a compatible version of Chrome with on-device AI enabled, or open this app from localhost as documented by Google.',
  'gate.blocked': 'Gemini Nano is not available yet',
  'gate.blockedHint':
    'The API is present but the model is unavailable. Enable the required flags, restart Chrome, and try again.',
  'gate.retry': 'Check again',
  'howToEnableLink': 'How to enable Gemini Nano',
  'howToEnableTitle': 'Enable Gemini Nano in Chrome',
  'howToEnableMarkdown': `Chrome can run **Gemini Nano** on-device via the Prompt API, but it often stays off until you enable experiments and restart.

## Local development (\`localhost\`)

1. Open \`chrome://flags/#optimization-guide-on-device-model\` — set **Enabled**, then restart Chrome if prompted.
2. Open \`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input\` — set **Enabled**, then restart Chrome again.

## Then

Reload this page. The chat appears when the browser reports the model is downloadable or ready.

You also need enough **disk space**, **RAM**, and often a suitable **GPU** — see Google's [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api).

## Troubleshooting

Open \`chrome://on-device-internals\` for download status and logs.`,
  'nav.section': 'Navigation',
  'nav.chats': 'Chats',
  'nav.newChat': 'New chat',
  'nav.settings.open': 'Open settings',
  'nav.settings.close': 'Close settings',
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.chatTitleInterval': 'Auto-rename chats (user messages)',
  'settings.chatTitleIntervalHelp':
    'After your first message and the assistant reply, Minerva asks the on-device model for a short sidebar title. If this number is greater than 0, it asks again every that many user messages (for example 10 → after user messages 1, 11, 21…). Use 0 for only the first automatic title.',
  'settings.lead':
    'Preferences are stored in this browser. The system prompt is sent to the model when a chat session starts.',
  'settings.navAria': 'Settings categories',
  'settings.sectionGeneral': 'General',
  'settings.sectionProfile': 'Profile',
  'settings.sectionSystem': 'System prompt',
  'settings.sectionData': 'Data',
  'settings.refineWithAi': 'Improve with AI',
  'settings.refining': 'Improving…',
  'settings.refineDone': 'Prompt updated.',
  'settings.refineFailed': 'Could not refine the prompt. Try again.',
  'settings.systemPromptRefine.instruction': `You improve system prompts for a small on-device assistant (Minerva). The user edits a "system prompt" field.

Rules:
- Reply with the improved system prompt text ONLY. No preamble, no markdown code fences, no explanation before or after.
- Keep it practical and concise (usually under 800 characters unless the draft clearly needs more).
- Preserve the user's intent and the language of the draft.
- If the draft is empty, output one concise default system prompt in English suitable for a helpful, brief assistant.`,
  'settings.systemPrompt': 'System prompt (optional)',
  'settings.systemPromptPlaceholder': 'e.g. Reply concisely in Spanish.',
  'settings.systemPromptHelp': 'Applied when the language model session is created for this chat.',
  'settings.preferredName': 'Your name for the assistant',
  'settings.preferredNamePlaceholder': 'e.g. Alex',
  'settings.preferredNameHelp':
    'Optional. Shown above Send in the same style as the model name, and sent to the model when a session starts.',
  'settings.save': 'Save',
  'settings.saved': 'Saved.',
  'settings.clearChats': 'Delete all chats',
  'settings.clearAllData': 'Delete all Minerva data',
  'settings.clearChatsTitle': 'Delete all chats?',
  'settings.clearChatsBody': 'This removes every thread and message stored in this browser for Minerva.',
  'settings.clearChatsAction': 'Delete chats',
  'settings.clearAllDataTitle': 'Delete all data?',
  'settings.clearAllDataBody':
    'This removes chats, messages, and settings (including the system prompt) stored for Minerva in this browser.',
  'settings.clearAllDataAction': 'Delete everything',
  'settings.clearedChats': 'All chats were deleted.',
  'settings.clearedAllData': 'All Minerva data in this browser was removed.',
  'settings.localStorageUsageLine': 'Local storage (approx.): {pct}%',
  'settings.localStorageUsageTitle':
    'Roughly {pct}% of a typical per-site localStorage budget (~{quotaMiB} MiB in many browsers). The real limit can differ; this counts all keys for this site.',
  'chat.dialog.title': 'Chats',
  'chat.dialog.newChat': 'New chat',
  'chat.dialog.empty': 'No chats yet.',
  'chat.send': 'Send',
  'chat.cancelStreaming': 'Stop',
  'chat.message.roleUser': 'You',
  'chat.delete': 'Delete',
  'chat.deleteConfirmTitle': 'Delete this chat?',
  'chat.deleteConfirmBody': 'This cannot be undone.',
  'chat.summary.view': 'View summary',
  'chat.summary.title': 'Chat summary',
  'chat.summary.loading': 'Summarizing…',
  'chat.summary.empty': 'This chat has no messages to summarize yet.',
  'chat.summary.error': 'Could not generate a summary. Try again.',
  'chat.code.copy': 'Copy',
  'chat.code.copied': 'Copied',
  'chat.code.download': 'Download as file',
  'chat.code.copyAria': 'Copy code to clipboard',
  'chat.code.downloadAria': 'Download code as a text file',
  'composer.toolbarAria': 'Attach images and view chat summary',
  'composer.mobileIdentityAria': 'Who is speaking in this thread',
  'composer.mobileChipAssistant': 'Assistant',
  'composer.mobileChipYou': 'You',
  'chat.attach.images': 'Attach images',
  'chat.attach.hintUnavailable':
    'Image input requires the Prompt API multimodal flag in Chrome (see How to enable Gemini Nano).',
  'chat.attach.removeAria': 'Remove attachment',
  'chat.internal.userAttachmentsLine': 'Attached {n} image(s): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Review the attached image(s) and answer according to the user’s instructions.',
  'chat.attachments.maxCount': 'At most {n} images per message.',
  'chat.attachments.fileTooLarge': '"{name}" exceeds the size limit ({limit}).',
  'chat.attachments.unsupportedFormat': '"{name}" is not a supported image type.',
  'chat.attachments.imageReadFailed': 'Could not read the image.',
  'empty.attachHint':
    'With the multimodal Chrome flag enabled, you can attach images using the paperclip next to the field.',
  'chat.time.justNow': 'Just now',
  'model.fallbackShort': 'AI',
  'placeholder': 'Write a message…',
  'empty.title': 'Start a conversation',
  'empty.bodyWhere': 'Messages stay in this browser.',
  'empty.bodyKeys': 'Use Enter to send; Shift+Enter to go to the next line.',
  'defaultChatTitle': 'New chat',
  'downloading': 'Downloading model… {pct}%',
  'waiting': 'Generating…',
  'error.generic': 'Something went wrong. Try again.',
  'error.noLm': 'Could not start the model.',
  'lang.en': 'English',
  'lang.es': 'Spanish (neutral)',
  'lang.esAR': 'Spanish (Argentina)',
};

const es: Dict = {
  ...en,
  'about.lead': 'Chat en tu navegador. Sin servidor ni cuenta.',
  'dialog.close': 'Cerrar',
  'dialog.back': 'Volver',
  'gate.loading': 'Comprobando soporte del navegador…',
  'gate.unsupported': 'Este navegador no expone la Prompt API',
  'gate.unsupportedHint':
    'Usá una versión compatible de Chrome con la IA en el dispositivo habilitada, o abrí esta app desde localhost según la documentación de Google.',
  'gate.blocked': 'Gemini Nano todavía no está disponible',
  'gate.blockedHint':
    'La API está presente pero el modelo figura como no disponible. Habilitá los flags necesarios, reiniciá Chrome y probá de nuevo.',
  'gate.retry': 'Volver a comprobar',
  'howToEnableLink': 'Cómo habilitar Gemini Nano',
  'howToEnableTitle': 'Habilitar Gemini Nano en Chrome',
  'howToEnableMarkdown': `Chrome puede ejecutar **Gemini Nano** en el dispositivo con la Prompt API, pero muchas veces sigue desactivado hasta que habilites experimentos y reinicies.

## Desarrollo local (\`localhost\`)

1. Abrí \`chrome://flags/#optimization-guide-on-device-model\` — elegí **Enabled** y reiniciá Chrome si lo pide.
2. Abrí \`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input\` — elegí **Enabled** y reiniciá Chrome otra vez.

## Después

Recargá esta página. El chat aparece cuando el navegador indica que el modelo se puede descargar o ya está listo.

También necesitás **espacio en disco**, **RAM** y a menudo una **GPU** adecuada — mirá la sección de hardware en la [documentación de la Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

## Si algo falla

Abrí \`chrome://on-device-internals\` para ver el estado de la descarga y registros.`,
  'nav.chats': 'Chats',
  'nav.newChat': 'Chat nuevo',
  'nav.settings.open': 'Abrir ajustes',
  'nav.settings.close': 'Cerrar ajustes',
  'settings.title': 'Ajustes',
  'settings.language': 'Idioma',
  'settings.theme': 'Tema',
  'settings.theme.dark': 'Oscuro',
  'settings.theme.light': 'Claro',
  'settings.chatTitleInterval': 'Título del chat con IA (cada cuántos mensajes tuyos)',
  'settings.chatTitleIntervalHelp':
    'Después del primer mensaje tuyo y la respuesta del asistente, Minerva le pide al modelo un título corto para la lista de chats. Si el número es mayor que 0, lo vuelve a pedir cada esa cantidad de mensajes tuyos (por ejemplo 10 → tras los mensajes 1, 11, 21…). Con 0 solo actualiza el título la primera vez.',
  'settings.lead':
    'Los ajustes se guardan en este navegador. El prompt del sistema se envía al modelo cuando arranca la sesión de un chat.',
  'settings.navAria': 'Categorías de ajustes',
  'settings.sectionGeneral': 'General',
  'settings.sectionProfile': 'Perfil',
  'settings.sectionSystem': 'Prompt del sistema',
  'settings.sectionData': 'Datos',
  'settings.refineWithAi': 'Mejorar con IA',
  'settings.refining': 'Mejorando…',
  'settings.refineDone': 'Prompt actualizado.',
  'settings.refineFailed': 'No se pudo refinar el prompt. Probá de nuevo.',
  'settings.systemPromptRefine.instruction': `Mejorás prompts de sistema para un asistente chico en el dispositivo (Minerva). El usuario edita un campo de "prompt del sistema".

Reglas:
- Respondé SOLO con el texto del prompt de sistema mejorado. Sin preámbulo, sin cercos markdown de código, sin explicación antes ni después.
- Que sea práctico y conciso (normalmente menos de 800 caracteres salvo que el borrador claramente pida más).
- Preservá la intención del usuario y el idioma del borrador.
- Si el borrador está vacío, devolvé un prompt de sistema breve por defecto en español, adecuado para un asistente útil y conciso.`,
  'settings.systemPrompt': 'Prompt del sistema (opcional)',
  'settings.systemPromptPlaceholder': 'ej.: Respondé en español, breve y claro.',
  'settings.systemPromptHelp': 'Se aplica cuando se crea la sesión del modelo para este chat.',
  'settings.preferredName': 'Nombre (cómo te llama el asistente)',
  'settings.preferredNamePlaceholder': 'ej.: Alex',
  'settings.preferredNameHelp':
    'Opcional. Se muestra arriba de Enviar con el mismo estilo que el nombre del modelo y se envía al modelo al iniciar la sesión.',
  'settings.save': 'Guardar',
  'settings.saved': 'Listo.',
  'settings.clearChats': 'Borrar todos los chats',
  'settings.clearAllData': 'Borrar todos los datos de Minerva',
  'settings.clearChatsTitle': '¿Borrar todos los chats?',
  'settings.clearChatsBody': 'Se eliminan todos los hilos y mensajes guardados en este navegador para Minerva.',
  'settings.clearChatsAction': 'Borrar chats',
  'settings.clearAllDataTitle': '¿Borrar todos los datos?',
  'settings.clearAllDataBody':
    'Se eliminan chats, mensajes y ajustes (incluido el prompt del sistema) guardados para Minerva en este navegador.',
  'settings.clearAllDataAction': 'Borrar todo',
  'settings.clearedChats': 'Se borraron todos los chats.',
  'settings.clearedAllData': 'Se borró todo lo de Minerva en este navegador.',
  'settings.localStorageUsageLine': 'Almacenamiento local (aprox.): {pct}%',
  'settings.localStorageUsageTitle':
    'Aproximadamente {pct}% de un cupo típico de localStorage por sitio (~{quotaMiB} MiB en muchos navegadores). El límite real puede variar; esto cuenta todas las claves de este sitio.',
  'chat.dialog.title': 'Chats',
  'chat.dialog.newChat': 'Chat nuevo',
  'chat.dialog.empty': 'Todavía no hay chats.',
  'chat.send': 'Enviar',
  'chat.cancelStreaming': 'Detener',
  'chat.message.roleUser': 'Vos',
  'chat.delete': 'Borrar',
  'chat.deleteConfirmTitle': '¿Borrar este chat?',
  'chat.deleteConfirmBody': 'No se puede deshacer.',
  'chat.summary.view': 'Ver resumen',
  'chat.summary.title': 'Resumen del chat',
  'chat.summary.loading': 'Resumiendo…',
  'chat.summary.empty': 'Este chat no tiene mensajes para resumir todavía.',
  'chat.summary.error': 'No se pudo generar el resumen. Probá de nuevo.',
  'chat.code.copy': 'Copiar',
  'chat.code.copied': 'Copiado',
  'chat.code.download': 'Descargar como archivo',
  'chat.code.copyAria': 'Copiar el código al portapapeles',
  'chat.code.downloadAria': 'Descargar el código como archivo de texto',
  'composer.toolbarAria': 'Adjuntar imágenes y ver resumen del chat',
  'composer.mobileIdentityAria': 'Quién habla en este chat',
  'composer.mobileChipAssistant': 'Asistente',
  'composer.mobileChipYou': 'Tú',
  'chat.time.justNow': 'Recién',
  'model.fallbackShort': 'IA',
  'placeholder': 'Escribí un mensaje…',
  'empty.title': 'Empezá una conversación',
  'empty.bodyWhere': 'Los mensajes quedan en este navegador.',
  'empty.bodyKeys': 'Usá Intro para enviar; Mayús+Intro para avanzar a la siguiente línea.',
  'chat.attach.images': 'Adjuntar imágenes',
  'chat.attach.hintUnavailable':
    'Las imágenes requieren el flag multimodal de la Prompt API en Chrome (mirá “Cómo habilitar Gemini Nano”).',
  'chat.attach.removeAria': 'Quitar adjunto',
  'chat.internal.userAttachmentsLine': 'Adjunté {n} imagen(es): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Revisá la(s) imagen(es) adjunta(s) y respondé según las instrucciones del usuario.',
  'chat.attachments.maxCount': 'Como máximo {n} imágenes por mensaje.',
  'chat.attachments.fileTooLarge': '"{name}" supera el límite de tamaño ({limit}).',
  'chat.attachments.unsupportedFormat': '"{name}" no es un tipo de imagen admitido.',
  'chat.attachments.imageReadFailed': 'No se pudo leer la imagen.',
  'empty.attachHint':
    'Con el flag multimodal de Chrome habilitado, podés adjuntar imágenes con el clip junto al campo.',
  'defaultChatTitle': 'Chat nuevo',
  'downloading': 'Descargando modelo… {pct}%',
  'waiting': 'Generando…',
  'error.generic': 'Algo salió mal. Probá de nuevo.',
  'error.noLm': 'No se pudo iniciar el modelo.',
};

const esAR: Dict = {
  ...es,
  'chat.message.roleUser': 'Vos',
  'composer.mobileChipYou': 'Vos',
  'chat.internal.userAttachmentsLine': 'Adjunté {n} imagen(es): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Revisá las imágenes adjuntas y respondé según lo que pida la persona.',
};

export type Translator = (key: string) => string;

export function createTranslator(lang: AppLang): Translator {
  const dict = lang === 'es' ? es : lang === 'es-AR' ? esAR : en;
  return (key: string) =>
    dict[key] ?? (lang === 'es-AR' ? es[key] : undefined) ?? en[key] ?? key;
}

/** Maps the browser language (`navigator`) to a supported app language. */
export function detectBrowserLang(): AppLang {
  if (typeof navigator === 'undefined') return 'en';
  const raw = (navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || 'en')
    .trim()
    .replace('_', '-');
  const tag = raw.toLowerCase();
  if (tag === 'es-ar' || tag.startsWith('es-ar-')) return 'es-AR';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('en')) return 'en';
  return 'en';
}

export function loadStoredLang(): AppLang {
  try {
    const v = (localStorage.getItem(LS_LANG) ?? '').trim();
    if (v === 'en' || v === 'es' || v === 'es-AR') return v;
  } catch {
    /* ignore */
  }
  return detectBrowserLang();
}

export function loadStoredTheme(): ThemeMode {
  try {
    const v = (localStorage.getItem(LS_THEME) ?? '').trim();
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}
