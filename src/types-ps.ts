import { CommonOpts, ExecFileParameters, OptionsReg64Or32, RegAddCmdOpts, RegKey, RegReadCmdOpts, RegStruct } from "./types";

export type PSCommonOpts = OptionsReg64Or32;
export type PSCommandConfig =  Omit<CommonOpts, keyof OptionsReg64Or32>;

export type PSReadOpts = Omit<RegReadCmdOpts, keyof CommonOpts | 'readCmd'> & PSCommonOpts;
export type PSReadCmd = RegKey | PSReadOpts;
export type PSReadCmdResult = {cmd:ExecFileParameters, struct:RegStruct, keysMissing:string[]}

export type PSAddOpts = Omit<RegAddCmdOpts, keyof CommonOpts | 's'> & PSCommonOpts;
export type PSAddCmd = RegKey | PSAddOpts;
export type PSAddCmdResult = {cmd:ExecFileParameters}