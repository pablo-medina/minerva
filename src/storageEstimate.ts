export type StorageQuotaMb = {
  quotaMb: number;
  usedMb: number;
  freeMb: number;
};

/** Uses `navigator.storage.estimate()` when available; otherwise zeros. */
export async function getOriginStorageQuotaMb(): Promise<StorageQuotaMb> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { quotaMb: 0, usedMb: 0, freeMb: 0 };
  }
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    const quotaMb = quota / (1024 * 1024);
    const usedMb = usage / (1024 * 1024);
    const freeMb = Math.max(0, quotaMb - usedMb);
    return {
      quotaMb: Math.round(quotaMb * 100) / 100,
      usedMb: Math.round(usedMb * 100) / 100,
      freeMb: Math.round(freeMb * 100) / 100,
    };
  } catch {
    return { quotaMb: 0, usedMb: 0, freeMb: 0 };
  }
}
