// skill.md 元数据解析（D4）。
// 元数据写错时必须在构建/启动阶段暴露，而不是让工具在运行时静默消失。

import { describe, expect, it } from 'vitest'
import { parseSkillMarkdown, toOpenAiTool } from '../../server/utils/skillParse'

const VALID = `# 查天气

<!-- skill-meta
{
  "name": "get_weather",
  "description": "查询指定城市的当前天气",
  "whenToUse": "用户询问天气时",
  "parameters": {
    "type": "object",
    "properties": { "city": { "type": "string" } }
  }
}
-->

返回 city 与 tempC。`

describe('parseSkillMarkdown', () => {
  it('解析元数据与正文', () => {
    const skill = parseSkillMarkdown(VALID)
    expect(skill.name).toBe('get_weather')
    expect(skill.whenToUse).toBe('用户询问天气时')
    expect(skill.body).toBe('返回 city 与 tempC。')
  })

  it('缺少元数据块时抛错', () => {
    expect(() => parseSkillMarkdown('# 只有正文')).toThrow('skill-meta')
  })

  it('元数据不是合法 JSON 时抛错', () => {
    expect(() => parseSkillMarkdown('<!-- skill-meta {name} -->\n正文')).toThrow('JSON')
  })

  it('工具名不符合小写下划线时抛错', () => {
    const raw = VALID.replace('"get_weather"', '"GetWeather"')
    expect(() => parseSkillMarkdown(raw)).toThrow()
  })

  it('正文为空时抛错：模型看不到用法说明', () => {
    const raw = VALID.replace('返回 city 与 tempC。', '')
    expect(() => parseSkillMarkdown(raw)).toThrow('正文为空')
  })
})

describe('toOpenAiTool', () => {
  it('把正文与适用场景并入 description', () => {
    const tool = toOpenAiTool(parseSkillMarkdown(VALID))
    expect(tool.type).toBe('function')
    expect(tool.function.name).toBe('get_weather')
    expect(tool.function.description).toContain('用户询问天气时')
    expect(tool.function.description).toContain('返回 city 与 tempC。')
    expect(tool.function.parameters).toMatchObject({ type: 'object' })
  })
})
