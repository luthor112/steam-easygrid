import { Millennium, Menu, MenuItem, MenuGroup, showContextMenu, DialogButton, Dropdown, findModule, afterPatch, findModuleByExport, findInReactTree, findInTree, fakeRenderComponent, sleep } from "@steambrew/client";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { pluginConfig, searchCache, imgTypeSettingsMap, getExcludedAppIDs, toggleAppExcludedFromReplacement, GetCustomizationState, SetCustomizationState } from "./config";
import { applyFirstWorkingImage, autoReplaceForApp } from "./api";
import { openEasyGridForApp, openSGDBWindow, setDesktopPopup } from "./easygrid-modal";

const WaitForElement = async (sel: string, parent = document) => [...(await Millennium.findElement(parent, sel))][0];

const IMAGE_TYPE_LABELS = Object.values(imgTypeSettingsMap).map((t) => t.label);
const ALL_IMAGE_TYPES = IMAGE_TYPE_LABELS.map((_, idx) => idx);

async function replaceCollectionImages(currentColl: any, imgTypes: number[], onProgress: (current: number, total: number) => void) {
    const excludedAppIDs = getExcludedAppIDs();
    for (let j = 0; j < currentColl.allApps.length; j++) {
        onProgress(j, currentColl.allApps.length);
        const appid = currentColl.allApps[j].appid;
        if (excludedAppIDs.includes(appid)) continue;
        for (const imgType of imgTypes) {
            if (!pluginConfig.replace_custom_images && GetCustomizationState(appid, imgType)) continue;
            await applyFirstWorkingImage(appid, imgType);
        }
        delete searchCache[appid.toString()];
    }
}

function resetCollectionImages(currentColl: any, imgTypes: number[], onProgress: (current: number, total: number) => void) {
    for (let j = 0; j < currentColl.allApps.length; j++) {
        onProgress(j, currentColl.allApps.length);
        const appid = currentColl.allApps[j].appid;
        for (const imgType of imgTypes) {
            SteamClient.Apps.ClearCustomArtworkForApp(appid, imgType);
            SetCustomizationState(appid, imgType, false);
        }
    }
}

async function renderHome(popup: any) {
    const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
    const oldGridButton = headerDiv.querySelector('button.easygrid-button');
    if (!oldGridButton && pluginConfig.collection_button) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        headerDiv.insertBefore(gridButton, headerDiv.firstChild!.nextSibling!.nextSibling);

        gridButton.addEventListener("click", async () => {
            const setStatus = (text: string) => { gridButton.firstChild.innerHTML = text; };

            const collectionMenuGroups = collectionStore.userCollections.map((collection: any) => {
                const collId = collection.m_strId;
                const collName = collection.m_strName;
                return (
                    <MenuGroup key={collId} label={collName}>
                        <MenuGroup label="Replace">
                            {IMAGE_TYPE_LABELS.map((label, idx) => (
                                <MenuItem key={idx} onClick={async () => {
                                    const currentColl = collectionStore.GetCollection(collId);
                                    await replaceCollectionImages(currentColl, [idx], (j, total) => setStatus(`Working... (${j}/${total})`));
                                    setStatus("Done!");
                                    console.log(`[steam-easygrid 4] ${label} replaced for`, collId);
                                }}>{label}</MenuItem>
                            ))}
                            <MenuItem onClick={async () => {
                                const currentColl = collectionStore.GetCollection(collId);
                                await replaceCollectionImages(currentColl, ALL_IMAGE_TYPES, (j, total) => setStatus(`Working... (${j}/${total})`));
                                setStatus("Done!");
                                console.log("[steam-easygrid 4] All image types replaced for", collId);
                            }}>All</MenuItem>
                        </MenuGroup>
                        <MenuGroup label="Reset">
                            {IMAGE_TYPE_LABELS.map((label, idx) => (
                                <MenuItem key={idx} onClick={() => {
                                    const currentColl = collectionStore.GetCollection(collId);
                                    resetCollectionImages(currentColl, [idx], (j, total) => setStatus(`Working... (${j}/${total})`));
                                    setStatus("Done!");
                                    console.log(`[steam-easygrid 4] ${label} cleared for`, collId);
                                }}>{label}</MenuItem>
                            ))}
                            <MenuItem onClick={() => {
                                const currentColl = collectionStore.GetCollection(collId);
                                resetCollectionImages(currentColl, ALL_IMAGE_TYPES, (j, total) => setStatus(`Working... (${j}/${total})`));
                                setStatus("Done!");
                                console.log("[steam-easygrid 4] All image types cleared for", collId);
                            }}>All</MenuItem>
                        </MenuGroup>
                    </MenuGroup>
                );
            });

            showContextMenu(
                <Menu label="EasyGrid Options">
                    {collectionMenuGroups}
                </Menu>,
                gridButton,
                {bForcePopup: true}
            );
        });
    }
}

