import type { AppLang } from './types';

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
    'Preferences and chats are stored in IndexedDB on this device. The system prompt is sent to the model when a chat session starts.',
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
  'settings.storageQuotaLine': 'Storage: {used} MB used · {free} MB free · {quota} MB quota',
  'settings.storageQuotaTitle':
    'Estimated storage for this site: {used} MB in use, {free} MB free, {quota} MB total quota (browser; includes IndexedDB and other persisted data).',
  'settings.storageQuotaUnavailable': 'Storage estimate unavailable in this environment.',
  'settings.storageQuotaUnavailableTitle': 'This browser did not report storage quota details.',
  'storage.pressureBanner':
    'Browser storage for this site is nearly full. Free space so new messages and attachments can be saved.',
  'storage.pressureBannerLink': 'Open Data settings',
  'settings.pruneOldestChats': 'Remove oldest chats (keep this tab)',
  'settings.pruneOldestChatsHelp':
    'Deletes older chat threads (by last update) until estimated storage drops below about 78% of quota. Your active chat is kept whenever another thread exists.',
  'settings.pruneOldestChatsTitle': 'Remove oldest chats?',
  'settings.pruneOldestChatsBody':
    'Minerva will delete older threads to reduce storage. This cannot be undone. If only one chat remains, nothing may be deleted until you clear data manually.',
  'settings.pruneOldestChatsAction': 'Remove oldest',
  'settings.prunedChatsNotice': 'Removed {n} chat(s).',
  'settings.pruneNoop': 'Nothing was removed (storage may already be below the target, or only one chat exists).',
  'settings.backup.lead':
    'Download a JSON backup of all chats (including attachments) and app settings, or restore one on another device. Keep backups private.',
  'settings.backup.download': 'Download full backup',
  'settings.backup.downloadDone': 'Backup downloaded.',
  'settings.backup.restore': 'Restore from backup file…',
  'settings.backup.restoreHint': 'Choose a JSON file previously exported from Minerva on this or another computer.',
  'settings.backup.restoreConfirmTitle': 'Replace all data with this backup?',
  'settings.backup.restoreConfirmBody':
    'The file “{name}” will replace every chat and all Minerva settings in this browser. You cannot undo this.',
  'settings.backup.restoreConfirmAction': 'Restore and reload',
  'settings.backup.error.invalidFile': 'That file is not a valid Minerva backup.',
  'settings.backup.error.invalidJson': 'The backup file is not valid JSON.',
  'settings.backup.error.unsupportedVersion': 'This backup was made with a different Minerva version and cannot be imported here.',
  'settings.backup.error.schemaMismatch':
    'This backup does not match the app’s current storage format. Update Minerva or export a new backup from a matching version.',
  'settings.backup.error.fileTooLarge': 'That backup file is too large to import in the browser.',
  'settings.backup.error.exportFailed': 'Could not create the backup file. Try again.',
  'settings.backup.error.importFailed': 'Could not restore from that file. Try again.',
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
  'chat.export.open': 'Export chat…',
  'chat.export.title': 'Export chat',
  'chat.export.lead':
    'Choose a format. If the chat includes images, HTML and Markdown downloads are a ZIP folder you can unpack and open offline.',
  'chat.export.format': 'Format',
  'chat.export.formatHtml': 'HTML (styled)',
  'chat.export.formatMarkdown': 'Markdown',
  'chat.export.formatPdf': 'PDF',
  'chat.export.start': 'Download',
  'chat.export.cancel': 'Cancel',
  'chat.export.metaExported': 'Exported',
  'chat.export.footer': 'Exported from Minerva',
  'chat.export.phase.collecting': 'Preparing…',
  'chat.export.phase.building': 'Building document…',
  'chat.export.phase.packaging': 'Creating ZIP…',
  'chat.export.phase.renderingPdf': 'Rendering PDF…',
  'chat.export.phase.done': 'Done',
  'chat.export.phase.cancelled': 'Cancelled',
  'chat.export.phase.error': 'Something went wrong',
  'chat.export.empty': 'There are no messages to export yet.',
  'chat.export.error': 'The export could not be completed. Please try again.',
  'chat.export.unsupported': 'That export format is not available on this device.',
  'chat.imageViewer.title': 'Image viewer',
  'chat.imageViewer.open': 'Open image',
  'chat.imageViewer.prev': 'Previous',
  'chat.imageViewer.next': 'Next',
  'chat.imageViewer.zoomIn': 'Zoom in',
  'chat.imageViewer.zoomOut': 'Zoom out',
  'chat.imageViewer.fit': 'Fit',
  'chat.imageViewer.shortcuts': 'Shortcuts: ← →, +/-, 0',
  'chat.imageViewer.mimeUnknown': 'image',
  'turnStats.details': 'Details',
  'turnStats.timestamp': 'Date & time',
  'turnStats.title': 'Response metrics',
  'turnStats.model': 'Model',
  'turnStats.totalTime': 'Total time',
  'turnStats.ttft': 'Time to first token',
  'turnStats.promptTokens': 'Prompt tokens',
  'turnStats.completionTokens': 'Completion tokens',
  'turnStats.totalTokens': 'Total tokens',
  'turnStats.generationSpeed': 'Generation speed',
  'turnStats.estimated': 'estimated',
  'turnStats.estimatedShort': 'est.',
  'turnStats.nanoLead':
    'The Prompt API does not expose token usage. Prompt and completion values are rough estimates (~4 characters per token; each attached image adds a fixed overhead; attached text file characters are included roughly).',
  'composer.toolbarAria': 'Attach files, export chat, and view chat summary',
  'composer.mobileIdentityAria': 'Who is speaking in this thread',
  'composer.mobileChipAssistant': 'Assistant',
  'composer.mobileChipYou': 'You',
  'chat.attach.images': 'Attach images',
  'chat.attach.filesAndImages': 'Attach files and images',
  'chat.attach.hintUnavailable':
    'Image input requires the Prompt API multimodal flag in Chrome (see How to enable Gemini Nano).',
  'chat.attach.removeAria': 'Remove attachment',
  'chat.internal.userAttachmentsLine': 'Attached {n} file(s): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Review the attached images and/or text files and answer according to the user’s instructions.',
  'chat.attachments.maxCount': 'At most {n} images per message (multimodal limit).',
  'chat.attachments.maxTotal': 'At most {n} attachments per message (images + text files).',
  'chat.attachments.maxText': 'At most {n} text files per message.',
  'chat.attachments.fileTooLarge': '"{name}" exceeds the size limit ({limit}).',
  'chat.attachments.unsupportedFormat': '"{name}" is not a supported image type.',
  'chat.attachments.unsupportedFile': '"{name}" is not a supported attachment type.',
  'chat.attachments.imageReadFailed': 'Could not read the image.',
  'chat.attachments.textTooLarge': '"{name}" exceeds the text file size limit ({limit}).',
  'chat.attachments.textReadFailed': 'Could not read the text file.',
  'chat.textAttachment.previewChars': '{n} characters',
  'empty.attachHint':
    'Use the paperclip to attach images (with the multimodal Chrome flag) or UTF-8 text files such as .txt, .csv, or .md.',
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
    'Los ajustes y los chats se guardan en IndexedDB en este dispositivo. El prompt del sistema se envía al modelo cuando arranca la sesión de un chat.',
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
  'settings.storageQuotaLine': 'Almacenamiento: {used} MB en uso · {free} MB libres · {quota} MB de cupo',
  'settings.storageQuotaTitle':
    'Estimación de almacenamiento de este sitio: {used} MB en uso, {free} MB libres, {quota} MB de cupo total (navegador; incluye IndexedDB y otros datos persistidos).',
  'settings.storageQuotaUnavailable': 'No hay estimación de almacenamiento en este entorno.',
  'settings.storageQuotaUnavailableTitle': 'El navegador no informó detalles del cupo de almacenamiento.',
  'storage.pressureBanner':
    'El almacenamiento del navegador para este sitio está casi lleno. Liberá espacio para que se puedan guardar mensajes y adjuntos nuevos.',
  'storage.pressureBannerLink': 'Abrir ajustes de Datos',
  'settings.pruneOldestChats': 'Eliminar los chats más viejos (mantener esta pestaña)',
  'settings.pruneOldestChatsHelp':
    'Borra hilos de chat más antiguos (por última actualización) hasta que el almacenamiento estimado baje aproximadamente por debajo del 78% del cupo. Se conserva el chat activo siempre que exista otro hilo.',
  'settings.pruneOldestChatsTitle': '¿Eliminar los chats más viejos?',
  'settings.pruneOldestChatsBody':
    'Minerva va a borrar hilos más antiguos para reducir el almacenamiento. No se puede deshacer. Si solo queda un chat, puede que no se borre nada hasta que limpies los datos manualmente.',
  'settings.pruneOldestChatsAction': 'Eliminar los más viejos',
  'settings.prunedChatsNotice': 'Se eliminaron {n} chat(s).',
  'settings.pruneNoop': 'No se eliminó nada (el almacenamiento puede estar ya por debajo del objetivo, o solo hay un chat).',
  'settings.backup.lead':
    'Descargá un respaldo JSON con todos los chats (incluidos adjuntos) y la configuración de la app, o restaurá uno en otro equipo. Tratá los respaldos como datos privados.',
  'settings.backup.download': 'Descargar respaldo completo',
  'settings.backup.downloadDone': 'Respaldo descargado.',
  'settings.backup.restore': 'Restaurar desde archivo de respaldo…',
  'settings.backup.restoreHint': 'Elegí un archivo JSON exportado antes desde Minerva en esta u otra computadora.',
  'settings.backup.restoreConfirmTitle': '¿Reemplazar todos los datos con este respaldo?',
  'settings.backup.restoreConfirmBody':
    'El archivo “{name}” va a reemplazar todos los chats y la configuración de Minerva en este navegador. No se puede deshacer.',
  'settings.backup.restoreConfirmAction': 'Restaurar y recargar',
  'settings.backup.error.invalidFile': 'Ese archivo no es un respaldo válido de Minerva.',
  'settings.backup.error.invalidJson': 'El archivo de respaldo no es JSON válido.',
  'settings.backup.error.unsupportedVersion':
    'Ese respaldo se hizo con otra versión de Minerva y no se puede importar acá.',
  'settings.backup.error.schemaMismatch':
    'Ese respaldo no coincide con el formato de almacenamiento actual de la app. Actualizá Minerva o exportá un respaldo nuevo desde una versión compatible.',
  'settings.backup.error.fileTooLarge': 'Ese archivo de respaldo es demasiado grande para importarlo en el navegador.',
  'settings.backup.error.exportFailed': 'No se pudo crear el archivo de respaldo. Probá de nuevo.',
  'settings.backup.error.importFailed': 'No se pudo restaurar desde ese archivo. Probá de nuevo.',
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
  'chat.export.open': 'Exportar chat…',
  'chat.export.title': 'Exportar chat',
  'chat.export.lead':
    'Elegí un formato. Si el chat tiene imágenes, las descargas en HTML y Markdown van en un ZIP que podés descomprimir y abrir sin conexión.',
  'chat.export.format': 'Formato',
  'chat.export.formatHtml': 'HTML (con estilos)',
  'chat.export.formatMarkdown': 'Markdown',
  'chat.export.formatPdf': 'PDF',
  'chat.export.start': 'Descargar',
  'chat.export.cancel': 'Cancelar',
  'chat.export.metaExported': 'Exportado',
  'chat.export.footer': 'Exportado desde Minerva',
  'chat.export.phase.collecting': 'Preparando…',
  'chat.export.phase.building': 'Armando el documento…',
  'chat.export.phase.packaging': 'Creando ZIP…',
  'chat.export.phase.renderingPdf': 'Generando PDF…',
  'chat.export.phase.done': 'Listo',
  'chat.export.phase.cancelled': 'Cancelado',
  'chat.export.phase.error': 'Algo salió mal',
  'chat.export.empty': 'Todavía no hay mensajes para exportar.',
  'chat.export.error': 'No se pudo completar la exportación. Probá de nuevo.',
  'chat.export.unsupported': 'Ese formato de exportación no está disponible en este dispositivo.',
  'chat.imageViewer.title': 'Visor de imágenes',
  'chat.imageViewer.open': 'Abrir imagen',
  'chat.imageViewer.prev': 'Anterior',
  'chat.imageViewer.next': 'Siguiente',
  'chat.imageViewer.zoomIn': 'Acercar',
  'chat.imageViewer.zoomOut': 'Alejar',
  'chat.imageViewer.fit': 'Ajustar',
  'chat.imageViewer.shortcuts': 'Atajos: ← →, +/-, 0',
  'chat.imageViewer.mimeUnknown': 'imagen',
  'turnStats.details': 'Detalle',
  'turnStats.timestamp': 'Fecha y hora',
  'turnStats.title': 'Métricas de respuesta',
  'turnStats.model': 'Modelo',
  'turnStats.totalTime': 'Tiempo total',
  'turnStats.ttft': 'Tiempo al primer token',
  'turnStats.promptTokens': 'Tokens de prompt',
  'turnStats.completionTokens': 'Tokens de respuesta',
  'turnStats.totalTokens': 'Tokens totales',
  'turnStats.generationSpeed': 'Velocidad de generación',
  'turnStats.estimated': 'estimado',
  'turnStats.estimatedShort': 'est.',
  'turnStats.nanoLead':
    'La Prompt API no expone el conteo de tokens. Los valores de prompt y respuesta son estimaciones aproximadas (~4 caracteres por token; cada imagen adjunta suma un overhead fijo; los caracteres de archivos de texto adjuntos se incluyen de forma aproximada).',
  'composer.toolbarAria': 'Adjuntar archivos, exportar el chat y ver el resumen',
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
  'chat.attach.filesAndImages': 'Adjuntar archivos e imágenes',
  'chat.attach.hintUnavailable':
    'Las imágenes requieren el flag multimodal de la Prompt API en Chrome (mirá “Cómo habilitar Gemini Nano”).',
  'chat.attach.removeAria': 'Quitar adjunto',
  'chat.internal.userAttachmentsLine': 'Adjunté {n} archivo(s): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Revisá las imágenes y/o archivos de texto adjuntos y respondé según las instrucciones del usuario.',
  'chat.attachments.maxCount': 'Como máximo {n} imágenes por mensaje (límite multimodal).',
  'chat.attachments.maxTotal': 'Como máximo {n} adjuntos por mensaje (imágenes + archivos de texto).',
  'chat.attachments.maxText': 'Como máximo {n} archivos de texto por mensaje.',
  'chat.attachments.fileTooLarge': '"{name}" supera el límite de tamaño ({limit}).',
  'chat.attachments.unsupportedFormat': '"{name}" no es un tipo de imagen admitido.',
  'chat.attachments.unsupportedFile': '"{name}" no es un tipo de adjunto admitido.',
  'chat.attachments.imageReadFailed': 'No se pudo leer la imagen.',
  'chat.attachments.textTooLarge': '"{name}" supera el límite de tamaño para texto ({limit}).',
  'chat.attachments.textReadFailed': 'No se pudo leer el archivo de texto.',
  'chat.textAttachment.previewChars': '{n} caracteres',
  'empty.attachHint':
    'Usá el clip para adjuntar imágenes (con el flag multimodal de Chrome) o archivos de texto UTF-8 como .txt, .csv o .md.',
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
  'chat.internal.userAttachmentsLine': 'Adjunté {n} archivo(s): {names}',
  'chat.internal.attachmentsOnlyBody':
    'Revisá las imágenes y/o archivos de texto adjuntos y respondé según lo que pida la persona.',
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

