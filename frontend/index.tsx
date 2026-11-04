import { Millennium, IconsModule, definePlugin, routerHook } from "@steambrew/client";
import {
    pluginConfig, mergeStoredConfig, gameIDOverrides, mergeStoredOverrides,
    customizationStates, mergeStoredCustomizationStates, safeParseStoredJSON, loadStored,
    CONFIG_STORAGE_KEY, OVERRIDES_STORAGE_KEY, CUSTOMIZATION_STORAGE_KEY,
    type PluginConfig, type GameIDOverrides, type CustomizationStates,
} from "./config";
import { patchLibraryContextMenu, OnPopupCreation, replaceCollectionImages } from "./context-menu";
import { patchBigPictureLibrary } from "./bigpicture-menu";
import { EasyGridRouteContent } from "./easygrid-modal";
import { SettingsContent } from "./settings-components";

declare global {
    var MainWindowBrowserManager: any;
    var appStore: any;
    var collectionStore: any;
    var uiStore: any;
    interface Window {
        __easygrid_mwbm_hooked__?: any;
        __easygrid_context_menu_patch__?: { unpatch: () => void };
        __easygrid_bigpicture_patch__?: { unpatch: () => void };
        __easygrid_route_registered__?: boolean;
    }
}

export default definePlugin(async () => {
    console.log("[steam-easygrid 4] frontend startup");

    const rawValue = await loadStored(CONFIG_STORAGE_KEY);
    const storedConfig: Partial<PluginConfig> = safeParseStoredJSON(rawValue, "config");
    mergeStoredConfig(storedConfig);
    console.log("[steam-easygrid 4] Merged config:", pluginConfig);

    const rawOverrideValue = await loadStored(OVERRIDES_STORAGE_KEY);
    const storedOverrides: GameIDOverrides = safeParseStoredJSON(rawOverrideValue, "overrides");
    mergeStoredOverrides(storedOverrides);
    console.log("[steam-easygrid 4] Overrides:", gameIDOverrides);

    const rawCustomizationValue = await loadStored(CUSTOMIZATION_STORAGE_KEY);
    const storedCustomizationStates: CustomizationStates = safeParseStoredJSON(rawCustomizationValue, "customization");
    mergeStoredCustomizationStates(storedCustomizationStates);
    console.log("[steam-easygrid 4] Customization states:", customizationStates);

    Millennium.AddWindowCreateHook!(OnPopupCreation);

    if (!window.__easygrid_context_menu_patch__) {
        window.__easygrid_context_menu_patch__ = patchLibraryContextMenu();
    }

    if (!window.__easygrid_bigpicture_patch__) {
        window.__easygrid_bigpicture_patch__ = patchBigPictureLibrary();
    }

    if (!window.__easygrid_route_registered__) {
        window.__easygrid_route_registered__ = true;
        routerHook.addRoute('/easygrid', EasyGridRouteContent, { exact: true });
    }

    if (pluginConfig.auto_replace_grids) {
        setTimeout(() => replaceCollectionImages(collectionStore.allAppsCollection, [0], (j, total) => console.log(`[steam-easygrid 4] Autoreplacing grids... (${j}/${total})`), false), 1000);
    }

    return {
        title: "Easy SteamGrid",
        icon: <IconsModule.Settings />,
        content: <SettingsContent />,
        onDismount() {
            window.__easygrid_context_menu_patch__?.unpatch?.();
            delete window.__easygrid_context_menu_patch__;
            window.__easygrid_bigpicture_patch__?.unpatch?.();
            delete window.__easygrid_bigpicture_patch__;
            routerHook.removeRoute('/easygrid');
            window.__easygrid_route_registered__ = false;
        },
    };
});
