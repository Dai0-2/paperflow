export const API_MODEL_OPTIONS = [
  'gpt-5.5',
  'gpt-5.6',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4o-mini',
];

export const CUSTOM_API_MODEL = '__custom__';

export function isPresetApiModel(model: string): boolean {
  return API_MODEL_OPTIONS.includes(model);
}
