const VALIDATION_BASE_URL = new URL('https://eventhub.invalid');

function hasUnsafeCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      character === '\\' ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return true;
    }
  }

  return false;
}

function isSafeInternalPath(candidate) {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    hasUnsafeCharacters(candidate)
  ) {
    return false;
  }

  let decodedCandidate;
  try {
    decodedCandidate = decodeURIComponent(candidate);
  } catch {
    return false;
  }

  if (hasUnsafeCharacters(decodedCandidate)) return false;

  try {
    const parsedCandidate = new URL(candidate, VALIDATION_BASE_URL);
    return parsedCandidate.origin === VALIDATION_BASE_URL.origin;
  } catch {
    return false;
  }
}

export function getSafeRedirectDestination(from, next) {
  if (isSafeInternalPath(from)) return from;
  if (isSafeInternalPath(next)) return next;
  return '/';
}
