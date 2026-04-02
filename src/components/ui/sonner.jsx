import { Toaster } from 'sonner'

const SonnerToaster = (props) => (
  <Toaster
    closeButton
    richColors
    position="bottom-right"
    visibleToasts={4}
    toastOptions={{
      style: {
        background: 'var(--ss-paper-elevated)',
        color: 'var(--ss-ink)',
        border: '1px solid var(--ss-border-subtle)',
        fontFamily: 'Sora, system-ui, sans-serif',
      },
    }}
    {...props}
  />
)

export { SonnerToaster }
