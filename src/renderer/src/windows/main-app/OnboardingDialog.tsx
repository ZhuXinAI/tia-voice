import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useI18n } from '@renderer/i18n'
import type { TriggerKey } from '../../../../preload/index'

import { OnboardingFlow } from '../onboarding/OnboardingFlow'

type OnboardingDialogProps = {
  open: boolean
  dashscopeConfigured: boolean
  dashscopeKeyLabel: string | null
  hotkeyHint: string
  permissions: import('./types').MainAppState['permissions']
  registeredHotkey: TriggerKey | null
  registeredHotkeyLabel: string | null
  onOpenChange: (open: boolean) => void
  onComplete: () => Promise<void>
  onSkip: () => Promise<void>
}

export function OnboardingDialog(props: OnboardingDialogProps): React.JSX.Element {
  const {
    open,
    dashscopeConfigured,
    dashscopeKeyLabel,
    hotkeyHint,
    permissions,
    registeredHotkey,
    registeredHotkeyLabel,
    onOpenChange,
    onComplete,
    onSkip
  } = props
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(920px,94vw)] max-w-none overflow-y-auto border border-border/70 bg-background/95 p-0 text-foreground shadow-2xl backdrop-blur-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{t('onboarding.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('onboarding.dialogBody')}</DialogDescription>
        </DialogHeader>

        <OnboardingFlow
          initialDashscopeConfigured={dashscopeConfigured}
          initialDashscopeKeyLabel={dashscopeKeyLabel}
          hotkeyHint={hotkeyHint}
          initialPermissions={permissions}
          registeredHotkey={registeredHotkey}
          registeredHotkeyLabel={registeredHotkeyLabel}
          mode="dialog"
          onComplete={onComplete}
          onSkip={onSkip}
        />
      </DialogContent>
    </Dialog>
  )
}