async function renderCollection(popup: any) {
    const collOptionsDiv = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
    const oldGridDropdown = collOptionsDiv.querySelector('div.easygrid-dropdown');

    if (!oldGridDropdown && pluginConfig.collection_button) {
        const gridDropdown = popup.m_popup.document.createElement("div");
        gridDropdown.className = "easygrid-dropdown";

        type BulkAction = { mode: 'replace' | 'reset'; imgTypes: number[] };

        const bulkActionsByKey: Record<string, BulkAction> = {
            ...Object.fromEntries(IMAGE_TYPE_LABELS.map((_, idx) => [`replace_${idx}`, { mode: 'replace' as const, imgTypes: [idx] }])),
            replace_all: { mode: 'replace', imgTypes: ALL_IMAGE_TYPES },
            ...Object.fromEntries(IMAGE_TYPE_LABELS.map((_, idx) => [`reset_${idx}`, { mode: 'reset' as const, imgTypes: [idx] }])),
            reset_all: { mode: 'reset', imgTypes: ALL_IMAGE_TYPES },
        };

        const DropdownComponent = () => {
            const sortModule = findModule(m => m.SortingDropDown && m.SortingDropDownLabel) || {};
            const [statusText, setStatusText] = useState("EasyGrid");
            const [selected, setSelected] = useState('replace_0');

            const options = [
                {
                    label: 'Replace',
                    options: [
                        ...IMAGE_TYPE_LABELS.map((label, idx) => ({ label, data: `replace_${idx}` })),
                        { label: 'All', data: 'replace_all' },
                    ],
                },
                {
                    label: 'Reset',
                    options: [
                        ...IMAGE_TYPE_LABELS.map((label, idx) => ({ label, data: `reset_${idx}` })),
                        { label: 'All', data: 'reset_all' },
                    ],
                },
            ];

            const handleChange = async (option: { data: string; label: string }) => {
                const key = option.data;
                setSelected(key);
                const bulkAction = bulkActionsByKey[key];
                if (!bulkAction) return;

                const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                const collLabel = uiStore.currentGameListSelection.strCollectionId;

                if (bulkAction.mode === 'replace') {
                    await replaceCollectionImages(currentColl, bulkAction.imgTypes, (j, total) => setStatusText(`Working... (${j}/${total})`));
                    setStatusText("Done!");
                    console.log("[steam-easygrid 4] Images replaced for", collLabel);
                } else {
                    resetCollectionImages(currentColl, bulkAction.imgTypes, (j, total) => setStatusText(`Working... (${j}/${total})`));
                    setStatusText("Done!");
                    console.log("[steam-easygrid 4] Images cleared for", collLabel);
                }

                setTimeout(() => setStatusText("EasyGrid"), 3000);
            };

            return (
                <div className={sortModule.SortingDropDown} tabIndex={-1}>
                    <div className={sortModule.SortingDropDownLabel}>
                        {statusText}
                    </div>
                    <Dropdown
                        rgOptions={options}
                        selectedOption={selected}
                        onChange={handleChange}
                    />
                </div>
            );
        };

        const gridDropdownRoot = createRoot(gridDropdown);
        gridDropdownRoot.render(<DropdownComponent />);

        collOptionsDiv.insertBefore(gridDropdown, collOptionsDiv.firstChild!.nextSibling);
    }
}

