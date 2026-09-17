import type {Control} from './types';
import type {MessageKey} from './en';
/** `say` turns a protocol message key into text in the interface language. */
export function validateControls(value:unknown, say?:(key:MessageKey)=>string):Control[];
export function isSessionOwning(method:string):boolean;
export const ROLES:string[];
export class Selection {generation:number;begin():number;current(ticket:number):boolean;}
export function pluginPath(id:string,view:string):string;

export function isContributionCurrent(
  contributor: { id: string; pluginId: string; capabilities: string[] },
  active: string | null,
  focusedTool: string | null,
  expanded: string[],
): boolean;
