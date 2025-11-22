export interface TelegramMessageResult {
  ok: boolean;
  error?: string;
}

export const sendTestMessage = async (_message: string): Promise<TelegramMessageResult> => {
  throw new Error("Not implemented");
};

export const sendVideoNotification = async (_videoPath: string): Promise<TelegramMessageResult> => {
  throw new Error("Not implemented");
};
