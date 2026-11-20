// 一键启动开发环境：确保 pgvector 容器在跑，然后启动 Nuxt dev server。
// 用法：npm run dev:start
// 跳过 Docker 启动：npm run dev:start -- --no-docker

import { spawn, exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const skipDocker = process.argv.includes('--no-docker')

function log(msg) {
  console.log(`\x1b[36m[dev]\x1b[0m ${msg}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 启动 pgvector 容器并等待健康检查通过。 */
async function ensureDb() {
  log('启动数据库容器（pgvector）...')
  try {
    await execAsync('docker compose up -d db')
  } catch (err) {
    log(`docker compose 启动失败：${err.message}`)
    log('请确认 Docker Desktop 已启动，或者用 npm run dev 直接启动（假设数据库已就绪）。')
    process.exit(1)
  }

  log('等待数据库就绪...')
  for (let i = 0; i < 30; i++) {
    try {
      // 直接读容器健康状态，比反复 exec 进容器更可靠。
      const { stdout } = await execAsync('docker compose ps -q db')
      const containerId = stdout.trim()
      if (!containerId) {
        await sleep(2000)
        continue
      }
      const { stdout: health } = await execAsync(
        `docker inspect --format '{{.State.Health.Status}}' ${containerId}`,
      )
      if (health.trim() === 'healthy') {
        log('数据库已就绪。')
        return
      }
    } catch {
      // 容器还在启动，健康检查接口尚未可用，继续轮询。
    }
    await sleep(2000)
  }

  log('数据库 60 秒内未就绪，请检查 `docker compose logs db`。')
  process.exit(1)
}

/** 启动 Nuxt dev server，把它的输出和信号直接转发给当前终端。 */
function startDev() {
  log('启动 Nuxt dev server...')
  const isNpm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(isNpm, ['run', 'dev'], {
    stdio: 'inherit',
    shell: false,
  })

  child.on('error', (err) => {
    log(`dev server 启动失败：${err.message}`)
    process.exit(1)
  })

  child.on('exit', (code) => {
    log(`dev server 退出（code=${code ?? 'signal'})`)
    process.exit(code ?? 0)
  })

  // Ctrl+C 时先通知子进程，再退出。
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      try {
        child.kill(signal)
      } catch {
        // 子进程可能已经退出。
      }
    })
  }
}

async function main() {
  if (!skipDocker) {
    await ensureDb()
  }
  startDev()
}

main()
