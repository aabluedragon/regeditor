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