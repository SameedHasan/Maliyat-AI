import * as LocalAuthentication from 'expo-local-authentication';

export type AuthResult = 'success' | 'failed' | 'unavailable';

let inProgress = false;

/** The system prompt can background the activity; the lock gate ignores those transitions. */
export function isAuthenticating(): boolean {
  return inProgress;
}

/** True when the device has any screen lock (PIN, pattern, password or biometrics). */
export async function isDeviceAuthAvailable(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/** Biometrics with the device credential as fallback. */
export async function authenticate(
  promptMessage: string,
  cancelLabel: string,
): Promise<AuthResult> {
  if (inProgress) return 'failed';
  inProgress = true;
  try {
    if (!(await isDeviceAuthAvailable())) return 'unavailable';
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel });
    return result.success ? 'success' : 'failed';
  } finally {
    inProgress = false;
  }
}
