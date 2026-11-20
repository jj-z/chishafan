# 记录用户口味反馈

<!-- skill-meta
{
  "name": "record_feedback",
  "description": "把用户对某道菜的喜欢/不喜欢写入数据库，用于后续推荐加权或排除。",
  "whenToUse": "用户明确表达「喜欢这道」「以后多推荐这个」「不喜欢这道」「别再推荐它」时调用。",
  "parameters": {
    "type": "object",
    "properties": {
      "dishName": {
        "type": "string",
        "description": "菜名，必须与候选清单中的菜名完全一致。"
      },
      "action": {
        "type": "string",
        "description": "LIKE 表示喜欢（软加权），DISLIKE 表示不喜欢（7 天内不再推荐）。",
        "enum": ["LIKE", "DISLIKE"]
      }
    },
    "required": ["dishName", "action"],
    "additionalProperties": false
  }
}
-->

返回字段：
- ok：是否记录成功
- dishName / action：最终写入的菜名与动作

注意：
1. 只有登录用户能记录，游客调用会返回失败，此时请提示用户先登录；
2. 菜名必须来自 recommend_dishes 或知识库中真实存在的菜，找不到时如实告知，不要换一个相近的菜偷偷记上；
3. 记录成功后，用一句话告诉用户「已记下你的偏好」，不要重复输出菜品标记。
