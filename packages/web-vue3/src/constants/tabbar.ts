import { CORE_TAB_BAR_CONFIG, type TabBarItem } from '@chisha/core';
import type { TabbarItem as VantTabbarItem } from 'vant'; // 伪代码示意

// 映射 Vant 图标：由 core 的 key 决定使用哪个 Vant 图标
const VANT_ICON_MAP: Record<string, string> = {
  home: 'home-o',
  dish: 'search',    // 假设食谱用搜索图标
  record: 'friends-o',
  mine: 'setting-o',
};

// 扩展基础配置，生成带 Vant 图标的完整配置
export const VUE3_TAB_BAR_CONFIG = CORE_TAB_BAR_CONFIG.map((item) => ({
  ...item,
  icon: VANT_ICON_MAP[item.key] || 'question-o',
}));