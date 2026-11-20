// Seed 脚本：把 demo/mock 数据写入真实数据库，幂等可重复执行。
//
// 设计要点：
// 1. 全用 upsert：where 走固定短 id（如 'c-home'、'd5'），update 分支覆盖字段值，
//    create 分支首次插入。重复运行不会撞唯一约束，字段改动也能同步到已存在行。
// 2. PrismaPg 适配器 + pg.Pool：和 Nuxt 服务端 db.ts 保持一致，避免 Prisma 7
//    默认连接器在热更新时泄漏连接（见 pitfalls #2）。
// 3. 模块制式：项目 package.json 声明 "type": "module" + Prisma Client 的
//    moduleFormat = "esm"，所以用纯 ESM import，不能 require。
// 4. 依赖顺序：Category（无依赖）→ Dish（外键 categoryId）→ User/Favorite/History。

import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../shared/generated/prisma/client.ts'
import pg from 'pg'
import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'
import type { Allergen } from '../shared/types/dish.ts'
import { CATEGORIES, DISHES } from '../app/mock/dishes.ts'

const { Pool } = pg

// 受控过敏原映射。放在 seed 里按菜品 id 维护，而不是塞进 mock 数据：
// mock 只负责展示用字段，真实库里过敏原是给用户忌口硬过滤用的结构化数据。
const DISH_ALLERGENS: Record<string, Allergen[]> = {
  d1: ['EGG'],
  d2: ['PEANUT', 'POULTRY', 'SOY'],
  d3: ['BEEF', 'SOY'],
  d4: ['PORK', 'SOY', 'GLUTEN'],
  d5: ['GLUTEN', 'BEEF'],
  d6: ['GLUTEN', 'EGG'],
  d7: ['GLUTEN', 'PORK'],
  d8: ['EGG', 'PORK'],
  d9: ['SEAFOOD', 'PORK', 'SOY', 'SESAME'],
  d10: ['POULTRY', 'SOY'],
  d11: ['PORK'],
  d12: ['LAMB'],
  d13: ['PEANUT'],
  d14: ['FISH', 'SOY'],
  d15: ['PEANUT', 'SOY'],
  d16: ['GLUTEN', 'LAMB'],
  d17: ['PORK', 'SOY'],
  d18: [],
  d19: ['SEAFOOD'],
  d20: ['EGG', 'SEAFOOD'],
  d21: ['PORK', 'SOY'],
  d22: ['PORK', 'SOY'],
  d23: ['EGG'],
  d24: ['GLUTEN', 'PORK', 'SOY'],
  d25: ['PORK', 'SOY', 'GLUTEN'],
  d26: ['SOY'],
  d27: ['EGG'],
  d28: ['LAMB'],
}

