import { Millennium, IconsModule, definePlugin, routerHook } from "@steambrew/client";
import {
    pluginConfig, mergeStoredConfig, gameIDOverrides, mergeStoredOverrides,
    customizationStates, mergeStoredCustomizationStates, safeParseStoredJSON,
    type PluginConfig, type GameIDOverrides, type CustomizationStates,
} from "./config";
import { patchLibraryContextMenu, OnPopupCreation } from "./context-menu";
import { EasyGridRouteContent } from "./easygrid-modal";
import { SettingsContent } from "./settings-components";

declare global {
    var MainWindowBrowserManager: any;
    var appStore: any;
    var collectionStore: any;
    var uiStore: any;
    interface Window {
        __easygrid_mwbm_hooked__?: boolean;
        __easygrid_context_menu_patch__?: { unpatch: () => void };
        __easygrid_route_registered__?: boolean;
    }
}

export default definePlugin(async () => {
    console.log("[steam-easygrid 4] frontend startup");

    const rawValue = localStorage.getItem("luthor112.steam-easygrid.config");
    const storedConfig: Partial<PluginConfig> = safeParseStoredJSON(rawValue, "config");
    mergeStoredConfig(storedConfig);
    console.log("[steam-easygrid 4] Merged config:", pluginConfig);

    const rawOverrideValue = localStorage.getItem("luthor112.steam-easygrid.overrides");
    const storedOverrides: GameIDOverrides = safeParseStoredJSON(rawOverrideValue, "overrides");
    mergeStoredOverrides(storedOverrides);
    console.log("[steam-easygrid 4] Overrides:", gameIDOverrides);

    const rawCustomizationValue = localStorage.getItem("luthor112.steam-easygrid.customization");
    const storedCustomizationStates: CustomizationStates = safeParseStoredJSON(rawCustomizationValue, "customization");
    mergeStoredCustomizationStates(storedCustomizationStates);
    console.log("[steam-easygrid 4] Customization states:", customizationStates);

    Millennium.AddWindowCreateHook!(OnPopupCreation);

    if (!window.__easygrid_context_menu_patch__) {
        window.__easygrid_context_menu_patch__ = patchLibraryContextMenu();
    }

    if (!window.__easygrid_route_registered__) {
        window.__easygrid_route_registered__ = true;
        routerHook.addRoute('/easygrid', EasyGridRouteContent, { exact: true });
    }

    return {
        title: "Easy SteamGrid",
        icon: <IconsModule.Settings />,
        content: <SettingsContent />,
        onDismount() {
            window.__easygrid_context_menu_patch__?.unpatch?.();
            delete window.__easygrid_context_menu_patch__;
            routerHook.removeRoute('/easygrid');
            window.__easygrid_route_registered__ = false;
        },
    };
});
