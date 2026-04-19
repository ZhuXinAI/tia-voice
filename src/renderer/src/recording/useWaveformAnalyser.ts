import { useEffect, useState } from 'react'

export function useWaveformAnalyser(stream: MediaStream | null): number[] {
  const [levels, setLevels] = useState<number[]>(new Array(24).fill(0.12))

  useEffect(() => {
    if (!stream) {
      setLevels(new Array(24).fill(0.12))
      return
    }

    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) {
      setLevels(new Array(24).fill(0.12))
      return
    }

    const audioContext = new AudioContextClass()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.82
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.frequencyBinCount)
    let frameId = 0

    const update = () => {
      analyser.getByteFrequencyData(buffer)
      const bins = 24
      const bucketSize = Math.max(1, Math.floor(buffer.length / bins))
      const nextLevels = new Array(bins).fill(0).map((_, index) => {
        const start = index * bucketSize
        const end = Math.min(buffer.length, start + bucketSize)
        const slice = buffer.slice(start, end)
        const average = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length)
        return Math.max(0.08, average / 255)
      })

      setLevels(nextLevels)
      frameId = window.requestAnimationFrame(update)
    }

    frameId = window.requestAnimationFrame(update)

    return () => {
      window.cancelAnimationFrame(frameId)
      source.disconnect()
      analyser.disconnect()
      void audioContext.close()
    }
  }, [stream])

  return levels
}
