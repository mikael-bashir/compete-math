// What the colours in the universe mean, and what its lines and glows mean. Shown beside the visualiser, not on it. Short, and without jargon.
export const UNIVERSE_LEGEND: { color: string; label: string }[] = [
  { color: '#d9d2bb', label: 'a trusted theorem' },
  { color: '#1fb8ff', label: 'the driver' },
  { color: '#fff2cc', label: 'search by shape (Leak I loogle)' },
  { color: '#ff9e4d', label: 'search by idea (Leak I moogle)' },
  { color: '#ffd98a', label: 'a proof being checked (Leak IV)' },
  { color: '#9eff8c', label: 'accepted' },
  { color: '#f24d38', label: 'rejected' },
  { color: '#9a6bff', label: 'the driver’s library: theorems it has saved' },
];

export const UNIVERSE_NOTES: string[] = [
  'The cyan ring is the driver: where its attention is now, with a short tail where it just was.',
  'A search sends threads to the stars it found, strongest to the best match. When a proof is accepted, the lemmas it used light up together, and the link between them joins a golden web that grows brighter the more it is used. A line means “used together in an accepted proof”, not “implies”.',
  'Light fades with age: recent work burns bright, old work dims but never vanishes, so the sky stays readable however long the run.',
  'The violet cloud is the driver’s own library, each dot a theorem it has saved, tinted by the area it leans on, with a thread to the areas it builds on.',
  'When the target is proved, the sky goes still, the target is born as a star in the library, and light runs back through everything the proof is built from, which keeps a golden thread.',
];
