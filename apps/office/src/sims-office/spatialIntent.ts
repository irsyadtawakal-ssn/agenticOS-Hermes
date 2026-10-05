import { PROFILES } from '../hermes/labels.ts';

export type SpatialAction = 'gather_chief_office' | 'gather_meeting_room' | 'return_workstation' | 'go_pantry';

export interface SpatialIntentResult {
  action: SpatialAction;
  targets: string[];
  isAll: boolean;
  rawText: string;
}

const CHIEF_OFFICE_REGEX =
  /(?:(?:ke|di|masuk\s+ke|menghadap|merapat\s+ke)?\s*ruang(?:an)?\s*(?:saya|bos|chief|pimpinan)|keruang(?:an)?\s*(?:saya|bos|chief|pimpinan)|(?:kumpul|meeting|rapat)\s+(?:ke|di)\s+ruang(?:an)?\s*(?:saya|bos|chief)|(?:ke\s+)?meja\s+saya|menghadap\s+(?:ke\s+)?saya|(?:ke\s*sini|kesini)\s*(?:sekarang|dulu|dong)?|come\s+(?:here|to\s+my\s+(?:office|room|desk)))/i;

const MEETING_ROOM_REGEX =
  /(?:(?:ke|di|masuk\s+ke)?\s*ruang(?:an)?\s*(?:rapat|meeting|konferensi|diskusi)|keruang(?:an)?\s*(?:rapat|meeting|konferensi|diskusi)|(?:kumpul|meeting|rapat)\s+(?:ke|di)\s+ruang(?:an)?\s*(?:rapat|meeting)|rapat\s+tim|meeting\s+tim|mulai\s+(?:rapat|meeting)|ke\s+war\s*room|go\s+to\s+(?:the\s+)?meeting\s+room)/i;

const RETURN_WORKSTATION_REGEX =
  /(?:kembali\s+(?:ke\s+)?(?:meja|kerja|workstation)|balik\s+(?:ke\s+)?(?:meja|kerja|workstation)|selesai\s+(?:rapat|meeting)|bubar|back\s+to\s+(?:work|desk))/i;

const GO_PANTRY_REGEX =
  /(?:ke\s+pantry|ke\s+dapur|istirahat\s+(?:dulu|sejenak)?|ambil\s+kopi|ngopi\s+(?:dulu)?|go\s+to\s+(?:the\s+)?pantry)/i;

const ALL_KEYWORDS_REGEX =
  /\b(?:semua|semuanya|all|everyone|tim|kalian|guys)\b/i;

/**
 * Parses user or agent chat message for office spatial intent.
 *
 * @param text The message text to analyze.
 * @param recipients The explicit recipients of the message: either a single profile ('crib'), 'all', or an array of profiles (e.g. ['clara', 'crib']).
 * @returns SpatialIntentResult if a spatial command is detected, null otherwise.
 */
export function parseOfficeSpatialIntent(
  text: string,
  recipients?: string[] | string | null
): SpatialIntentResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let action: SpatialAction | null = null;
  if (CHIEF_OFFICE_REGEX.test(trimmed)) {
    action = 'gather_chief_office';
  } else if (MEETING_ROOM_REGEX.test(trimmed)) {
    action = 'gather_meeting_room';
  } else if (RETURN_WORKSTATION_REGEX.test(trimmed)) {
    action = 'return_workstation';
  } else if (GO_PANTRY_REGEX.test(trimmed)) {
    action = 'go_pantry';
  }

  if (!action) return null;

  const isAllExplicit = ALL_KEYWORDS_REGEX.test(trimmed);
  const detectedTargets = new Set<string>();

  // 1. Check profiles explicitly mentioned in the text (e.g. "@adelia", "bersama adelia", "clara")
  for (const p of PROFILES) {
    const pRegex = new RegExp(`(?:@|\\b)${p}\\b`, 'i');
    if (pRegex.test(trimmed)) {
      detectedTargets.add(p);
    }
  }

  // 2. Extract explicit recipients (from chat tab or broadcast target selection)
  const explicitRecipients: string[] = [];
  if (Array.isArray(recipients)) {
    for (const r of recipients) {
      if (PROFILES.includes(r) && !explicitRecipients.includes(r)) {
        explicitRecipients.push(r);
      }
    }
  } else if (typeof recipients === 'string' && recipients !== 'all' && PROFILES.includes(recipients)) {
    explicitRecipients.push(recipients);
  }

  // If specific profiles were mentioned in the prompt, combine them with explicit recipients
  // (e.g. user chatting with crib says "kumpul di ruangan saya bersama adelia" -> ['crib', 'adelia'])
  if (detectedTargets.size > 0) {
    for (const r of explicitRecipients) {
      detectedTargets.add(r);
    }
  }

  // 3. Determine if command targets ALL agents:
  // - If text explicitly says "semua", "all", "tim", "kalian" -> TRUE
  // - Else if no text mentions AND recipients is 'all' (or not specified) -> TRUE
  // - Else if recipients was specifically chosen (e.g. ['clara', 'crib']) -> FALSE!
  const isAll =
    isAllExplicit ||
    (detectedTargets.size === 0 &&
      (!recipients ||
        recipients === 'all' ||
        (Array.isArray(recipients) && recipients.length >= PROFILES.length)));

  let targets: string[];
  if (isAll) {
    targets = [...PROFILES];
  } else if (detectedTargets.size > 0) {
    targets = Array.from(detectedTargets);
  } else if (explicitRecipients.length > 0) {
    targets = explicitRecipients;
  } else {
    targets = [...PROFILES];
  }

  return {
    action,
    targets,
    isAll,
    rawText: trimmed,
  };
}
