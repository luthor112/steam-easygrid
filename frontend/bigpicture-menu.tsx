import { Menu, Focusable, showContextMenu, routerHook, EUIMode } from "@steambrew/client";
import { useEffect, useState } from "react";
import { MenuGroup, buildReplaceResetMenuGroups, buildStopMenuItem } from "./context-menu";

const SELECT_BUTTON = 13;
const LIBRARY_ROUTES = ["/library/home", "/library"];
const MENU_MAX_HEIGHT = "50vh";

let statusText = "";
const statusListeners = new Set<() => void>();

function setStatus(text: string) {
    statusText = text === "SGDB" ? "" : text;
    statusListeners.forEach((listener) => listener());
}

function openSgdbMenu(anchor: any) {
    const groups = [
        <MenuGroup key="easygrid-all-games" label="All Games">
            {buildReplaceResetMenuGroups(() => collectionStore.allAppsCollection, setStatus)}
        </MenuGroup>,
        ...collectionStore.userCollections.map((collection: any) => (
            <MenuGroup key={collection.m_strId} label={collection.m_strName}>
                {buildReplaceResetMenuGroups(() => collectionStore.GetCollection(collection.m_strId), setStatus)}
            </MenuGroup>
        )),
    ];

    showContextMenu(
        <Menu label="EasyGrid SGDB">
            {buildStopMenuItem()}
            <div style={{ maxHeight: MENU_MAX_HEIGHT, overflowY: "auto" }}>{groups}</div>
        </Menu>,
        anchor
    );
}

function SelectButtonWrapper(props: { children?: any }) {
    const [, rerender] = useState(0);

    useEffect(() => {
        const listener = () => rerender((n) => n + 1);
        statusListeners.add(listener);
        return () => { statusListeners.delete(listener); };
    }, []);

    return (
        <Focusable
            style={{ display: "contents" }}
            actionDescriptionMap={{ [SELECT_BUTTON]: statusText || "SGDB" } as any}
            onButtonDown={(evt: any) => {
                if (evt?.detail?.button === SELECT_BUTTON) {
                    evt.stopPropagation();
                    openSgdbMenu(evt.target);
                }
            }}
        >
            {props.children}
        </Focusable>
    );
}

function patchLibraryRoute(route: any) {
    return { ...route, children: <SelectButtonWrapper>{route.children}</SelectButtonWrapper> };
}

export function patchBigPictureLibrary(): { unpatch: () => void } {
    for (const path of LIBRARY_ROUTES) {
        routerHook.addPatch(path, patchLibraryRoute, EUIMode.GamePad);
    }

    return {
        unpatch: () => {
            for (const path of LIBRARY_ROUTES) {
                routerHook.removePatch(path, patchLibraryRoute, EUIMode.GamePad);
            }
        }
    };
}
