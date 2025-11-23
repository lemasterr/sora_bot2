# Sora Desktop

Electron + React desktop приложение для автоматизации работы с Sora: управление сессиями и Chrome-профилями, отправка промптов, скачивание черновиков, обработка водяных знаков/blur/merge и Telegram-уведомления.

## Страницы приложения

### Dashboard
- Статистика по дням (промпты, загрузки, ошибки) и мини-граф активности.
- Top Sessions: ТОП-5 сессий по скачкам/активности.
- Быстрый статус всех сессий и пайплайна.

### Sessions
- Работа с `ManagedSession`: `id`, `name`, `chromeProfileName`, `promptProfile`, `cdpPort`, файлы `promptsFile`, `imagePromptsFile`, `titlesFile`, логи `submittedLog`/`failedLog`, директории `downloadDir`/`cleanDir`, `cursorFile`, `maxVideos`, `openDrafts`, `autoLaunchChrome`, `autoLaunchAutogen`, `notes`, `status`.
- Создание, сохранение, удаление, клонирование и health-check сессий.
- Запуск/остановка Autogen и Downloader, просмотр последней статистики.

### Content
- Редактор промптов, тайтлов и image-промптов, привязанных к активному Chrome-профилю.
- Переключение профиля, счётчики строк, сохранение/перезагрузка файлов.

### Automator
- Конструктор Pipeline со шагами: `session_prompts`, `session_images`, `session_mix`, `session_download`, `session_watermark`, `session_chrome`, `global_blur`, `global_merge`.
- Поддержка нескольких `sessionIds` в шаге, лимитов скачек (0 = без ограничения) и статуса прогресса.
- Драй-ран и запуск/стоп пайплайна.

### Downloader
- Ручной запуск загрузчика с лимитом скачек (0 = без ограничения) и просмотром статуса.

### Watermark / Blur
- Предпросмотр кадров, применение blur-профилей, вызов скриптов водяного знака/очистки.

### Telegram
- Настройка токена и chat id, опциональные уведомления (finish/error/watchdog/cleanup), тестовые сообщения.

### Logs
- Поток логов (ipc, pipeline, autogen, downloader и т.д.), фильтры по уровню и источнику, экспорт/открытие папки логов.

### Settings
- `sessionsRoot`, `chromeExecutablePath`, `chromeUserDataDir`, активный Chrome-профиль, `ffmpegPath`.
- Тайминги: `promptDelayMs`, `draftTimeoutMs`, `downloadTimeoutMs`, `maxParallelSessions`.
- Cleanup-параметры, пути и опции Telegram, сохранение конфигурации.

## Установка и запуск

```bash
npm install
```

### Dev (Electron)
```bash
npm run dev
```
- Собирает main-процесс (dist-electron/electron/main.js), поднимает Vite на `http://localhost:5173` и запускает окно Electron с preload-мостом.
- Открывать URL в браузере не требуется: основной сценарий — через Electron; в браузере сработает ElectronGuard и предупредит об отсутствии backend.

### Production build
```bash
npm run build
```
- Собирает рендерер (`vite build`), main-процесс (`tsc -p tsconfig.electron.json`) и упаковывает electron-builder.
- Готовые артефакты ищите в `dist/` (рендерер) и итоговый инсталлятор в `dist/` после electron-builder (например, `dist/mac-arm64/`).

## Дополнительно
- Требуется Node.js 18+, установленный Chrome/Chromium и ffmpeg (для превью/blur).
- Конфиг хранится в каталоге `userData` Electron и редактируется на странице Settings.
