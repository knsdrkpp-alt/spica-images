import { BANNED_WORDS } from '../../src/diagnosis/copy';
import { EXTRA_BANNED_STEMS } from '../../src/numerology/copy';

/** Everything that must never appear in the 声と数のあいだ reading (text or attributes). */
export const READING_FORBIDDEN: string[] = [
  ...BANNED_WORDS, ...EXTRA_BANNED_STEMS, 'ぬくもり',
  'あなた', 'になります', '本当の自分', '本質', '健康', '病', 'お金', '金運', '収入', '稼', '恋', '結婚',
  '運命', '幸運', '開運', '寿命', '成功', '必ず',
];

export const forbiddenIn = (s: string): string[] => READING_FORBIDDEN.filter((w) => s.includes(w));
