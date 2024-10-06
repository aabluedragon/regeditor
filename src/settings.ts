export type RegeditorSettings = {winePath?: string|null}
export let settings:RegeditorSettings = {}

export function regeditorUpdateSettings(newSettings: RegeditorSettings) {
    settings = structuredClone(newSettings);
}

export function regeditorGetSettings() {
    return structuredClone(settings)
}