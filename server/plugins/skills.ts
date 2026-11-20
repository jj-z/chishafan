// 启动时校验技能资产（D4）。
//
// 技能定义放在 server/assets/skills/*.md，由 Nitro 打包进产物。
// 如果部署时漏掉 server assets，AI 会变成「只会闲聊、不会推荐」的哑巴，
// 而这种问题在接口层表现为工具列表为空、很难定位，所以在启动日志里显式暴露。
export default defineNitroPlugin(async () => {
  try {
    const skills = await loadSkills()
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'skills.loaded',
        count: skills.length,
        names: skills.map((skill) => skill.name),
      }),
    )
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'skills.load',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }
})
