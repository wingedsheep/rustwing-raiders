/**
 * The people you meet between fights, and how each comes across: a name, what they are, a colour
 * for their name plate, how fast their words arrive, and the voice their barks are in
 * (public/audio/voices/<voice>/). Lore for each: docs/npcs/, their peoples: docs/lore/peoples.md.
 *
 * Every kind is in the mix on purpose: humans (the Ostranders), the Reach's other peoples (one
 * strange feature each), machines that woke (nemva, docs/lore/minds.md), and creatures.
 */

export type CastKind = 'human' | 'alien' | 'machine' | 'creature';

export interface CastMember {
  name: string;
  /** What they do, and what they are, under the name. */
  role: string;
  kind: CastKind;
  /** Name plate and quote colour. */
  color: string;
  /** Letters a second as their words arrive (Seffa slow, Squit fast). */
  pace: number;
  /** A folder of barks in public/audio/voices/ (none: silent). */
  voice?: string;
}

export const CAST = {
  // ---- humans ----
  mama: { name: 'MAMA RUZZ', role: 'MONEYLENDER · HUMAN', kind: 'human', color: '#ff8a7a', pace: 70, voice: 'mama' },
  spoke: { name: 'SPOKE', role: 'WHO RUNS THE REELS · HUMAN', kind: 'human', color: '#ffd04a', pace: 80, voice: 'spoke' },
  holloway: { name: 'INSPECTOR HOLLOWAY', role: 'PORT AUTHORITY · HUMAN', kind: 'human', color: '#8ad0ff', pace: 55, voice: 'holloway' },
  pip: { name: 'PIP HOLLOW', role: 'LANTERN MUTUAL · HUMAN', kind: 'human', color: '#ff8ae0', pace: 95, voice: 'pip' },
  nell: { name: 'BIG NELL', role: 'FUEL MERCHANT · HUMAN', kind: 'human', color: '#ffb04a', pace: 75, voice: 'nell' },
  rollo: { name: 'ROLLO STAX', role: 'THE VOICE OF THE LANES · HUMAN', kind: 'human', color: '#ffe08a', pace: 100, voice: 'rollo' },
  kaspar: { name: 'KASPAR', role: 'WHO HUNTS FOR BOUNTIES · HUMAN', kind: 'human', color: '#ff5a4a', pace: 50, voice: 'kaspar' },
  juno: { name: 'CAPTAIN JUNO PELL', role: 'COURIER, ADRIFT · HUMAN', kind: 'human', color: '#ffc08a', pace: 80, voice: 'juno' },
  brask: { name: 'CAPTAIN ODO BRASK', role: 'THE LAST CONVOY · HUMAN', kind: 'human', color: '#c8bca8', pace: 55, voice: 'brask' },
  varga: { name: 'DR I. VARGA', role: "SHIP'S SURGEON · HUMAN", kind: 'human', color: '#a8f0ff', pace: 85, voice: 'varga' },
  wick: { name: 'WICK TARROW', role: 'THE OLDEST RUSTWING · HUMAN', kind: 'human', color: '#e8a86a', pace: 45, voice: 'wick' },
  // ---- the Reach's other peoples ----
  seffa: { name: 'OLD MOTHER SEFFA', role: 'LANE-READER · HOOWAE', kind: 'alien', color: '#d8c8ff', pace: 32, voice: 'seffa' },
  twins: { name: 'GROHH AND VUKKA', role: 'BROKERS, TWO PERSONS · VHOSSK', kind: 'alien', color: '#c8b48a', pace: 60, voice: 'grohh' },
  tobbo: { name: 'TOBBO GRISK', role: 'JUNK DEALER · BAHWOH', kind: 'alien', color: '#b8f06a', pace: 95, voice: 'tobbo' },
  skree: { name: 'THE CHIKTA', role: 'SALVAGERS · "SKREE"', kind: 'alien', color: '#ffe85a', pace: 110, voice: 'skree' },
  squit: { name: 'SQUIT', role: 'WHO HEARS THINGS · EEFEE', kind: 'alien', color: '#8af0a0', pace: 120, voice: 'squit' },
  ledger: { name: 'CLERK TEKKEH-OTTEX', role: 'THE LEDGER CLAN · KEHX', kind: 'alien', color: '#e0e0d0', pace: 60, voice: 'ledger' },
  vaelmira: { name: 'LADY VAELMIRA', role: 'A COLLECTOR · VAELO', kind: 'alien', color: '#ffb0e8', pace: 40, voice: 'vaelmira' },
  census: { name: 'CENSOR ASHQEL', role: 'OF THE THRONE · ZHAUN', kind: 'alien', color: '#f0f4ff', pace: 38, voice: 'census' },
  // ---- machines that woke ----
  holly: { name: 'UNIT 7-HOLLY', role: 'TOLL RELAY 41 · A WOKEN CORE', kind: 'machine', color: '#8affe0', pace: 90, voice: 'holly' },
  ferrule: { name: 'SAINT FERRULE', role: 'KEEPER OF SHIPS · A WOKEN CORE', kind: 'machine', color: '#ffcf8a', pace: 40, voice: 'ferrule' },
  choir: { name: 'THE TAMSIN LOWE', role: 'THE CHOIR OF MIREFALL · BLOOM', kind: 'machine', color: '#c8ff5a', pace: 45, voice: 'choir' },
  wren: { name: 'THE WREN', role: 'A FREIGHTER THAT WOKE · NEMVA', kind: 'machine', color: '#a8d8ff', pace: 70, voice: 'wren' },
  // ---- creatures ----
  leeches: { name: 'HULL LEECHES', role: 'LANE PARASITES', kind: 'creature', color: '#ff8a5a', pace: 70, voice: 'leeches' },
  calf: { name: 'AN UMORA CALF', role: 'A LANE-WHALE, LOST', kind: 'creature', color: '#9ad8ff', pace: 50, voice: 'umora' },
} satisfies Record<string, CastMember>;

export type CastId = keyof typeof CAST;

export const castOf = (id: string): CastMember | null => (CAST as Record<string, CastMember>)[id] ?? null;
