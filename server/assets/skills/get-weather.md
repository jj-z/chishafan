# 查天气

<!-- skill-meta
{
  "name": "get_weather",
  "description": "查询指定城市的当前天气（温度、天气现象），并给出适合当前天气的餐食建议，用于结合天气推荐吃什么。",
  "whenToUse": "用户询问天气，或推荐时需要依据天气（如「下雨天吃什么」「今天好热」「天冷想吃点热的」）判断口味时调用。",
  "parameters": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "城市名，例如「上海」。不传则使用用户当前定位城市（需先调用 get_location 或依赖系统上下文）。"
      }
    },
    "additionalProperties": false
  }
}
-->

返回字段：
- city：城市名
- tempC：当前温度（摄氏度）
- text：天气现象中文描述
- kind：HOT / COLD / RAIN / SNOW / MILD / UNKNOWN
- mealHint：基于天气的餐食建议，例如「天气炎热，适合清淡解暑的口味」「天冷，适合热汤暖胃」；天气未知时为 null

如果工具返回失败，必须如实告诉用户「天气服务暂时不可用」，禁止编造天气。
mealHint 只是参考，最终仍以用户明确说的口味为准。
