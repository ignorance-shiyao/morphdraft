import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import process from 'node:process'

const cargoBin = join(homedir(), '.cargo', 'bin')
const androidHome = process.env.ANDROID_HOME || join(homedir(), 'Library', 'Android', 'sdk')
const ndkRoot = join(androidHome, 'ndk')
const installedNdks = existsSync(ndkRoot)
  ? readdirSync(ndkRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : []
const ndkHome = process.env.NDK_HOME && existsSync(process.env.NDK_HOME)
  ? process.env.NDK_HOME
  : installedNdks.length
    ? join(ndkRoot, installedNdks.at(-1))
    : undefined

const env = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ''}`,
  ...(existsSync(androidHome) ? {
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  } : {}),
  ...(ndkHome ? {
    NDK_HOME: ndkHome,
    ANDROID_NDK_HOME: ndkHome,
  } : {}),
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(command, ['tauri', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
