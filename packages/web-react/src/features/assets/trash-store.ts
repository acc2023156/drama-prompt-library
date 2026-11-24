import { purgeAssetTrash } from '../../domain/asset-trash'
import { get, set } from '../../lib/storage'

/** 清掉资产回收桶里的过期项（旧 purgeAssetTrash）：有过期项才写回 pl.assetsTrash。资产首页与回收桶页进入时都调用。 */
export function purgeStoredAssetTrash() {
  const { kept, changed } = purgeAssetTrash(get('assetsTrash'), Date.now())
  if (changed) set('assetsTrash', kept)
}
