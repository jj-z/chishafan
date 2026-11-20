// skill.md 解析（D4）。
//
// 元数据放在 HTML 注释里的 JSON 块中，而不是 YAML frontmatter：
// 1. 工具的 parameters 是嵌套 JSON Schema，手写 YAML 解析器容易在缩进/数组上出错；
// 2. 不需要为此引入 yaml 依赖（技术栈约束：不得随意加包）；
// 3. 注释块在 Markdown 渲染时不可见，正文仍然是给人看的说明。
//
// 纯函数模块，方便单测（不 import Prisma / h3）。

import { z } from 'zod'

/** skill.md 头部元数据的结构；正文作为工具说明的一部分注入给模型。 */
export const skillMetaSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, '工具名必须是小写下划线命名'),
  description: z.string().min(1),
  whenToUse: z.string().optional(),
  /** OpenAI function calling 的 parameters（JSON Schema）。 */
  parameters: z.record(z.string(), z.unknown()),
})

export type SkillMeta = z.infer<typeof skillMetaSchema>

export interface ParsedSkill extends SkillMeta {
  /** 元数据之后的正文：写「怎么用、返回什么、注意事项」，会拼进工具描述。 */
  body: string
}

const META_BLOCK = /<!--\s*skill-meta\s*([\s\S]*?)-->/i

/**
 * 解析一份 skill.md。
 * 元数据缺失或 JSON 非法时直接抛错：技能定义属于构建期资产，
 * 与其让工具在运行时静默消失，不如在启动/构建阶段立刻失败。
 */
export function parseSkillMarkdown(raw: string): ParsedSkill {
  const match = raw.match(META_BLOCK)
  if (!match?.[1]) {
    throw new Error('skill.md 缺少 <!-- skill-meta {...} --> 元数据块')
  }

  let meta: unknown
  try {
    meta = JSON.parse(match[1])
  } catch {
    throw new Error('skill.md 的 skill-meta 不是合法 JSON')
  }

  const parsed = skillMetaSchema.parse(meta)
  const body = raw
    .replace(META_BLOCK, '')
    .replace(/^#\s.*$/m, '')
    .trim()

  if (!body) throw new Error(`skill「${parsed.name}」正文为空，模型将看不到使用说明`)

  return { ...parsed, body }
}

/**
 * 把一份技能转成 OpenAI tools 数组里的一项。
 * 正文追加在 description 末尾：模型只会看到 description，看不到独立的注释块。
 */
export function toOpenAiTool(skill: ParsedSkill) {
  return {
    type: 'function' as const,
    function: {
      name: skill.name,
      description: [
        skill.description,
        skill.whenToUse ? `适用场景：${skill.whenToUse}` : '',
        skill.body,
      ]
        .filter(Boolean)
        .join('\n'),
      parameters: skill.parameters,
    },
  }
}
