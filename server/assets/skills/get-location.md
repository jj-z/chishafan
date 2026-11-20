# 查用户位置

<!-- skill-meta
{
  "name": "get_location",
  "description": "获取用户当前所在城市与省份，用于结合地域口味偏好推荐餐食。",
  "whenToUse": "用户问「我在哪」「我这里有什么好吃的」，或推荐时需要依据地域口味（如「四川人爱吃辣」「广东人爱喝汤」）判断菜系时调用。",
  "parameters": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
-->

返回字段：
- city：城市名，例如「成都」；无法定位时为 null
- province：省份名，例如「四川省」；无法定位时为 null
- regionHint：基于地域的口味偏好提示，例如「四川地区偏好川菜（麻辣）」；无地域信息时为 null

使用要求：
1. 定位失败（city 为 null）时如实告诉用户「暂时无法定位到你的城市」，不要编造位置；
2. regionHint 只是软偏好，最终仍以用户明确说的口味为准；
3. 拿到位置后，如果还要推荐，记得结合天气一起考虑。
