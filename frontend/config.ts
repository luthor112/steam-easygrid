import { log_frontend } from "./backend";

export const imgTypeDict = ["grids", "heroes", "logos", "wide_grids", "icons"];

export const ICON_IMG_TYPE = 4;

export type ImageTypeSubConfig = {
    nsfw: string,
    humor: string,
    epilepsy: string,
    types: string,
    mimes: string,
    styles: string,
    dimensions?: string
};

export type PluginConfig = {
    api_key: string,
    display_name_fallback: boolean,
    replace_custom_images: boolean,
    appids_excluded_from_replacement: string,
    prioritize_animated: boolean,
    prioritize_authors: string[],
    expand_headers: string,
    expand_hero_image: boolean,
    collection_button: boolean,
    disable_webp: boolean,
    reapply_app_page: boolean,
    grids_config: ImageTypeSubConfig,
    wide_grids_config: ImageTypeSubConfig,
    heroes_config: ImageTypeSubConfig,
    logos_config: ImageTypeSubConfig,
    icons_config: ImageTypeSubConfig,
    grids_width_mult: number,
    wide_grids_width_mult: number,
    heroes_width_mult: number,
    logos_width_mult: number,
    icons_width_mult: number
};

export var pluginConfig: PluginConfig = {
    api_key: "",
    display_name_fallback: true,
    replace_custom_images: true,
    appids_excluded_from_replacement: "",
    prioritize_animated: false,
    prioritize_authors: [],
    expand_headers: "",
    expand_hero_image: false,
    collection_button: true,
    disable_webp: true,
    reapply_app_page: true,
    grids_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,white_logo,material,no_logo",
        dimensions: "600x900,342x482,660x930,512x512,1024x1024"
    },
    wide_grids_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,white_logo,material,no_logo",
        dimensions: "460x215,920x430,512x512,1024x1024"
    },
    heroes_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png,image/jpeg",
        styles: "alternate,blurred,material",
        dimensions: ""
    },
    logos_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/webp,image/png",
        styles: "official,white,black,custom",
        dimensions: ""
    },
    icons_config: {
        nsfw: "false",
        humor: "any",
        epilepsy: "any",
        types: "static,animated",
        mimes: "image/png,image/vnd.microsoft.icon",
        styles: "official,custom",
        dimensions: ""
    },
    grids_width_mult: 5,
    wide_grids_width_mult: 5,
    heroes_width_mult: 10,
    logos_width_mult: 7,
    icons_width_mult: 7
};

export const imgTypeSettingsMap: Record<number, { configKey: keyof PluginConfig; widthMultKey: NumKeys; label: string }> = {
    0: { configKey: "grids_config", widthMultKey: "grids_width_mult", label: "Grid" },
    1: { configKey: "heroes_config", widthMultKey: "heroes_width_mult", label: "Hero" },
    2: { configKey: "logos_config", widthMultKey: "logos_width_mult", label: "Logo" },
    3: { configKey: "wide_grids_config", widthMultKey: "wide_grids_width_mult", label: "Wide Grid" },
    4: { configKey: "icons_config", widthMultKey: "icons_width_mult", label: "Icon" },
};

export const TYPE_OPTIONS = ["static", "animated"];

export const imageSearchOptionsByConfigKey: Record<string, { mimeOptions: string[]; styleOptions: string[] }> = {
    grids_config: {
        mimeOptions: ["image/webp", "image/png", "image/jpeg"],
        styleOptions: ["alternate", "blurred", "white_logo", "material", "no_logo"],
    },
    wide_grids_config: {
        mimeOptions: ["image/webp", "image/png", "image/jpeg"],
        styleOptions: ["alternate", "blurred", "white_logo", "material", "no_logo"],
    },
    heroes_config: {
        mimeOptions: ["image/webp", "image/png", "image/jpeg"],
        styleOptions: ["alternate", "blurred", "material"],
    },
    logos_config: {
        mimeOptions: ["image/webp", "image/png"],
        styleOptions: ["official", "white", "black", "custom"],
    },
    icons_config: {
        mimeOptions: ["image/png", "image/vnd.microsoft.icon"],
        styleOptions: ["official", "custom"],
    },
};

