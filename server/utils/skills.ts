// 技能注册表（D4）。
//
// 技能以 Markdown 维护在 server/assets/skills/*.md：正文是给模型看的使用说明，
// 元数据在 HTML 注释块里（见 skillParse.ts）。
//
// 为什么用 Nitro 的 server assets 而不是 `import x from './a.md?raw'`：
// Nitro 的服务端构建走 Rollup，不识别 Vite 的 `?raw` 后缀，会在 build 阶段
// 尝试打开字面路径 `xxx.md?raw` 并报 ENOENT。server/assets 是 Nitro 内置能力，
// 开发与生产都会把文件复制进产物，通过 useStorage('assets:server') 读取。
//
// 读取是异步的：首次调用读一次并缓存，之后所有请求复用同一份解析结果。

import { parseSkillMarkdown, toOpenAiTool, type ParsedSkill } from './skillParse'

const STORAGE_BASE = 'assets:server'
const SKILL_DIR = 'skills'

let cached: ParsedSkill[] | null = null
let loading: Promise<ParsedSkill[]> | null = null

/** 技能文件缺失时给一句能直接定位问题的错误，而不是空数组导致工具静默消失。 */
function missingSkillsError(): Error {
  return new Error(
    '未找到技能定义：请确认 server/assets/skills/*.md 存在，且构建产物包含 server assets',
  )
}

async function readSkills(): Promise<ParsedSkill[]> {
  const storage = useStorage(STORAGE_BASE)
  const allKeys = await storage.getKeys()
  // unstorage 的 key 分隔符在不同版本里可能是 '/' 或 ':'，两种都兼容。
  const keys = allKeys.filter((key) => /skills[/:]/.test(key) && key.endsWith('.md')).sort()

  if (!keys.length) throw missingSkillsError()

  const raws = await Promise.all(keys.map((key) => storage.getItem(key)))
  return raws.map((raw, index) => {
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new Error(`技能文件 ${keys[index]} 内容为空或无法读取`)
    }
    try {
      return parseSkillMarkdown(raw)
    } catch (err) {
      throw new Error(
        `技能文件 ${keys[index]} 解析失败：${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      )
    }
  })
}

/**
 * 加载全部技能（带缓存）。
 * 并发首次调用共享同一个 Promise，避免启动时多个请求同时读盘。
 */
export function loadSkills(): Promise<ParsedSkill[]> {
  if (cached) return Promise.resolve(cached)
  loading ??= readSkills()
    .then((skills) => {
      cached = skills
      return skills
    })
    .finally(() => {
      loading = null
    })
  return loading
}

/** 转换为 OpenAI tools 参数；每个请求都会调用，但只做一次 map，成本可忽略。 */
export async function getOpenAiTools() {
  return (await loadSkills()).map(toOpenAiTool)
}

/** 按工具名取技能定义；未知名字返回 undefined，由调度层返回明确错误。 */
export async function getSkill(name: string): Promise<ParsedSkill | undefined> {
  return (await loadSkills()).find((skill) => skill.name === name)
}

/** 仅供测试或热更新场景清空缓存，生产代码不要调用。 */
export function resetSkillCache(): void {
  cached = null
  loading = null
}

/** 技能目录名，供启动校验与日志使用。 */
export const SKILLS_STORAGE_PREFIX = SKILL_DIR
