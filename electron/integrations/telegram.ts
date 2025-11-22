export type TelegramResult = { ok: boolean; error?: string };

export async function sendTelegramMessage(_text: string): Promise<TelegramResult> {
  // TODO: send Telegram message
  throw new Error('Not implemented');
}

export async function sendTelegramVideo(_videoPath: string, _caption?: string): Promise<TelegramResult> {
  // TODO: send Telegram video
  throw new Error('Not implemented');
}

export async function testTelegram(): Promise<TelegramResult> {
  // TODO: send test message
  throw new Error('Not implemented');
}
