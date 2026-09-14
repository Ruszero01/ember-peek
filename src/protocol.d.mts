import type {Control} from './types';
export function validateControls(value:unknown):Control[];
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
