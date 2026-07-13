// 餐时分类
export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'supper' | 'teatime'

// 菜系（初期列举常见，后期可扩展）
export type Cuisine = '川菜' | '粤菜' | '湘菜' | '鲁菜' | '苏菜' | '闽菜' | '浙菜' | '徽菜' | '西餐' | '日料' | '韩餐' | '东南亚' | '其他' | '淮扬菜' | '东北菜' | '新疆菜' | '西北菜' | '台湾菜' | '港式茶餐厅' | '快餐' | '素食' | '烧烤' | '火锅' | '小吃' | '甜品' | '饮品'

// 口味
export type Taste = '辣' | '酸' | '甜' | '咸鲜' | '清淡' | '麻辣' | '酸甜'

// 难度
export type Difficulty = '简单' | '中等' | '困难'

// 用餐人数场景
export type MealScene = '单人' | '家庭' | '老人' | '儿童' | '聚餐' | '节日' | '工作简餐' | '宴请' | '其他'

// 核心菜品接口
/**
 * 核心菜品接口
 * 用于描述系统中的一道完整菜品信息
 */
export interface Dish {
  /**
   * 菜品唯一标识符
   * @example 'dish_001'
   */
  id: string

  /**
   * 菜品名称
   * @example '宫保鸡丁'
   */
  name: string

  /**
   * 所属餐次（早/午/晚/加餐）
   * 建议使用枚举类型 MealTime 定义可选值
   * @example MealTime.LUNCH
   */
  mealTime: MealTime

  /**
   * 菜系分类（如川菜、粤菜、鲁菜等）
   * 建议使用枚举类型 Cuisine 定义可选值
   * @example Cuisine.SICHUAN
   */
  cuisine: Cuisine

  /**
   * 口味特征（可多选）
   * 例如：辣、甜、咸、酸等，用数组表示
   * 建议使用枚举类型 Taste[] 定义可选值
   * @example [Taste.SPICY, Taste.SALTY]
   */
  taste: Taste[]

  /**
   * 主要食材列表
   * 由于食材库会动态扩展，暂用 string 数组
   * @example ['鸡胸肉', '花生', '干辣椒']
   */
  ingredients: string[]

  /**
   * 过敏原信息列表
   * 可包含如 '花生', '虾', '鸡蛋' 等
   * 未来可扩展为枚举联合类型
   * @example ['花生', '麸质']
   */
  allergens: string[]

  /**
   * 菜品热量（单位：千卡 kcal）
   * @example 450
   */
  calories: number

  /**
   * 菜品价格（单位：元 RMB）
   * @example 38.50
   */
  price: number

  /**
   * 制作难度等级
   * 建议使用枚举类型 Difficulty 定义可选值
   * @example Difficulty.MEDIUM
   */
  difficulty: Difficulty

  /**
   * 预计烹饪时间（单位：分钟）
   * @example 25
   */
  cookingTime: number

  /**
   * 菜品图片 URL（可选）
   * @example 'https://example.com/images/kungpao.jpg'
   */
  image?: string

  /**
   * 菜品描述（可选）
   * 可包含口味、特色等额外文本信息
   * @example '经典川菜，麻辣鲜香，口感丰富'
   */
  description?: string

  /**
   * 适用场景（可选，可多选）
   * 例如：家庭聚餐、工作简餐、节日宴会等
   * 建议使用枚举类型 MealScene[] 定义可选值
   * @example [MealScene.FAMILY, MealScene.PARTY]
   */
  scene?: MealScene[]

  /**
   * 食品份数（标准份量）
   * 默认为 1，表示一份的标准量。
   * 在实际点餐或计算营养时，可乘以该份数。
   * @default 1
   * @example 2（表示双人份）
   */
  servings?: number
}