const isAppContextMenu = (items: any): boolean => {
    if (!Array.isArray(items) || !items.length) return false;
    return Boolean(findInReactTree(items, (node: any) => {
        const selected = node?.props?.onSelected?.toString?.() ?? node?.onSelected?.toString?.() ?? '';
        return selected.includes('AppProperties') || Boolean(node?.app?.appid);
    }));
};

const findContextMenuAppId = (tree: any, owner: any): number | undefined => {
    if (owner?.pendingProps?.overview?.appid) {
        return owner.pendingProps.overview.appid;
    }
    const found = findInTree(tree, (node: any) => node?.app?.appid || node?.overview?.appid, { walkable: ['props', 'children', '_owner', 'pendingProps'] });
    return found?.app?.appid ?? found?.overview?.appid;
};

const insertEasyGridMenuItem = (menuItems: any[], appid: number) => {
    if (!appid || menuItems.find((item: any) => item?.key === 'easygrid-group')) return;
    const isExcluded = getExcludedAppIDs().includes(appid);
    menuItems.push(
        <MenuGroup key="easygrid-group" label="Easy SteamGrid">
            <MenuItem onClick={() => { void openEasyGridForApp(appid); }}>Open</MenuItem>
            <MenuItem onClick={() => { void autoReplaceForApp(appid); }}>Auto Replace</MenuItem>
            <MenuItem selected={isExcluded} onClick={() => toggleAppExcludedFromReplacement(appid)}>Exclude from replacement</MenuItem>
        </MenuGroup>
    );
};

export function patchLibraryContextMenu(): { unpatch: () => void } {
    const noop: { unpatch: () => void } = { unpatch: () => {} };

    const module = findModuleByExport((exp: any) => exp?.toString && exp.toString().includes('().LibraryContextMenu'));
    const component = Object.values(module ?? {}).find((sibling: any) => sibling?.toString?.().includes('navigator:')) as any;
    const LibraryContextMenu = component ? fakeRenderComponent(component)?.type : null;

    if (!LibraryContextMenu?.prototype?.render) {
        console.warn("[steam-easygrid 4] Could not find LibraryContextMenu; Big Picture entry point disabled");
        return noop;
    }

    let innerPatch: any = null;
    const outerPatch = afterPatch(LibraryContextMenu.prototype, 'render', (_args: any[], rendered: any) => {
        if (!innerPatch) {
            innerPatch = afterPatch(rendered, 'type', (_typeArgs: any[], typeRet: any) => {
                if (typeRet?.type?.prototype?.render) {
                    afterPatch(typeRet.type.prototype, 'render', (_renderArgs: any[], renderRet: any) => {
                        const menuItems = renderRet?.props?.children?.[0];
                        if (isAppContextMenu(menuItems)) {
                            const appid = findContextMenuAppId(renderRet, renderRet?._owner);
                            if (appid) insertEasyGridMenuItem(menuItems, appid);
                        }
                        return renderRet;
                    });
                    afterPatch(typeRet.type.prototype, 'shouldComponentUpdate', ([nextProps]: any[], shouldUpdate: any) => {
                        const menuItems = nextProps?.children;
                        if (isAppContextMenu(menuItems)) {
                            const appid = findContextMenuAppId(nextProps, undefined);
                            if (appid) insertEasyGridMenuItem(menuItems, appid);
                        }
                        return shouldUpdate;
                    });
                }
                return typeRet;
            });
        } else if (Array.isArray(rendered?.props?.children)) {
            const appid = findContextMenuAppId(rendered, rendered?._owner);
            if (appid) insertEasyGridMenuItem(rendered.props.children, appid);
        }

        return rendered;
    });

    return {
        unpatch: () => {
            outerPatch?.unpatch?.();
            innerPatch?.unpatch?.();
        }
    };
}

