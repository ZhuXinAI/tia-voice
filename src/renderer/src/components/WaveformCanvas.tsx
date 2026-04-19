import { useEffect, useRef } from 'react'

const BAR_COUNT = 6

function drawBars(context: CanvasRenderingContext2D, width: number, height: number, levels: number[]): void {
  context.clearRect(0, 0, width, height)
  const clampedLevels = levels.length > 0 ? levels : new Array(BAR_COUNT).fill(0.1)
  const barWidth = Math.max(4, Math.floor(width / 18))
  const totalBarsWidth = barWidth * BAR_COUNT
  const gap = BAR_COUNT > 1 ? (width - totalBarsWidth) / (BAR_COUNT - 1) : 0
  const minHeight = Math.max(8, height * 0.22)
  const maxHeight = Math.max(minHeight, height * 0.9)

  for (let index = 0; index < BAR_COUNT; index += 1) {
    const level = Math.max(0.06, Math.min(clampedLevels[index] ?? 0.1, 1))
    const barHeight = minHeight + (maxHeight - minHeight) * level
    const x = index * (barWidth + gap)
    const y = (height - barHeight) / 2

    context.fillStyle = '#f8d88f'
    context.beginPath()
    context.roundRect(x, y, barWidth, barHeight, barWidth / 2)
    context.fill()
  }
}

function drawIdleBars(context: CanvasRenderingContext2D, width: number, height: number): void {
  drawBars(context, width, height, [0.1, 0.14, 0.18, 0.16, 0.12, 0.1])
}

export function WaveformCanvas(props: { stream: MediaStream | null }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const width = canvas.clientWidth || 60
    const height = canvas.clientHeight || 60
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!props.stream) {
      drawIdleBars(context, width, height)
      return
    }

    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) {
      drawIdleBars(context, width, height)
      return
    }

    const audioContext = new AudioContextClass()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.82
    const source = audioContext.createMediaStreamSource(props.stream)
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    let frameId = 0

    const render = (): void => {
      frameId = window.requestAnimationFrame(render)
      analyser.getByteFrequencyData(dataArray)

      const bucketSize = Math.max(1, Math.floor(bufferLength / BAR_COUNT))
      const levels = new Array(BAR_COUNT).fill(0).map((_, index) => {
        const start = index * bucketSize
        const end = Math.min(bufferLength, start + bucketSize)
        let total = 0
        let count = 0

        for (let i = start; i < end; i += 1) {
          total += dataArray[i]
          count += 1
        }

        const average = count > 0 ? total / count : 0
        return average / 255
      })

      drawBars(context, width, height, levels)
    }

    render()

    return () => {
      window.cancelAnimationFrame(frameId)
      source.disconnect()
      analyser.disconnect()
      void audioContext.close()
    }
  }, [props.stream])

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      data-testid="waveform-canvas"
      aria-label="Recording waveform"
    />
  )
}
