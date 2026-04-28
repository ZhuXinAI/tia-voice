import { Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { Button } from '../components/ui/button'
import {
  getSelectionToolbarState,
  startTextToSpeech,
  subscribeToSelectionToolbarState
} from '../lib/ipc'
import type { SelectionToolbarStatePayload } from '../../../preload/index'

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

const DRAG_STYLE: AppRegionStyle = { WebkitAppRegion: 'drag' }
const NO_DRAG_STYLE: AppRegionStyle = { WebkitAppRegion: 'no-drag' }

export default function SelectionToolbarWindow(): React.JSX.Element {
  const [state, setState] = useState<SelectionToolbarStatePayload>({
    visible: false,
    text: '',
    sourceApp: null
  })

  useEffect(() => {
    void getSelectionToolbarState().then(setState)
    return subscribeToSelectionToolbarState(setState)
  }, [])

  return (
    <div
      className="window flex items-center justify-center bg-transparent px-2 py-1"
      style={DRAG_STYLE}
    >
      <div className="flex min-h-11 min-w-44 items-center justify-center rounded-full border border-border/60 bg-background/95 p-1 shadow-[0_16px_45px_rgba(15,23,42,0.22)] backdrop-blur-xl">
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-full px-4 text-sm font-medium"
          style={NO_DRAG_STYLE}
          onClick={() =>
            void startTextToSpeech({
              text: state.text,
              source: 'selection-toolbar'
            })
          }
        >
          <Volume2 className="size-4" />
          Read Out Loud
        </Button>
      </div>
    </div>
  )
}
