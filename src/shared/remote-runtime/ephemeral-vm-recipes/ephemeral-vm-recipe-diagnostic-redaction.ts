import { stripCredentialsFromMessage } from '../../git/remotes/git-remote-error'

// Kept apart from the result diagnostics so browser bundles can redact without the pairing codec.
export function redactEphemeralVmRecipeDiagnosticText(text: string): string {
  if (!text) {
    return text
  }
  return stripCredentialsFromMessage(text)
    .replace(/orca:\/\/pair\?code=[A-Za-z0-9_-]+/g, 'orca://pair?code=[redacted]')
    .replace(
      /("(?:pairingCode|deviceToken|publicKeyB64|token|secret|password|apiKey|accessToken|identityFile|identityAgent|proxyCommand)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"'
    )
}

const RECIPE_STDERR_TAIL_LINES = 8
const RECIPE_STDERR_TAIL_MAX_CHARS = 1_200

/** Adds the last lines a failed recipe script printed, so "exited with code 1" says why. */
export function appendRecipeStderrTail(error: string, stderr: string | undefined): string {
  const tail = redactEphemeralVmRecipeDiagnosticText(stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-RECIPE_STDERR_TAIL_LINES)
    .join('\n')
    .slice(-RECIPE_STDERR_TAIL_MAX_CHARS)
  return tail ? `${error}\n${tail}` : error
}
