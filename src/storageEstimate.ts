/**
 * Values from `navigator.storage.estimate()` converted with divisor 1024² (mebibytes, MiB).
 * Names use `Mib` to avoid confusion with decimal megabytes (10⁶ bytes).
 */
export type OriginStorageQuotaMib = {
  quotaMib: number;
  usedMib: number;
  freeMib: number;
};

/** Uses `navigator.storage.estimate()` when available; otherwise zeros. */
export async function getOriginStorageQuotaMib(): Promise<OriginStorageQuotaMib> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { quotaMib: 0, usedMib: 0, freeMib: 0 };
  }
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    const quotaMib = quota / (1024 * 1024);
    const usedMib = usage / (1024 * 1024);
    const freeMib = Math.max(0, quotaMib - usedMib);
    return {
      quotaMib: Math.round(quotaMib * 100) / 100,
      usedMib: Math.round(usedMib * 100) / 100,
      freeMib: Math.round(freeMib * 100) / 100,
    };
  } catch {
    return { quotaMib: 0, usedMib: 0, freeMib: 0 };
  }
}
