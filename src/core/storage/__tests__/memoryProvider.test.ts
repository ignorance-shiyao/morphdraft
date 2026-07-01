// MemoryProvider 跑通契约套件——既验证内存实现，也验证套件本身可作为后续 Provider 的基准。
import { MemoryProvider } from '../providers/memoryProvider'
import { runProviderContract } from './providerContract'

runProviderContract('memory', () => new MemoryProvider())
