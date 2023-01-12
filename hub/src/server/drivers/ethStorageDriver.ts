import {
  ListFilesResult, PerformWriteArgs, WriteResult, PerformDeleteArgs, PerformRenameArgs,
  PerformStatArgs, StatResult, PerformReadArgs, ReadResult, PerformListFilesArgs,
  ListFilesStatResult, DriverStatics, DriverModel
} from '../driverModel.js'

class EthStorageDriver implements DriverModel {
  supportsETagMatching: boolean


  static getConfigInformation() {
    const envVars: any = {}
    return {
      defaults: {
        azCredentials: {
          accountName: undefined as any,
          accountKey: undefined as any
        }
      },
      envVars
    }
  }

  dispose(): Promise<void> {
    return Promise.resolve(undefined)
  }

  ensureInitialized(): Promise<void> {
    return Promise.resolve(undefined)
  }

  getReadURLPrefix(): string {
    return ''
  }

  listFiles(_args: PerformListFilesArgs): Promise<ListFilesResult> {
    return Promise.resolve(undefined)
  }

  listFilesStat(_args: PerformListFilesArgs): Promise<ListFilesStatResult> {
    return Promise.resolve(undefined)
  }

  performDelete(_args: PerformDeleteArgs): Promise<void> {
    return Promise.resolve(undefined)
  }

  performRead(_args: PerformReadArgs): Promise<ReadResult> {
    return Promise.resolve(undefined)
  }

  performRename(_args: PerformRenameArgs): Promise<void> {
    return Promise.resolve(undefined)
  }

  performStat(_args: PerformStatArgs): Promise<StatResult> {
    return Promise.resolve(undefined)
  }

  performWrite(_args: PerformWriteArgs): Promise<WriteResult> {
    return Promise.resolve(undefined)
  }

}

const driver: typeof EthStorageDriver & DriverStatics = EthStorageDriver
export default driver

