// 把 markdown 里内联的 base64 图片（data:image/...;base64,...）外置到附件库，改写为
// asset:// 引用。用于粘贴富文本 / 导入 Word·Notion·HTML 等场景，避免 base64 撑爆源码、
// 无法去重、导出体积膨胀。EditorPane 直接插图本就走 asset://，不经此函数。

import { saveAsset } from '../assets'
import { dataUrlToBlob } from '../localDocuments'

// ![alt](data:image/png;base64,XXXX)；base64 段到右括号前（不含空白/右括号）。
const DATA_IMAGE_RE = /!\[([^\]]*)\]\(\s*(data:image\/[a-zA-Z0-9.+-]+;base64,[^)\s]+)\s*\)/g

export async function externalizeDataImages(markdown: string): Promise<string> {
  const urls = new Set<string>()
  for (const m of markdown.matchAll(DATA_IMAGE_RE)) urls.add(m[2])
  if (!urls.size) return markdown

  const mapping = new Map<string, string>()
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const mime = url.match(/^data:(image\/[^;]+)/)?.[1] || 'image/png'
        const asset = await saveAsset(dataUrlToBlob(url, mime), mime)
        mapping.set(url, asset)
      } catch {
        // 转存失败则保留原 data URL，不阻断导入
      }
    }),
  )

  return markdown.replace(DATA_IMAGE_RE, (full, alt: string, url: string) => {
    const asset = mapping.get(url)
    return asset ? `![${alt}](${asset})` : full
  })
}
