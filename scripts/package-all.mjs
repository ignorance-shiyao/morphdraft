import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

function run(script) {
  console.log(`\n> npm run ${script}\n`)
  const result = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

switch (process.platform) {
  case 'darwin':
    run('package:macos')
    if (existsSync('src-tauri/gen/android')) run('package:android')
    else console.log('\n跳过 Android：请先执行 npm run tauri android init')
    if (existsSync('src-tauri/gen/apple')) run('package:ios')
    else console.log('\n跳过 iOS：请先执行 npm run tauri ios init')
    break
  case 'win32':
    run('package:windows')
    if (existsSync('src-tauri/gen/android')) run('package:android')
    else console.log('\n跳过 Android：请先执行 npm run tauri android init')
    break
  case 'linux':
    run('package:linux')
    if (existsSync('src-tauri/gen/android')) run('package:android')
    else console.log('\n跳过 Android：请先执行 npm run tauri android init')
    break
  default:
    console.error(`暂不支持当前操作系统：${process.platform}`)
    process.exit(1)
}
