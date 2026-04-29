import { type Signal } from '../lib/utils';

export interface NotificationSettings {
  desktop: boolean;
  email: boolean;
  sms: boolean;
  emailAddress: string;
  phoneNumber: string;
}

export async function sendEmailNotification(signal: Signal, symbol: string, settings: NotificationSettings) {
  if (!settings.email || !settings.emailAddress) return;
  
  console.log(`[MOCK EMAIL] Sending to ${settings.emailAddress}: ${signal.type} signal for ${symbol} at ${signal.price}`);
  
  // In a real app, you would call an API route here:
  /*
  await fetch('/api/notify/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: settings.emailAddress,
      subject: `Trading Alert: ${signal.type} ${symbol}`,
      text: `${signal.type} signal detected for ${symbol} at ${signal.price}. Reason: ${signal.reason}`
    })
  });
  */
}

export async function sendSMSNotification(signal: Signal, symbol: string, settings: NotificationSettings) {
  if (!settings.sms || !settings.phoneNumber) return;
  
  console.log(`[MOCK SMS] Sending to ${settings.phoneNumber}: ${signal.type} signal for ${symbol} at ${signal.price}`);
  
  // In a real app, you would call an API route here:
  /*
  await fetch('/api/notify/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: settings.phoneNumber,
      message: `Trading Alert: ${signal.type} ${symbol} at ${signal.price}`
    })
  });
  */
}
