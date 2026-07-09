import type { TabBarItem } from '../types/tabbar';

export const CORE_TAB_BAR_CONFIG: TabBarItem[] = [
  { key: 'home', path: '/', label: '帮我选' },
  { key: 'dish', path: '/dishlist', label: '食谱' },
  { key: 'record', path: '/records', label: '记录' },
  { key: 'mine', path: '/mine', label: '我的' },
] as const;