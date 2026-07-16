import type { User } from '@chisha/core'
import { dishes } from './dishes'

export interface MockUserProfile {
  user: User
  favoriteDishIds: string[]
  blacklistDishIds: string[]
}

export const mockUserProfile: MockUserProfile = {
  user: {
    id: 'user_001',
    nickname: '吃货小王',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    gender: 'male',
    city: '北京',
    bio: '热爱美食，喜欢尝试新菜，也会把喜欢的菜品收藏起来。',
    phone: '13800138000',
    wechatId: 'wx_eat_001',
    alipayId: 'alipay_001',
    preferredTastes: ['酸甜', '麻辣', '咸鲜'],
    createdAt: new Date('2024-01-15T09:30:00.000Z'),
    updatedAt: new Date('2025-07-16T12:00:00.000Z')
  },
  favoriteDishIds: [
    dishes[0].id,
    dishes[2].id,
    dishes[5].id,
    dishes[8].id
  ],
  blacklistDishIds: [
    dishes[3].id,
    dishes[11].id,
    dishes[14].id
  ]
}
