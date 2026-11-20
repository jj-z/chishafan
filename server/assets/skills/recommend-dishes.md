# 推荐一餐

<!-- skill-meta
{
  "name": "recommend_dishes",
  "description": "从 App 菜品库的真实候选里搭配「一餐」，已应用忌口、辣度上限与不感兴趣过滤。返回值是主菜 + 配菜 + 汤 + 主食的整套搭配。",
  "whenToUse": "用户想让你推荐吃什么、来一餐饭时调用。任何推荐都必须先调用本工具，禁止凭记忆说出菜品。",
  "parameters": {
    "type": "object",
    "properties": {
      "mealType": {
        "type": "string",
        "description": "餐别筛选：BREAKFAST / LUNCH / DINNER / ANY。不传时按当前时间推断。",
        "enum": ["BREAKFAST", "LUNCH", "DINNER", "ANY"]
      },
      "keyword": {
        "type": "string",
        "description": "可选口味关键词，用于按菜名/标签/食材缩小范围，例如「辣」「清淡」「面」。匹配不到时自动放宽。"
      }
    },
    "additionalProperties": false
  }
}
-->

返回字段：
- meal.staple：主食名称（米饭、馒头等，算搭配的一部分，不是一道菜）
- meal.dishes：搭配好的菜品数组，每项含 name / role（主菜/配菜/汤）/ category / spicyLevel / priceLevel / tags / ingredients
- note：搭配说明（例如关键词未完全匹配时，按口味配了相近的菜）

使用要求：
1. 把结果当作**一顿饭**整体介绍，按「主食 + 菜」的口吻说明为什么这套搭配适合用户；
2. 只能介绍返回的菜，菜名必须一字不差，禁止自己增删；
3. 每一道菜用一句话说明理由，不要只罗列属性；
4. 最后一行输出 `<<DISHES:["菜名1","菜名2"]>>` 标记，不推荐时不要输出；
5. note 说「没有完全匹配」时，如实说一句即可，不要因此拒绝推荐。
