import type { TabBarItem } from '../types';

export const CORE_TAB_BAR_CONFIG: TabBarItem[] = [
  { key: 'home', path: '/', label: '今日推荐' },
  { key: 'dishlist', path: '/dishlist', label: '食物集' },
  { key: 'records', path: '/records', label: '记录' },
  { key: 'mine', path: '/mine', label: '我的' },
] as const;