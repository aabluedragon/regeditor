import { ExecFileParameters, RegStruct } from "./types";

export type RegDeleteCmdResultSingle = {
    notFound?: boolean,
    cmd: ExecFileParameters
}

export type RegExportCmdResultSingle = RegDeleteCmdResultSingle;

export type RegQueryCmdResultSingle = {
    struct: RegStruct,
    keyMissing?: boolean
    cmd: ExecFileParameters
};

export type RegReadResultSingle = RegQueryCmdResultSingle

export type PSJsonResultValue = {
    Name: string;
    Value: string|number|string[]|number[];
    Type:number
}
export type PSJsonResultKey = {
    Path: string,
    Values: PSJsonResultValue[],
    SubKeys: PSJsonResultKey
}

export enum PSRegType {
    REG_NONE = -1,
    REG_SZ = 1,
    REG_EXPAND_SZ = 2,
    REG_BINARY = 3,
    REG_DWORD = 4,
    REG_MULTI_SZ = 7,
    REG_QWORD = 11
}
