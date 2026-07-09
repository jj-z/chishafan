// 只定义基础字段，不包含任何 UI 框架的 icon 字段
export interface TabBarItem {
  key: string;      // 唯一标识，如 'home'
  path: string;     // 路由路径
  label: string;    // 显示文案
}