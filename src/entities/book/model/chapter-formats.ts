export type ChapterFormatId = 'both' | 'apple' | 'nero';

export type ChapterFormatOption = {
  id: ChapterFormatId;
  label: string;
  badge?: string;
  description: string;
  /** Popular players known to read this format. */
  examples: string[];
  quickTime: boolean;
  nero: boolean;
};

export const CHAPTER_FORMATS: readonly ChapterFormatOption[] = [
  {
    id: 'both',
    label: 'Both formats',
    badge: 'Recommended',
    description: 'Works in practically every player: each app reads the format it understands. Keep this if you are not sure.',
    examples: ['Apple Books', 'BookPlayer', 'VLC', 'foobar2000'],
    quickTime: true,
    nero: true,
  },
  {
    id: 'apple',
    label: 'Apple chapters',
    description: 'QuickTime chapter track, the only format Apple apps read. Other iPhone players and some Android ones read it too.',
    examples: ['Apple Books', 'Apple Music / iTunes', 'BookPlayer', 'Symfonium'],
    quickTime: true,
    nero: false,
  },
  {
    id: 'nero',
    label: 'Nero chapters',
    description: 'Simple chapter list read by desktop players and tag editors. Ignored by Apple apps; at most 255 chapters.',
    examples: ['foobar2000', 'VLC', 'Mp3tag'],
    quickTime: false,
    nero: true,
  },
];

export const getChapterFormat = (id: ChapterFormatId): ChapterFormatOption =>
  CHAPTER_FORMATS.find((format) => format.id === id) ?? CHAPTER_FORMATS[0];
