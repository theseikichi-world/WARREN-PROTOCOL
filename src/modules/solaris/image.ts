import type { ImageInput } from '../../settings'

/**
 * Read an image File, downscale it to fit `maxEdge` px on its longest side, and
 * return base64 JPEG (no data: prefix) ready for aiVision. Downscaling keeps the
 * token cost — and upload time — sane regardless of the camera's resolution.
 */
export async function fileToImageInput(file: File, maxEdge = 1024): Promise<ImageInput> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Could not read the image file.'))
    r.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload  = () => resolve(i)
    i.onerror = () => reject(new Error('Could not decode the image.'))
    i.src = dataUrl
  })

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable.')
  ctx.drawImage(img, 0, 0, w, h)

  const base64 = (canvas.toDataURL('image/jpeg', 0.82).split(',')[1]) ?? ''
  return { base64, mediaType: 'image/jpeg' }
}
