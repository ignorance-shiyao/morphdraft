// LocalProvider 跑通契约套件（内存 RawKv 替身）。生产用 IndexedDB RawKv，逻辑同构。
import { LocalProvider, createMemoryRawKv } from '../providers/localProvider'
import { runProviderContract } from './providerContract'

runProviderContract('local', () => new LocalProvider(createMemoryRawKv()))
