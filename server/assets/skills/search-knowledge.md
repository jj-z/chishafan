# 检索菜品知识库

<!-- skill-meta
{
  "name": "search_knowledge",
  "description": "在菜品知识库中做语义检索，获取菜品的菜系、食材、过敏原、辣度、价位与做法等事实。",
  "whenToUse": "用户询问某道菜的具体信息（食材、辣不辣、怎么做、含不含某种过敏原）或你不确定菜品库是否有相关内容时调用。",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "独立完整的检索问题。多轮对话要改写成不依赖上下文的一句话，例如把「那有没有不辣的」改写成「有没有不辣的菜」。"
      }
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
-->

返回字段：
- found：是否存在达到相似度阈值的内容
- degraded：true 表示向量服务不可用、已降级为关键词匹配
- hits：命中的知识片段数组，每条含 content 与 score

使用要求：
1. 凡是涉及菜品事实的问题都必须先检索，禁止凭训练数据回答；
2. found=false 时必须直接说「菜品库里暂时没有这个信息」，可以再推荐相近的菜，但不得编造食材或做法；
3. 回答时只使用 hits 里出现过的事实，不要补充片段之外的内容。
