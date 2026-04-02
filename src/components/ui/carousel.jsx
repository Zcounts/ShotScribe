import * as React from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

const Carousel = React.forwardRef(({ className, opts, children, ...props }, ref) => {
  const [emblaRef, emblaApi] = useEmblaCarousel(opts)
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((api) => {
    if (!api) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [])

  React.useEffect(() => {
    if (!emblaApi) return
    onSelect(emblaApi)
    emblaApi.on('reInit', onSelect)
    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('reInit', onSelect)
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi, onSelect])

  return (
    <div className={cn('relative', className)} ref={ref} {...props}>
      <div className="overflow-hidden" ref={emblaRef}>{children}</div>
      <button type="button" onClick={() => emblaApi?.scrollPrev()} disabled={!canScrollPrev} className="absolute left-1 top-1/2 -translate-y-1/2 rounded border border-[var(--ss-border-subtle)] bg-[var(--ss-paper-elevated)] p-1 disabled:opacity-40">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => emblaApi?.scrollNext()} disabled={!canScrollNext} className="absolute right-1 top-1/2 -translate-y-1/2 rounded border border-[var(--ss-border-subtle)] bg-[var(--ss-paper-elevated)] p-1 disabled:opacity-40">
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})
Carousel.displayName = 'Carousel'

const CarouselContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex', className)} {...props} />
))
CarouselContent.displayName = 'CarouselContent'

const CarouselItem = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('min-w-0 shrink-0 grow-0 basis-full', className)} {...props} />
))
CarouselItem.displayName = 'CarouselItem'

export { Carousel, CarouselContent, CarouselItem }
