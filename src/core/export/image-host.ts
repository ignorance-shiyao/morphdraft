// M7-4: 图床集成（sm.ms API 上传图片 → 返回 URL）
// 配置：设置页配置 sm.ms token；公众号复制/知乎复制时本地图自动上传替换 URL

import { getString, setString } from '../localStore'

const SM_MS_API = 'https://sm.ms/api/v2/upload'
const IMAGE_HOST_KEY = 'morphdraft-image-host'

export interface ImageHostConfig {
  provider: 'smms' | null
  token: string
}

// 上传图片到 sm.ms
async function uploadToSmms(blob: Blob, token: string): Promise<string | null> {
  const formData = new FormData()
  formData.append('smfile', blob, 'image.png')
  try {
    const resp = await fetch(SM_MS_API, {
      method: 'POST',
      headers: token ? { Authorization: token } : {},
      body: formData,
    })
    const data = await resp.json()
    if (data.success) return data.data.url
    if (data.code === 'image_repeated') return data.images // 已存在，返回原 URL
    return null
  } catch {
    return null
  }
}

// 替换 markdown 中的本地图片引用为远程 URL
export async function uploadLocalImages(
  markdown: string,
  config: ImageHostConfig,
): Promise<string> {
  if (!config.provider || !config.token) return markdown

  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g
  const matches = [...markdown.matchAll(imgRe)]

  for (const m of matches) {
    const url = m[2]
    // 跳过已有的远程 URL
    if (url.startsWith('http://') || url.startsWith('https://')) continue
    // 跳过 data URL（太大，不适合上传）
    if (url.startsWith('data:')) continue

    try {
      let blob: Blob | null = null
      if (url.startsWith('asset://')) {
        // asset:// 协议：vault 读盘 / 否则 IndexedDB
        const { getAssetBlob } = await import('../assets')
        const id = url.replace('asset://', '')
        blob = await getAssetBlob(id)
      } else if (url.startsWith('blob:')) {
        const resp = await fetch(url)
        blob = await resp.blob()
      }

      if (blob) {
        const remoteUrl = await uploadToSmms(blob, config.token)
        if (remoteUrl) {
          markdown = markdown.replace(m[0], `![${m[1]}](${remoteUrl})`)
        }
      }
    } catch { /* skip failed uploads */ }
  }

  return markdown
}

// 从 localStorage 读取图床配置
export function getImageHostConfig(): ImageHostConfig {
  try {
    const raw = getString(IMAGE_HOST_KEY, '')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { provider: null, token: '' }
}

// 保存图床配置
export function setImageHostConfig(config: ImageHostConfig) {
  setString(IMAGE_HOST_KEY, JSON.stringify(config))
}
