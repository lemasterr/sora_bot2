# Sora Desktop

A modern Electron + React desktop shell for Sora automation. It ships with session-aware Chrome profiles, prompt and download pipelines, watermark previews, and Telegram configuration in a dark admin UI.

## Возможности
- Electron main process with context-isolated preload bridge for safe IPC.
- React 19 + Vite renderer styled with Tailwind (dark admin theme).
- Session manager for per-profile prompt/title files, downloads, and logs.
- Puppeteer-based automation for prompt submission and draft downloads.
- Watermark preview generation and Telegram test hooks via IPC.

## Требования
- Node.js 18+ и npm.
- Google Chrome/Chromium (путь задаётся в настройках).
- ffmpeg, если планируется генерация предпросмотров водяных знаков.

## Запуск приложения

### Запуск в режиме разработки (Electron)
1. Установите зависимости:
   ```bash
   npm install
   ```
2. Запустите приложение:
   ```bash
   npm run dev
   ```
   Эта команда собирает main-процесс, поднимает Vite на `http://localhost:5173` и автоматически открывает окно Electron с подключённым preload‑мостом.

При желании можно использовать вспомогательный скрипт:
```bash
./start.sh
```
Он выполняет те же действия (установка зависимостей при необходимости и запуск `npm run dev`).

### Сборка продакшн-версии
1. Убедитесь, что зависимости установлены:
   ```bash
   npm install
   ```
2. Выполните сборку:
   ```bash
   npm run build
   ```
   Готовую сборку ищите в каталоге `dist/` (рендерер) и итоговый установочный пакет — в `dist/` после работы electron-builder (например, `dist/mac-arm64/`).

### Зачем нужен ElectronGuard
Основной сценарий — запуск внутри Electron. При открытии `http://localhost:5173` напрямую в браузере preload не доступен, поэтому в интерфейсе показывается предупреждение о необходимости запустить десктопное приложение. Этого можно избежать, используя только `npm run dev` или собранный пакет.

## Структура проекта
- `electron/` – main процесс, preload, автоматизация, конфиг и управление сессиями.
- `src/` – React-рендерер и Zustand store.
- `shared/` – общие типы TypeScript между main и renderer.
- `tailwind.config.cjs`, `postcss.config.cjs` – настройка стилей.
- `tsconfig.json`, `tsconfig.electron.json` – конфигурации TypeScript для рендерера и Electron.

## Конфигурация
Во время работы приложение хранит конфиг (корневая папка сессий, пути Chrome/ffmpeg, тайминги, токены Telegram и т.д.) в каталоге `userData` Electron. Изменения вносятся на странице Settings и сохраняются на диск.

## Сессии и данные
Каждая сессия лежит в настроенной `sessionsRoot`:

```
<sessionsRoot>/<sessionName>/
  prompts.txt
  image_prompts.txt
  titles.txt
  submitted.log
  failed.log
  profile/
  downloads/
```

Используйте страницы Sessions и Content для редактирования файлов, отправки промтов и запуска скачивания черновиков. Логи копятся по каждой сессии.

## Примечания
- Автоматизация предполагает, что вы авторизованы в Sora в выбранном профиле Chrome.
- Puppeteer использует `chromeExecutablePath` из настроек — укажите его перед запуском автоматизации.
- Водяные знаки требуют ffmpeg; если его нет, IPC вернёт контролируемую ошибку.