// 新增几条 mock 里没有的菜，让菜品库在真实库里更像一个可用的 MVP。
const EXTRA_DISHES = [
  {
    id: 'd23',
    name: '蛋炒饭',
    description: '剩米饭的完美归宿，简单却永远好吃。',
    imageUrl: `/dishes/d23.jpg`,
    mealType: 'LUNCH',
    categoryId: 'c-home',
    servingMode: 'SINGLE',
    spicyLevel: 0,
    priceLevel: 1,
    tags: ['快手', '盖饭'],
    ingredients: ['隔夜米饭', '鸡蛋 2 个', '葱花', '盐'],
    steps: '1. 鸡蛋打散炒散盛出；2. 米饭下锅炒到粒粒分明；3. 回锅鸡蛋加盐炒匀；4. 撒葱花出锅。',
  },
  {
    id: 'd24',
    name: '盖浇面',
    description: '浇头一盖，面和菜全有了，快手又管饱。',
    imageUrl: `/dishes/d24.jpg`,
    mealType: 'ANY',
    categoryId: 'c-noodle',
    servingMode: 'SINGLE',
    spicyLevel: 1,
    priceLevel: 2,
    tags: ['快手', '管饱'],
    ingredients: ['面条', '肉末', '酱油', '青菜'],
    steps: '1. 肉末炒香加酱油和水煮开做浇头；2. 面条煮熟捞碗；3. 浇头盖面；4. 加烫好的青菜。',
  },
  {
    id: 'd25',
    name: '红烧排骨',
    description: '酥烂入味，一顿能吃两碗饭。',
    imageUrl: `/dishes/d25.jpg`,
    mealType: 'DINNER',
    categoryId: 'c-home',
    servingMode: 'DISH',
    role: 'MAIN',
    spicyLevel: 0,
    priceLevel: 3,
    tags: ['硬菜', '下饭'],
    ingredients: ['排骨 500g', '冰糖', '生抽', '老抽', '八角'],
    steps: '1. 排骨焯水；2. 炒糖色下排骨裹色；3. 加香料和热水炖 40 分钟；4. 收汁。',
  },
  {
    id: 'd26',
    name: '凉拌黄瓜',
    description: '爽脆解腻，五分钟上桌。',
    imageUrl: `/dishes/d26.jpg`,
    mealType: 'ANY',
    categoryId: 'c-home',
    servingMode: 'DISH',
    role: 'VEG',
    spicyLevel: 1,
    priceLevel: 1,
    tags: ['凉拌', '快手'],
    ingredients: ['黄瓜', '蒜末', '醋', '生抽', '辣椒油'],
    steps: '1. 黄瓜拍碎切段；2. 加蒜末、醋、生抽、辣椒油拌匀；3. 冷藏 10 分钟更入味。',
  },
  {
    id: 'd27',
    name: '番茄蛋汤',
    description: '比紫菜蛋花汤更浓鲜，配荤菜正好。',
    imageUrl: `/dishes/d27.jpg`,
    mealType: 'ANY',
    categoryId: 'c-soup',
    servingMode: 'DISH',
    role: 'SOUP',
    spicyLevel: 0,
    priceLevel: 1,
    tags: ['快手', '清淡'],
    ingredients: ['番茄', '鸡蛋', '葱花', '盐'],
    steps: '1. 番茄炒出沙加水煮开；2. 淋蛋液成蛋花；3. 加盐和葱花出锅。',
  },
  {
    id: 'd28',
    name: '烧烤套餐（聚会）',
    description: '羊肉串 + 烤茄子 + 烤韭菜，一顿夜宵顶一天。',
    imageUrl: `/dishes/d28.jpg`,
    mealType: 'DINNER',
    categoryId: 'c-bbq',
    servingMode: 'SINGLE',
    spicyLevel: 2,
    priceLevel: 3,
    tags: ['夜宵', '聚会'],
    ingredients: ['羊肉串 10 串', '烤茄子', '烤韭菜', '孜然', '辣椒面'],
    steps: '1. 羊肉串先烤至微焦撒孜然；2. 茄子剖开刷油烤软加蒜末；3. 韭菜快烤撒盐。',
  },
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })
  // nuxt-auth-utils 内部用 @adonisjs/hash 的 Scrypt 驱动，
  // 这里显式构造一个，和 Nuxt 服务端生成的 hash 格式完全一致。
  const hash = new Hash(new Scrypt({}))

  // ── 1. 分类 ──────────────────────────────────────────────────────────
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i]
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { name: cat.name, sortOrder: i * 10 },
      create: { id: cat.id, name: cat.name, sortOrder: i * 10 },
    })
  }
  console.log(`✅ 分类 ${CATEGORIES.length} 条 upsert 完成`)

  // ── 2. 菜品 ──────────────────────────────────────────────────────────
  const allDishes = [...DISHES, ...EXTRA_DISHES]
  for (const d of allDishes) {
    const data = {
      name: d.name,
      description: d.description,
      imageUrl: d.imageUrl,
      mealType: d.mealType as 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'ANY',
      servingMode: d.servingMode as 'SINGLE' | 'DISH',
      role: (d.role ?? 'MAIN') as 'MAIN' | 'VEG' | 'SOUP',
      spicyLevel: d.spicyLevel,
      priceLevel: d.priceLevel,
      tags: d.tags,
      ingredients: d.ingredients,
      allergens: DISH_ALLERGENS[d.id] ?? [],
      steps: d.steps,
      categoryId: d.categoryId,
    }
    await prisma.dish.upsert({
      where: { id: d.id },
      update: data,
      create: { id: d.id, ...data },
    })
  }
  console.log(`✅ 菜品 ${allDishes.length} 条 upsert 完成（含 ${EXTRA_DISHES.length} 条扩展）`)

  // ── 3. 测试用户 ──────────────────────────────────────────────────────
  const adminPwd = await hash.make('admin1234')
  await prisma.user.upsert({
    where: { email: 'admin@chishafan.local' },
    update: { passwordHash: adminPwd, nickname: '超级管理员', role: 'ADMIN' },
    create: {
      email: 'admin@chishafan.local',
      passwordHash: adminPwd,
      nickname: '超级管理员',
      role: 'ADMIN',
    },
  })

  const userPwd = await hash.make('user1234')
  await prisma.user.upsert({
    where: { email: 'demo@chishafan.local' },
    update: { passwordHash: userPwd, nickname: '试吃员' },
    create: {
      email: 'demo@chishafan.local',
      phone: '13800000001',
      passwordHash: userPwd,
      nickname: '试吃员',
    },
  })
  console.log('✅ 用户 2 条 upsert 完成（admin + demo）')

  // ── 4. 演示收藏和历史（让新用户登录后看到一些数据）──────────────────
  const demoUser = await prisma.user.findUnique({ where: { email: 'demo@chishafan.local' } })
  if (demoUser) {
    const today = new Date()
    const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000)

    // 几条收藏
    for (const dishId of ['d10', 'd2', 'd1']) {
      await prisma.favorite.upsert({
        where: { userId_dishId: { userId: demoUser.id, dishId } },
        update: {},
        create: { userId: demoUser.id, dishId },
      })
    }

    // 近 5 天的就餐历史：确保随机推荐有东西可去重
    const historySamples: Array<[string, number]> = [
      ['d10', 0], // 今天
      ['d2', 1], // 昨天
      ['d5', 2],
      ['d13', 3],
      ['d1', 4],
    ]
    for (const [dishId, ago] of historySamples) {
      await prisma.diningHistory.upsert({
        where: { userId_dishId_eatenOn: { userId: demoUser.id, dishId, eatenOn: daysAgo(ago) } },
        update: {},
        create: { userId: demoUser.id, dishId, eatenOn: daysAgo(ago) },
      })
    }
    console.log('✅ 演示收藏 3 条、历史 5 条 upsert 完成')

    // 演示口味偏好：忌口花生、辣度上限 2、喜欢家常/川菜、不喜欢烧烤。
    // 用它可以验证硬过滤（花生菜不出现）与软降权（烧烤概率降低）是否生效。
    const preference = {
      likedCategoryIds: ['c-home', 'c-sichuan'],
      dislikedCategoryIds: ['c-bbq'],
      allergens: ['PEANUT'] as Allergen[],
      spicyMax: 2,
      priceMax: 3,
    }
    await prisma.userPreference.upsert({
      where: { userId: demoUser.id },
      update: preference,
      create: { userId: demoUser.id, ...preference },
    })
    console.log('✅ 演示口味偏好 upsert 完成（忌口花生 / 辣度≤2）')
  }

  await pool.end()
  await prisma.$disconnect()
  console.log('\n🎉 Seed 全部完成！')
  console.log('   admin: admin@chishafan.local / admin1234')
  console.log('   demo : demo@chishafan.local  / user1234')
}

main().catch((err) => {
  console.error('❌ Seed 失败:', err)
  process.exit(1)
})
