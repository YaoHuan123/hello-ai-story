export function normalizePhoneDigits(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.length === 13 && digits.startsWith("86") ? digits.slice(2) : digits;
  if (!/^1\d{10}$/.test(local)) return null;
  return local;
}
