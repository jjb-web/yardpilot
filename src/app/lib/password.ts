export const PASSWORD_REQUIREMENTS = [
  "At least 10 characters",
  "One uppercase and one lowercase letter",
  "At least one number",
  "At least one symbol",
] as const;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "qwerty123",
  "letmein123",
  "yardpilot",
  "yardpilotusa",
]);

export function passwordError(password: string): string {
  if (password.length < 10) return PASSWORD_REQUIREMENTS[0];
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return PASSWORD_REQUIREMENTS[1];
  }
  if (!/\d/.test(password)) return PASSWORD_REQUIREMENTS[2];
  if (!/[^A-Za-z0-9]/.test(password)) return PASSWORD_REQUIREMENTS[3];
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "Choose a less common password.";
  }
  return "";
}

export function passwordRequirements(password: string) {
  return [
    { label: PASSWORD_REQUIREMENTS[0], met: password.length >= 10 },
    {
      label: PASSWORD_REQUIREMENTS[1],
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { label: PASSWORD_REQUIREMENTS[2], met: /\d/.test(password) },
    { label: PASSWORD_REQUIREMENTS[3], met: /[^A-Za-z0-9]/.test(password) },
  ];
}