// User-supplied CSS from their own fluenty theme edits — these class names are stable per Steam client
// build (same as the ones used elsewhere in this file), not random per-machine. Fixes the hero image only
// filling ~1/3 of the header's width on ultrawide/4K monitors, since it's a pure CSS rule rather than
// per-element JS styling, it applies to matching elements automatically without needing reapplication.
function injectHeroExpandCss(doc: Document) {
    if (doc.getElementById("easygrid-hero-expand-css")) return;
    const style = doc.createElement("style");
    style.id = "easygrid-hero-expand-css";
    style.textContent = `
        .HNbe3eZf6H7dtJ042x1vM.HSQWw9HUAP6jtA2OZjS-u,
        .QlR9EFwTdUNm_J5vx54_Z .HNbe3eZf6H7dtJ042x1vM {
            max-width: 100% !important;
            -webkit-mask-image: none !important;
            width: calc(100% + 128px) !important;
        }
    `;
    doc.head.appendChild(style);
}

async function renderApp(popup: any) {
    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    if (!topCapsuleDiv.classList.contains("easygrid-header")) {
        topCapsuleDiv.addEventListener("dblclick", async() => {
            openSGDBWindow(popup);
        });
        topCapsuleDiv.classList.add("easygrid-header");
    }

    if (pluginConfig.expand_hero_image) {
        injectHeroExpandCss(popup.m_popup.document);
    }

    const expandHeadersValue = pluginConfig.expand_headers;
    if (expandHeadersValue !== "") {
        for (const el of popup.m_popup.document.querySelectorAll(`*:has(> .${findModule(e => e.ImgSrc).ImgSrc})`)) {
            el.style.setProperty("height", "auto", "important");
        }

        (topCapsuleDiv as HTMLElement).style.setProperty("max-height", expandHeadersValue, "important");

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.BoxSizer).BoxSizer} img`)) {
            el.style.setProperty("width", "50%", "important");
            el.style.setProperty("height", "50%", "important");
            el.style.setProperty("margin-bottom", "100px", "important");
        }

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.TitleSection).TitleSection}`)) {
            el.style.setProperty("bottom", "100px", "important");
        }
    }
}

async function renderAppAndObserve(popup: any) {
    await renderApp(popup);

    if (pluginConfig.reapply_app_page) {
        const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
        const topCapsuleObserver = new MutationObserver(async (mutationList: any, observer: any) => {
            void mutationList;
            void observer;
            await renderApp(popup);
        });
        topCapsuleObserver.observe(topCapsuleDiv.parentNode!, { subtree: true, childList: true, attributes: true });
    }
}

export async function OnPopupCreation(popup: any) {
    await sleep(10000);
    if (popup.m_strName === "SP Desktop_uid0") {
        setDesktopPopup(popup);

        if (window.__easygrid_mwbm_hooked__) {
            console.log("[steam-easygrid 4] finished-request already hooked, skipping duplicate registration");
            return;
        }

        let mwbm = undefined;
        while (!mwbm) {
            console.log("[steam-easygrid 4] Waiting for MainWindowBrowserManager");
            try {
                mwbm = MainWindowBrowserManager;
            } catch {
                await sleep(100);
            }
        }

        window.__easygrid_mwbm_hooked__ = true;
        console.log("[steam-easygrid 4] Registering callback");
        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL: any, previousURL: any) => {
            void currentURL;
            void previousURL;

            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                await renderHome(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                await renderCollection(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                await renderAppAndObserve(popup);
            }
        });
    }
}
