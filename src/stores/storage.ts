// 存储后端设置 store（B1）：持久化「选哪个后端 + 非密钥配置」，密钥仅存会话内存。
// 桥接核心引擎：UI 选后端/填地址 → 本 store → factory.createProvider → 同步引擎。
// 真正的文档推拉循环（DocBackend 接线）是后续 B1-4，不在本 store 内。
import { defineStore } from 'pinia'
import { getString, setString } from '../core/localStore'
import {
  splitSecrets, mergeSecrets, serializeConfig, parseConfig, isConfigComplete, testConnection,
  type PersistedConfig, type Secrets,
} from '../core/storage/config'
import { createProvider, isRemote, needsCredentials, type StorageConfig, type CreateProviderDeps, type StorageType } from '../core/storage/factory'
import type { StorageProvider } from '../core/storage/types'
import type { ConnectionStatus } from '../core/storage/config'

const CONFIG_KEY = 'mddoc:storage-config'

export const useStorageStore = defineStore('storage', {
  state: () => ({
    // 持久化部分（非密钥）；默认本地。
    persisted: (parseConfig(getString(CONFIG_KEY, '')) ?? { type: 'local' }) as PersistedConfig,
    // 密钥仅会话内存，绝不写本地配置。
    secrets: {} as Secrets,
    status: null as ConnectionStatus | null,
    testing: false,
  }),
  getters: {
    type(state): StorageType { return state.persisted.type },
    remote(state): boolean { return isRemote(state.persisted.type) },
    requiresCredentials(state): boolean { return needsCredentials(state.persisted.type) },
    fullConfig(state): StorageConfig { return mergeSecrets(state.persisted, state.secrets) },
    complete(): boolean { return isConfigComplete(this.fullConfig) },
  },
  actions: {
    // 切换后端 / 更新非密钥配置（重置上次连通状态）。
    setBackend(persisted: PersistedConfig) {
      this.persisted = persisted
      this.status = null
    },
    // 更新会话密钥（token / password）。
    setSecret(patch: Partial<Secrets>) {
      this.secrets = { ...this.secrets, ...patch }
      this.status = null
    },
    // 保存非密钥配置到本地（密钥另由钥匙串/会话处理，不在此落盘）。
    save() {
      const { persisted } = splitSecrets(this.fullConfig)
      this.persisted = persisted
      setString(CONFIG_KEY, serializeConfig(persisted))
    },
    // 用当前配置构造 Provider（deps 可注入 fetch / rawKv）。
    buildProvider(deps?: CreateProviderDeps): StorageProvider {
      return createProvider(this.fullConfig, deps)
    },
    // 测试连接：构造 Provider 并 list 一次。
    async testConnection(deps?: CreateProviderDeps): Promise<ConnectionStatus> {
      this.testing = true
      try {
        this.status = await testConnection(this.buildProvider(deps))
        return this.status
      } catch (error) {
        this.status = { ok: false, error: error instanceof Error ? error.message : String(error) }
        return this.status
      } finally {
        this.testing = false
      }
    },
  },
})