export type GameIDOverrides = Record<string, number>;

export var gameIDOverrides: GameIDOverrides = {};

export type SearchCache = Record<string, Record<string, any>>;

export var searchCache: SearchCache = {};

export type AppCustomizationState = {
    grids: boolean;
    heroes: boolean;
    logos: boolean;
    wide_grids: boolean;
    icons: boolean;
};

export type CustomizationStates = Record<string, AppCustomizationState>;

export var customizationStates: CustomizationStates = {};

export function mergeStoredConfig(stored: Partial<PluginConfig>) {
    pluginConfig = { ...pluginConfig, ...stored };
}

export function mergeStoredOverrides(stored: GameIDOverrides) {
    gameIDOverrides = { ...gameIDOverrides, ...stored };
}

export function mergeStoredCustomizationStates(stored: CustomizationStates) {
    customizationStates = { ...customizationStates, ...stored };
}

export function safeParseStoredJSON(raw: string | null, label: string): any {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[steam-easygrid 4] Stored ${label} was corrupted, resetting to defaults:`, e, raw);
        log_frontend({ msg: `Stored ${label} was corrupted, resetting to defaults: ${e}` });
        return {};
    }
}

export function persistConfig() {
    localStorage.setItem("luthor112.steam-easygrid.config", JSON.stringify(pluginConfig));
    searchCache = {};
}

export function SetCustomizationState(appID: number, imgType: number, newState: boolean) {
    if (!(appID.toString() in customizationStates)) {
        customizationStates[appID.toString()] = {
            grids: false,
            heroes: false,
            logos: false,
            wide_grids: false,
            icons: false
        };
    }

    customizationStates[appID.toString()][imgTypeDict[imgType] as keyof AppCustomizationState] = newState;
    localStorage.setItem("luthor112.steam-easygrid.customization", JSON.stringify(customizationStates));
}

export function GetCustomizationState(appID: number, imgType: number) {
    if (appID.toString() in customizationStates) {
        return customizationStates[appID.toString()][imgTypeDict[imgType] as keyof AppCustomizationState];
    } else {
        return false;
    }
}

export function getExcludedAppIDs() {
    let excludeAppsList = [];
    if (pluginConfig.appids_excluded_from_replacement !== "") {
        const strParts = pluginConfig.appids_excluded_from_replacement.split(";");
        for (let i = 0; i < strParts.length; i = i + 2) {
            excludeAppsList.push(Number(strParts[i]));
        }
    }
    return excludeAppsList;
}

export function toggleAppExcludedFromReplacement(appid: number) {
    const strParts = pluginConfig.appids_excluded_from_replacement ? pluginConfig.appids_excluded_from_replacement.split(";") : [];
    const pairIndex = strParts.findIndex((part, i) => i % 2 === 0 && Number(part) === appid);
    if (pairIndex !== -1) {
        strParts.splice(pairIndex, 2);
    } else {
        const app = appStore.allApps.find((x: any) => x.appid === appid);
        strParts.push(appid.toString(), app?.display_name ?? `App ${appid}`);
    }
    pluginConfig.appids_excluded_from_replacement = strParts.join(";");
    persistConfig();
}

type BoolKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends boolean ? K : never
}[keyof PluginConfig];

type StringKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends string ? K : never
}[keyof PluginConfig];

export type NumKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends number ? K : never
}[keyof PluginConfig];

type StringArrayKeys = {
    [K in keyof PluginConfig]: PluginConfig[K] extends string[] ? K : never
}[keyof PluginConfig];

export type { BoolKeys, StringKeys, StringArrayKeys };
