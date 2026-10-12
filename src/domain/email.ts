/**
 * Lightweight email check: "local@domain.tld", a single @, no whitespace,
 * and a dot inside the domain. Not full RFC 5322: actual delivery is the real validation.
 */
export function isValidEmail(value: string): boolean {
  if (/\s/.test(value)) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts as [string, string];
  const dot = domain.indexOf('.');
  return local.length > 0 && dot > 0 && dot < domain.length - 1;
}