import type { VoiceType } from '../types';

export const TYPE_LABEL: Record<VoiceType, string> = {
  'clear-bright': '透明感',
  'soft-bright': 'ふんわり軽やか',
  'clear-calm': '深み・安定',
  'soft-calm': 'やわらか包容',
};

export const FIXED_FOOTER =
  '声のかすれが長く続く(目安として4週間以上)、息苦しさや吸うときの音、痛み、痰に血が混じる、飲み込みにくさ、首のしこりがあるときは、医療機関(耳鼻咽喉科)に相談してください。このアプリは医療や診断のためのものではありません。';

export const STOP_NOTICE = '痛み、疲れ、かすれの悪化があれば、練習をやめてください。';

export const ALLOWED_FIXED_COPY: string[] = [FIXED_FOOTER, STOP_NOTICE];

export const BANNED_WORDS: string[] = [
  '診断', '検査', 'スクリーニング', '異常', '正常', 'リスク', '疑い', '悪化', '改善します', '高精度',
];

/** Acoustic-only descriptions; hedged, and a rough guide only. */
export const TYPE_DESCRIPTION: Record<VoiceType, string> = {
  'clear-bright':
    '高めの帯域のエネルギーが相対的に多く、声の倍音の構造が比較的そろっている傾向があります。',
  'soft-bright':
    '高めの帯域のエネルギーが相対的に多く、息の成分がやや混じった、空気を含んだ響きの傾向があります。',
  'clear-calm':
    '低めの帯域のエネルギーが相対的に多く、声の倍音の構造が比較的そろっている傾向があります。',
  'soft-calm':
    '低めの帯域のエネルギーが相対的に多く、息の成分がやや混じった、やわらかい響きの傾向があります。',
};

export const TENDENCY_MIXED_ALL =
  'いくつかのタイプの特徴が同じくらい混ざっていて、はっきり一つに寄らない傾向があります。';

export const TENDENCY_NOTE = 'これは音響的な特徴にもとづく大まかな目安で、条件によって変わるかもしれません。';

export const FOCUS = {
  clarity: '澄み具合',
  intonation: '抑揚',
  stability: '声の安定',
  speed: '話すスピード',
} as const;

export const STRENGTH_CLARITY = '声の輪郭が安定している傾向があります。';
export const STRENGTH_BRIGHTNESS = '明るい帯域がよく出ている傾向があります。';

const SAFE = '痛みや違和感があればすぐにやめます。';

export const WARMUP = {
  title: 'ウォームアップ',
  how: `ハミングまたはストロー発声で、楽な高さの声を2分ほど出します。力まず、息を長く細く流すつもりで。${SAFE}`,
};

export const TRANSFER = {
  title: '転移',
  how: `普段の声で短い文を読み上げ、練習で楽に出せた感覚を1分ほど試します。${SAFE}`,
};

export const GENERAL_STEP = {
  title: 'のびのび音読',
  how: `好きな文章を楽な声で3分ほど音読します。声の高さの変化は1回1〜2半音以内、声量の変化は数dB以内にとどめます。${SAFE}`,
};

export const FOCUS_STEP: Record<keyof typeof FOCUS, { title: string; how: string }> = {
  clarity: {
    title: '澄み具合の練習',
    how: `ストロー発声で、声がかすれずに続く楽な高さを探します。慣れたら「あー」を3秒ずつ、息を混ぜすぎない程度に。高さの変化は1回1〜2半音以内、声量の変化は数dB以内にします。${SAFE}`,
  },
  intonation: {
    title: '抑揚の練習',
    how: `短い文を、いつもより少しだけ高さに変化をつけて読みます。目安は本人比で+0.5〜1半音から。高さの変化は1回1〜2半音以内にします。${SAFE}`,
  },
  stability: {
    title: '声の安定の練習',
    how: `楽な高さで「あー」を5秒ほど、高さと大きさをそろえるつもりで出します。声量の変化は数dB以内にします。${SAFE}`,
  },
  speed: {
    title: '話すスピードの練習',
    how: `読み上げ文を、いつもの速さから10〜20%以内でゆっくり、または少し速めにして読みます。区切りの位置で軽く息を入れます。${SAFE}`,
  },
};
