// src/lib/ai/entityResolver.ts
// Fuzzy name → entity resolution shared by every AI command module.
// Business rule: partial case-insensitive match; zero matches and multiple
// matches are both LOUD errors the assistant relays verbatim — the AI never
// picks between ambiguous parties silently.

interface Named { id: string; name: string }

export function resolveEntity<T extends Named>(
  list: T[],
  needle: string,
  what: string
): { party?: T; error?: string } {
  const n = needle.trim().toLowerCase();
  if (!n) return { error: 'No ' + what + ' name was given.' };
  const matches = list.filter(x => x.name.toLowerCase().includes(n));
  if (matches.length === 0) return { error: 'No ' + what + ' found matching "' + needle + '".' };
  if (matches.length > 1) {
    return {
      error: 'Multiple ' + what + 's match: ' + matches.map(m => '"' + m.name + '"').join(', ') +
        '. Be more specific.',
    };
  }
  return { party: matches[0] };
}
