# 查当前时间

<!-- skill-meta
{
  "name": "get_current_time",
  "description": "获取服务器当前时间（北京时间 Asia/Shanghai），包括日期、星期与当前餐别。",
  "whenToUse": "用户问「现在几点」「今天几号」「星期几」，或需要按时段判断该推荐早餐/午餐/晚餐时调用。",
  "parameters": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
-->

调用后直接用返回结果回答，不要自行推算时间。

返回字段说明：
- date：YYYY-MM-DD
- time：HH:mm
- weekday：星期几
- mealPeriod：BREAKFAST / LUNCH / DINNER / LATE_NIGHT（按北京时间划分）

注意：模型本身不知道当前时间，凡涉及「现在」「今天」的问题都必须先调用本工具。
