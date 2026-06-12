const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Genera un código de invitación legible sin caracteres ambiguos
export function generateInviteCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('');
}

// Normaliza códigos ingresados por el usuario
export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

// Construye enlace de invitación para compartir
export function buildInviteLink(inviteCode: string): string {
  const normalized = normalizeInviteCode(inviteCode);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://finsync-tau.vercel.app';
  return `${baseUrl}/?join=${normalized}`;
}
