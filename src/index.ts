export { regCmdQuery } from './commands/reg-cmd-query';
export { regCmdAdd } from './commands/reg-cmd-add';
export { regCmdDelete } from './commands/reg-cmd-delete';
export { regCmdImport } from './commands/reg-cmd-import';
export { regCmdExport } from './commands/reg-cmd-export';
export { regCmdCopy } from './commands/reg-cmd-copy';
export { regApply } from './operations/reg-apply';
export { regCompare } from './operations/reg-compare';
export { regRead } from './operations/reg-read';
export { psRead } from './commands/ps-read';
export { psAdd } from './commands/ps-add';
export * from './errors';
export * from './types';
export * from './types-ps';
export * from './lookpath-sync'
export * as PromiseStoppable from './promise-stoppable';
export { regKeyResolvePath } from './utils';
export { COMMAND_NAMES, REG_TYPES_ALL, REG_VALUENAME_DEFAULT, TIMEOUT_DEFAULT } from './constants';