export type AssistantAction = {
  kind: 'paste-text'
  text: string
}

export interface ActionExecutor {
  execute(action: AssistantAction): Promise<void>
}
