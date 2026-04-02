import { Toaster } from 'sonner'

const SonnerToaster = (props) => (
  <Toaster
    closeButton
    richColors
    position="bottom-right"
    toastOptions={{
      style: {
        background: 'var(--ss-paper-elevated)',
        color: 'var(--ss-ink)',
        border: '1px solid var(--ss-border-subtle)',
      },
    }}
    {...props}
  />
)

export { SonnerToaster }
