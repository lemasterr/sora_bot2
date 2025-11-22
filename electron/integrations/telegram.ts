import axios from "axios";
import FormData from "form-data";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import { getConfig } from "../config/config";

export interface TelegramResult {
  ok: boolean;
  error?: string;
}

const TELEGRAM_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // ~50MB limit

const resolveTelegramConfig = async (): Promise<{ token: string; chatId: string } | null> => {
  const config = await getConfig();
  const { telegram } = config;

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return null;
  }

  return { token: telegram.botToken, chatId: telegram.chatId };
};

const friendlyError = (error: any): string => {
  if (error?.response?.data?.description) return String(error.response.data.description);
  if (error?.message) return String(error.message);
  return "telegram request failed";
};

export const sendTelegramMessage = async (text: string): Promise<TelegramResult> => {
  const cfg = await resolveTelegramConfig();
  if (!cfg) return { ok: false, error: "telegram disabled" };

  const url = `https://api.telegram.org/bot${cfg.token}/sendMessage`;

  try {
    const response = await axios.post(url, { chat_id: cfg.chatId, text });
    if (response.data?.ok) return { ok: true };
    return { ok: false, error: response.data?.description ?? "telegram api error" };
  } catch (error: any) {
    return { ok: false, error: friendlyError(error) };
  }
};

export const sendTelegramVideo = async (videoPath: string, caption?: string): Promise<TelegramResult> => {
  const cfg = await resolveTelegramConfig();
  if (!cfg) return { ok: false, error: "telegram disabled" };

  try {
    const stat = await fs.stat(videoPath);
    if (!stat.isFile()) {
      return { ok: false, error: "video file not found" };
    }
    if (stat.size > TELEGRAM_MAX_VIDEO_BYTES) {
      return { ok: false, error: "video exceeds 50MB limit" };
    }

    const url = `https://api.telegram.org/bot${cfg.token}/sendVideo`;
    const form = new FormData();
    form.append("chat_id", cfg.chatId);
    if (caption) form.append("caption", caption);
    form.append("video", createReadStream(videoPath), {
      filename: path.basename(videoPath),
    });

    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    if (response.data?.ok) return { ok: true };
    return { ok: false, error: response.data?.description ?? "telegram api error" };
  } catch (error: any) {
    return { ok: false, error: friendlyError(error) };
  }
};

export const testTelegram = async (): Promise<TelegramResult> => sendTelegramMessage("Sora Suite: test message");

// Legacy aliases for compatibility
export const sendTestMessage = testTelegram;
export const sendVideoNotification = sendTelegramVideo;
