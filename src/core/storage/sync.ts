// 同步骨架（B0-3）：只承载可单测的纯决策函数，不接网络、不碰存储。
// B1 的同步引擎据此决定对单个对象做推 / 拉 / 冲突副本。

export type SyncDecision = 'push' | 'pull' | 'in-sync' | 'conflict'

// 给定「本地基线 etag（上次同步时记下的远端版本）」「本地是否有未推改动」
// 「远端当前 etag」，决定该对象的同步动作。
//
// 规则（上游 §5.2，与测试一一对应）：
//   远端无对象（首次）：本地脏 → push；否则 in-sync
//   远端存在：
//     本地不脏 且 远端 etag === base → in-sync
//     本地不脏 且 远端 etag !== base → pull
//     本地脏   且 远端 etag === base → push
//     本地脏   且 远端 etag !== base → conflict（双改，需冲突副本）
export function decideSync(
  baseEtag: string | undefined,
  localDirty: boolean,
  remoteEtag: string | undefined,
): SyncDecision {
  if (remoteEtag === undefined) {
    return localDirty ? 'push' : 'in-sync'
  }
  const remoteMatchesBase = remoteEtag === baseEtag
  if (!localDirty) {
    return remoteMatchesBase ? 'in-sync' : 'pull'
  }
  return remoteMatchesBase ? 'push' : 'conflict'
}
