import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useAppearance(): { dark: boolean } {
  const theme = useAppStore((state) => state.theme);
  const fontFamily = useAppStore((state) => state.fontFamily);
  const fontScale = useAppStore((state) => state.fontScale);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark
      ? 'dark'
      : theme === 'zotero' ? 'zotero' : 'light';
    document.documentElement.dataset.fontFamily = fontFamily;
    document.documentElement.style.setProperty('--ui-font-scale', String(fontScale / 100));
  }, [dark, fontFamily, fontScale, theme]);

  return { dark };
}
