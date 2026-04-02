import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

const Command = React.forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-[var(--ss-paper)] text-[var(--ss-ink)]', className)}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }) => (
  <Drawer open={props.open} onOpenChange={props.onOpenChange}>
    <DrawerContent className="p-0">
      <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-[var(--ss-slate)] [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-1 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-10 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-sm [&_[cmdk-item][data-selected=true]]:bg-[var(--ss-surface-slate)] [&_[cmdk-list]]:max-h-[300px] [&_[cmdk-list]]:overflow-y-auto">
        {children}
      </Command>
    </DrawerContent>
  </Drawer>
)

const CommandInput = React.forwardRef(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-[var(--ss-border-subtle)] px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-60" />
    <CommandPrimitive.Input ref={ref} className={cn('flex h-10 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-[var(--ss-slate)] disabled:cursor-not-allowed disabled:opacity-50', className)} {...props} />
  </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.List ref={ref} className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)} {...props} />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef((props, ref) => <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm text-[var(--ss-slate)]" {...props} />)
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef(({ className, ...props }, ref) => <CommandPrimitive.Group ref={ref} className={cn('overflow-hidden p-1 text-[var(--ss-ink)]', className)} {...props} />)
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandItem = React.forwardRef(({ className, ...props }, ref) => (
  <CommandPrimitive.Item ref={ref} className={cn('relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-[var(--ss-surface-slate)] data-[disabled=true]:opacity-50', className)} {...props} />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandSeparator = React.forwardRef(({ className, ...props }, ref) => <CommandPrimitive.Separator ref={ref} className={cn('-mx-1 h-px bg-[var(--ss-border-subtle)]', className)} {...props} />)
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator }
