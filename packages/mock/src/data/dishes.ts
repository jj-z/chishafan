import type { Dish } from '@chisha/core'

export const mockDishes: Dish[] = [
  {
    id: '1',
    name: '番茄炒蛋',
    mealTime: 'lunch',
    cuisine: '川菜',
    taste: ['咸鲜', '酸甜'],
    ingredients: ['番茄', '鸡蛋', '葱'],
    allergens: ['鸡蛋'],
    calories: 180,
    price: 15,
    difficulty: '简单',
    cookingTime: 10,
    image: 'https://via.placeholder.com/300x200?text=番茄炒蛋',
    description: '国民家常菜，酸甜开胃。',
    scene: ['单人', '家庭'],
  },
  // ... 继续添加更多菜品
]