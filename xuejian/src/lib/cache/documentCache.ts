import { openDB, type DBSchema } from 'idb'

interface DocumentCacheDB extends DBSchema {
  pageTextLayers: {
    key: string
    value: {
      id: string
      documentId: string
      page: number
      textLayer: string
      updatedAt: string
    }
  }
  thumbnails: {
    key: string
    value: {
      id: string
      documentId: string
      page: number
      dataUrl: string
      updatedAt: string
    }
  }
}

const dbPromise = openDB<DocumentCacheDB>('xuejian-cache', 1, {
  upgrade(db) {
    db.createObjectStore('pageTextLayers', { keyPath: 'id' })
    db.createObjectStore('thumbnails', { keyPath: 'id' })
  },
})

function pageKey(documentId: string, page: number) {
  return `${documentId}:${page}`
}

export const documentCache = {
  async getPageTextLayer(documentId: string, page: number) {
    const db = await dbPromise
    return db.get('pageTextLayers', pageKey(documentId, page))
  },

  async setPageTextLayer(documentId: string, page: number, textLayer: string) {
    const db = await dbPromise
    return db.put('pageTextLayers', {
      id: pageKey(documentId, page),
      documentId,
      page,
      textLayer,
      updatedAt: new Date().toISOString(),
    })
  },

  async getThumbnail(documentId: string, page: number) {
    const db = await dbPromise
    return db.get('thumbnails', pageKey(documentId, page))
  },

  async setThumbnail(documentId: string, page: number, dataUrl: string) {
    const db = await dbPromise
    return db.put('thumbnails', {
      id: pageKey(documentId, page),
      documentId,
      page,
      dataUrl,
      updatedAt: new Date().toISOString(),
    })
  },

  async clearDocument(documentId: string) {
    const db = await dbPromise
    const transaction = db.transaction(['pageTextLayers', 'thumbnails'], 'readwrite')

    for (const storeName of ['pageTextLayers', 'thumbnails'] as const) {
      let cursor = await transaction.objectStore(storeName).openCursor()

      while (cursor) {
        if (cursor.value.documentId === documentId) {
          await cursor.delete()
        }

        cursor = await cursor.continue()
      }
    }

    await transaction.done
  },
}
