export type OverlayOptions = { movable: boolean; resizable: boolean; followToolbar: boolean };
export type SidebarOptions = { side: 'left' | 'right'; width: number; minWidth: number; maxWidth: number };
export function overlayOptions(value?: unknown): OverlayOptions;
export function sidebarOptions(value?: unknown): SidebarOptions;
export function sidebarWidth(width: number, bounds: SidebarOptions, viewport: number): number;
export function overlaySize(size: {width:number; height:number}, viewport: {width:number; height:number}, strip?:number): {width:number; height:number};

export function rememberedSidebarWidth(value: unknown, options: SidebarOptions): number;
