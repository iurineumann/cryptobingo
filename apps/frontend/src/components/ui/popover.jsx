import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
function Popover({ ...props }) {
    return <PopoverPrimitive.Root data-slot="popover" {...props}/>;
}
function PopoverTrigger({ ...props }) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}/>;
}
function PopoverPortal({ ...props }) {
    return <PopoverPrimitive.Portal data-slot="popover-portal" {...props}/>;
}
function PopoverClose({ ...props }) {
    return <PopoverPrimitive.Close data-slot="popover-close" {...props}/>;
}
function PopoverContent({ align = "center", alignOffset = 0, side = "bottom", sideOffset = 4, className, ...props }) {
    return (<PopoverPortal>
      <PopoverPrimitive.Positioner className="isolate z-50 outline-none" align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup data-slot="popover-content" className={cn("z-50 max-w-72 w-(--anchor-width) min-w-32 origin-(--transform-origin) rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className)} {...props}/>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>);
}
function PopoverTitle({ className, ...props }) {
    return (<PopoverPrimitive.Title data-slot="popover-title" className={cn("mb-1 text-sm font-semibold", className)} {...props}/>);
}
function PopoverDescription({ className, ...props }) {
    return (<PopoverPrimitive.Description data-slot="popover-description" className={cn("text-xs text-muted-foreground", className)} {...props}/>);
}
export { Popover, PopoverTrigger, PopoverContent, PopoverClose, PopoverTitle, PopoverDescription, };
//# sourceMappingURL=popover.js.map