import type { Language } from './types';

export const text = (language: Language, english: string, chinese: string) => language === 'zh' ? chinese : english;
