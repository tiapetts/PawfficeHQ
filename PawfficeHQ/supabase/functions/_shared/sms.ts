// Keep these helpers free of runtime dependencies so they can be unit tested.
export function normalizeSmsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

const gsmBasic = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const gsmExtended = new Set("\f^{}\\[~]|€");
export function smsSegments(text: string): number {
  let units = 0;
  for (const character of text) {
    if (gsmBasic.has(character)) units++;
    else if (gsmExtended.has(character)) units += 2;
    else return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  }
  return units <= 160 ? 1 : Math.ceil(units / 153);
}
export function isConfirmation(body: string): boolean {
  return /^(c|confirm|confirmed|yes|y)$/i.test(body.trim());
}
export function isOptOut(body: string, optOutType?: string): boolean {
  return optOutType === "STOP" ||
    /^(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout)$/i.test(
      body.trim(),
    );
}
const statusRank: Record<string, number> = {
  pending: 0,
  unknown: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
  undelivered: 3,
};
export function shouldAdvanceStatus(current: string, next: string): boolean {
  return next in statusRank && statusRank[next] > (statusRank[current] ?? -1);
}
